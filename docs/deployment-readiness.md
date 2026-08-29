# Deployment readiness

An audit of everything between "the code is good" and "the thing is running for
real users", written just before the first production release.

Scope: `infra/terraform/`, `Caddyfile`, `docker-compose.prod.yml`,
`scripts/deploy.sh`, `.github/workflows/deploy.yml`, and the deployment
documentation. Application code is out of scope.

**Method, and its one hard limit.** Line numbers refer to the files **as
committed before this change**, so a reviewer can find each defect in
`git show HEAD~1:<file>`. Every finding below was reproduced by reading the file
at the line given, and every fix was verified with
`terraform fmt`/`validate`, `caddy adapt`/`validate`, `docker compose config`,
`bash -n`, and — where the behaviour was testable — by actually running it
locally. **No `terraform plan` and no `terraform apply` was run**: that needs
real Hetzner and Cloudflare tokens and would touch remote state. Nothing here is
proven against a live account. Where that gap matters for a specific finding, it
is called out on that finding.

---

## Verdict

The stack was **not deployable from scratch** as committed. Two of the four P1
items are not "risky" — they are certain failures on the first deploy: TLS could
never have been established, and `app.<domain>` was never served. A third
silently disabled the application's rate limiting. All four are fixed here.

What remains open is mostly about **durability and recovery**, not about the
first deploy working: the database lives on an ephemeral disk with backups off,
and the Terraform state bucket holds plaintext secrets with no versioning. Those
are listed below with reasons for leaving them.

| Severity | Count | Fixed in code | Documented only | Left open |
|---|---|---|---|---|
| P1 — deploy fails or silently misbehaves | 4 | 4 | 0 | 0 |
| P2 — real risk, not a first-deploy blocker | 8 | 3 | 2 | 3 |
| P3 — correctness of documentation and hygiene | 7 | 6 | 0 | 1 |

"Documented only" means the defect is real and unfixed, but the fix is a decision
someone else has to make (P2-f, P2-h) — so what changed is that an operator now
finds it before it bites, instead of after.

---

## P1 — these break the deploy

### P1-a · TLS could never have been established → 525 for every visitor · **FIXED**

**Where**
`Caddyfile:13-28` (as committed) · `infra/terraform/envs/prod/cloudflare_dns.tf:56-63`
· `infra/terraform/envs/prod/variables.tf` (`restrict_http_to_cloudflare`, default `true`)
· `infra/terraform/envs/prod/outputs.tf:59-61` · `.github/workflows/deploy.yml`
· `README.md:169`

**What happens.** The Caddyfile configured automatic issuance over
HTTP-01/TLS-ALPN. Both challenges are answered by whoever the resolver reaches on
the public name. `api.<domain>` is an orange-clouded `A` record, so that is
Cloudflare's edge — and the Hetzner firewall additionally accepts 80/443 only
from Cloudflare's ranges. The challenge cannot reach the origin, ever. Caddy
would loop on failed ACME orders with no certificate, and Cloudflare would return
**525 (SSL handshake failed)** to every visitor.

The design that fixes this was already half-built: Terraform mints a Cloudflare
Origin Certificate (`cloudflare_tls.tf`) and `outputs.tf:59-61` stated that
GitHub Actions delivers it to `/etc/caddy/origin.pem` and `.key`.
`infra/terraform/README.md:246-294` even prescribed the Caddyfile. **No such step
existed in `.github/workflows/deploy.yml`** — I read the whole file. The
documentation described a pipeline nobody had written, which is worse than
describing nothing: it reads as done.

`README.md:169` compounded it by documenting the broken variant — "TLS via Let's
Encrypt" — as though it were the intended design.

**Fix.** The delivery path now exists end to end.

