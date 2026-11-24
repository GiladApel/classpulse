# ADR-005: Copy detection by token fingerprints, not embeddings

| | |
|---|---|
| **Status** | Accepted (M6), after field test T9; re-measured 2026-11-24 |
| **Deciders** | Gilad Apel |
| **Scope** | Similar hand-ins shown to the lecturer |
| **Related** | [EDD-Homework](../07-edd/homework.md) · [spike](../../spikes/copy-detection/) |

## Context
The lecturer wants to see hand-ins that are suspiciously similar. Students who copy rename variables. Every honest solution to the same task is about the same thing.

## Decision
Compare **normalised token fingerprints**: identifiers, numbers and strings are normalised; prose uses word shingles; a bottom-256 MinHash sketch estimates Jaccard similarity; pairs ≥ 0.5 go to the lecturer only, for review by hand.

## Options considered
| Option | Copy with renamed names | Two honest solutions | Threshold possible | Cost |
|---|---|---|---|---|
| **Token fingerprints (MinHash)** | 1.00 | ≤ 0.21 | Yes (0.5) | Free, offline |
| Gemini embeddings (cosine) | 0.97 | up to 0.94 | No (0.03 apart) | API calls |

## Consequences
- A renamed copy is caught; reordered logic or a rewrite in other words is not (acceptable: a human reviews).
- Fingerprints are stored as a hidden field and never shown to students.

## Evidence
[`spikes/copy-detection/result.json`](../../spikes/copy-detection/result.json): five Java solutions, one a renamed copy.
