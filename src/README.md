# MCP AI Shopping Platform

Kapruka Genie is a hosted-AI conversational commerce app styled from `Doc/sample.html` and based on `Doc/Overview.docx`.

- Text chat replies: Groq Qwen chat completions
- First-message context analysis: Groq processing model
- Image shopping and voice: OpenRouter vision, STT, and TTS APIs
- Live products, delivery checks, and tracking: Kapruka MCP at `https://mcp.kapruka.com/mcp`
- Ranking, event planning, gift boxes, comparison, and analytics: Groq over real MCP results

No AI models are downloaded locally. The browser calls local Next API routes, and those routes call hosted provider APIs.

## Getting Started

Create your local env file:

```powershell
Copy-Item env.local.example .env.local
```

Edit `.env.local` and set:

- `OPENROUTER_API_KEY`
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
KAPRUKA_MCP_URL=https://mcp.kapruka.com/mcp
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-32b-instruct
OPENROUTER_STT_MODEL=openai/whisper-large-v3
OPENROUTER_TTS_MODEL=google/gemini-3.1-flash-tts-preview
OPENROUTER_TTS_VOICE=Kore
```

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
