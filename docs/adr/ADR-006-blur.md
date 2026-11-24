# ADR-006: Blur the class photo on the server

| | |
|---|---|
| **Status** | Accepted (M4) |
| **Deciders** | Gilad Apel |
| **Scope** | What students see in a Visual Ping |
| **Related** | [EDD-AntiFraud](../07-edd/anti-fraud.md) · [EDD-Infrastructure](../07-edd/infra.md) |

## Context
In a Visual Ping every checked-in student sees the class photo to tap their seat. They must find their seat without being able to see or identify classmates (NFR-04).

## Decision
The server produces a **heavily blurred copy** with sharp (downscale to 480 px, blur, upscale, blur again, JPEG) and sends only that to students. The clear photo is for the lecturer only and is deleted when the lesson ends.

## Options considered
| Option | Clear photo leaves the server | Faces recoverable | Seats visible |
|---|---|---|---|
| **Server-side blur (sharp)** | No | No | Yes |
| Blur in the browser (canvas) | Yes, to every phone | Yes, from the original | Yes |
| No photo (seat number) | No | — | No, students do not know seat numbers |

## Consequences
- Students never receive the clear photo; the blurred copy is a separate file.
- Blur strength is a parameter (σ = 30); field test T6 checks the lowest σ that still hides faces.

## Evidence
Integration test `challenges.int.test.ts` (real image processing, protected files); field test T6 is pending.
