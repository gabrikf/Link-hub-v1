# 🚀 Development Scripts Guide

> **Scope:** this is a reference for the **npm scripts** and nothing else. It was
> once described as an architecture guide, which it is not. For architecture and
> orientation read `README.md`; for the rules an agent (or a new contributor)
> must follow read `AGENTS.md` and the workspace file for wherever you are
> working — `apps/api/AGENTS.md`, `apps/web/AGENTS.md`,
> `packages/schemas/AGENTS.md`; for anything visual read `DESIGN.md`; for how
> that whole set is wired together read `docs/harness/agent-harness.md`.
>
> Ports here are **api 3333** and **web 5173**. An earlier version of this file
> said the web app ran on port 3000. It never did — `apps/web/vite.config.ts`
> has always set 5173, and `.claude/launch.json` agrees.

This guide explains all available npm scripts in the CraftHub monorepo.

## 📦 Understanding the Monorepo

Your project uses:

- **Turborepo** - Manages the monorepo and caching
- **npm workspaces** - Links packages together
- **TypeScript** - All packages need to be built

### Important: When to Rebuild Packages

When you change `@repo/schemas` or any shared package:

```bash
npm run rebuild:schemas   # Rebuild schemas package
```

The API will automatically pick up the changes because it's linked via workspaces!

---

## 🎯 Most Common Commands

### Development (Daily Use)

```bash
# Start EVERYTHING (API + Web + all packages)
npm run dev

# Start ONLY the backend API (port 3333)
npm run dev:api

# Start ONLY the frontend web (port 5173)
npm run dev:web

# Watch & rebuild schemas package (when actively changing schemas)
npm run dev:schemas

# Start API + Web in parallel (no packages watching)
npm run dev:all
```

### Building

```bash
# Build everything (packages + apps)
npm run build

# Build only API
npm run build:api

# Build only Web
npm run build:web

# Rebuild schemas (clean + build)
npm run rebuild:schemas
```

---

## 🗄️ Database Commands

### Drizzle Studio (Visual Database Editor)

```bash
# Open Drizzle Studio in your browser
npm run db:studio
```

Opens at: `https://local.drizzle.studio`

### Schema Changes & Migrations

```bash
# 1. After changing schema.ts, generate migration
npm run db:generate

# 2. Apply migrations to database
npm run db:migrate

# OR: Push schema directly (no migrations - dev only)
npm run db:push
```

### Database Reset & Seed

```bash
# Reset database (drop all tables and recreate)
npm run db:reset

# Seed database with test data
npm run db:seed
```

**Note:** These use your `db-manage.sh` script.

---

## 📬 Seeing the e-mails the API sends

Account verification means the API now **sends e-mail**. Locally there is no
mail server, so out of the box the API runs `MAIL_TRANSPORT=log`: it prints the
verification link to the terminal instead of sending anything. That is enough to
click through a flow, and it is the right default — but it tells you nothing
about whether the message actually renders, or what the subject line looks like
in a client.

**Mailpit** is a mail catcher: it speaks SMTP, accepts everything, delivers
nothing, and shows you every message in a browser.

```bash
# Start it (it lives behind the compose `tools` profile, like pgAdmin)
docker compose -f docker-compose.dev.yml --profile tools up -d mailpit

# Or start it together with pgAdmin and the database:
bash db-manage.sh admin
```

Then open **<http://localhost:8025>**.

Point the API at it by pasting this into `apps/api/.env` (create the file if it
does not exist — the API needs nothing to boot in development, so it is normal
for it to be missing):

```dotenv
# Mailpit, from docker-compose.dev.yml. Accepts any credentials, no TLS, and
# never delivers anything outside your machine.
MAIL_TRANSPORT=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=crafthub
SMTP_PASSWORD=crafthub
MAIL_FROM=CraftHub <no-reply@localhost>

# The origin used to BUILD the link inside the e-mail. Not the same thing as
# WEB_APP_URL, which is a comma-separated CORS allow-list and may hold several
# origins. Read server-side — it is NOT a VITE_ variable, so it belongs here and
# never in apps/web/.env.
APP_PUBLIC_URL=http://localhost:5173

# How long a verification link stays valid. Drop it to something tiny when you
# are testing the expired-token screen.
EMAIL_VERIFICATION_TOKEN_TTL_HOURS=24
```

Restart the API (`npm run dev:api`), sign up, and the message appears in Mailpit
within a second. `SMTP_USER` and `SMTP_PASSWORD` can be any two strings —
Mailpit runs with `MP_SMTP_AUTH_ACCEPT_ANY`, so they exist only to keep the code
path identical to production, where they are real.

**Notes worth having:**

