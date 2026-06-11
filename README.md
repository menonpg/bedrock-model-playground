# Bedrock Model Playground

**Interactive demo for comparing AWS Bedrock foundation models**

🌐 **Live Demo:** https://menonpg.github.io/bedrock-model-playground/  
⚡ **API Proxy:** https://bedrock-proxy.prahlad-menon.workers.dev/

---

## Purpose

A lightweight browser-based tool to test and compare AWS Bedrock foundation models side-by-side. Built for evaluating model responses for:
- Emotional intelligence use cases
- Clinical/healthcare conversations
- Multi-turn dialogue quality
- Response latency and token efficiency

Designed to support **Medimergent/Grace Phase 1** model selection and ongoing model evaluation.

---

## Architecture

```
┌────────────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│  GitHub Pages UI   │────▶│  Cloudflare Worker       │────▶│  AWS Bedrock    │
│  (Static HTML/JS)  │     │  (API Proxy + AWS Auth)  │     │  (Models)       │
└────────────────────┘     └──────────────────────────┘     └─────────────────┘
```

- **Frontend**: Pure HTML/JS, no build step, hosted on GitHub Pages
- **Worker**: Cloudflare Worker handles AWS SigV4 signing via `aws4fetch`, keeps credentials secure
- **Backend**: AWS Bedrock **Converse API** (works with inference profiles)

---

## Supported Models (June 2026)

> ⚠️ **Important:** Models must be called using their **inference profile IDs**, not raw model IDs.  
> Bedrock no longer requires manual model activation — models are auto-enabled on first invoke.

### Anthropic Claude Family

| Model | Inference Profile ID | Context | Pricing (per 1M tokens) | Notes |
|-------|---------------------|---------|------------------------|-------|
| **Claude Fable 5** | `us.anthropic.claude-fable-5` | 200K | $10 in / $50 out | **NEW** - Mythos-class, safeguards enabled |
| Claude Opus 4.8 | `us.anthropic.claude-opus-4-8` | 200K | $15 in / $75 out | Flagship, no fallback restrictions |
| Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | 200K | $0.80 in / $4 out | Fast, cost-efficient |

### Other Bedrock Models

| Model | Inference Profile ID | Pricing (per 1M tokens) |
|-------|---------------------|------------------------|
| Llama 4 Maverick 17B | `us.meta.llama4-maverick-17b-instruct-v1:0` | $0.22 in / $0.88 out |
| Llama 4 Scout 17B | `us.meta.llama4-scout-17b-instruct-v1:0` | $0.22 in / $0.88 out |
| DeepSeek R1 | `us.deepseek.r1-v1:0` | Varies |

---

## Claude Fable 5 Deep Dive

### What's New (June 9, 2026)

**Claude Fable 5** is Anthropic's first publicly available Mythos-class model. Key highlights:

- **State-of-the-art** on nearly all tested benchmarks
- **Long-running autonomy**: Can execute complex multi-hour coding tasks without intervention
- **Vision capabilities**: Extracts numbers from scientific figures, rebuilds web apps from screenshots
- **Self-verification**: Proactively validates its own work at high effort levels

### Safeguards & Fallback Behavior

Fable 5 includes **safety classifiers** that detect potential misuse. When triggered:

> ⚠️ **Harmful prompts in cybersecurity, biology/chemistry, or distillation topics automatically fall back to Claude Opus 4.8**

This affects <5% of sessions. Users are notified when fallback occurs.

### ⚠️ Data Retention Requirement for Fable 5 (CRITICAL)

**Claude Fable 5 requires `provider_data_share` mode opt-in at the AWS ACCOUNT level before first use.**

If you get this error:
```
The model returned the following errors: data retention mode 'default' is not available for this model
```

**Fix:** Run this command (one-time, per AWS account):

```bash
# Using curl with AWS SigV4 signing
curl -X PUT https://bedrock.us-east-1.amazonaws.com/data-retention \
  --aws-sigv4 "aws:amz:us-east-1:bedrock" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "X-Amz-Security-Token: $AWS_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "provider_data_share" }'
```

**Response:**
```json
{"mode":"provider_data_share","updatedAt":"2026-06-11T13:53:44.268Z"}
```

**Important notes:**
- There is **NO console UI** for this setting — API only
- This is an **account-wide** setting, not per-request
- Anthropic requires 30-day input/output retention for abuse detection
- Data is NOT used for model training

**Verify current setting:**
```bash
curl https://bedrock.us-east-1.amazonaws.com/data-retention \
  --aws-sigv4 "aws:amz:us-east-1:bedrock" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "X-Amz-Security-Token: $AWS_SESSION_TOKEN"
```

### Fable 5 vs Mythos 5

| Aspect | Claude Fable 5 | Claude Mythos 5 |
|--------|---------------|-----------------|
| Availability | General (via Bedrock, API, etc.) | Project Glasswing partners only |
| Safeguards | Enabled (falls back to Opus 4.8) | Some safeguards lifted |
| Use case | General enterprise use | Cyber defense, critical infrastructure |
| Pricing | $10/$50 per 1M tokens | Same |

---

## Using Fable 5 in Cline (VS Code Extension)

To use Claude Fable 5 with the Cline VS Code extension:

### Option 1: Via AWS Bedrock (Recommended)

1. **Enable data retention** (see above — required one-time)

