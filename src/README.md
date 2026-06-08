# MCP AI Shopping Platform

This Next.js app includes three hosted Hugging Face AI testers:

- `/ai-chatbot` - multilingual LLM chatbot through Hugging Face chat completions
- `/image-analysis` - hosted image classification
- `/voice-messages` - hosted speech-to-text for recorded or uploaded audio

No Hugging Face models are downloaded locally. The browser calls local Next API routes, and those routes call Hugging Face hosted inference.

## Getting Started

Create your local env file:

```powershell
Copy-Item env.local.example .env.local
```

Edit `.env.local` and set `HF_TOKEN` to a Hugging Face access token with Inference Providers permission.

Install dependencies and run the development server:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Optional Models

You can override the defaults in `.env.local`:

```dotenv
HF_CHAT_MODEL=Qwen/Qwen3-235B-A22B-Instruct-2507:novita
HF_IMAGE_MODEL=google/vit-base-patch16-224
HF_VOICE_MODEL=openai/whisper-large-v3
```

Restart `npm run dev` after changing env values.

The default chat model is `Qwen/Qwen3-235B-A22B-Instruct-2507:novita`, an advanced multilingual Qwen3 model available through Hugging Face Inference Providers. It can answer Sinhala prompts in Sinhala script. If your Hugging Face account cannot use that provider, override `HF_CHAT_MODEL` with another provider-backed chat model from the Hugging Face playground.

## Routes

- UI: `/ai-chatbot`, `/image-analysis`, `/voice-messages`
- API: `/api/ai/chatbot`, `/api/ai/image-analysis`, `/api/ai/voice-messages`

## Scripts

```powershell
npm run dev
npm run lint
npm run build
```