- Mailpit keeps messages **in memory**. Restarting the container empties the
  inbox — deliberately, so you are never reading last month's test data.
- It is **development only**. It is declared in `docker-compose.dev.yml` and
  deliberately not in `docker-compose.prod.yml`. Production sends through a real
  provider, and the SPF/DKIM/DMARC records that make that mail deliverable are
  managed by Terraform (`email_provider` in `infra/terraform/envs/prod`).
- To go back to printing links in the terminal, remove `MAIL_TRANSPORT` and
  `SMTP_HOST` from `apps/api/.env`. With no `SMTP_HOST`, the transport defaults
  to `log` on its own.
- The full variable list, with defaults, is in `apps/api/.env.example`.

---

## 🖼️ Uploading images locally (MinIO)

Every image the app stores — avatars, banners, page backgrounds — goes through
one S3-compatible adapter. In production that is **Cloudflare R2**. Locally it is
**MinIO**, which speaks the same S3 API, so the adapter, the SigV4 signing, the
path-style addressing and the public-URL shape are the ones production runs. A
write-to-disk stub would have been simpler and would have proven nothing about
the code path that runs for real users.

```bash
# MinIO comes up with Postgres and Redis — it is NOT behind the `tools` profile
bash db-manage.sh start
```

|            | URL                                        | Credentials                  |
| ---------- | ------------------------------------------ | ---------------------------- |
| S3 API     | <http://localhost:9000>                    | `crafthub` / `crafthub_secret` |
| Console    | <http://localhost:9001>                    | same                         |
| Bucket     | `crafthub-media`, anonymous read enabled    | —                            |

**There is nothing to paste into `apps/api/.env`.** When no `S3_*` variable is
set, the API defaults to exactly this MinIO in development —
`LOCAL_MINIO_STORAGE_CONFIG` in
`apps/api/src/infra/providers/s3-file-storage-provider.ts`. Restart the API,
open **Edit profile → Appearance**, and drop a photo on the banner tile: the URL
it comes back with is `http://localhost:9000/crafthub-media/uploads/<your-id>/…`
and you can paste it straight into a browser.

**Notes worth having:**

- **Production is untouched.** `docker-compose.prod.yml` has no MinIO and never
  will, and `resolveFileStorageConfig` refuses to hand the fallback to
  `NODE_ENV=production` — unconfigured production still fails loudly on the
  first upload, exactly as before.
- **Setting even one of the five REQUIRED variables turns the fallback off** —
  `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
  `S3_PUBLIC_BASE_URL`. A half-filled block is a typo, and quietly redirecting
  those uploads to a local container would hide it until a visitor's browser
  tried to load `localhost`. You get the clear "Image storage is not configured"
  error instead. `S3_REGION` is the one exception: it has a default and used to
  ship uncommented in `.env.example`, so it sits in everyone's `.env` while
  saying nothing about whether a bucket was configured — counting it would have
  made this fallback dead on arrival.
- **The bucket is publicly readable, on purpose.** `S3_PUBLIC_BASE_URL` is
  pasted straight into an `<img src>` with no credentials and no signature —
  the same way R2's public bucket serves it in production. Without the
  anonymous-download policy every avatar renders as a broken image and the only
  symptom is a silent 403 in the network tab. `minio-setup` applies it; that
  container exiting `0` is the success case, not a crash.
- **Uploaded images survive a restart** (named volume `minio_data`).
  `bash db-manage.sh reset` throws them away along with the database.
- The real round trip — write an object, then fetch it back **anonymously** —
  is covered by
  `apps/api/src/infra/providers/s3-file-storage-provider.minio.e2e.test.ts`. It
  self-skips with a printed reason when MinIO is down, and the guardrail gate
  names it in its TEST SCOPE NOTICE.

---

## 🧪 Testing

```bash
# Run all tests once
npm test

# Run API tests only
npm run test:api

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage, with the per-package ratchet floors. See docs/coverage.md.
npm run test:coverage

# Only the suites that touch one file
npx vitest related apps/web/src/lib/theme.ts --run
```

**Some api tests need real infrastructure and will hang for 60-90s without it.**
Start it first: `bash db-manage.sh start`. Three more need a funded
`OPENAI_API_KEY` and are excluded from CI by name. `apps/api/AGENTS.md` lists
all six files.

---

## 🛡️ The guardrails gate

```bash
npm run guardrails         # node scripts/guardrails/pre-push.mjs
```

One command: builds `@repo/schemas`, type-checks and tests only what your change
affects, lints only the files you touched, and prints `guardrails PASS`. It runs
automatically on `git push` (husky) and skips — loudly, by name — any test it
cannot run.

```bash
npm run lint:changed       # just the eslint step
npm run i18n:parity        # locale parity (a no-op until i18n exists)
```

---

## 👁️ Visual checks

```bash
npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
npm run visual:run -- <scenario> --headed    # watch it happen
npm run visual:login                          # seed a session for an authed scenario
```

One browser launch walks every state of a screen — loading, empty, error,
filled, both themes — and fails on console errors, uncaught exceptions and
unexpected 4xx/5xx. Needs `npm run dev` up and a seeded database.

---

## 🛠️ Utility Commands

```bash
# Format all code with Prettier
npm run format

