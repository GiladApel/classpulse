# ADR-001: PocketBase as the data, auth and realtime layer

| | |
|---|---|
| **Status** | Accepted (M1), reviewed after M13 |
| **Deciders** | Gilad Apel (architecture and implementation) |
| **Scope** | Persistence, authentication, realtime push and file storage |
| **Related** | [Components](05-components.md) §3 (architectural rules), [Tools report](01-tools-report.md) T1, [Testing](08-testing.md) |

## 1. Context

ClassPulse needs a backend platform that provides, from day one:

- **Identity:** Google sign-in for students, password sign-in for lecturers, and roles.
- **Fine-grained privacy:** some data must exist but never reach certain readers. Examples: the author of an anonymous question, the expected answers in a homework rubric, the AI's grade of a hand-in (lecturer only), a poll's correct answer until it closes, and copy-detection pairs.
- **Realtime fan-out:** a poll opening, a check-in or a lecturer's answer must appear on dozens of phones within a fraction of a second.
- **Protected files:** homework PDFs and handed-in solutions, readable only by the right people.
- **Schema as code**, reviewable in Git and repeatable across environments.

**The constraints are as decisive as the features:**

- **Scale:** one course, tens of students, at most around a hundred people at once in a lecture hall.
- **Infrastructure:** one existing server (1 vCPU, 1 GB RAM) that already hosts other applications. The budget for new infrastructure is zero.
- **Team:** one developer, in a fixed academic timeline. Every hour spent operating infrastructure is an hour not spent on the product.

## 2. Decision

We use **PocketBase** (a single Go binary embedding SQLite) for persistence, authentication, realtime subscriptions and file storage. We place **our own typed API (Hono, TypeScript) in front of it** for every write that carries a business rule.

PocketBase is treated as **infrastructure, not as the domain**. The domain never depends on it.

## 3. Options considered

| Criterion | **PocketBase** (self-hosted) | Supabase Cloud | Supabase self-hosted | Firebase | Postgres + own auth/realtime |
|---|---|---|---|---|---|
| Footprint on our server | One container, capped at 160 MB | None (hosted) | ~10 containers, several GB | None (hosted) | Postgres plus code we would write |
| Extra monthly cost | $0 | $0 (Free, pauses when idle) / ~$25 (Pro) | $0 | Usage-based | $0 |
| Auth (Google OAuth, roles) | Built in | Built in | Built in | Built in | Must build |
| Realtime | Built in (SSE) | Built in | Built in | Built in | Must build |
| Field-level privacy | Hidden fields plus per-collection rules | Row-level security; column privacy needs views | Same as Cloud | Rules; documents are read whole | Must build |
| Protected files | Built in, with file tokens | Storage with policies | Same | Storage with rules | Must build |
| Query power and scale-out | SQLite, one node | PostgreSQL, scales | PostgreSQL | NoSQL, scales | PostgreSQL |
| Maturity | Pre-1.0, single maintainer | Mature, commercial | Mature, heavy to operate | Mature, commercial | Mature |
| Lock-in | Low (our API and Repositories) | Medium | Medium | High (NoSQL model, proprietary SDK) | None |

**Why the others were rejected:**

- **Supabase Cloud** was the strongest alternative. It was rejected for this phase for three reasons:
  - the free tier pauses idle projects, a risk for an app used in weekly lectures;
  - it adds an external dependency and a second network hop in the hot path of a lecture;
  - it offers no capability we need that PocketBase lacks at this scale.
- **Supabase self-hosted** does not fit in the memory budget of the shared server.
- **Firebase** has a document model and proprietary SDK that would leak into the domain and maximize lock-in.
- **Postgres with hand-built auth and realtime** would spend most of the project's time rebuilding commodity infrastructure.

## 4. Why PocketBase was right for this system

- **Operational simplicity.**
  - One container.
  - The data is a single SQLite file, so a backup is a file copy.
  - Deployment is part of `deploy/deploy.sh` with no extra services.
- **Measured headroom.** Field test T1 ran on the production server:
  - 80 students checked in concurrently while 80 realtime subscribers listened;
  - 80/80 check-ins with 0 errors, p95 latency 183 ms;
  - 80/80 realtime events, p95 235 ms;
  - about 60 MB of RAM at rest for the whole stack.

  That is well beyond a single lecture hall.
- **Privacy expressed declaratively, and verified.** Sensitive values live in hidden fields that only the API (superuser) can read, including:
  - anonymous authors;
  - the homework rubric and the lecturer's notes;
  - final grades;
  - fingerprints and similar pairs.

  Collection rules decide who sees which row. Seven integration test suites (30 tests) run against a real PocketBase and assert, field by field, that each secret is absent for students and, where intended, for the lecturer too.
- **Realtime with no custom server.** PocketBase is the subject of an Observer: an API write notifies every subscribed client. We wrote no websocket code.
- **Cost:** $0 beyond the existing server.