- `.github/workflows/deploy.yml` — a guard step fails on the runner if
  `CADDY_ORIGIN_CERT_B64` or `CADDY_ORIGIN_KEY_B64` is missing; the SSH step then
  decodes both, checks the decoded bytes actually look like PEM, and writes
  `secrets/caddy/origin.pem` (0644) and `secrets/caddy/origin.key` (0600) via a
  temp file and `mv`, so a half-written PEM can never be what Caddy mounts.
  Base64 because `appleboy/ssh-action` cannot carry a multi-line value through
  `envs:` and a PEM is multi-line by definition. That is transport, not
  protection.
- `Caddyfile` — `tls /etc/caddy/origin.pem /etc/caddy/origin.key`, which also
  switches automatic issuance off for the site. The ACME block is gone, with a
  comment explaining why it could never have worked.
- `docker-compose.prod.yml` — the caddy service bind-mounts both files read-only.
- `scripts/deploy.sh` — refuses to migrate or restart anything unless both files
  exist, are regular files (not the directory Docker silently creates for a
  missing bind-mount path), are non-empty, and contain the expected PEM header.
- `README.md` and `infra/terraform/README.md` — corrected, and the manual step of
  creating the two repository secrets is now listed.

**Verified.** `caddy validate` against the real `Caddyfile` with a generated
P-256 certificate: `Valid configuration`, plus
`skipping automatic certificate management because one or more matching certificates are already loaded`
— i.e. ACME is genuinely off. Without the files, Caddy fails hard and
immediately: `loading certificates: open /etc/caddy/origin.pem: no such file or
directory`. That is a deliberate improvement: a container that will not start is
visible in one second, where the old behaviour was a container that started
happily and served 525s. The deploy-time decode, the permission bits and the
rejection of a non-PEM secret were all exercised locally against a real
`openssl`-generated pair. The `deploy.sh` guard was exercised for all four
branches (missing, directory, empty, valid).

**Not verified.** That Cloudflare accepts this specific certificate at the edge.
That requires an apply.

---

### P1-b · Application rate limiting was per-datacenter, not per-user · **FIXED**

**Where**
`Caddyfile:72` (as committed) · `apps/api/src/infra/config/app-config.ts:98`
· prescribed and unimplemented at `infra/terraform/README.md:270-279`

**What happens.** `header_up X-Real-IP {remote_host}` sets the header from the
socket peer. Behind the orange cloud that peer is a Cloudflare edge address.
The API runs `trustProxy: true` in production, so `@fastify/rate-limit` bucketed
by colo. Two failure modes, both bad and neither visible in a log: one abusive
client 429s everyone routed through the same Cloudflare datacenter, and a
distributed abuser gets a fresh quota per colo.

**Fix.** The `Caddyfile` global options now declare Cloudflare's published ranges
as `trusted_proxies static` and set
`client_ip_headers CF-Connecting-IP X-Forwarded-For`; the reverse proxy sends
`header_up X-Real-IP {client_ip}`.

**One deliberate deviation from the prescription.** The README prescribed
`trusted_proxies cloudflare`, which self-refreshes — but that module ships in the
`caddy-cloudflare-ip` plugin, which is **not** in the stock `caddy:2-alpine`
image this stack runs. Using it would mean building a custom Caddy with xcaddy on
every deploy: a new build step and a new failure mode on a 4GB box. The README
itself offered the static list as the fallback, and that is what is implemented.
The staleness risk is a *degradation*, not an outage: a range added by Cloudflare
and not mirrored here makes requests through that colo fall back to
`{remote_host}`, which is the old behaviour, for those requests only. The
authoritative list is `terraform output http_allowed_source_ips`; both README
sections now say so.

**Verified.** `caddy adapt` on the real file emits all 22 ranges under
`trusted_proxies.ranges`, `client_ip_headers: [CF-Connecting-IP,
X-Forwarded-For]`, and `X-Real-Ip: {http.vars.client_ip}`. The range list was
fetched from `cloudflare.com/ips-v4` and `ips-v6` on 2026-08-28.

