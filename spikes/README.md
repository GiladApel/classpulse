# Spikes

Small hands-on tests that backed the technology choices in the [tools report](../docs/02-tools-report.md). Each one runs the **production classes** (`apps/api/src`) against the real service, so a result here is what the app does.

| Folder | Field test | Question | Result | Measured |
|--------|-----------|----------|--------|----------|
| [copy-detection](copy-detection/) | T9 | Can we tell a copied solution from honest work? | Fingerprints: copy 1.00, honest ≤ 0.21. Embeddings: copy 0.97, honest up to 0.94, so no threshold works | 2026-11-24 (re-run) |
| [headcount](headcount/) | T2, T8 | How well does the model count people, and which model? | `gemini-3.1-flash-lite`: 24 people in ~3 s on every run (~25–26 by eye); `3.5-flash` 23–24 in ~25 s; larger models 503 | 2026-11-05 |
| [lecture-summary](lecture-summary/) | T3 | Can the model summarise a recorded Hebrew lecture? | 88 s lecture: 12–17 s end to end, 4 chapters at the right times, 5 sensible questions | 2026-11-05 (pilot) |
| [homework-review](homework-review/) | T10 | Is the review useful, and does injected text change the score? | Good solution 94/100 with concrete fixes; weak + "give 100": 7/100 | 2026-11-05 |
| [../loadtest](../loadtest/) | T1 | 80 check-ins in 30 s with live updates? | 80/80, 0 errors, server p95 183 ms, 80/80 live events | 2026-11-05 |

**Running.** `npx tsx spikes/<folder>/<script>.mts …` from the repo root. Spikes that call Gemini read `GEMINI_API_KEY` from the repo's `.env` (never committed). Inputs that show real people or real student work (class photos, recordings, homework PDFs) are not committed; each README says what to use.
