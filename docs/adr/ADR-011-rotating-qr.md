# ADR-011: A rotating, signed QR token for check-in

| | |
|---|---|
| **Status** | Accepted (M3) |
| **Deciders** | Gilad Apel |
| **Scope** | How a student proves they are in the room |
| **Related** | [EDD-Attendance](../07-edd/attendance.md) |

## Context
Check-in must take one scan (NFR-01), and a photo of the code sent to a friend at home must not work. Phones in the back row may be a few seconds slow.

## Decision
The projector shows a QR with an **HMAC-signed token that changes every 10 s**; a token is accepted in its own and the next window (≤ 20 s). The secret never leaves the server. Location adds a lenient check.

## Options considered
| Option | Photo sent home | Taps | Slow phones |
|---|---|---|---|
| **Rotating signed token (10 s)** | Expires in ≤ 20 s | 1 scan | Next window accepted |
| Static QR per lesson | Works all lesson | 1 scan | Yes |
| Typed code | Works all lesson | Several | Yes |

## Consequences
- A friend at home needs a live relay of the projector; the anti-fraud checks cover the rest.
- The window is configurable (`QR_WINDOW_SEC`); E2E uses 3 s to test expiry quickly.

## Evidence
Unit tests of `QrTokenService` (windows, tampering, other lesson); E2E scenario 2; field test T4 (QR from the back row) is pending.
