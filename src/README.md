# MCP AI Shopping Platform

Kapruka Genie is a hosted-AI conversational commerce app styled from `Doc/sample.html` and based on `Doc/Overview.docx`.

- Text chat replies: Groq Qwen chat completions
- First-message context analysis: Groq processing model
- Image shopping and voice transcription: Groq vision and STT APIs
- Assistant read-aloud: browser speech synthesis (no additional AI model)
- Live products, delivery checks, and tracking: Kapruka MCP at `https://mcp.kapruka.com/mcp`
- Ranking, event planning, gift boxes, comparison, and analytics: Groq over real MCP results

No AI models are downloaded locally. The browser calls local Next API routes, and those routes call hosted provider APIs.

## Getting Started

Create your local env file:

```powershell
Copy-Item env.local.example .env.local
```

Edit `.env.local` and set:

- `GROQ_API_KEY`

Run the app:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Default Models

```dotenv
GROQ_REPLY_MODEL=qwen/qwen3-32b
GROQ_PROCESSING_MODEL=llama-3.3-70b-versatile
GROQ_CONTEXT_MODEL=llama-3.3-70b-versatile
GROQ_COMMERCE_MODEL=llama-3.3-70b-versatile
GROQ_BACKUP_MODEL=llama-3.1-8b-instant
GROQ_REQUEST_TIMEOUT_MS=10000
GROQ_TOTAL_TIMEOUT_MS=25000
KAPRUKA_MCP_URL=https://mcp.kapruka.com/mcp
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_VISION_BACKUP_MODEL=meta-llama/llama-4-maverick-17b-128e-instruct
```

HTTP 429 and temporary Groq failures automatically retry with backup models.
Each model attempt and the complete retry chain are time-limited. Text requests
can try the configured backup followed by built-in 8B, Qwen, and GPT-OSS
fallbacks. Vision uses a separate vision-capable backup model.

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

The commerce API uses the real Kapruka MCP streamable HTTP transport. It opens an MCP session, calls tools such as `kapruka_search_products`, `kapruka_check_delivery`, `kapruka_create_order`, and `kapruka_track_order`, then sends only real product/delivery results to Groq for ranking/analytics.

## Scripts

```powershell
npm run dev
npm run lint
npm run build
```
