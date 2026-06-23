# MCP AI Shopping Platform

Kapruka Genie is a hosted-AI conversational commerce app styled from `Doc/sample.html` and based on `Doc/Overview.docx`.

- Main shopping chat replies: Novita-hosted Gemma, with the existing Groq reply as an automatic fallback
- First-message context analysis: Groq processing model
- Image shopping and voice transcription: Groq vision and STT APIs
- Assistant read-aloud: browser speech synthesis (no additional AI model)
- Live products, delivery checks, and tracking: Kapruka MCP at `https://mcp.kapruka.com/mcp`
- Ranking, event planning, gift boxes, and comparison: Groq over real MCP results
- Reply chips: two randomly selected starter chips, generated locally
- Commerce analytics: generated locally

No AI models are downloaded locally. The browser calls local Next API routes, and those routes call hosted provider APIs.

## Getting Started

Create your local env file:

```powershell
Copy-Item env.local.example .env.local
```

Edit `.env.local` and set:

- `GROQ_API_KEY`
- `HF_TOKEN` with Inference Providers permission

Run the app:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Default Models

```dotenv
HF_NOVITA_REPLY_MODEL=google/gemma-4-31B-it:novita
HF_NOVITA_REPLY_TIMEOUT_MS=4500
GROQ_REPLY_MODEL=qwen/qwen3-32b
GROQ_PROCESSING_MODEL=llama-3.3-70b-versatile
GROQ_CONTEXT_MODEL=llama-3.3-70b-versatile
GROQ_COMMERCE_MODEL=llama-3.3-70b-versatile
GROQ_ENGLISH_CHAT_MODEL=openai/gpt-oss-120b
GROQ_SINHALA_CHAT_MODEL=openai/gpt-oss-120b
GROQ_SINGLISH_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_GIFT_MESSAGE_MODEL=llama-3.3-70b-versatile
GROQ_SINHALA_GIFT_MESSAGE_MODEL=openai/gpt-oss-120b
GROQ_SINGLISH_GIFT_MESSAGE_MODEL=llama-3.3-70b-versatile
GROQ_BACKUP_MODEL=qwen/qwen3.6-27b
GROQ_REQUEST_TIMEOUT_MS=5000
GROQ_TOTAL_TIMEOUT_MS=10000
MCP_REQUEST_TIMEOUT_MS=4000
KAPRUKA_MCP_URL=https://mcp.kapruka.com/mcp
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_VISION_BACKUP_MODEL=meta-llama/llama-4-maverick-17b-128e-instruct
```

HTTP 429 and temporary Groq failures automatically retry with backup models.
Each model attempt and the complete retry chain are time-limited. Text requests
can try the configured backup followed by built-in 8B, Qwen, and GPT-OSS
fallbacks. Vision uses a separate vision-capable backup model.

Sinhala and Singlish shopping-chat replies use Hugging Face Gemma routed through
Novita. English shopping-chat replies use Groq. Sinhala and Singlish gift
messages also use Novita first, while English gift messages use Groq directly.
If a Novita request is rate-limited, unavailable, times out, or returns an empty
reply, the language-specific Groq response is used automatically. Ranking,
comparisons, tracking suggestions, context analysis, vision, and voice retain
their existing providers. Reply chips randomly select up to two entries from the
initial starter-chip pool locally, with no AI call. Commerce analytics remain local.

Shopping replies use the latest three conversation messages for continuity.
All suggested product cards are filtered against the active preset or custom
budget before they reach the interface. Smart Shopping includes a working
`Suggest more` chip that rotates or reloads additional budget-matched products.

The app also maintains hidden extended preferences for budget, recipient,
occasion, and gift type. They start from the visible selections and accumulate
more specific details from later messages without changing the visible presets.
Product searches use only these extended values; for example, visible `Cakes`
can remain selected while the hidden search gift type becomes `chocolate cakes`.

The no-login admin dashboard at `/kapruka-admin` shows the fixed provider setup.
Hugging Face through Novita generates Sinhala and Singlish shopping-chat replies;
Groq generates English shopping-chat replies. Gift messages continue to use
the same routing: Novita for Sinhala and Singlish, and Groq for English. Groq is
used automatically when a Novita reply is rate-limited, times out, or returns
no usable reply.

Voice recognition and transcription always use Groq
`whisper-large-v3-turbo`, restricted to English voice search. The model cannot
be overridden per request or by an environment variable. Unrecognized voice
input asks the user to retry.

Reading the latest English assistant message aloud prefers an installed female
English browser voice. The control is hidden for Sinhala and Singlish and does
not call a second server-side voice model.

Restart `npm run dev` after changing env values.

## Routes

- Main app: `/`
- Provider test pages: `/ai-chatbot`, `/image-analysis`, `/voice-messages`
- API: `/api/ai/chatbot`, `/api/ai/image-analysis`, `/api/ai/voice-messages`, `/api/ai/commerce`

The commerce API uses the real Kapruka MCP streamable HTTP transport. It reuses
short-lived MCP sessions, caches product searches for 45 seconds and normalized
cities for 24 hours, and bounds MCP calls to 4 seconds by default. Delivery is
checked only when the user's current message asks about delivery. Independent
MCP setup, message analysis, catalog search, and city normalization work runs
concurrently where their data dependencies allow it.

## Scripts

```powershell
npm run dev
npm run lint
npm run build
```
