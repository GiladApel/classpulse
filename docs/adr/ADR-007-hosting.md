# ADR-007: Host on our VPS with Docker Compose behind Cloudflare

| | |
|---|---|
| **Status** | Accepted (M7) |
| **Deciders** | Gilad Apel |
| **Scope** | Where the app runs during the course and the demo |
| **Related** | [SDD](../06-sdd.md) §5 · [ADR-001](ADR-001-database.md) |

## Context
The camera and location need HTTPS; the demo is live in class and cannot wait for a cold start; the budget for new infrastructure is zero; a server that already hosts other apps is available.

## Decision
Run PocketBase, the API and nginx in **Docker Compose** on the existing VPS, behind a **Cloudflare tunnel** (HTTPS, no open ports), on one hostname so the browser sees one origin.

## Options considered
| Option | Cold start | HTTPS | Cost | Control |
|---|---|---|---|---|
| **Own VPS + Cloudflare tunnel** | None | Cloudflare | $0 extra | Full |
| Render (free) | Sleeps when idle | Yes | $0 | Limited |
| Fly.io | Configurable | Yes | Usage-based | Medium |

## Consequences
- No cold start during the demo; HTTPS without managing certificates; the PocketBase admin is reachable only through an SSH tunnel.
- Memory is shared (1 GB): containers have limits (PocketBase 160 MB, API 320 MB, nginx 48 MB).

## Evidence
T1: 80 check-ins in 30 s on this server, p95 183 ms, ~60 MB RAM at rest for the whole stack.
