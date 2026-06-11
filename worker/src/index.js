// Cloudflare Worker for Bedrock Model Playground
// Uses aws4fetch for proper SigV4 signing with Converse API

import { AwsClient } from 'aws4fetch';

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        hasCredentials: !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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

        const region = env.AWS_REGION || 'us-east-1';
        
        // Create AWS client with session token support
        const aws = new AwsClient({
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          sessionToken: env.AWS_SESSION_TOKEN,
          region: region,
          service: 'bedrock'
        });

        // Use Converse API - works better with inference profiles
        const bedrockUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/converse`;
        
        // Build Converse API request body
        const converseBody = {
          messages: messages.map(m => ({
            role: m.role,
            content: [{ text: m.content }]
          })),
          inferenceConfig: {
            maxTokens: max_tokens
          }
        };
        
        // Add system message if provided
        if (system) {
          converseBody.system = [{ text: system }];
        }
        
        // NOTE: Data retention mode for Claude Fable 5 must be set at account level
        // via the Bedrock Control Plane API, NOT per-request.
        // See: https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html
        // 
        // To enable Fable 5:
        // curl -X PUT https://bedrock.us-east-1.amazonaws.com/data-retention \
        //   --aws-sigv4 "aws:amz:us-east-1:bedrock" \
        //   -H "Content-Type: application/json" \
        //   -d '{ "mode": "provider_data_share" }'
        
        const response = await aws.fetch(bedrockUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(converseBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(JSON.stringify({ 
            error: `Bedrock error ${response.status}: ${errorText}` 
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await response.json();
        
        // Normalize Converse API response
        const normalizedResponse = {
          content: result.output?.message?.content?.[0]?.text || '',
          usage: result.usage,
          stop_reason: result.stopReason,
          model: modelId
        };

        return new Response(JSON.stringify(normalizedResponse), {
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
