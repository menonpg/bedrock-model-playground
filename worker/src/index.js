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
        
        // Extract text content from Converse API response
        // Fable 5 may include reasoningContent blocks alongside text blocks
        // We need to find the actual text content, not the reasoning signature
        let textContent = '';
        const contentBlocks = result.output?.message?.content || [];
        
        for (const block of contentBlocks) {
          if (block.text) {
            // Direct text block
            textContent += block.text;
          } else if (block.reasoningContent?.reasoningText?.text) {
            // Reasoning block with text (Fable 5 extended thinking)
            // This is internal reasoning, we might want to include or skip
            // For now, skip it as it's usually empty or internal
          }
        }
        
        // Normalize Converse API response
        const normalizedResponse = {
          content: textContent,
          usage: result.usage,
          stop_reason: result.stopReason,
          model: modelId,
          latency_ms: result.metrics?.latencyMs
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

    // Also support /v1/models for discovery
    if (url.pathname === '/v1/models' && request.method === 'GET') {
      const models = {
        object: 'list',
        data: [
          { id: 'us.anthropic.claude-fable-5', object: 'model', created: 1717977600, owned_by: 'anthropic' },
          { id: 'us.anthropic.claude-sonnet-4-20250514-v1:0', object: 'model', created: 1715817600, owned_by: 'anthropic' },
          { id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', object: 'model', created: 1729555200, owned_by: 'anthropic' },
          { id: 'us.anthropic.claude-3-haiku-20240307-v1:0', object: 'model', created: 1709769600, owned_by: 'anthropic' },
        ]
      };
      return new Response(JSON.stringify(models), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // OpenAI-compatible endpoint for Cline and other tools
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { model, messages, max_tokens = 4096, temperature, stream = false } = body;

        if (stream) {
          return new Response(JSON.stringify({ error: 'Streaming not yet supported' }), {
            status: 501,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Map model names - allow shortcuts
        let modelId = model;
        const modelAliases = {
          'claude-fable-5': 'us.anthropic.claude-fable-5',
          'fable-5': 'us.anthropic.claude-fable-5',
          'claude-sonnet-4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
          'sonnet-4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
          'claude-3.5-sonnet': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
          'claude-3-haiku': 'us.anthropic.claude-3-haiku-20240307-v1:0',
        };
        if (modelAliases[model]) {
          modelId = modelAliases[model];
        }

        const region = env.AWS_REGION || 'us-east-1';
        
        const aws = new AwsClient({
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          sessionToken: env.AWS_SESSION_TOKEN,
          region: region,
          service: 'bedrock'
        });

        const bedrockUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/converse`;
        
        // Convert OpenAI messages to Bedrock Converse format
        // Extract system message if present
        let systemMessage = null;
        const conversationMessages = [];
        
        for (const msg of messages) {
          if (msg.role === 'system') {
            systemMessage = msg.content;
          } else {
            conversationMessages.push({
              role: msg.role,
              content: [{ text: msg.content }]
            });
          }
        }
        
        const converseBody = {
          messages: conversationMessages,
          inferenceConfig: {
            maxTokens: max_tokens
          }
        };
        
        if (temperature !== undefined) {
          converseBody.inferenceConfig.temperature = temperature;
        }
        
        if (systemMessage) {
          converseBody.system = [{ text: systemMessage }];
        }
        
        const startTime = Date.now();
        const response = await aws.fetch(bedrockUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(converseBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          // Return OpenAI-style error
          return new Response(JSON.stringify({ 
            error: {
              message: `Bedrock error: ${errorText}`,
              type: 'api_error',
              code: response.status
            }
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await response.json();
        const latencyMs = Date.now() - startTime;
        
        // Extract text content
        let textContent = '';
        const contentBlocks = result.output?.message?.content || [];
        
        for (const block of contentBlocks) {
          if (block.text) {
            textContent += block.text;
          }
        }
        
        // Map stop reason to OpenAI format
        const stopReasonMap = {
          'end_turn': 'stop',
          'stop_sequence': 'stop',
          'max_tokens': 'length',
          'tool_use': 'tool_calls'
        };
        
        // Return OpenAI-compatible response
        const openAIResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: textContent
            },
            finish_reason: stopReasonMap[result.stopReason] || 'stop'
          }],
          usage: {
            prompt_tokens: result.usage?.inputTokens || 0,
            completion_tokens: result.usage?.outputTokens || 0,
            total_tokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
          },
          // Extra metadata
          _bedrock: {
            latency_ms: latencyMs,
            original_model: modelId
          }
        };

        return new Response(JSON.stringify(openAIResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('OpenAI-compat error:', error);
        return new Response(JSON.stringify({ 
          error: {
            message: error.message,
            type: 'internal_error'
          }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};