## 5. Known limitations (accepted)

- **Single node.** SQLite allows one writer and PocketBase runs on one server. We cannot scale horizontally without changing the platform.
- **Pre-1.0 platform.** Upgrades may include breaking changes. We pin the version (0.40.6) and upgrade deliberately, behind the test suite.
- **Rules in a proprietary syntax.** Access rules are written in PocketBase's filter language. They are tested, but they are not portable SQL.
- **Direct client reads.** For responsiveness, the web client reads and subscribes to PocketBase directly. This is the main coupling outside the server; see §7.

## 6. How the architecture limits lock-in

The decision is cheap to reverse because of how the system is built, not because of PocketBase.

1. **The business layer never sees the database.**
   - Domain services such as `HomeworkAnalysisService`, `FeedService` and `CourseService` depend only on Repository interfaces declared in the domain (`content/repositories.ts`, `engagement/repositories.ts`, …).
   - PocketBase appears only in `infra/pb/`: **21 Repository implementations**, each a thin mapping between records and domain entities.
   - Every interface also has an in-memory implementation, used by the 188 unit and HTTP tests. That proves the domain runs without PocketBase at all.
2. **One composition root.** `container.ts` decides which implementations are wired. Swapping the persistence layer means changing that file and adding a new `infra/` package. Services, controllers and business rules are untouched.

   The same pattern already works for AI providers: Gemini and the Mock are interchangeable through the `LLMProvider` Strategy, chosen by configuration (`LLM_PROVIDER`).
3. **All business writes go through the API.** Collections that carry rules have `createRule`/`updateRule = null`, so clients cannot write around the domain. Validation, invariants (two checks per homework, one hand-in, a rubric locked after the first hand-in) and authorization live in TypeScript, not in the database.
4. **Schema as code.** The 15 migrations in `pocketbase/pb_migrations` describe every collection, index and rule. They are the specification a new schema would be derived from.
5. **Behaviour pinned by tests at three levels:**
   - unit and HTTP tests (database-independent);
   - integration tests (the privacy contract);
   - Playwright end-to-end tests (user flows).

   A migration is "done" when the same suites pass against the new platform.

## 7. Migration path to PostgreSQL / Supabase

| Area | What changes | What stays |
|---|---|---|
| Schema | 15 migrations become SQL tables, indexes and constraints | Entities and field meanings |
| Server persistence | New `infra/postgres/` Repositories implementing the same interfaces; `container.ts` rewired | All domain services, controllers and API routes |
| Authentication | Google OAuth and roles move to Supabase Auth; users sign in again once | `UserIdentity`, roles, admin logic |
| Access rules | PocketBase rules become Postgres row-level security; hidden fields become views or API-only columns | The privacy contract (same integration assertions) |
| Client reads and realtime | About 30 live subscriptions in 34 web files move from the PocketBase SDK to the Supabase client, behind one small data hook | Pages and components |
| Files | Homework PDFs and hand-ins move to Supabase Storage with matching policies | Upload limits and flows |
| Data | One-off export and import script | — |

**This is a bounded, contained change, not a rewrite.** Because the domain is separated from the platform (Repositories, an API-only write path, a single composition root and schema as code), none of the business logic has to change. The work is limited to the infrastructure layer and the client's data access. The highest-risk part is re-expressing the access rules as row-level security, and the existing integration assertions cover exactly that.

**Sequence:**
1. Server Repositories behind the existing tests.
2. Authentication.
3. Client reads, behind a single data-access hook.
4. Row-level security, adding a test per rule.
5. Files.
6. Data copy.
7. Cut-over.

Each step is verified by the existing suites, so the system can migrate gradually instead of being rewritten.

One improvement would make a future migration cheaper still: route the client's reads through a single data-access module, as the API already does on the server. It is not done now, because it adds indirection with no benefit at the current scale.

## 8. When to revisit this decision

Revisit when any of these become true:

- more than one institution or department, or a few hundred concurrent users per lecture;
- a need for more than one application server, or an availability SLA;
- analytical or cross-course reporting that calls for real SQL;
- PocketBase upgrades becoming a recurring cost, or the project being maintained by a team.

Until then, PocketBase remains the simplest platform that meets every requirement.

## 9. Consequences

**Positive:**
- Fast delivery.
- Near-zero operating cost and load.
- Privacy enforced by the platform and proven by tests.
- Realtime without custom infrastructure.
- A domain layer that is fully testable in memory.

**Negative:**
- No horizontal scaling.
- A pre-1.0 dependency.
- Access rules in a non-portable syntax.
- The client is coupled to the PocketBase SDK for reads.

**Mitigation:** the Repository boundary, the API-only write path and the test suites keep these negatives contained and make the migration in §7 a bounded, incremental project.
