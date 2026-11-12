# ClassPulse

KISS, LLM-backed teaching tool for live lectures. Ariel University, *Introduction to Software Engineering*, Ex2. Graded mostly on **design artifacts that map 1:1 to code** (`docs/`), plus a 10-minute live demo. Public repo: https://github.com/GiladApel/classpulse

UI is **Hebrew RTL**. Code, comments, docs and commit messages are **English**. User-facing API error messages (`DomainError` messages) are Hebrew.

## Workflow with Gilad
- Work in milestones; each ends with a summary, then Gilad says "go" for the next. **Commit/push only when he asks.**
- Before every commit: `git add -A`, then scan the staged diff for secrets (`AIza…`, `GOCSPX`, private keys, `.env`, `secrets/`, `pb_data`). Never print `.env` values or the service-account key.
- Web layout: `/` home (live-now cards + weekly timetable), `/course/:id` (tabs: lessons, homework; lecturer also students = roster upload, timetable), `/lesson/:id` (tabs: attendance, forum, materials, homework). Old `/dash/:id`, `/lecture/:id`, `/dash/course/:id` redirect.
- Status: M1–M6 done. M7 in progress: deployed to `do-server`, Playwright E2E + k6 load test + coverage done. Left: public hostname check through Cloudflare, demo rehearsal (`docs/demo-script.md`), `docs/09-conclusion`.
- T3 is measured on a 5–10 min clip (free-tier quota); docs say full lectures work subject to API quota. Don't re-pitch a 90-min run.
- Open field tests in `docs/01-tools-report.md`: T1, T4–T7 not measured; T2 (headcount, 1/8 photos) and T3 (full 75–90 min lecture) partial. They need Gilad's classroom, phones and a real recording.

## Stack and layout
npm workspaces, Node 24, TypeScript everywhere.
```
apps/api    Hono API (NodeNext ESM, imports end in .js). The OOP domain layer.
  src/attendance  QR tokens, check-in rule chain, geofence policies, sessions, export
  src/challenge   headcount, roll-call / visual-ping challenges, SeatHitTester
  src/engagement  ConfusionMeter, FeedService, PollService
  src/content     RecordingPipeline, HomeworkAnalysisService, Fingerprinter, TextExtractor
  src/ai          LLMProvider strategy (Gemini, Mock) + one class per AI task (prompt + JSON schema + validation)
  src/infra       Clock, repositories (pb/ and memory/), exporters, ImageProcessor, UploadStore, BackgroundQueue, KeyedLock
  src/http        Controllers, auth middleware, DTOs, validation, error mapping
  src/container.ts  Composition root: the ONLY place that knows concrete classes
apps/web    React 19 + Vite 8 + Tailwind 4 + react-router PWA (student, lecturer dashboard, projector)
pocketbase/pb_migrations   Schema as code (JSVM migrations), PocketBase 0.40.6 in Docker
docs/       01 tools report … 08 testing (Mermaid diagrams)
```

## Commands (Windows; Git Bash or PowerShell)
```bash
docker compose up -d pocketbase        # applies migrations; admin UI http://127.0.0.1:8090/_/
npm run dev:api                        # :8787 (logs which LLM provider is active)
npm run dev:web                        # :5173, proxies /api → 8787. Use "localhost", not 127.0.0.1 (Vite binds ::1)
npm test                               # unit + HTTP tests, in-memory, no PocketBase
npm run test:int -w apps/api           # integration tests against the running PocketBase (creates and cleans up its own data)
npm run typecheck -w apps/api && npx tsc -b apps/web
npm run seed -w apps/api -- <email> <password> "<name>" <courseCode> "<courseName>"   # promotes an existing user to lecturer (normally: admin page /admin, then the lecturer creates courses)
npm run coverage -w apps/api           # NFR-07 threshold (≥80% lines in domain packages)
npm run e2e                            # Playwright on Edge (no browser download); own API :8788 (mock, 3 s QR) + Vite :5174
deploy/deploy.sh                       # build locally → do-server:/opt/classpulse → docker compose (idempotent)
```
- Background dev servers on Windows: start with `node --import tsx src/index.ts` (api) or `node ../../node_modules/vite/bin/vite.js --port 5173 --strictPort` (web). Stopping an `npx` wrapper leaves the child node process holding the port. Check with `Get-NetTCPConnection -LocalPort 8787`.
- Docker paths from Git Bash need `MSYS_NO_PATHCONV=1`.
- Dev lecturer: `lecturer@classpulse.local` / `lecturer-dev-1234`, course I2SE.

