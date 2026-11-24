# ADR-009: Vitest, Playwright and k6; CI on GitHub Actions

| | |
|---|---|
| **Status** | Accepted (M2), CI added in M15 |
| **Deciders** | Gilad Apel |
| **Scope** | How the system is tested |
| **Related** | [STP/STD](../08-stp-std.md) |

## Context
The code is TypeScript with native ESM; flows span a phone, a lecturer screen and live updates; the load requirement is 80 check-ins in 30 s.

## Decision
**Vitest** for unit, HTTP and integration tests; **Playwright** for E2E with emulated phones, on Chromium and WebKit in CI; **k6** plus 80 server-sent-event listeners for load; **GitHub Actions** on every push.

## Options considered
| Option | ESM / TS | Several browser contexts | Safari engine | Load |
|---|---|---|---|---|
| **Vitest + Playwright + k6** | Native | Yes | WebKit | k6 |
| Jest + Cypress | Config needed | One tab per test | No | — |
| Puppeteer only | — | Yes | No | — |

## Consequences
- Every push runs every level; a Must requirement without a test fails CI (`npm run trace`).
- E2E runs against a real PocketBase in Docker, so CI is slower (~5 minutes).

## Evidence
CI runs on every push; measured results in the STD and the load test (T1).
