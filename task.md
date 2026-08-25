# Task Plan — developer-experience-concepts

Living planning doc for next steps. Update statuses as work progresses;
prune completed items periodically rather than letting this grow forever.

## Status: PR #1 and PR #2 merged, deploy pipeline verified end-to-end

PR #1 (bootstrap: S3+CloudFront CDK stack, OIDC CI/CD, data-driven static
site) and PR #2 (LICENSE + required-check fix) are both merged to `main`.
`cdk-diff.yml` and `deploy.yml` have each run successfully at least once.
`main` now has branch protection (required `CDK Infrastructure Diff`
status check, no force-pushes/deletions, enforced for admins too).

## Immediate (verify the merge actually deploys cleanly)

- [x] Watch the `deploy.yml` run triggered by the merge to `main`.
- [x] Fix `AWS_DEPLOY_ROLE_ARN` trust policy — the `deploy` job uses
      `environment: production`, which changes GitHub's `sub` claim suffix
      to `:environment:production` instead of `:ref:refs/heads/main`.
      Updated the wildcard pattern in `resume-site-stack.ts` to match;
      redeployed and confirmed the pipeline succeeds.
- [ ] Load the CloudFront URL (`DistributionDomainName` output) and
      confirm the résumé renders, `how-it-was-built.html` and `404.html`
      work, and cache headers look right (HTML no-cache, assets
      long-cache). Not yet manually verified in a browser.

## Near-term follow-ups

- [ ] Node 20 deprecation warnings showing up in Actions logs
      (`actions/setup-node` pinned to `node-version: '20'` in both
      workflows, and CDK CLI itself warns about Node 20 EOL). Bump to
      Node 22 in both workflow files and re-verify.
- [ ] Un-pin / upgrade `aws-cdk` (currently 2.152.0; CLI notices suggest
      2.1138.0+) — check for breaking changes in `cdk.json` feature flags
      before bumping.
