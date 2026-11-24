# ADR-003: React + Vite + Tailwind for the web app

| | |
|---|---|
| **Status** | Accepted (M1) |
| **Deciders** | Gilad Apel |
| **Scope** | The student, lecturer and projector screens |
| **Related** | [SDD](../06-sdd.md) §2.1 |

## Context
Students use their phone browser with nothing to install (KISS, NFR-05); the interface is Hebrew, right to left; the lecturer needs a dense dashboard and a projector view. One developer must build all three quickly.

## Decision
A single **React 19** app built with **Vite**, styled with **Tailwind** using logical (start/end) properties for RTL, served as a static site, reading PocketBase directly for live data.

## Options considered
| Option | Familiarity | RTL | Build speed | Ecosystem |
|---|---|---|---|---|
| **React + Vite + Tailwind** | High | Logical properties | Fast | Largest |
| Vue | Medium | Logical properties | Fast | Large |
| SvelteKit | Low | Logical properties | Fast | Smaller |
| Native apps | Low | Native | Slow | Two codebases |

## Consequences
- One codebase for phones, the dashboard and the projector; works on iOS Safari and Android Chrome (E2E on WebKit and Chromium in CI).
- No offline support; the app needs the network in class (risk R-4).

## Evidence
The E2E suite runs the same app on emulated iPhone 13 and Pixel 7 and a desktop window.