2. **Configure Cline settings** (`settings.json`):
```json
{
  "cline.apiProvider": "bedrock",
  "cline.awsRegion": "us-east-1",
  "cline.awsAccessKeyId": "YOUR_ACCESS_KEY",
  "cline.awsSecretAccessKey": "YOUR_SECRET_KEY",
  "cline.awsSessionToken": "YOUR_SESSION_TOKEN",  // if using SSO
  "cline.modelId": "us.anthropic.claude-fable-5"
}
```

3. **Or use AWS CLI profile:**
```json
{
  "cline.apiProvider": "bedrock",
  "cline.awsProfile": "608380991622_PowerUserAccess",
  "cline.awsRegion": "us-east-1",
  "cline.modelId": "us.anthropic.claude-fable-5"
}
```

### Option 2: Via OpenAI-Compatible Proxy

Use our Cloudflare Worker as an OpenAI-compatible endpoint:

```json
{
  "cline.apiProvider": "openai-compatible",
  "cline.openaiBaseUrl": "https://bedrock-proxy.prahlad-menon.workers.dev",
  "cline.openaiApiKey": "not-needed",
  "cline.modelId": "us.anthropic.claude-fable-5"
}
```

> **Note:** The worker currently uses the Converse API format, not OpenAI format. For Cline, direct Bedrock is recommended.

---

## API Usage

### Health Check

```bash
curl https://bedrock-proxy.prahlad-menon.workers.dev/health
```

### Invoke Model

```bash
curl -X POST https://bedrock-proxy.prahlad-menon.workers.dev/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "messages": [{"role": "user", "content": "Hello!"}],
    "system": "You are a helpful assistant.",
    "max_tokens": 1024
  }'
```

**Response:**
```json
{
  "content": "Hello! How can I help you today?",
  "usage": {"inputTokens": 12, "outputTokens": 8, "totalTokens": 20},
  "stop_reason": "end_turn",
  "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}
```

---

## Emotional Intelligence Evaluation (Grace Phase 1)

For the Medimergent/Grace project, we're evaluating models on:

1. **Empathy in responses** - Does it acknowledge patient emotions appropriately?
2. **Clinical accuracy** - Correct medical information without hallucination
3. **Appropriate escalation** - Knows when to recommend human clinician
4. **Conversation continuity** - Maintains context across multi-turn dialogues
5. **Tone calibration** - Adjusts formality based on patient communication style

### Pre-built Test Scenarios

The playground includes:
- **Anxious patient** - Test results anxiety
- **Confused elderly** - Medication guidance
- **Frustrated patient** - Insurance issues
- **Caregiver** - Asking on behalf of family member
- **Technical** - Detailed medical questions

---

## Setup (Self-Hosting)

### Prerequisites

- AWS account with Bedrock access
- Cloudflare account (for Worker)
- Node.js 18+

### 1. Enable Data Retention for Fable 5

```bash
# Set your AWS credentials
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_SESSION_TOKEN="your-token"  # if using SSO

# Enable provider_data_share (required for Fable 5)
curl -X PUT https://bedrock.us-east-1.amazonaws.com/data-retention \
  --aws-sigv4 "aws:amz:us-east-1:bedrock" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "X-Amz-Security-Token: $AWS_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "provider_data_share" }'
```

### 2. Deploy Cloudflare Worker

```bash
cd worker
npm install

# Set secrets
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put AWS_SESSION_TOKEN  # Only if using temporary credentials

npx wrangler deploy
```

### 3. Configure Frontend

Update `index.html`:
```javascript
const CONFIG = {
    workerUrl: 'https://your-worker.your-domain.workers.dev',
    models: [...]
};
```

### 4. AWS IAM Requirements

Create an IAM user/role with Bedrock invoke permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "*"
    }
  ]
}
```

> **Note:** Bedrock model access is now auto-enabled on first invoke. No manual activation required.

---

## Important Notes

### Inference Profiles vs Model IDs

Bedrock requires using **inference profile IDs** (e.g., `us.anthropic.claude-haiku-4-5-20251001-v1:0`) rather than raw model IDs (e.g., `anthropic.claude-3-5-haiku-20241022-v1:0`).

List available inference profiles:
```bash
aws bedrock list-inference-profiles --query "inferenceProfileSummaries[*].inferenceProfileId"
```

### Credential Rotation

If using temporary credentials (SSO/assumed role), the session token expires (typically 12 hours). You'll need to refresh the secrets:

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put AWS_SESSION_TOKEN
```

For production, consider using a permanent IAM user with minimal permissions.

### Fable 5 Response Format

Fable 5 may include `reasoningContent` blocks in its response alongside text. The worker extracts only the user-facing text content. Example raw response structure:

```json
{
  "output": {
    "message": {
      "content": [
        {"reasoningContent": {"reasoningText": {"signature": "...", "text": ""}}},
        {"text": "Actual response text here"}
      ]
    }
  }
}
```

---

## Related Projects

- [Carmen/Grace AWS Deployment](../carmen-vapi-prod/) - Main project using these models
- [Medimergent Documentation](../carmen-docs/) - Project context

---

## References

- [Anthropic: Claude Fable 5 and Mythos 5 Announcement](https://www.anthropic.com/news/claude-fable-5-mythos-5)
- [AWS Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [AWS: Data Retention API](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html) - Required for Fable 5
- [AWS: Model Access Retirement Notice](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) - Models now auto-enabled on first invoke

---

*Created: June 2026 | Fraunhofer CMA / Medimergent Grace Project*
