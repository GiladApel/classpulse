# Spike: headcount and model choice (field tests T2, T8)

- **Goal:** count the people in a class photo well enough to notice extra check-ins, fast enough for a live lecture, on a model a new API key can use.
- **What we did:** [`detect.mts`](detect.mts) normalises the photo like the app does and runs the production `PeopleDetector` once per model and run, logging count, confidence and time to `results.jsonl`, and draws the boxes on a copy of the photo.
- **Run:** `npx tsx spikes/headcount/detect.mts class.jpg 3 gemini-3.1-flash-lite,gemini-3.5-flash`. Use your own classroom photo; photos of real people are not committed.
- **Result** (2026-11-05, one real classroom photo, ~25–26 people by eye):

| Model | Count | Time | Notes |
|-------|-------|------|-------|
| `gemini-3.1-flash-lite` | 24, 24, 24 | ~3 s | Stable; misses only people cut off at the frame edge; tight boxes on back-row faces (~40 px) |
| `gemini-3.5-flash` | 23–24 | ~25 s | Too slow for a live check |
| `gemini-3.8-flash`, `3.7-flash`, `flash-latest` | — | — | 503 "high demand" on every attempt |
| `gemini-2.5-*` | — | — | 404: closed to new keys |

- **Decision:** `gemini-3.1-flash-lite` as the default ([ADR-004](../../docs/adr/ADR-004-llm.md)); the count is advisory, so being one or two low is safe (the lecturer decides).
- **Still open:** T2 asks for 8 photos; only 1 is measured.