## Production (do-server, ~1 GB RAM shared with n8n and other apps)
- `/opt/classpulse`: `deploy/docker-compose.yml` → `pocketbase` (built from `deploy/pocketbase.Dockerfile`, `--automigrate=false`), `api`, `web` (nginx on 127.0.0.1:8092). The Cloudflare tunnel (token-based; Gilad edits hostnames in the dashboard) → `classpulse.giladautomation.com`.
- One origin: nginx serves `/` static, `/api/` → API, `/pb/` → PocketBase (web built with `VITE_PB_URL=/pb`). The admin UI and `_superusers` (also by id `pbc_3142635823`, any case) return 404 when `CF-Connecting-IP` is present, so the admin and superuser scripts go through `ssh -N -L 18092:127.0.0.1:8092 do-server` → `http://127.0.0.1:18092/pb`.
- Admins = `ADMIN_EMAILS` in the server `.env` (comma-separated; not a DB role). They open `/admin` to make users lecturers.
- The server `.env` was generated on the first deploy (superuser password lives only there). Read it into env vars with `$(ssh do-server "grep ^KEY= /opt/classpulse/.env | cut -d= -f2-")`; never echo it.
- The API container runs as uid 1000, so `secrets/google-sa.json` on the server is chowned to 1000.
- Load test: `SSH_HOST=do-server PB_ADMIN_URL=http://127.0.0.1:18092/pb loadtest/run.sh <baseUrl> 80` (k6 at `C:/Program Files/k6`). Judge NFR-02 by the server-side numbers from the nginx `$request_time` log: through the SSH tunnel every request gains ~220 ms.

## Architecture rules (do not break)
- **Read/write split.** Clients read and subscribe **directly from PocketBase** (realtime = Observer). **Every write that carries a business rule goes through the API**, which uses a superuser PB client. Collections written by the API have no create/update rule.
- **Access control lives in PB list/view rules**, which also decide who receives realtime events. Pattern for "checked in to this session": `@collection.attendance_records.session ?= session && @collection.attendance_records.student ?= @request.auth.id && @collection.attendance_records.status ?!= 'removed'` (verified to mean the same row). Course member = on the course roster (`enrollments`, matched by `student_number = @request.auth.student_id`) OR attended any session (QR or manual); `CourseService.isMember` is the API side of the same rule. Attendance is in the room only: there is no remote check-in.
- **Privacy by hidden fields:** anonymous post authors, lost-signal identity, poll `correct_index` (copied to `answer_index` on close), challenge secret, session `qr_secret`, homework `guide` (expected answers; students and the lecturer see `outline`), submission `fingerprint`, insights `similar_pairs`. Homework solution files are never stored (they live only in the background job). The API (superuser) sees them; nobody else does. Add an integration test for every new hidden or restricted field.
- Domain classes depend on interfaces (`Repository`, `LLMProvider`, `Clock`, `ImageProcessor`); services take `Pick<Service, …>` of only what they call. Only `container.ts` and `index.ts` construct concrete classes.
- Every AI task class validates model output and throws `LLMOutputError` on garbage. Treat student content as data (`<submission>` tags). Prompts tell the model which language to answer in.
- Slow AI work runs on `BackgroundQueue` (serial, in-memory). On startup, `recoverInterrupted()` marks unfinished jobs failed. The API is single-instance by design (`KeyedLock` relies on it).