- [ ] Consider running `npm run lint` as part of `deploy.yml`/`cdk-diff.yml`
      (script exists in `infra/package.json` but isn't wired into CI yet).
- [x] Add branch protection on `main` requiring the `CDK Diff (PR)` check
      to pass before merge. Note: this required removing the `paths:`
      filter from `cdk-diff.yml` so the required status check reports on
      *every* PR (not just infra ones) — otherwise non-infra PRs hang
      forever waiting on a status that never gets reported. The workflow
      now always runs but internally skips the actual `cdk diff` steps via
      a git-diff-based gate when no infra files changed.
- [ ] Repo is public specifically so branch protection works on GitHub
      Free. GitHub Pro was purchased mid-session, which *does* unlock
      protection on private repos — revisit going private if desired
      (decision was to stay public + add a restrictive LICENSE instead,
      see below).

## Planned features — mapped to target job description (IS Manager, DevEx)

The job description this repo is being built to demonstrate emphasizes four
pillars: (1) golden paths / Internal Developer Platform, (2) engineering
enablement + DORA/SEI metrics, (3) people leadership, (4) AI-assisted
engineering. Feature ideas below are grouped accordingly.

**Build order (decided 2026-08-24, revised same day):** the email OTP
access gate (feature 0) now goes **first**, since it changes the site's
fundamental access model and every other feature should be built assuming
it's already gated. After that: DORA metrics scorecard, Bedrock AI chat,
golden-path template repo, DevSecOps CI hardening as time allows.

### 0. Email OTP access gate — makes the deployed site invite-only

**Decision (2026-08-24):** the deployed site should become **non-public by
default** — only people who verify control of an allowlisted email address
(e.g. specific interviewer addresses, or an `@mutualofomaha.com` domain
suffix) can view it. Important distinction: there is no way to
cryptographically "trust" an email address without contacting it — this is
an email-verification (OTP) gate, not a claim-based trust mechanism. The
GitHub *repo* stays public (per the LICENSE decision above); this only
gates the *deployed site*.

This changes the site from "static-only" to having a small stateful
backend, so it's a meaningfully bigger lift than prior features — worth
sequencing deliberately (probably before or alongside the DORA scorecard
since it changes the site's fundamental access model).

**Architecture** (single CloudFront distribution, two behaviors):

- Default behavior (`/*`) → existing private S3 origin (OAC), fronted by a
  **CloudFront Function** (viewer-request) that checks for a valid signed
  session cookie:
  - Cookie present + signature/expiry valid → pass through to S3 as today.
  - Missing/invalid → redirect (302) to `/login.html` (which must itself be
    excluded from the check, along with static assets it depends on).
  - CloudFront Functions (not Lambda@Edge) chosen for cost/latency — they
    now support SHA-256/HMAC via the built-in `crypto` module, enough to
    verify an HMAC-signed session token without a network call per request.
- New behavior (`/auth/*`) → API Gateway (HTTP API) → Lambda, **not**
  cached, so `Set-Cookie` responses reach the browser same-origin as the
  rest of the site (required for `HttpOnly` cookies to work cleanly without
  cross-site cookie issues).
  - `POST /auth/request-code`: looks up the submitted email against an
    allowlist (DynamoDB — exact addresses and/or domain-suffix entries like
    `@mutualofomaha.com`). If allowed, generates a 6-digit OTP, stores a
    **hash** of it (never plaintext) + expiry (~10 min) + attempt counter in
    DynamoDB (TTL attribute for auto-cleanup), sends it via SES. Returns the
    same generic response regardless of allowlist match, to avoid leaking
    which emails/domains are allowlisted (anti-enumeration).
  - `POST /auth/verify-code`: checks submitted code against the stored
    hash, enforces a max-attempts lockout, and on success issues a signed
    session token (HMAC, short secret rotated via CDK deploy) as an
    `HttpOnly; Secure; SameSite=Lax` cookie scoped to the CloudFront domain.
- Allowlist management: **admin UI**, not manual CLI/console edits. A
  small `/admin.html` page (linked nowhere public, only reachable by an
  admin session) lets you list/add/remove allowlist entries (exact emails
  or domain suffixes) through authenticated endpoints:
  - `GET /auth/admin/allowlist`, `POST /auth/admin/allowlist`,
    `DELETE /auth/admin/allowlist/{id}` — all require the caller's session
    to carry an `admin: true` claim, checked server-side in each Lambda
    (never trust a client-supplied flag).
  - Admin status lives in the same DynamoDB allowlist table as a boolean
    attribute on your own entry (seeded once, manually, at deploy time —
    e.g. via a CDK custom resource or a one-time `put-item` for your own
    email only, so there's still a bootstrap step but it's a single row,
    not ongoing allowlist maintenance). Every other entry is manageable
    through the admin UI from then on.
  - `verify-code` copies the `admin` flag from the allowlist record into
    the signed session token at login time, so the CloudFront Function /
    Lambda authorizer can check it without extra DB lookups per request.
  - Non-admin sessions get a 403 (not a redirect/leak) from `/auth/admin/*`
    and the `/admin.html` page itself renders nothing useful without a
    valid admin session (checked client-side for UX, enforced server-side
    for security).

**Security requirements:**

- [ ] OTP codes stored as hashes only, short expiry (~10 min), rate-limited
      per email and per source IP (API Gateway usage plan / WAF), and
      locked out after a small number of failed attempts.
- [ ] Anti-enumeration: `request-code` responses must not reveal whether an
      email was actually allowlisted.
- [ ] Session cookie must be `HttpOnly`, `Secure`, `SameSite=Lax`, with a
      **14-day expiry** (decided 2026-08-24) — not indefinite.
- [ ] Admin-only endpoints/pages (`/auth/admin/*`, `/admin.html`) must
      re-check the `admin` claim server-side on every request — a
      client-side check is UX only, never the actual gate.
- [ ] Lambda execution roles scoped tightly: `request-code` Lambda needs
      SES send + DynamoDB read/write on only its table; `verify-code`
      Lambda needs DynamoDB read/write on only its table. Neither shares a
      role with the GitHub OIDC deploy/diff roles.
- [ ] CloudFront Function must fail closed — any error verifying the
      session token should redirect to `/login.html`, never pass through.
- [ ] Rotate the HMAC signing secret via a documented process (e.g. CDK
      parameter backed by SSM SecureString) rather than hardcoding it
      long-term in source.
- [ ] Update README/LICENSE framing once this ships — the "public
      portfolio site" framing needs a note that the *deployed* site is
      access-gated even though the repo/source remains public.
- [ ] Budget/cost check: SES + Lambda + DynamoDB + API Gateway at this
      scale should be near-zero, but add to the existing AWS Budgets
      nice-to-have below rather than assuming.

**Resolved decisions (2026-08-24):**

- Build order: this feature ships **before** the DORA scorecard.
- Session duration: **14 days**.
- Allowlist management: **admin UI** (`/admin.html` + `/auth/admin/*`),
  bootstrapped by a single manually-seeded admin row for your own email —
  see architecture above.
- The Bedrock chat feature (below) will sit behind this same gate once
  both exist — simplifies its security posture considerably, since it's
  no longer reachable by anonymous public traffic.

**Remaining open question:** none blocking — ready to move to
implementation planning (CDK constructs, Lambda handlers, login/admin
pages) when picked up.

**Implementation status (2026-08-24, in progress on branch
`feature/email-otp-gate`, nothing committed yet — all working-tree
edits):**

- [x] Shared Lambda helpers (`infra/lambda/common/`: dynamo, session
      sign/verify, KVS secret fetch, allowlist check).
- [x] Route handlers: `infra/lambda/requestCode`, `verifyCode`, `admin`.
- [x] `infra/lambda/kvsSeed` custom-resource Lambda (Describe→PutKey with
      ETag/retry).
- [x] `infra/cloudfront-functions/session-check.js` (fails closed, exempts
      `/login.html`).
- [x] `site/login.html` (self-contained) and `site/admin.html`.
- [x] `infra/lib/resume-site-stack.ts` fully wired: DynamoDB tables, SES
      identity, CloudFront KeyValueStore + seed, bootstrap-admin custom
      resource, 3 Lambdas + IAM grants, L1 API Gateway v2, CloudFront
      Function + `/auth/*` behavior, new outputs.
- [x] `infra/bin/resume-site.ts` reads `OTP_ADMIN_EMAIL` / `OTP_SES_FROM_ADDRESS` /
      `OTP_HMAC_SECRET` env vars (fails fast via `requireEnv()` if missing)
      and passes them as stack props.
- [x] `npm install` + `tsc`/`jest`/`cdk synth` validation pass (16/16 tests
      passed; synth succeeded with real env vars, confirmed all expected
      resources in the synthesized template).
- [x] Wired the 3 new secrets into `.github/workflows/deploy.yml` and
      `cdk-diff.yml` (env vars on the `cdk deploy`/`cdk diff` steps only —
      `npm test` doesn't need them since jest constructs the stack
      directly, bypassing `bin/resume-site.ts`).
- [x] Created the 3 GitHub repo secrets: `OTP_ADMIN_EMAIL` and
      `OTP_SES_FROM_ADDRESS` both `usafsting@gmail.com` (confirmed with
      user), `OTP_HMAC_SECRET` generated via Node `crypto.randomBytes(32)`.
- [ ] Commit, push, open PR, get CI green, merge.
- [ ] Manual post-deploy verification: click SES sender verification
      email, verify the admin recipient too (SES sandbox mode requires
      every recipient individually verified), walk the login flow at the
      deployed URL, confirm `/admin.html` allowlist CRUD works.
- [ ] Mark this section shipped + note the SES-sandbox limitation in
      README once live.

Full technical detail (exact API shapes, CDK construct choices, security
rationale) is preserved in repo memory at
`infra/.copilot-memory` equivalent — see assistant's repo-scoped memory
file `otp-gate-implementation-status.md` if picked up by an AI assistant;
otherwise this checklist plus the code comments in the files above should
be enough to resume manually.

### 1. DORA metrics / SEI scorecard — NEXT UP

JD explicitly calls out "own the DORA metrics and Software Engineering
Intelligence (SEI) program." Turn that resume claim into a working artifact
by instrumenting this repo's own pipeline:

- [ ] Small job (Lambda on a schedule, or a GitHub Actions workflow) that
      pulls this repo's own Actions run history via the GitHub REST API
      and computes the four DORA metrics: deployment frequency, lead time
      for changes, change failure rate, mean time to restore.
- [ ] Render results as a scorecard section on the site (e.g. a new
      `dora-metrics.html` page or a widget on `how-it-was-built.html`),
      sourced from a small JSON file the job writes (similar pattern to
      `content.json` → `build.js`).
- [ ] Decide data source/refresh: could be a scheduled GitHub Actions
      workflow that commits an updated JSON file (simplest, no new AWS
      infra), or a Lambda+EventBridge pull that writes to S3 (more
      "platform-y" but more infra to secure/pay for). Lean toward the
      GitHub Actions + committed-JSON approach first — cheaper and simpler
      to reason about security-wise (no new IAM roles, no public API).
- [ ] If historical run data before this repo's creation matters, note the
      metrics will only reflect activity captured going forward — no
      backdating trick needed, just be transparent about the data window
      on the page.

### 2. Bedrock AI chat — "ask about my experience"

Interactive chat backed by an AWS Bedrock agent so site visitors can ask
questions about skills/experience conversationally. This is the AI-assisted
engineering demo pillar. Decided scope (2026-08-24): knowledge base limited
to **`site/content.json` only** (already-public curated content — never the
raw résumé docx, which contains phone number/city not meant to be public).
Budget ceiling: **< $20/month**.

Architecture: Browser → CloudFront (new `/api/chat` behavior) → API Gateway
(HTTP API) → Lambda → Bedrock Agent (+ Knowledge Base for RAG over
`content.json`). A backend is required — static site can't call Bedrock
directly since it needs signed AWS credentials.

Security requirements (must-have, not optional, given public exposure):

- [ ] Knowledge base ingests only the curated `content.json` — never the
      raw docx or anything with phone/address. Re-verify this whenever
      content.json is edited.
- [ ] Bedrock Guardrails configured: denied topics, PII filters, and a
      tightly scoped system prompt to resist prompt injection ("ignore
      previous instructions..." style attacks). Treat all agent output as
      untrusted before rendering client-side (no raw HTML injection).
- [ ] API Gateway throttling / usage plan to cap requests per
      IP/time-window — public chat endpoints are a billing-DoS target.
- [ ] Small/cheap model choice (e.g. Nova Micro/Lite or Claude Haiku via
      Bedrock) with a hard max-token cap per response.
- [ ] Dedicated least-privilege IAM role for the chat Lambda — scoped to
      `bedrock:InvokeAgent` on only that agent/alias ARN. Must be a
      separate role from the GitHub OIDC deploy/diff roles (different
      trust principal entirely — this role is assumed by Lambda, not
      GitHub Actions).
- [ ] CORS locked to the CloudFront domain only, so other sites can't
      embed/drain the endpoint.
- [ ] AWS Budgets alarm on the Bedrock/Lambda/API Gateway costs specifically
      (ties into the existing cost-alarm nice-to-have below) — alert well
      under the $20/month ceiling so there's room to react.
- [ ] Feature flag / kill switch (env var read by the Lambda, or a CDK
      context flag that removes the API Gateway route) to instantly
      disable the chat without a full redeploy if abused.
- [ ] No PII in any conversation logging; if logs are kept for debugging,
      redact and add a one-line privacy note near the chat UI.

### 3. Golden-path / Internal Developer Platform demo

JD calls out IDP ownership and Backstage/Port/Cortex experience as
preferred. Cheap ways to demonstrate this without standing up a full IDP:

- [ ] Turn this repo into an actual GitHub **template repository** (repo
      setting, "Template repository" checkbox) so it's a literal,
      clone-and-go golden path rather than just a description of one.
- [ ] Add a `catalog-info.yaml` (Backstage's service-catalog format) at
      the repo root describing this "service" — owner, links, docs,
      lifecycle stage. Doesn't require running Backstage to be a valid,
      inspectable artifact.

### 4. DevSecOps CI hardening

JD requires "strong understanding of... DevSecOps" — cheap, concrete wins
that extend the existing pipeline:

- [ ] Add CodeQL scanning (GitHub's built-in code scanning) for the CDK
      TypeScript code.
- [ ] Add Dependabot config (this overlaps with the existing nice-to-have
      below — do them together).
- [ ] Add `npm audit` (or a dedicated tool) as a gating CI step.

## Nice-to-haves / "demonstrate more DX practices"

- [x] Add a LICENSE (all rights reserved) and README note clarifying the
      repo is public for portfolio purposes only, not for reuse or AI
      training datasets.
- [ ] Dependabot config for `infra/package.json` and GitHub Actions versions.
- [ ] PR template referencing the CDK diff comment / review checklist.
- [ ] Smoke-test step after deploy (curl the CloudFront URL, assert 200).
- [ ] Optional: custom domain (steps already documented in
      [resume-site-stack.ts](../infra/lib/resume-site-stack.ts) doc comment
      and [README.md](../README.md)).
- [ ] Optional: cost/budget alarm via AWS Budgets, given the "< $1/month"
      claim in the README — would be a nice concrete demo of cost awareness.

## Notes / decisions log

- OIDC trust policies must use wildcard `sub` matching, not exact string
  match, due to GitHub decorating `sub` with owner/repo IDs after renames.
  Full context in [copilot-instructions.md](copilot-instructions.md).
- `actions/github-script` steps must pass step outputs via `env:`, never
  splice them into the JS template literal directly (injection + syntax
  risk when output contains backticks).
- GitHub jobs with `environment:` set change the OIDC `sub` claim suffix
  to `:environment:<name>` instead of `:ref:refs/heads/<branch>` — trust
  policies must match whichever one actually applies.
- Branch protection (required status checks, enforce-admins, no
  force-push/delete) requires the repo to be public on GitHub Free, or
  GitHub Pro for a private repo. Decided to stay public + rely on an
  explicit LICENSE to discourage scraping/reuse instead of going private.