# Type-check all packages
npm run check-types

# Clean build caches
npm run clean

# Nuclear option: Delete all node_modules and build artifacts
npm run clean:all
```

---

## 📋 Workflow Examples

### Scenario 1: Changing Schemas

You're working on the API and need to change the auth schemas:

```bash
# Terminal 1: Watch & rebuild schemas automatically
npm run dev:schemas

# Terminal 2: Run API in watch mode
npm run dev:api

# Now changes to schemas automatically rebuild and API picks them up!
```

### Scenario 2: Full Stack Development

```bash
# Single command runs everything
npm run dev

# Or use separate terminals for better control:
# Terminal 1: API
npm run dev:api

# Terminal 2: Web
npm run dev:web

# Terminal 3: Database Studio (optional)
npm run db:studio
```

### Scenario 3: After Changing Database Schema

```bash
# 1. Edit apps/api/src/infra/database/drizzle/schema.ts
# ... make your changes ...

# 2. Generate migration
npm run db:generate

# 3. Apply to database
npm run db:migrate

# 4. Verify in Drizzle Studio
npm run db:studio
```

### Scenario 4: Fresh Setup / Reset Everything

```bash
# 1. Clean everything
npm run clean:all

# 2. Reinstall dependencies
npm install

# 3. Build all packages
npm run build

# 4. Reset & seed database
npm run db:reset
npm run db:seed

# 5. Start development
npm run dev
```

---

## 🎨 Quick Reference Table

| Task             | Command                   | When to Use          |
| ---------------- | ------------------------- | -------------------- |
| Start dev server | `npm run dev`             | Daily development    |
| Backend only     | `npm run dev:api`         | Working on API       |
| Frontend only    | `npm run dev:web`         | Working on UI        |
| View database    | `npm run db:studio`       | Check DB data        |
| Reset database   | `npm run db:reset`        | Start fresh          |
| Run tests        | `npm run test:watch`      | Writing tests        |
| Rebuild schemas  | `npm run rebuild:schemas` | After schema changes |
| Format code      | `npm run format`          | Before committing    |

---

## 💡 Pro Tips

### 1. **Always rebuild schemas after changes**

```bash
# Quick command when schemas change:
npm run rebuild:schemas && npm run dev:api
```

### 2. **Use Turbo filtering for faster builds**

```bash
# Only build what changed since last commit
npm run build
```

### 3. **Database workflow**

```bash
# Development: Use push (faster)
npm run db:push

# Production: Use migrations (trackable)
npm run db:generate
npm run db:migrate
```

### 4. **Parallel terminals for productivity**

```bash
# Terminal 1: API
npm run dev:api

# Terminal 2: Web
npm run dev:web

# Terminal 3: Tests
npm run test:watch

# Terminal 4: DB Studio
npm run db:studio
```

---

## 🔧 Troubleshooting

### "Module not found: @repo/schemas"

**Solution:**

```bash
npm run rebuild:schemas
```

### "Schema doesn't match" errors

**Solution:**

```bash
# Rebuild schemas package
npm run rebuild:schemas

# Restart API
npm run dev:api
```

### Changes not reflecting

**Solution:**

```bash
# Hard reset
npm run clean
npm install
npm run build
npm run dev
```

### Database out of sync

**Solution:**

```bash
npm run db:reset    # Drops and recreates everything
npm run db:migrate  # OR apply migrations
```

---

## 📚 Additional Resources

- **Turborepo Docs**: https://turbo.build/repo/docs
- **Drizzle ORM**: https://orm.drizzle.team
- **npm Workspaces**: https://docs.npmjs.com/cli/v7/using-npm/workspaces

---

## 🎯 Summary

**For daily work:**

```bash
npm run dev              # Full stack
npm run dev:api          # Backend only
npm run dev:web          # Frontend only
npm run db:studio        # Database GUI
```

**When schemas change:**

```bash
npm run rebuild:schemas  # Then restart API
```

**Database changes:**

```bash
npm run db:generate      # Create migration
npm run db:migrate       # Apply migration
npm run db:reset         # Nuclear option
```

Happy coding! 🚀