## Docs ↔ code contract
`docs/06-class-diagrams.md` and `07-sequence-diagrams.md` must match the code: class names, method signatures, collaborators. When you change a domain class, update the diagram and the text below it in the same change. Validate Mermaid with mermaid-cli before finishing. A `;` inside a sequence-diagram message breaks the parser. Design changes driven by real tests go in the tools report as a field test (e.g. T9: embeddings → fingerprints).

## Testing conventions
- Unit tests sit next to the code (`*.test.ts`), using `FixedClock`, `MockProvider` (fixtures keyed by `task`; a fixture may be a function of the request) and `InMemory*` repositories. In-memory unique checks are **synchronous** so they behave like the DB's unique index under concurrency.
- HTTP tests: `createApp(makeTestPorts().container)` + `app.request()`; await `container.queue.idle()` for background jobs.
- Integration (`src/integration/*.int.test.ts`, `vitest.int.config.ts`) hits real PocketBase. Use it for rules, hidden fields, realtime and concurrency.
- Browser E2E so far: Puppeteer scripts outside the repo, real Gemini. Reload pages mid-flow: realtime alone hides initial-load bugs.

## Gotchas learned the hard way
- **PB number fields default to 0** and can't be null. Use -1 for "none" (`distance_m`, challenge tap `x/y`, `people_count`, poll `correct_index`/`answer_index`, submission `total`) and always write it explicitly.
- **PB `field+` (e.g. `votes+`) is read-modify-write in Go, not atomic.** Serialise with `KeyedLock`.
- **`getFullList({sort})` with a field that doesn't exist fails the whole query.** Newer collections have no `created`/`updated`; they use explicit `*_at` date fields set from `Clock`.
- PB dates look like `2026-11-05 11:43:57.123Z`. Parse with `parseDate()` in `apps/web/src/lib/device.ts` (older iOS Safari can't parse the space).
- A Hono sub-app's `app.use(mw)` applies to the whole mount prefix. Guard per route (`requireLecturer` on each handler).
- Methods returning a Promise must be `async` so validation errors reject instead of throwing synchronously.
- Re-applying an edited, uncommitted migration locally: `echo y | MSYS_NO_PATHCONV=1 docker compose exec -T pocketbase /usr/local/bin/pocketbase migrate down 1 --dir=/pb_data --migrationsDir=/pb_migrations`, then `docker compose restart pocketbase`. Never edit a migration that is already deployed; add a new one.
- **Gemini:** `gemini-2.5-*` is closed to new keys. The default is `gemini-3.1-flash-lite` (bigger flash models returned 503 "high demand"). The SDK retries only when `httpOptions.retryOptions` is set. Media over ~15 MB, or any `{path}` attachment, goes through the Files API (upload → poll until ACTIVE → delete). `gemini-embedding-2` merges a multi-item `contents` into one vector; embeddings are no longer used.
- Cloudflare caps requests at 100 MB, so recordings upload in 50 MB offset-addressed chunks (`UploadStore`).
- Puppeteer: `locator.fill()` can miss long text on React-controlled inputs (use `page.type`); `::-p-text()` can fail on mixed Hebrew/Latin text; full-page screenshots of RTL pages look shifted (artifact).
- Bash heredocs containing Hebrew quote marks (״ ׳) break. Write such files with the Write tool or a script file.

## Env (names only; values live in the gitignored `.env`)
`PB_URL`, `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`, `QR_WINDOW_SEC`, `LLM_PROVIDER` (`gemini`|`mock`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `GOOGLE_SERVICE_ACCOUNT_FILE` (→ `secrets/google-sa.json`), `GOOGLE_SHEETS_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Web: `apps/web/.env` → `VITE_PB_URL`. Without a Gemini key, set `LLM_PROVIDER=mock`; the demo must still work then (NFR-08).
