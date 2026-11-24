# ADR-002: A separate TypeScript API (Hono) for business rules

| | |
|---|---|
| **Status** | Accepted (M1) |
| **Deciders** | Gilad Apel |
| **Scope** | Where business rules live |
| **Related** | [SDD](../06-sdd.md) §2.2, §8 · [ADR-001](ADR-001-database.md) |

## Context
The course grades design artifacts that map to code: classes, sequences, patterns. PocketBase can run JavaScript hooks, but they are functions attached to collection events, not classes with interfaces, and they cannot be unit-tested without a running database.

## Decision
Every write that carries a business rule goes through our own API, written in TypeScript with **Hono** on Node 24. Domain logic lives in classes behind interfaces; `container.ts` wires them.

## Options considered
| Option | Classes and interfaces | Unit tests without a DB | Size and speed | Typed routes |
|---|---|---|---|---|
| **Hono (Node, TS)** | Yes | Yes (`app.request`) | Tiny, fast | Yes |
| Express | Yes | Yes (supertest) | Larger, older types | Partly |
| Fastify | Yes | Yes | Fast, more ceremony | Yes |
| PocketBase JS hooks | No | No | No extra service | No |

## Consequences
- The class diagrams describe real classes; 211 unit and HTTP tests run in about 5 s without PocketBase.
- One more container to deploy (the API), and the API must stay single-instance (in-memory queue and locks).

## Evidence
Every service test (`apps/api/src/**/*.test.ts`) runs on in-memory repositories; HTTP tests call `createApp(...).request()` directly.
