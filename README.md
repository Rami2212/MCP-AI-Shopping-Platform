# MCP AI Shopping Platform

Kapruka Genie is a multilingual AI-assisted shopping experience built with Next.js. It combines hosted LLMs, a live Kapruka MCP integration, guided shopping flows, delivery checks, product comparison, gift message generation, image-based search hints, and voice input into a single ecommerce workspace.

The app lives in the [`src`](D:/Projects/AI/MCP-AI-Shopping-Platform/src) directory and is designed around real catalog operations rather than mock product recommendations. The frontend talks to local Next.js API routes, and those routes orchestrate Groq, Hugging Face via Novita, and the Kapruka MCP server.

## Table of Contents

- [Project Overview](#project-overview)
- [Core Features](#core-features)
- [How the App Works](#how-the-app-works)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Pages and Routes](#pages-and-routes)
- [API Reference](#api-reference)
- [AI Model Routing](#ai-model-routing)
- [Kapruka MCP Integration](#kapruka-mcp-integration)
- [User Flows](#user-flows)
- [Architecture Notes](#architecture-notes)
- [Operational Behavior and Safeguards](#operational-behavior-and-safeguards)
- [Troubleshooting](#troubleshooting)
- [Deployment Notes](#deployment-notes)
- [Additional Project Files](#additional-project-files)

## Project Overview

This project implements an AI shopping assistant for Kapruka-style gifting and commerce use cases. Instead of offering only chat, it supports the full journey:

- understanding shopping intent and user context
- retrieving live products from the Kapruka MCP backend
- ranking and explaining product matches
- checking delivery feasibility for a city and date
- comparing real products by product ID
- preparing checkout-ready cart details
- generating gift card messages
- using images and voice as shopping inputs

The app supports `English`, `Sinhala`, `Singlish`, and `Tanglish` in different parts of the experience, with explicit prompt logic to preserve the intended language style.

## Core Features

- `Smart Shopping`: conversational product discovery with guided context collection
- `Event Planner`: structured planning flow for birthdays, office events, and gatherings
- `Gift Box Builder`: guided multi-item gift box creation
- `Product Compare`: compare two real Kapruka products using their product IDs
- `Order Tracking`: track an existing Kapruka order and generate a short next-step suggestion
- `Gift Message`: generate or refine gift-card copy in multiple supported language styles
- `Buy Box`: lightweight cart-style sidebar for selected products and checkout preparation
- `Delivery Checks`: asks Kapruka MCP for city/date availability when the user requests delivery details
- `Image Analysis`: analyzes an uploaded image and turns it into shopping hints and a search query
- `Voice Input`: speech-to-text for English shopping input
- `Read Aloud`: browser speech synthesis for the latest English assistant reply

## How the App Works

At a high level:

1. The user interacts with the UI rendered by [`src/kapruka-genie/KaprukaGenieApp.tsx`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/kapruka-genie/KaprukaGenieApp.tsx).
2. The app collects chat history, selected mode, shopping profile, cart state, and language choice.
3. The frontend calls local API routes under [`src/app/api/ai`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/app/api/ai).
4. Those routes call one or more of:
   - Groq hosted models
   - Hugging Face Inference Providers via Novita
   - Kapruka MCP tools at `https://mcp.kapruka.com/mcp`
5. The backend returns a normalized JSON response containing reply text, products, recommendations, delivery status, chips, analytics, or task-specific results.
6. The UI updates product cards, chat bubbles, guided chips, the buy box, and any delivery or checkout information.

## Tech Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `ESLint 9`
- `Groq API` for chat, reasoning, image analysis, and speech-to-text
- `Hugging Face Inference Providers` via Novita for selected reply generation
- `Kapruka MCP` for live commerce operations

## Repository Structure

```text
MCP-AI-Shopping-Platform/
|-- README.md
|-- usage.md
|-- ai-usage-and-models.txt
|-- netlify.toml
|-- Doc/
|   |-- Overview.docx
|   `-- sample.html
`-- src/
    |-- app/
    |   |-- api/ai/
    |   |   |-- chatbot/route.ts
    |   |   |-- commerce/route.ts
    |   |   |-- context-analysis/route.ts
    |   |   |-- image-analysis/route.ts
    |   |   `-- voice-messages/route.ts
    |   |-- ai-chatbot/page.tsx
    |   |-- demo-video/page.tsx
    |   |-- features/page.tsx
    |   |-- image-analysis/page.tsx
    |   |-- voice-messages/page.tsx
    |   |-- globals.css
    |   |-- layout.tsx
    |   `-- page.tsx
    |-- kapruka-genie/
    |   `-- KaprukaGenieApp.tsx
    |-- lib/
    |   |-- aiPayload.ts
    |   |-- deliveryLocations.ts
    |   |-- groqHosted.ts
    |   |-- huggingFaceNovita.ts
    |   |-- kaprukaMcp.ts
    |   `-- productCatalog.ts
    |-- public/
    |-- env.local.example
    `-- package.json
```

## Prerequisites

- `Node.js 20+` recommended
- `npm`
- a `Groq API key`
- a `Hugging Face token` with Inference Providers permission
- network access to the Kapruka MCP endpoint

## Local Setup

The runnable application is inside [`src`](D:/Projects/AI/MCP-AI-Shopping-Platform/src), so run commands there.

1. Install dependencies:

```powershell
cd src
npm install
```

2. Create a local environment file:

```powershell
Copy-Item env.local.example .env.local
```

3. Update `.env.local` with your API keys and any optional model overrides.

4. Start the development server:

```powershell
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

The default template is [`src/env.local.example`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/env.local.example).

### Required

- `GROQ_API_KEY`
- `HF_TOKEN`

### Commerce and Provider Configuration

- `KAPRUKA_MCP_URL`
- `MCP_REQUEST_TIMEOUT_MS`
- `GROQ_REQUEST_TIMEOUT_MS`
- `GROQ_TOTAL_TIMEOUT_MS`
- `HF_NOVITA_REPLY_TIMEOUT_MS`

### Text Model Selection

- `HF_NOVITA_REPLY_MODEL`
- `GROQ_REPLY_MODEL`
- `GROQ_PROCESSING_MODEL`
- `GROQ_CONTEXT_MODEL`
- `GROQ_COMMERCE_MODEL`
- `GROQ_ENGLISH_CHAT_MODEL`
- `GROQ_SINHALA_CHAT_MODEL`
- `GROQ_SINGLISH_CHAT_MODEL`
- `GROQ_GIFT_MESSAGE_MODEL`
- `GROQ_SINHALA_GIFT_MESSAGE_MODEL`
- `GROQ_SINGLISH_GIFT_MESSAGE_MODEL`
- `GROQ_BACKUP_MODEL`

### Vision Models

- `GROQ_VISION_MODEL`
- `GROQ_VISION_BACKUP_MODEL`

### Demo Page

- `NEXT_PUBLIC_DEMO_VIDEO_EMBED_URL`

### Default Example

```dotenv
GROQ_API_KEY=your_groq_key_here
HF_TOKEN=your_hugging_face_token_with_inference_permission

HF_NOVITA_REPLY_MODEL=Qwen/Qwen2.5-72B-Instruct:novita
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
GROQ_VISION_MODEL=qwen/qwen3.6-27b
GROQ_VISION_BACKUP_MODEL=qwen/qwen3.6-27b
```

## Available Scripts

Run these from [`src`](D:/Projects/AI/MCP-AI-Shopping-Platform/src):

```powershell
npm run dev
npm run build
npm run start
npm run lint
```

## Pages and Routes

### UI Pages

- `/`: main Kapruka Genie workspace
- `/features`: feature overview and mode guide
- `/demo-video`: embedded demo video page
- `/ai-chatbot`: loads the same app shell
- `/image-analysis`: loads the same app shell
- `/voice-messages`: loads the same app shell

### Internal API Routes

- `/api/ai/commerce`
- `/api/ai/context-analysis`
- `/api/ai/chatbot`
- `/api/ai/image-analysis`
- `/api/ai/voice-messages`

## API Reference

### `POST /api/ai/commerce`

Main orchestration route for shopping and commerce tasks.

Supports multiple tasks, including:

- `initial`: initial live product load
- `recommend`: general shopping reply and product recommendation flow
- `compare`: compare product IDs
- `checkout`: create a Kapruka checkout link
- `track`: track an order
- `giftMessage`: generate gift card text

Typical responsibilities:

- analyzes the message and preferences
- builds a product search query
- fetches live products from Kapruka MCP
- filters by budget when needed
- requests delivery checks when the user asks for delivery
- ranks or compares products with AI
- returns chips, analytics, normalized preferences, and product cards

### `POST /api/ai/context-analysis`

Analyzes the first shopping message and extracts:

- `budget`
- `recipient`
- `occasion`
- `category`
- `requestedGiftType`
- `missingFields`

This route mixes local heuristics with Groq analysis and preserves the selected language as authoritative.

### `POST /api/ai/chatbot`

Standalone chat route for lightweight multilingual chatbot testing. It accepts message history and a selected language, then returns one short reply paragraph.

### `POST /api/ai/image-analysis`

Accepts multipart form uploads with an `image` file. It sends the image to a Groq vision model and returns:

- a short `summary`
- visual `labels`
- `visibleText`
- `productHints`
- a `searchQuery`

If Groq vision is temporarily unavailable, it falls back to filename-based hint generation.

### `POST /api/ai/voice-messages`

Accepts multipart form uploads with an `audio` file and `language=en`.

Behavior:

- uses Groq `whisper-large-v3-turbo`
- supports English voice search only
- rejects unclear or non-recognized transcripts with a retry response
- does not handle read-aloud, because read-aloud is browser-side speech synthesis

## AI Model Routing

The routing behavior in code is task-specific rather than a single-model setup.

### Main Patterns

- `Groq` handles most analysis, ranking, comparison, context extraction, vision, and speech-to-text tasks
- `Hugging Face via Novita` is used for selected direct reply generation, especially non-English style-sensitive responses
- `Browser speech synthesis` handles read-aloud locally with no server model
- `Kapruka MCP` handles live commerce data and operations

### Current Default Routing Notes

Based on the repository's current code and config files:

- `/api/ai/context-analysis`: Groq
- `/api/ai/image-analysis`: Groq vision
- `/api/ai/voice-messages`: Groq Whisper
- `/api/ai/chatbot`: Groq by default, with Novita used for Tanglish when configured
- `/api/ai/commerce`:
  - live search, delivery checks, tracking lookup, and order creation come from Kapruka MCP
  - comparison, ranking, reasoning, and most commerce responses come from Groq
  - gift-message generation may use Novita first for non-English variants, then Groq fallback

Because model selection is environment-driven, check:

- [`ai-usage-and-models.txt`](D:/Projects/AI/MCP-AI-Shopping-Platform/ai-usage-and-models.txt)
- [`usage.md`](D:/Projects/AI/MCP-AI-Shopping-Platform/usage.md)
- [`src/env.local.example`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/env.local.example)

for the current documented defaults.

## Kapruka MCP Integration

The MCP client implementation is in [`src/lib/kaprukaMcp.ts`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/lib/kaprukaMcp.ts).

Important behavior:

- uses the Kapruka MCP endpoint `https://mcp.kapruka.com/mcp` by default
- initializes an MCP session and sends `notifications/initialized`
- reuses a short-lived session for performance
- expires sessions after 10 minutes
- handles both JSON and SSE-style MCP responses
- retries on invalid or expired session errors for most tools
- enforces a request timeout with `AbortController`

The commerce route uses MCP for operations such as:

- product search
- product detail retrieval
- delivery checks
- order creation
- order tracking

## User Flows

### Smart Shopping

1. User enters a natural request.
2. Context analysis extracts budget, recipient, occasion, and gift type.
3. The app asks for missing fields using guided chips.
4. The backend fetches matching live products from Kapruka MCP.
5. AI ranks and explains the product matches.
6. The user adds products to the buy box or asks for more suggestions.

### Event Planner

1. User chooses the mode.
2. The UI collects event type, participant count, venue, and budget.
3. The commerce route searches for relevant products and builds a guided planning response.
4. The user continues using the guided controls under product cards.

### Gift Box Builder

1. User selects recipient, theme, item count, and budget.
2. The system searches live products that fit the theme and budget.
3. The user iterates with guided actions and adds products to the buy box.

### Product Compare

1. User copies real product IDs from product cards.
2. The app fetches those products from Kapruka.
3. AI generates a concise comparison or falls back to a deterministic local summary.

### Checkout

1. User adds products to the buy box.
2. User provides recipient, sender, city, date, and address details.
3. The app validates required checkout fields.
4. Kapruka MCP creates a guest checkout link.

### Order Tracking

1. User enters a Kapruka order number.
2. MCP returns the latest tracking result.
3. AI optionally converts that result into a short next-step suggestion.

## Architecture Notes

### Frontend

- Main app shell: [`src/kapruka-genie/KaprukaGenieApp.tsx`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/kapruka-genie/KaprukaGenieApp.tsx)
- App entry page: [`src/app/page.tsx`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/app/page.tsx)
- Shared UI logic includes:
  - multilingual copy and mode switching
  - guided chip flows
  - chat state persistence
  - buy box/cart state
  - image upload and voice recording
  - browser speech synthesis

### Backend Helpers

- [`src/lib/groqHosted.ts`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/lib/groqHosted.ts): Groq requests, retries, and fallback behavior
- [`src/lib/huggingFaceNovita.ts`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/lib/huggingFaceNovita.ts): Novita-hosted Hugging Face requests
- [`src/lib/productCatalog.ts`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/lib/productCatalog.ts): product normalization and formatting
- [`src/lib/deliveryLocations.ts`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/lib/deliveryLocations.ts): delivery city and location handling
- [`src/lib/aiPayload.ts`](D:/Projects/AI/MCP-AI-Shopping-Platform/src/lib/aiPayload.ts): payload parsing and model output cleanup

## Operational Behavior and Safeguards

The code includes several important constraints and guardrails:

- only the latest few conversation turns are reused in some model calls to keep prompts focused
- budget-aware filtering is applied to product results before rendering
- MCP requests are timeout-bounded
- product searches and normalized city lookups are cached
- delivery checks are only triggered when the message actually asks about delivery
- non-past delivery dates are enforced for checkout and delivery flows
- image uploads are capped at `4 MB`
- audio uploads are capped at `12 MB`
- voice search is English-only
- unclear speech returns a retry instruction instead of unreliable text
- some model outputs are cleaned with `stripModelThinking` before use

## Troubleshooting

### App starts but AI routes fail

Check:

- `GROQ_API_KEY` is set
- `HF_TOKEN` is set when Novita-backed flows are needed
- the dev server was restarted after `.env.local` changes

### Live product search fails

Check:

- network access to `https://mcp.kapruka.com/mcp`
- `KAPRUKA_MCP_URL` if you overrode it
- timeout settings if the MCP backend is slow

### Voice input does not work

Check:

- you are sending English speech
- the uploaded or recorded audio is under 12 MB
- the browser granted microphone access

### Image analysis fails

Check:

- the file is under 4 MB
- the Groq vision model is available
- your Groq key has access to the configured model

### Demo video page is blank

Set:

- `NEXT_PUBLIC_DEMO_VIDEO_EMBED_URL`

The page accepts a Google Drive file URL and converts it to an embeddable preview URL.

## Deployment Notes

- [`netlify.toml`](D:/Projects/AI/MCP-AI-Shopping-Platform/netlify.toml) is present, so Netlify deployment is expected or supported
- all AI services are remote; no model weights are downloaded locally
- environment variables must be configured in the deployment platform
- browser-only features like microphone access and speech synthesis depend on client support

## Additional Project Files

- [`usage.md`](D:/Projects/AI/MCP-AI-Shopping-Platform/usage.md): task-to-model usage notes
- [`ai-usage-and-models.txt`](D:/Projects/AI/MCP-AI-Shopping-Platform/ai-usage-and-models.txt): current model defaults and routing notes
- [`Doc/Overview.docx`](D:/Projects/AI/MCP-AI-Shopping-Platform/Doc/Overview.docx): source overview material
- [`Doc/sample.html`](D:/Projects/AI/MCP-AI-Shopping-Platform/Doc/sample.html): reference styling and UI inspiration

## License

No license file is currently included in this repository. Add one if you plan to distribute or open-source the project.
