# ADR-012: Identify students by their sign-in email

| | |
|---|---|
| **Status** | Accepted (M15), at the lecturer's request |
| **Deciders** | Gilad Apel |
| **Scope** | How a student is matched to a course roster |
| **Related** | [EDD-Courses](../07-edd/courses.md) · [SRS](../04-srs.md) FR-EN-01 … FR-EN-05 |

## Context
Until M14 a student typed their 9-digit ID on the first visit and the roster was a list of IDs. The lecturer asked to identify students by email instead, and to handle wrong emails. All records (check-ins, votes, submissions) are keyed by a student number.

## Decision
The roster lists **emails** (an ID is optional). On the first visit `StudentLinker` gives the user a **student key** (the roster ID if there is one, otherwise a generated 12-digit key) and writes it into every roster row with their email, which is what grants access. The lecturer sees rows still waiting for a sign-in and fixes a wrong email inline.

## Options considered
| Option | Student types | Wrong entry | Change to existing data |
|---|---|---|---|
| **Email roster + internal key** | Nothing | Lecturer fixes the email | Additive migration |
| Typed student ID (before) | 9 digits | Wrong person linked | — |
| Email as the key everywhere | Nothing | Lecturer fixes the email | Every collection changes |

## Consequences
- Records keep their key, so no existing data changed; access rules also require a non-empty key so an unlinked row never matches.
- A generated key is never shown; exports print the email and only a real ID.

## Evidence
`StudentLinker.test.ts`, `enrollment.int.test.ts` (an email row opens the course only to its student), E2E scenario 10b. Deployed 2026-11-24 with no change to production rows.
