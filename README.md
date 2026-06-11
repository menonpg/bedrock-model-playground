# Bedrock Model Playground

**Interactive demo for comparing AWS Bedrock foundation models**

Live Demo: [TBD - GitHub Pages URL after deployment]

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
│  (Static HTML/JS)  │     │  (API Proxy + Auth)      │     │  (Models)       │
└────────────────────┘     └──────────────────────────┘     └─────────────────┘
```

- **Frontend**: Pure HTML/JS, no build step, hosted on GitHub Pages
- **Worker**: Cloudflare Worker handles AWS SigV4 signing, keeps credentials secure
- **Backend**: AWS Bedrock `InvokeModel` / `Converse` API

---

## Supported Models (June 2026)

### Anthropic Claude Family

| Model | Model ID | Context | Pricing (per 1M tokens) | Notes |
|-------|----------|---------|------------------------|-------|
| **Claude Fable 5** | `anthropic.claude-fable-5` | 200K | $10 in / $50 out | **NEW** - Mythos-class, safeguards enabled |
| Claude Opus 4.8 | `anthropic.claude-opus-4.8` | 200K | $15 in / $75 out | Flagship, no fallback restrictions |
| Claude Opus 4.7 | `anthropic.claude-opus-4.7` | 200K | $15 in / $75 out | Previous generation |
| Claude Haiku 4.5 | `anthropic.claude-haiku-4.5` | 200K | $0.80 in / $4 out | Fast, cost-efficient |

### Other Bedrock Models

| Model | Model ID | Pricing (per 1M tokens) |
|-------|----------|------------------------|
| Amazon Titan Text | `amazon.titan-text-premier-v1:0` | $0.50 in / $1.50 out |
| Meta Llama 3.1 70B | `meta.llama3-1-70b-instruct-v1:0` | $2.65 in / $3.50 out |
| Mistral Large | `mistral.mistral-large-2407-v1:0` | $4 in / $12 out |

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

### Bedrock Requirements

To use Fable 5 via Bedrock, you **must** opt into data sharing:

```bash
# Set data retention (required before first invoke)
curl -X PUT https://bedrock.us-east-1.amazonaws.com/data-retention \
  -H "Authorization: Bearer <your_bearer_token>" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "provider_data_share" }'
```

Anthropic requires **30-day input/output retention** + human review capability for abuse detection.

### Fable 5 vs Mythos 5

| Aspect | Claude Fable 5 | Claude Mythos 5 |
|--------|---------------|-----------------|
| Availability | General (via Bedrock, API, etc.) | Project Glasswing partners only |
| Safeguards | Enabled (falls back to Opus 4.8) | Some safeguards lifted |
| Use case | General enterprise use | Cyber defense, critical infrastructure |
| Pricing | $10/$50 per 1M tokens | Same |

---

## Emotional Intelligence Evaluation (Grace Phase 1)

For the Medimergent/Grace project, we're evaluating models on:

1. **Empathy in responses** - Does it acknowledge patient emotions appropriately?
2. **Clinical accuracy** - Correct medical information without hallucination
3. **Appropriate escalation** - Knows when to recommend human clinician
4. **Conversation continuity** - Maintains context across multi-turn dialogues
5. **Tone calibration** - Adjusts formality based on patient communication style

### Test Prompts

The playground includes pre-built test scenarios for:
- Anxious patient asking about test results
- Confused elderly patient needing medication guidance
- Frustrated patient with insurance questions
- Caregiver asking on behalf of family member

---

## Setup

### 1. Deploy Cloudflare Worker

```bash
cd worker
npm install
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your AWS credentials
npx wrangler deploy
```

### 2. Configure GitHub Pages

1. Fork this repo
2. Go to Settings → Pages → Enable from `main` branch
3. Update `config.js` with your Worker URL

### 3. AWS IAM Setup

Create an IAM user/role with:

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
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    }
  ]
}
```

---

## Development

```bash
# Local development (frontend only)
npx serve .

# Worker development
cd worker && npx wrangler dev
```

---

## Related Projects

- [Carmen/Grace AWS Deployment](../carmen-vapi-prod/) - Main project using these models
- [Medimergent Documentation](../carmen-docs/) - Project context

---

## References

- [Anthropic: Claude Fable 5 and Mythos 5 Announcement](https://www.anthropic.com/news/claude-fable-5-mythos-5)
- [AWS Blog: Claude Fable 5 on Bedrock](https://aws.amazon.com/blogs/aws/anthropic-claude-fable-5-on-aws-mythos-class-capabilities-with-built-in-safeguards-now-available/)
- [Claude on Amazon Bedrock Docs](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)
- [System Card](https://anthropic.com/claude-fable-5-mythos-5-system-card)

---

*Created: June 2026 | Fraunhofer CMA / Medimergent Grace Project*
