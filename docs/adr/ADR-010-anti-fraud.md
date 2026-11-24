# ADR-010: Anti-fraud by counting and spot checks, not face recognition

| | |
|---|---|
| **Status** | Accepted (M4) |
| **Deciders** | Gilad Apel |
| **Scope** | How a friend checking in for an absent student is caught |
| **Related** | [EDD-AntiFraud](../07-edd/anti-fraud.md) · [SoW](../03-sow.md) §3 |

## Context
A rotating QR stops a photo sent home, but a friend in the room can still check in from two phones. Recognising each student would solve it but needs consent, a face database and accuracy in a lecture hall.

## Decision
Count people in a class photo with the model; when check-ins exceed the count, run a **Roll-call** (rescan a one-time QR) or a **Visual Ping** (tap your seat on a blurred photo). Labels flag records; **the lecturer decides**.

## Options considered
| Option | Privacy | Catches two phones | Setup |
|---|---|---|---|
| **Count + spot checks** | No faces stored | Yes (collisions, empty seats) | One photo |
| Face recognition | Face database, consent | Yes | Enrolment photos |
| Bluetooth proximity | Good | No (same room) | An installed app |

## Consequences
- No biometric data; the clear photo is deleted at the end of the lesson.
- A model that miscounts only triggers a check; it never removes anyone.

## Evidence
E2E scenario 4 (empty seat flagged); unit tests of `SeatHitTester`; T2 headcount accuracy.