**Not verified.** That a request arriving at the container preserves the
Cloudflare source address through Docker's published-port NAT. It should —
iptables DNAT preserves the source IP for external traffic in bridge mode — but
it has not been observed on this box. If it does not, `{client_ip}` falls back to
the socket address and the behaviour is the old broken one, not something worse.
Worth confirming on the first deploy by comparing an access log entry with the
requesting IP.

**Related, and documented rather than fixed:** `TRUST_PROXY` is read at
`apps/api/src/infra/config/app-config.ts:98` and appears in no example file. It
is now documented in `README.md` (Environment) and in the
`docker-compose.prod.yml` header. `apps/api/.env.example` is owned by another
workstream and was not touched.

---

### P1-c · The production firewall was built from an unvalidated HTTP response · **FIXED**

**Where**
`infra/terraform/envs/prod/locals.tf:71-88` · consumed at
`infra/terraform/envs/prod/hetzner.tf:47,55`

**What happens.** Two `data "http"` blocks fetch Cloudflare's IP ranges on every
plan and the response bodies are split on newlines and written straight into
`hcloud_firewall.main`'s `source_ips`. Nothing checked the status code, that the
body was non-empty, or that it contained CIDRs. A 200 with an unexpected body —
an HTML error page from an edge, a captive portal on airport wifi, a corporate
TLS-intercepting proxy — silently rewrites the production firewall.

The empty-body case is the cruel one: `compact()` yields an empty list, the
firewall is created with **no permitted source** on 80/443, and the API goes dark
in a way that does not look like a firewall problem.

**Fix.** Each data source now carries three `lifecycle.postcondition` blocks:
status code is 200; at least 5 (v4) / 3 (v6) non-empty lines, because Cloudflare
publishes ~15 and ~7 respectively and has for years, so a shorter list is a
truncated response rather than a shrunken one; and every non-empty line matches a
CIDR shape for the right family. `hcloud_firewall.main` additionally carries a
`lifecycle.precondition` that the final list is non-empty — redundant on purpose,
because the cost of being wrong is production offline.

`postcondition`, not `check`: a `check` block only warns and lets the apply
continue, and continuing is exactly what must not happen. Postconditions on a
data source are evaluated at read time, so the plan fails before any resource is
touched. Every error message says so explicitly.

**Verified.** The two regexes were extracted verbatim from `locals.tf` and run
through Terraform against real range values and against HTML snippets: the v4
pattern accepts `173.245.48.0/20` and `131.0.72.0/22` and rejects
`<!DOCTYPE html>` and `<html><body>Error 1020</body></html>`; the v6 pattern
accepts `2a06:98c0::/29` and `2606:4700::/32` and rejects both HTML strings and
an IPv4 CIDR. `terraform validate` passes.

**Not verified.** The postconditions have not been observed firing against a real
plan, because a plan needs credentials.

---

### P1-d · `app.<domain>` was never actually served · **FIXED**

**Where**
`infra/terraform/envs/prod/cloudflare_dns.tf:46-54` · `cloudflare_pages.tf`

**What happens.** The CNAME points `app.<domain>` at `<project>.pages.dev`, but
nothing claimed that hostname on the Pages project. Cloudflare Pages serves a
custom hostname only when the project itself owns it. The apply succeeds, DNS
resolves, and the edge returns the Pages error page. Nothing in Terraform
indicates a problem — the worst combination available.

The provider documentation is explicit about this: for `cloudflare_pages_domain`,
"a DNS record for the domain is not automatically created". The two resources are
independent and both are required.

**Fix.** Added `cloudflare_pages_domain.app` in `cloudflare_pages.tf`, with
`depends_on = [cloudflare_dns_record.app]` because Cloudflare validates ownership
through DNS as soon as the hostname is claimed — claiming first leaves the domain
stuck in `pending`. Added an `app_pages_domain_status` output so the state is
visible without opening the dashboard, and a troubleshooting entry for `pending`
vs `active`.

