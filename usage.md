# AI Usage

This project uses Novita-hosted Gemma only for the direct main shopping reply. Groq remains responsible for context, commerce reasoning, fallback replies, vision, and speech-to-text tasks.

Media routes use dedicated Groq model slugs because image and speech-to-text use different endpoint capabilities. Read-aloud uses the browser speech engine and does not call an AI model.

| Task | Where Used | API Route | Model Used                                                                                      |
| --- | --- | --- |-------------------------------------------------------------------------------------------------|
| First-message context extraction | Detects budget, recipient, and occasion from the user's first shopping message before showing the context card. | `src/app/api/ai/context-analysis/route.ts` | use groq  |
| Main shopping direct reply | Replies to shopping, event, gift box, and general user messages after context is set. | `src/app/api/ai/commerce/route.ts` | Novita Gemma; current Groq reply on rate limit, timeout, or provider failure |
| Standalone chatbot test page | Generates a short multilingual reply outside the main interface. | `src/app/api/ai/chatbot/route.ts` | Groq |
| Commerce reasoning and ranking | Ranks real Kapruka MCP products, writes recommendation reasons, creates event/gift-box responses, and generates compare-mode tables. | `src/app/api/ai/commerce/route.ts` | use groq |
| Commerce analytics and reply chips | Produces deterministic status, next action, risk, and localized follow-up controls without waiting for another model field. | `src/app/api/ai/commerce/route.ts` | Local code |
| Product comparison | User enters product IDs; the commerce route searches Kapruka MCP for product values and uses AI only for the AI suggestion field. | `src/app/api/ai/commerce/route.ts` | use groq |
| Order tracking AI suggestion | Kapruka MCP returns the tracking result, then AI writes a short next-step suggestion from that result. | `src/app/api/ai/commerce/route.ts` | use groq |
| Image search analysis | Analyzes uploaded image content to create product search hints. The raw analysis is not shown to the user. | `src/app/api/ai/image-analysis/route.ts` | `GROQ_VISION_MODEL`, otherwise `meta-llama/llama-4-scout-17b-16e-instruct` |
| Voice recognition and transcription | Converts recognized English voice input into text for product search. The recording popup states that voice search is English-only; unrecognized audio produces a retry message. | `src/app/api/ai/voice-messages/route.ts` | `whisper-large-v3-turbo` (fixed) |
| Voice reply output | Reads the latest English assistant message aloud using a preferred female English browser voice. The speaker is hidden in Sinhala and Singlish. | `src/kapruka-genie/KaprukaGenieApp.tsx` | Browser Speech Synthesis API; no AI model |

## Non-AI MCP Tasks

These tasks use Kapruka MCP directly and do not require an AI model unless paired with a chat/reasoning response.

| Task | API Route | Model Used |
| --- | --- | --- |
| Initial live product load | `src/app/api/ai/commerce/route.ts` | No AI model; Kapruka MCP search only |
| Product search | `src/app/api/ai/commerce/route.ts` | Kapruka MCP search first; AI is used only for ranking/reply on non-initial searches |
| Delivery check | `src/app/api/ai/commerce/route.ts` | No AI model; Kapruka MCP delivery check only when requested by the current message |
| Checkout link creation | `src/app/api/ai/commerce/route.ts` | No AI model; Kapruka MCP order creation |
| Order tracking lookup | `src/app/api/ai/commerce/route.ts` | Kapruka MCP tracking lookup first; AI is used only for the suggestion field |
