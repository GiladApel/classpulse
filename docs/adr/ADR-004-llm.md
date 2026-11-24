# ADR-004: Gemini 3.1 Flash-Lite behind an LLMProvider interface

| | |
|---|---|
| **Status** | Accepted (M4), reviewed after T8 |
| **Deciders** | Gilad Apel |
| **Scope** | Every AI task: headcount, poll drafts, summaries, reports, homework |
| **Related** | [EDD-AI](../07-edd/ai.md) · [Tools report](../02-tools-report.md) T2, T3, T8, T10 · [spike](../../spikes/headcount/) |

## Context
The AI tasks need images (class photo, slide), long video (a lecture), PDFs (homework) and structured output. A new API key on the free tier must be enough for one class, and the demo must work even if the service is down (NFR-08).

## Decision
All model access goes through the `LLMProvider` interface (Strategy); one class per task owns its prompt, JSON schema and validation. The production provider is **Gemini**, default model **`gemini-3.1-flash-lite`**; tests and the fallback use `MockProvider`.

## Options considered
| Option | Images, video, PDF | Structured JSON | Speed (headcount) | Available to a new key |
|---|---|---|---|---|
| **Gemini 3.1 Flash-Lite** | All, native | JSON schema | ~3 s | Yes |
| Gemini 3.5 Flash | All, native | JSON schema | ~25 s | Yes |
| Gemini 3.7/3.8 Flash | All, native | JSON schema | — | 503 high demand |
| Whisper + a text model | Audio only, two services | Varies | — | Yes |
| Other vendors | Images, PDF; video varies | Yes | Not measured | Paid key |

## Consequences
- Video goes straight to the model (no separate transcription); large files use the Gemini Files API.
- The SDK retries 429/5xx only when configured, so retries are enabled explicitly.
- Another vendor is one new class plus one factory line; no service changes.

## Evidence
T8 (model choice): `3.1-flash-lite` counted 24 people in ~3 s on every run; `3.5-flash` 23–24 in ~25 s; bigger models 503. T3: an 88 s lecture summarised in 12–17 s.