**Verified.** Resource shape checked against the provider's own schema
(`account_id`, `project_name`, `name`, all required) via `terraform providers
schema -json` for cloudflare/cloudflare 5.23.0, and against the provider docs.
`terraform validate` passes.

---

## P2 — real risk, not a first-deploy blocker

### P2-a · SSH open to the internet by default · **FIXED**

`infra/terraform/envs/prod/variables.tf:116-120` defaulted `ssh_allowed_ips` to
`["0.0.0.0/0", "::/0"]` — port 22 of production open to everyone, for any
operator who did not think to change it. A value that is only safe if you
remember to override it is not a default; it is a trap.

**Fix.** The default is removed, so the plan fails until the operator declares
who gets in, with validations for non-empty and CIDR shape. The description and
`terraform.tfvars.example` both note that the Hetzner Console (VNC) does not
depend on this firewall, so nobody can lose the machine by getting it wrong.

**This is a breaking change for an existing `terraform.tfvars`** — it now needs
an `ssh_allowed_ips` line. Documented in the README's troubleshooting section.

**Verified.** With the variable unset, `terraform plan` stops at
`No value for required variable ... on variables.tf line 116`.

---

### P2-b · `VITE_*` drift: two dead required variables, four missing real ones · **FIXED**

Terraform hard-required `vite_linkedin_client_id` and
`vite_linkedin_redirect_uri` — neither of which `apps/web` has ever read — and
set none of `VITE_MODEL_CDN_BASE_URL`, `VITE_SENTRY_DSN`,
`VITE_SENTRY_ENVIRONMENT` or `VITE_SENTRY_RELEASE`, all of which it does. Every
operator had to invent values for two variables that did nothing, and the Pages
build had no Sentry and no model CDN.

Confirmed with `grep -rn "import.meta.env.VITE_" apps/web/src`, which returns
exactly six names: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`,
`VITE_MODEL_CDN_BASE_URL`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`,
`VITE_SENTRY_RELEASE`. LinkedIn sign-in looks like a counter-example and is not
one: `apps/web/src/lib/auth-api.ts:124` builds the link as
`${apiBaseUrl}/auth/linkedin` and every LinkedIn credential lives on the API.

**Fix.** The two LinkedIn variables are removed (with a comment recording why, so
they do not come back). Added `vite_model_cdn_base_url`, `vite_sentry_dsn` and
`vite_sentry_environment`, all optional and defaulting to `null`, merged in only
when set — a Pages env var defined as `""` is not the same as absent, and code
testing the variable for truthiness would see an empty string instead of
`undefined`. Preview deployments get `VITE_SENTRY_ENVIRONMENT=preview` so a test
branch cannot trip production alerts.

**`VITE_SENTRY_RELEASE` is deliberately not a Terraform variable.** The correct
value is the commit SHA, which changes every build; a static value in the Pages
project would tag every error with the same release and make Sentry useless for
telling what broke. The GitHub Actions build — the path that actually publishes
the bundle — already injects `${{ github.sha }}`.

**This is also breaking for an existing `terraform.tfvars`**: Terraform rejects
values for undeclared variables, so those two lines must be deleted. Documented.

---

### P2-c · Postgres and Redis on an ephemeral root disk, with backups off · **NOT FIXED**

No `hcloud_volume` exists, so `postgres_data` and `redis_data` are Docker volumes
on the server's root disk, and `enable_backups`
(`infra/terraform/envs/prod/variables.tf:90-94`) defaults to `false`. Losing or
rebuilding the server loses the database. `scripts/backup.sh` mitigates this —
but see P2-d for the bucket it writes to.

**Why not fixed here.** Attaching a block volume moves the Postgres data
directory, which means a planned migration of live data, not a Terraform edit —
and `user_data` changes recreate the server, so the sequencing has to be
deliberate. This is its own task with its own review. **The cheap partial
mitigation is to set `enable_backups = true`** (+20% of the server price); the
`terraform.tfvars.example` entry now says what it protects against instead of
just naming the cost.

