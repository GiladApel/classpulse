# Spike: copy detection (field test T9)

- **Goal:** flag a copied homework solution even when the copier renamed every identifier, without flagging two honest solutions to the same task.
- **What we did:** five Java solutions to one task (count words, print the 3 most common) in [`solutions/`](solutions/). `s4` is `s2` with every class, method and variable renamed and a comment added; the others are written independently. [`compare.mts`](compare.mts) scores every pair with (1) the production `Fingerprinter` (normalised token shingles, MinHash sketch) and (2) Gemini embeddings with cosine similarity.
- **Run:** `npx tsx spikes/copy-detection/compare.mts` (embeddings only when `GEMINI_API_KEY` is set).
- **Result** ([`result.json`](result.json), 2026-11-24):

| Method | Copy (s2–s4) | Highest honest pair | Usable threshold? |
|--------|--------------|---------------------|-------------------|
| Token fingerprints | **1.00** | 0.21 | Yes: anything ≥ 0.5 |
| Gemini embeddings (`gemini-embedding-001`) | 0.97 | 0.94 | No: 0.03 apart |

- **Decision:** fingerprints ([ADR-005](../../docs/adr/ADR-005-copy-detection.md)). Embeddings measure *what the code is about*, and every solution to the same task is about the same thing.
- **Time spent:** ~1 hour, both runs.
