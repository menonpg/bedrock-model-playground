// Cloudflare Worker for Bedrock Model Playground
// Proxies requests to AWS Bedrock with SigV4 signing

export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Invoke model
    if (url.pathname === '/invoke' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { modelId, messages, system, max_tokens = 1024 } = body;

        if (!modelId) {
          return new Response(JSON.stringify({ error: 'modelId required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Determine if this is an Anthropic model or other
        const isAnthropic = modelId.startsWith('anthropic.');

        // Build the request body based on model type
        let bedrockBody;
        if (isAnthropic) {
          // Anthropic Messages API format
          bedrockBody = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens,
            system: system || undefined,
            messages: messages.map(m => ({
              role: m.role,
              content: m.content
            }))
          };
        } else {
          // Converse API format for other models
          bedrockBody = {
            messages: messages.map(m => ({
              role: m.role,
              content: [{ text: m.content }]
            })),
            inferenceConfig: { maxTokens: max_tokens }
          };
        }

        // Call Bedrock
        const bedrockResponse = await invokeBedrockModel(
          env.AWS_ACCESS_KEY_ID,
          env.AWS_SECRET_ACCESS_KEY,
          env.AWS_REGION || 'us-east-1',
          modelId,
          bedrockBody,
          isAnthropic,
          env.AWS_SESSION_TOKEN
        );

        return new Response(JSON.stringify(bedrockResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('Invoke error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};

// URI encode per RFC 3986 (required for SigV4)
function uriEncode(str, encodeSlash = true) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || 
        (ch >= '0' && ch <= '9') || ch === '_' || ch === '-' || ch === '~' || ch === '.') {
      result += ch;
    } else if (ch === '/' && !encodeSlash) {
      result += ch;
    } else {
      result += '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return result;
}

// AWS SigV4 signing and Bedrock invocation
async function invokeBedrockModel(accessKeyId, secretAccessKey, region, modelId, body, isAnthropic, sessionToken) {
  const service = 'bedrock';
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  
  // Use global endpoint for supported models
  const useGlobal = modelId.includes('claude-fable-5') || 
                    modelId.includes('claude-opus-4') || 
                    modelId.includes('claude-haiku-4');
  
  const effectiveModelId = useGlobal ? `global.${modelId}` : modelId;
  
  // For the HTTP request: use raw model ID (let fetch() encode it)
  const rawPath = `/model/${effectiveModelId}/invoke`;
  
  // For the canonical request URI: encode ourselves to match what AWS will receive
  // AWS receives the encoded version because fetch() will encode the URL
  const encodedModelId = uriEncode(effectiveModelId, true);
  const canonicalUri = `/model/${encodedModelId}/invoke`;
  
  const bodyString = JSON.stringify(body);
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = datetime.slice(0, 8);

  // Create canonical request
  const method = 'POST';
  const canonicalQuerystring = '';
  
  const payloadHash = await sha256Hex(bodyString);
  
  const headers = {
    'content-type': 'application/json',
    'host': host,
    'x-amz-date': datetime,
    'x-amz-content-sha256': payloadHash
  };
  
  // Add session token header if using temporary credentials
  if (sessionToken) {
    headers['x-amz-security-token'] = sessionToken;
  }
  
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(key => `${key}:${headers[key]}`)
    .join('\n') + '\n';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    datetime,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  // Calculate signature
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256Hex(kSigning, stringToSign);

  // Create authorization header
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Make the request with raw path - fetch() will encode it for us
  const response = await fetch(`https://${host}${rawPath}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': authorization
    },
    body: bodyString
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bedrock error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  
  // Normalize response format
  if (isAnthropic) {
    return {
      content: result.content?.[0]?.text || '',
      usage: result.usage,
      stop_reason: result.stop_reason,
      model: modelId,
      // Check if there was a safeguard fallback (Fable 5 specific)
      fallback: result.model && result.model !== modelId
    };
  } else {
    return {
      content: result.output?.message?.content?.[0]?.text || '',
      usage: result.usage,
      stop_reason: result.stopReason,
      model: modelId
    };
  }
}

// Crypto helpers
async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key, message) {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuffer = new TextEncoder().encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  return new Uint8Array(signature);
}

async function hmacSha256Hex(key, message) {
  const signature = await hmacSha256(key, message);
  return Array.from(signature)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