---

### P2-d · The backup bucket is unmanaged · **NOT FIXED**

`scripts/backup.sh:58` writes to `RCLONE_BUCKET="${RCLONE_BUCKET:-crafthub-backups}"`.
No Terraform resource creates `crafthub-backups`; `cloudflare_r2.tf` manages only
`uploads` and `tfstate`. Backups therefore go to a bucket that exists only if
someone made it by hand, with no lifecycle policy and no Terraform-visible
retention.

**Why not fixed here.** Adding the resource is easy; deciding whether it should
be `import`ed (like the tfstate bucket) or created, and what its lifecycle rules
should be, is a data-retention decision that belongs with whoever owns the backup
policy. Creating it blind would risk a Terraform *create* colliding with an
existing hand-made bucket, and that failure lands mid-apply.

---

### P2-e · The tfstate bucket has no versioning, and it holds plaintext secrets · **NOT FIXED**

`cloudflare_r2.tf` sets `prevent_destroy` on the state bucket but no versioning.
The state contains, in plaintext: the R2 API token value and the derived S3
secret, the Origin Certificate private key, and every Pages environment variable.
`cloudflare_r2.tf:71` says so out loud, which is to its credit. A corrupted or
truncated state write has no previous object to recover from.

**Why not fixed here.** The dvn house style mandates versioning on the backend
bucket (section 13), and this violates it. But the bucket is adopted by an
`import` block, and adding a versioning resource to an imported bucket changes
what the first post-change apply does to the thing holding the state of
everything else. That deserves its own apply, done deliberately, with a state
backup taken first — not a side change in a release commit.

Worth knowing meanwhile: R2 object versioning can be enabled from the dashboard
without Terraform, and doing so is strictly safer than the current situation.

---

### P2-f · Nothing prepares a fresh box; the first deploy cannot succeed · **DOCUMENTED, not automated**

The deploy workflow does `cd /srv/crafthub`, `git fetch`, `git checkout`, and
`scripts/deploy.sh` requires `.env.production` at the repository root
(`scripts/deploy.sh:59`). Nothing creates `/srv/crafthub`, clones the repository,
or writes `.env.production` — `cloud-init.yaml.tftpl` deliberately stops at "host
ready to receive a deploy". On a brand-new server the very first workflow run
fails at `cd`.

**Why documented rather than automated.** `.env.production` contains secrets that
must not pass through CI or Terraform state, and the repository URL/branch is an
operator decision. Automating the clone without the env file would move the
failure one step later without removing it.

