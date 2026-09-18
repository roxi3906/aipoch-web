# AIPOCH Web

Standalone Next.js 16 application using React, TypeScript, Tailwind CSS and Bun.
The repository root is the application root. UI primitives are local source files
in `components/ui`; all dependencies are declared in one `package.json`.

## Local development

Use Bun 1.3.14 (the same version used by the Docker image):

```sh
bun install --frozen-lockfile
cp .env.example .env.local
bun run dev
```

Fill the runtime settings for your environment. Development runs at
[http://localhost:3202](http://localhost:3202). The browser API URL must be reachable
from the browser; `INTERNAL_API_URL` can use a separate server-accessible address.
The API is an external service and is not shipped in this repository.
Optional analytics settings may remain empty.

```sh
bun run test:unit
bun run typecheck
bun run lint
bunx playwright install chromium
bun run test:e2e
bun run build
bun run start
```

Playwright starts an isolated development server on port 3212 and covers desktop
and mobile Chromium. Production `start` uses port 3000 by default (`PORT` overrides it).

## Mock development

Run the application with MSW 2.x and local sample data:

```sh
bun install --frozen-lockfile
bun run dev:mock
# Optional dedicated ports:
bun run dev:mock --port 3302 --mock-port 3303
bun run dev:mock --help
```

Next.js runs at `http://127.0.0.1:3202`. Shared MSW handlers intercept read-only
requests in both environments: `setupServer` starts through `instrumentation.ts`
for SSR, and `setupWorker` starts through `instrumentation-client.ts` in the
browser. Browser API entry points await worker readiness without hiding the SSR
HTML or deferring the entire component tree. Mocking is enabled explicitly by the
launcher and disabled when `NODE_ENV=production`.

The second loopback port, `http://127.0.0.1:3203`, is a **state adapter**, powered
by `@mswjs/http-middleware`. Only stateful claim/waitlist requests, health checks,
and downloadable sample files use it. This gives browser requests and server
requests one in-memory state owner. Read-only business requests to that port
return 404 when made outside an MSW-enabled runtime; this prevents a working
HTTP fallback from concealing broken SSR or browser interception.

Editing TypeScript or JSON files in `mocks/` automatically restarts the complete
session after a short debounce, keeping SSR, browser handlers, and the adapter in
sync. This resets reservations and claims. Reload the browser if it does not
refresh automatically. Application source edits still use Next.js Fast Refresh. If a mock edit causes a
session failure, the launcher waits for the next edit and retries after saving a
correction. Ctrl+C also stops it while waiting. Initial startup failures still exit.

Press Ctrl+C to stop Next and the adapter. Occupied ports fail without terminating
existing services. No `.env`
files are edited. The launcher supplies child-only API URLs, the
`NEXT_PUBLIC_API_MOCKING=enabled` switch, disabled analytics, and the local Wiki
sitemap origin. The download manifest is intercepted by MSW instead of being
injected as a separate JSON environment variable.

Mock builds use the existing `.next/e2e` directory. Do not run this command,
`test:mock`, and the existing Playwright suite concurrently in the same worktree.
Normal `dev`, `build`, and `start` commands retain their existing settings.

### Fixtures and scenarios

`mocks/fixtures.ts` holds deterministic sample data. `mocks/handlers/` groups the
MSW handlers by business area; browser, server, adapter, and contract tests reuse
these definitions. Mutable state belongs only to `handlers/state.ts` instances
owned by the adapter, not to separate browser and SSR stores.

| Area | Coverage | Sample page |
| --- | --- | --- |
| Homepage | Release summary, read/watch links, skill count and GitHub stars | `/` |
| Skills | 30 skills, categories, search, sorting, pagination, details, download URL and sitemap | `/agent-skills/list`, `/agent-skills/literature-review` |
| Leaderboards | Overall filters, statistics, daily/weekly/monthly, evaluation results | `/leaderboard`, `/leaderboard/items/literature-review-result` |
| Comparison | Two linked skill evaluations | `/compare/literature-review-vs-clinical-trials` |
| Blog | 24 articles, pagination, details and sitemap | `/blog`, `/blog/release-notes` |
| Community | 24 discussions, search, sorting, pagination, details and comments | API handlers only; existing community pages intentionally return 404 |
| MedFlow | Validation, success, duplicate reservation and explicit error cases | `/medflow` |
| MedFlow redesign | Production-rendered redesign with the same waitlist states and responsive content; intentionally excluded from sitemap | `/medflow-redesign` |
| Agent claim | Valid, invalid and already-claimed tokens, shared in-memory verification | `/claim/demo-claim`, `/claim/already-claimed` |
| Open-Science | Intercepted release manifest and local text downloads | `/open-science/download` |

Business responses preserve `{ code: 20000, msg, data }`. Unknown GET routes and
missing details return 404, unsupported API methods return 405, and malformed
input returns 400. Pagination accepts positive `page` and `page_size`, with at
most 100 entries per page. Community `hot` uses score order and `shuffle` uses a
stable demo order. Unmatched requests to the configured business API are rejected;
unrelated external assets pass through.

For MedFlow, use any valid name and email for success; repeat the email for an
already-reserved success. Use `rate-limit@example.test` for HTTP 429 or
`error@example.test` for HTTP 500. For local claiming, use `demo-claim`, code
`MOCK-1234`, and a URL such as `https://x.com/demo/status/123`. Select
“I've posted the tweet” to skip the external posting step. No tweet is checked or
published. Reloading the page after verification shows “Already Claimed”.

CDN images/media, fonts, external navigation, and Wiki pages may still require
network access. The Skills UI opens the real GitHub repository after its mocked
download API call; the API itself returns a local Markdown sample. Open-Science
mock downloads are text samples, not installers. No real email reservations,
account claims, or downloadable releases are created.

### Validation

```sh
bun run test:unit
bunx playwright install chromium
bun run test:mock
bun run typecheck
bun run lint
```

`test:mock` starts the real launcher on ephemeral ports. It checks SSR pages,
sitemap entries, JavaScript-disabled rendering, client navigation, claim state
across reloads, desktop/mobile Skills search and MedFlow submission, worker
interception, shutdown, and port conflicts. Stop existing mock or Playwright
instances before running it. Test data is held only in memory.

`public/mockServiceWorker.js` is generated by MSW and must stay in sync with the
locked MSW package. After upgrading MSW, regenerate it using:

```sh
bunx msw init public --no-save
```

## Docker Compose

```sh
cp .env.example .env
# Fill the API, site, asset and public Wiki addresses for your deployment.
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
```

Compose fixes `web` to `ghcr.io/aipoch/aipoch-web:latest` on port 3060 and
`openscience-wiki` to `ghcr.io/aipoch/openscience-wiki:latest` on port 3062.
Images and host ports are defined directly in `compose.yaml`. The Web service reaches
Wiki through `http://openscience-wiki`; the public Wiki prefix must be reachable
from visitors' browsers. Wiki routes live below `/docs`. Reverse proxy and TLS
configuration are deployment responsibilities.

The multi-stage Dockerfile installs with the frozen Bun lockfile and runs the
Next.js standalone server as the non-root `bun` user. It includes `public` and
`.next/static`; local environment files and agent artifacts are excluded from
the build context. Public settings are injected at container startup via
`next-runtime-env`, allowing the same image to run in different environments.
Wiki uses the `aipoch` image namespace and retains its `linux/amd64` platform.

### Local image validation

Build Web explicitly with the same tag used by Compose. Ensure the Wiki image is
already cached locally, then prevent registry pulls and force container recreation:

```sh
docker build --platform linux/amd64 -t ghcr.io/aipoch/aipoch-web:latest .
docker compose up -d --pull never --no-build --force-recreate --wait
```

Compose contains no build configuration. These command options make local
validation use the locally built Web image and the cached Wiki image.

## Image publishing

`.github/workflows/build-push-web.yml` builds the root Dockerfile on every push
to `main` and publishes `ghcr.io/aipoch/aipoch-web` with `latest`, `main`, and
`sha-<full-commit>` tags. It uses `GITHUB_TOKEN` with `packages: write`; private
packages require registry authentication when pulled. The workflow can also be
run manually on `main`. It builds Linux AMD64 images and uses the GitHub Actions
build cache. The workflow takes effect once this change is present on `main`;
creating or renaming that branch is outside this migration.

## Migration from the previous layout

Run commands from the repository root instead of `web` or `web/apps/user`.
The former shared UI and TypeScript packages are now local source and root
configuration. The API, CLI, Admin application, standalone Skills admin page,
and AWS deployment workflows have been removed. Existing Web routes and
external API contracts are preserved. Deployment automation must use the root
`Dockerfile`, `compose.yaml` and new `web` service name.
