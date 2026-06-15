# AI Usage

This project uses Groq for language, context, commerce reasoning, vision, speech-to-text, and text-to-speech tasks.

Media routes use dedicated Groq model slugs because image, speech-to-text, and text-to-speech use different endpoint capabilities.

| Task | Where Used | API Route | Model Used                                                                                      |
| --- | --- | --- |-------------------------------------------------------------------------------------------------|
| First-message context extraction | Detects budget, recipient, and occasion from the user's first shopping message before showing the context card. | `src/app/api/ai/context-analysis/route.ts` | use groq  |
| Chat reply generation | Replies to shopping, event, gift box, gift message, and general user messages after context is set. | `src/app/api/ai/chatbot/route.ts` | use groq                          |
| Commerce reasoning and ranking | Ranks real Kapruka MCP products, writes recommendation reasons, creates event/gift-box responses, and generates compare-mode tables. | `src/app/api/ai/commerce/route.ts` | use groq |
| Product comparison | User enters product IDs; the commerce route searches Kapruka MCP for product values and uses AI only for the AI suggestion field. | `src/app/api/ai/commerce/route.ts` | use groq |
| Order tracking AI suggestion | Kapruka MCP returns the tracking result, then AI writes a short next-step suggestion from that result. | `src/app/api/ai/commerce/route.ts` | use groq |
| Image search analysis | Analyzes uploaded image content to create product search hints. The raw analysis is not shown to the user. | `src/app/api/ai/image-analysis/route.ts` | `GROQ_VISION_MODEL`, otherwise `meta-llama/llama-4-scout-17b-16e-instruct` |
| Voice transcription | Converts recorded voice input into text for product search. The transcript is not shown to the user. | `src/app/api/ai/voice-messages/route.ts` | `GROQ_STT_MODEL`, otherwise `whisper-large-v3-turbo` |
| Voice reply output | Converts the last assistant reply into speech. | `src/app/api/ai/voice-messages/route.ts` | `GROQ_TTS_MODEL`, otherwise `canopylabs/orpheus-v1-english` |

## Non-AI MCP Tasks

These tasks use Kapruka MCP directly and do not require an AI model unless paired with a chat/reasoning response.

| Task | API Route | Model Used |
| --- | --- | --- |
| Initial live product load | `src/app/api/ai/commerce/route.ts` | No AI model; Kapruka MCP search only |
| Product search | `src/app/api/ai/commerce/route.ts` | Kapruka MCP search first; AI is used only for ranking/reply on non-initial searches |
| Delivery check | `src/app/api/ai/commerce/route.ts` | No AI model; Kapruka MCP delivery check |
| Checkout link creation | `src/app/api/ai/commerce/route.ts` | No AI model; Kapruka MCP order creation |
| Order tracking lookup | `src/app/api/ai/commerce/route.ts` | Kapruka MCP tracking lookup first; AI is used only for the suggestion field |