**What changed.** `infra/terraform/README.md` gains a manual step (#11) with the
exact commands, and the note that `VPS_APP_DIR` must match if the path is not
`/srv/crafthub`.

---

### P2-g · `rate_limit_mitigation_timeout_seconds` had no validation · **FIXED**

`infra/terraform/envs/prod/variables.tf:270-274` accepted any number while every
sibling knob validated its input, so a value like `45` failed at **apply** — after
other resources had been created or changed — instead of at plan. Now validated
against the same list the API accepts (`10, 60, 120, 300, 600, 3600`).

---

### P2-h · `uploads_bucket_name` disagrees with the API's example env · **DOCUMENTED, not silently changed**

`variables.tf` defaults `uploads_bucket_name` to `crafthub-uploads`;
`apps/api/.env.example:195` says `S3_BUCKET=crafthub-media`. Whichever is wrong,
uploads land in one bucket and reads look in another.

**Why not "fixed".** Both sides are plausible defaults and I cannot tell which is
intended — and `apps/api/.env.example` belongs to another workstream. Changing
the Terraform default silently would be the worse error: if a bucket already
exists under the old name, the next apply creates a second one and the objects
are split. `infra/terraform/README.md` now carries a call-out at the point where
an operator reads the S3 outputs, saying to pick one and make both sides match
**before the first upload**, because afterwards it means migrating objects.

---

## P3 — documentation correctness and hygiene

### P3-a · `README.md` claimed there is no `apps/api/.env.example` · **FIXED**

`README.md:101-102` said "There is no root `.env.example` yet — the only
committed example is `apps/web/.env.example`". `apps/api/.env.example` exists and
`scripts/deploy.sh:59` hard-requires a copy of it. The Environment section now
names both files and explains the `.env.production` relationship.

### P3-b · `.github/workflows/deploy.yml:53` documented a secret that does not exist · **FIXED**

The comment described a long-lived `read:packages` PAT named `GHCR_PULL_TOKEN`.
Nothing reads it; the deploy step forwards the run's `GITHUB_TOKEN` as
`GHCR_TOKEN` and the box logs in with that. The real mechanism is *better* than
the documented one — the credential dies with the job — but a documented secret
that does not exist sends the first person debugging a failed pull looking for
it. Corrected, including the one real consequence: the login on the box expires,
so a manual `./scripts/deploy.sh` may fail to pull from a private registry, and
the recovery path is the no-argument mode that builds locally.

### P3-c · `scripts/deploy.sh:193-195` justified itself with a dependency that no longer exists · **FIXED**

The comment explained the swallowed `compose up` exit status by saying caddy
waits on `api: service_healthy`. `docker-compose.prod.yml:284-286` as committed
(`:339` after this change) says `condition: service_started`, and its own comment
explains why it was changed.
The swallow still earns its place — `up` also fails on a pull error or a bad bind
mount, and every one of those must reach the health poll and the rollback rather
than aborting early — so the comment now records the history *and* the current
reason instead of a stale one.

### P3-d · `docker-compose.dev.yml:1` carried an obsolete `version: "3.8"` · **FIXED**

Compose v2 ignores it and prints a deprecation warning on every invocation.
Removed.

### P3-e · No local mail catcher · **FIXED**

`docker-compose.dev.yml` had no mail service, so a developer could not see a
verification e-mail at all. Added **Mailpit** behind the existing `tools`
profile, so `docker compose -f docker-compose.dev.yml up -d` does not start it
and `bash db-manage.sh admin` does. Web UI on 8025, SMTP on 1025, no volume
(messages are meant to be disposable), `MP_MAX_MESSAGES: 500` so a runaway worker
loop cannot eat memory. `DEVELOPMENT-GUIDE.md` carries the exact `SMTP_*` block
to paste.

**Verified by running it**: container healthy, UI returns 200, an authenticated
SMTP send on `localhost:1025` was accepted and the message appeared in the API
with the right subject. Then removed.

### P3-f · `docker-compose.prod.yml` header described the wrong environment file · **FIXED**

The header at `:16-25` described `.env.production` in one sentence. It now lists
what must be in it by group — Postgres, core, `APP_PUBLIC_URL`, mail, proxy,
storage/AI, Caddy — including the new mail variables, the note that
`MAIL_TRANSPORT` silently defaults to `log` and that `log` in production means
nobody ever receives a verification e-mail, and that `ACME_EMAIL` is no longer
read by anything.

### P3-g · No Terraform CI, no `docker build` in `ci.yml`, and a lock file with one platform · **NOT FIXED**

Three related gaps:

- `.github/workflows/ci.yml` has `lint`, `check-types` and `test` and nothing
  else. No `terraform fmt -check`, no `terraform validate`, no `docker build`. A
  broken Dockerfile or a malformed `.tf` is first discovered by the deploy
  workflow, on the way to production.
- `infra/terraform/envs/prod/.terraform.lock.hcl` records **4** `h1:` hashes —
  one per provider, all `linux_amd64`. A teammate on macOS or ARM cannot
  `terraform init` without either `-upgrade` (which rewrites the lock and defeats
  its purpose) or `terraform providers lock -platform=...`. The repository
  currently has exactly one Terraform operator, which is why this has not bitten.
- `tls_private_key.origin` and `hcloud_server.main` have no `lifecycle` block.
  A change that replaces the key destroys the old certificate before the new one
  is in place; `create_before_destroy` would close that window.

**Why not fixed here.** Each is a change to a shared pipeline or to a
replacement-triggering resource, and this task's blast radius is already large.
The lock-file fix is a one-liner worth doing before a second person touches this
directory:

```bash
cd infra/terraform/envs/prod
terraform providers lock \
  -platform=linux_amd64 -platform=darwin_amd64 -platform=darwin_arm64
```

---

## House-style compliance — `.github/terraform-dvn-style.instructions.md`

The instructions file declares `applyTo: "**/*.tf"`, so it governs
`infra/terraform/`. It was written for the dvn-workshop **AWS/EKS** project, and
a large part of it does not transfer. Being specific about which part:

**Both safety rules are followed.**

- *"Use `use_lockfile = true` instead of `dynamodb_table`"* — `versions.tf:70`
  does, over R2's S3-compatible API, with a comment explaining every `skip_*`
  flag it needs.
- *"Never hard-code credentials"* — no token appears in any `.tf`. Both providers
  read environment variables; the backend credential lives in a gitignored
  `backend.hcl`. `providers.tf` states this at the top.

**Rules that are AWS-specific and do not apply.** Sections 5 (`assume_role`,
`default_tags`, AWS provider version), 9 (IAM roles, `jsonencode` policies,
GitHub OIDC), 10 (VPC/subnet/NAT layout), 11 (EKS), 12 (ECR), 13 (the
DynamoDB half of the backend stack), and the `tags`/`assume_role` base variables
in section 6. There is no AWS account here: this is Hetzner plus Cloudflare, one
VPS, no VPC, no Kubernetes, no IAM. Hetzner labels are used instead of AWS tags
(`locals.common_labels`), which is the honest local equivalent.

**Rules that do apply and are violated.** These are real, and none of them was
introduced by this change:

- **Section 1 — numbered stacks (`NN-<purpose>-stack/`).** This is
  `envs/prod/`, a single root module. The README argues for folder-per-environment
  over workspaces, which is a reasonable position, but it is not the prescribed
  layout.
- **Section 2 — `main.tf` holding only `terraform {}` + providers.** There is no
  `main.tf`; that content is split across `versions.tf` and `providers.tf`. The
  split is arguably clearer and is definitely not what the rule says.
- **Section 3 — dots as hierarchy separator.** Files are `cloudflare_dns.tf`,
  `cloudflare_pages.tf`; the rule wants `cloudflare.dns.tf`. Note this also
  conflicts with the repository's own kebab-case rule in `AGENTS.md`, so the
  files are consistent with neither.
- **Section 4 — `this` for a file's single primary resource.** Names here are
  descriptive throughout (`hcloud_server.main`, `cloudflare_r2_bucket.uploads`).
- **Section 6 — always provide a `default`.** `domain`,
  `cloudflare_account_id`, `ssh_public_key`, `vite_google_client_id` have none,
  and this change **adds one more**: `ssh_allowed_ips`. Deliberate, and explained
  under P2-a — the alternative default was port 22 open to the internet, and a
  plan that stops is better than a firewall that does not.
- **Section 13 — S3 versioning must always be enabled.** Violated; see P2-e.

**What this change did follow.** Section 6's *"group related config into a single
typed `object` variable, never many flat variables"* — `email_provider` is one
object with six required fields and an optional `list(object({...}))` for MX,
with a `default` of `null` and five validations, rather than the eight flat
scalars the surrounding file's style would have suggested. This was a deliberate
choice to follow the house rule where the surrounding file does not.

**Recommendation.** Either restructure the directory to the dvn layout, or narrow
the instruction file's `applyTo` so it stops claiming authority over a
non-AWS stack it does not fit. Right now it reads as though this directory is
broadly non-compliant, when most of the mismatch is a category error. That is a
decision for the repository owner, not a defect to fix in a release commit.

---

## What an operator must add to `.env.production` for this release

New, all read server-side by the API. None is a `VITE_` variable.

| Variable | Default | Set it to |
|---|---|---|
| `APP_PUBLIC_URL` | first entry of `WEB_APP_URL`, else `http://localhost:5173` | `https://app.<domain>` — the one canonical public origin used to build e-mailed links. **Not** the same as `WEB_APP_URL`, which is a comma-separated CORS allow-list. |
| `MAIL_TRANSPORT` | `smtp` if `SMTP_HOST` is set, else `log` | `smtp`. `assertProductionConfig()` refuses to boot when this resolves to `log`, so getting it wrong is a container that will not start — not a silent dead end. |
| `SMTP_HOST` | — | your provider's SMTP host |
| `SMTP_PORT` | `587` | `587` unless the provider says otherwise |
| `SMTP_SECURE` | `false` | `false` for 587 (STARTTLS), `true` for implicit TLS on 465 |
| `SMTP_USER` / `SMTP_PASSWORD` | — | from the provider |
| `MAIL_FROM` | `CraftHub <no-reply@localhost>` | `CraftHub <no-reply@<domain>>` — the domain here must be the one SPF/DKIM authorise, or the mail fails authentication |
| `EMAIL_VERIFICATION_TOKEN_TTL_HOURS` | `24` | `24` |

Also worth setting explicitly even though it defaults correctly:

| Variable | Default | Note |
|---|---|---|
| `TRUST_PROXY` | `true` in production | Correct as-is. Only set `false` if the API ever becomes directly reachable. |

And `ACME_EMAIL` is **no longer read by anything** — TLS is the Origin
Certificate now. Leaving the old value in the file is harmless.

**Two new repository secrets** are also required, or the deploy job fails on the
runner: `CADDY_ORIGIN_CERT_B64` and `CADDY_ORIGIN_KEY_B64` (see P1-a).

**Two `terraform.tfvars` changes** are required, or the plan fails: add
`ssh_allowed_ips`, and delete `vite_linkedin_client_id` /
`vite_linkedin_redirect_uri`.

---

## What was not verified

Stated plainly, because a readiness report that omits its own blind spots is the
expensive kind of wrong.

- **No `terraform plan` and no `terraform apply`.** Both need real Hetzner and
  Cloudflare tokens and would touch remote state. Everything Terraform-side is
  verified only as far as `terraform fmt -check -recursive` and
  `terraform validate` reach — which is syntax and provider-schema conformance,
  not behaviour. Specifically unproven: that Cloudflare accepts the SPF/DKIM/DMARC
  records as written, that `cloudflare_pages_domain` reaches `active`, that the
  `data.http` postconditions fire on a bad response, and that the firewall
  precondition ever triggers.
- **TXT record quoting.** The provider's own v4→v5 migration test asserts
  `content == "v=spf1 -all"` without surrounding quotes, and that is what the
  code does. It has not been observed against a live zone. If a perpetual diff
  appears on the SPF or DMARC record after the first apply, this is the first
  place to look.
- **No end-to-end deploy.** The Caddyfile, the compose file, the workflow's
  remote script and the deploy script were each validated and, where runnable,
  executed locally in isolation. They have never run together against the real
  VPS.
- **Docker source-IP preservation** through the published port, which P1-b's
  correctness depends on. See that section.
- **Mailpit against the real API.** Mailpit itself was verified end to end with a
  hand-written SMTP client. The API's mail provider is being written by another
  workstream and did not exist in a runnable state here, so the `SMTP_*` values
  documented in `DEVELOPMENT-GUIDE.md` are taken from the agreed variable
  contract, not from a successful send by the application.
- **The application's rate limiting after the P1-b fix.** That Caddy now sends
  the true client IP in `X-Real-IP` is verified in the adapted config. That
  `@fastify/rate-limit` then buckets per user is inferred from
  `apps/api/src/infra/config/app-config.ts`, not measured.
