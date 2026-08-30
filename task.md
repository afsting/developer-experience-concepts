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

- [x] Node 20 deprecation warnings showing up in Actions logs — bumped
      `node-version` to `'24'` (latest LTS) in both `deploy.yml` and
      `cdk-diff.yml`, and `@types/node` to `^24.0.0` (PR #7, merged
      2026-08-25). Confirmed via job log: CDK CLI now reports
      `node v24.19.0`, original supported-versions warning gone.
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

## Site review — competitiveness recommendations (2026-08-30)

Full-site review against the target JD and current resume content.
**The application closes 2026-09-11 (~12 days)** — items are prioritized
by JD impact per unit of effort with that deadline in mind. Biggest
finding: the JD's Engineering Enablement pillar explicitly includes
owning an "Engineering Dojo" (workshops, learning paths, labs, office
hours, coaching) and facilitating the Engineering Community of Practice
— and the site currently has **zero** direct representation of either,
even though the resume's strongest enablement stories (MuleSoft Days
training program with 53+ documented participants; founding CoPs for
AI/AR-VR/cloud) map to them almost one-to-one. Meanwhile the resume
page's framing undersells: the header subtitle and meta description
still say "Software Engineer / IS Manager" rather than the leadership
positioning, and the competencies list omits the JD's own scan keywords
(DORA/SEI, golden paths, IDP/service catalog, DevSecOps, GitHub
Actions) that the rest of the site literally demonstrates.

### P0 — quick wins (hours; do before applying)

- [x] **Fix the resume page's positioning.** `index.html` hardcodes the
      header subtitle "Software Engineer / IS Manager" (line 26) and a
      matching meta description; `build.js` never overwrites them, even
      though `content.json` already carries the stronger headline
      ("Engineering Leader | Developer Experience | AI Enablement |
      Platform Strategy"). Render the subtitle from `content.json`'s
      `title` field (content-as-data consistency win too) and update the
      meta description to match. First impressions: this is the first
      line a hiring manager reads under the name.
      **Done (2026-08-30):** `build.js` now has a `renderHeader()` step
      that sets `#site-title` from `data.title`; the static fallback
      text and meta description in `index.html` updated to match.
- [x] **Align competencies with the JD's vocabulary.** Add to
      `content.json` competencies (and consider mirroring into the
      source resume): DORA Metrics & SEI Programs, Internal Developer
      Platform / Service Catalog, Golden Paths & Templates, DevSecOps,
      GitHub Enterprise & GitHub Actions, Engineering Enablement &
      Training Programs. The site *demonstrates* all of these but the
      resume page never *says* them — humans and ATS scanners both
      match on the words. Trim lower-relevance items if the grid gets
      crowded (e.g. fold "MuleSoft Integration Architecture" into
      "API-Led Architecture").
      **Done (2026-08-30):** all six added; folded "MuleSoft Integration
      Architecture" into "API-Led Architecture & MuleSoft Integration"
      and folded "Developer Enablement" into the new "Engineering
      Enablement & Training Programs" to avoid a near-duplicate — net
      16 competencies, verified rendering in-browser.
- [x] **Retitle the enablement highlight cards toward the Dojo.** The
      "Communities of Practice" highlight is good; add or reframe a
      card as "Engineering Enablement Programs" leading with MuleSoft
      Days (self-service curriculum, 53+ participants, still in organic
      use) — the JD's dojo bullet is a near-verbatim description of
      that program, and right now it's buried mid-bullet-list in the
      experience section.
      **Done (2026-08-30):** added as a new 5th highlight card (kept the
      existing four rather than replacing one), positioned right after
      "Strategic Enterprise Initiative Leadership".
- [x] **Add favicon + Open Graph/Twitter meta to every page.** No page
      has either — a link shared with a recruiter or hiring manager
      unfurls with no title/description/image in Slack/Teams/LinkedIn.
      Small, high-visibility polish that itself demonstrates attention
      to the "developer-facing experience" the JD cares about.
      **Done (2026-08-30):** inline SVG data-URI favicon (navy "RP"
      monogram in the site's own accent color, no extra asset file) on
      all 8 HTML pages. og:type/title/description/url +
      twitter:card=summary/title/description on the 5 public content
      pages (index, how-it-was-built, dora-metrics, security-scorecard,
      100-day-plan); favicon only (no OG) on 404/login/admin since
      those aren't meant to be shared/unfurled. No og:image yet — would
      need an actual designed raster asset, out of scope for a quick
      win; `summary` card type doesn't require one.
- [ ] **Reconsider the public contact address.** `content.json`'s
      `email` (and the footer `mailto:`) is the current employer's
      address (`raymond.page@mutualofomaha.com`). For a job-search
      portfolio this is worth a second look: it may read oddly to a
      hiring manager, could brush up against an employer's
      acceptable-use policy for outside job searching, and won't work
      once employment there ends. Consider adding a personal/
      professional address as the primary public contact.

### P1 — features (days; highest JD alignment per effort)

- [ ] **"Engineering Enablement" page (the Dojo pillar).** New static
      page, same content-as-data pattern (`enablement.json` +
      dedicated JS): a genericized sample learning path / workshop
      curriculum — e.g. "From first commit to production on the golden
      path" modeled on the MuleSoft Days structure (modules, formats,
      target audiences, how effectiveness is measured), plus a short
      section on office-hours / coaching cadence. No infra changes.
      This closes the single biggest JD-coverage gap on the site and
      arguably now outranks the Bedrock chat in build order.
- [ ] **Community of Practice playbook section or page.** JD:
      "Facilitate the Engineering Community of Practice." A one-page
      genericized playbook — founding a CoP, meeting formats, topic
      pipeline, measuring engagement, sustaining momentum — drawn from
      actually having founded three. A differentiator most candidates
      cannot produce; pairs naturally with (or lives inside) the
      Enablement page above.
- [ ] **"Time to first deploy" onboarding claim on the golden-path
      section.** The JD's success measures include "faster onboarding."
      The template repo already exists; document (or script as a smoke
      test) the elapsed time from "Use this template" to a live
      CloudFront URL and state it on `how-it-was-built.html` (e.g.
      "under 30 minutes from template to production"). Concrete,
      measurable, exactly on-message.
- [ ] **Bedrock AI chat (feature 2 below) — reassessed.** Still the
      AI-pillar showpiece, but the biggest lift on the list. If it
      can't ship comfortably before 2026-09-11, do the Enablement page
      first and strengthen the AI story cheaply instead: expand the
      how-it-was-built AI section with the concrete practices this
      repo actually uses (copilot-instructions.md as living context,
      task.md as a persistent AI-collaboration planning doc, AI-driven
      review loops) — that's a direct answer to the JD's "evaluating
      and promoting AI-assisted engineering practices" line, with
      receipts. The chat can then land after the application as an
      interview talking point.

### P2 — post-application polish / interview ammunition

- [ ] **Name the governance story.** JD: "establish governance and
      lifecycle management processes to ensure platform content remains
      current." The site already *does* this — daily scheduled metric
      refreshes, content-as-data with hand-curated public subset,
      Dependabot, CodeQL cron, `catalog-info.yaml` — but never names
      it. Add a short "Governance & content freshness" subsection to
      `how-it-was-built.html` tying those mechanisms together.
- [ ] PR template referencing the CDK-diff/review checklist and a
      post-deploy smoke test (existing nice-to-haves below) — small,
      cheap DevEx proof points.
- [ ] Consider a lightweight "who's visited" indicator for your own
      awareness (CloudFront standard logs → small summary), given the
      OTP gate already identifies visitors by email. Privacy note
      required if surfaced anywhere; purely optional.

### Further "showcase what's possible" ideas (2026-08-30, second pass)

Additional leverage ideas beyond the JD-gap fixes above, grouped by
what each one proves. Recommended picks for the pre-2026-09-11 window:
the Engineering Health rollup, the devcontainer, and ADRs — the rest
are post-application or interview-prep material.

- [ ] **Engineering Health rollup page.** The JD repeatedly says
      "engineering health scorecards and insights" — the site has DORA
      and Security as separate pages. A small rollup (or tile row on
      the resume page) grading the site itself — delivery (DORA
      elite/high/medium/low bands), security posture, content
      freshness, uptime — is literally the artifact the JD describes
      owning. Mostly a rendering exercise over JSON already published.
      While in there: annotate the DORA page with the standard
      benchmark bands, showing fluency with the framework rather than
      just the raw numbers.
- [ ] **One-click golden-path environment (`devcontainer.json`).** Add
      a devcontainer to the template repo so "Use this template" opens
      straight into a ready Codespace with Node/CDK/AWS tooling
      preinstalled. Strongest cheap move for the JD's "faster
      onboarding" success measure — it turns the time-to-first-deploy
      claim (P1 above) into something a hiring manager can literally
      click.
- [ ] **Architecture Decision Records.** The decisions log in this doc
      already holds the raw material (OIDC over stored keys, CloudFront
      Functions over Lambda@Edge, squash-merge tradeoffs, SES sandbox
      workaround). Formalize the big ones as ADRs in-repo and render
      them on the site — a cheap, recognized governance practice that
      hits the JD's "standards and governance" language with receipts.
- [ ] **Working-in-the-open delivery journal.** A page auto-generated
      from the repo's own merged-PR history (same GitHub-API→S3
      pattern as the DORA workflow): each PR with title, CDK diff
      posted, review findings addressed. Demonstrates delivery cadence
      and review culture live, and doubles as an interview walkthrough
      ("every change since day one, reviewed and gated").
- [ ] **Developer feedback loop.** JD mentions "feedback collection"
      from the developer community. A tiny thumbs-up/down widget per
      page posting to the existing API Gateway/Lambda/DynamoDB stack —
      small, but shows instrumenting for feedback by habit, and closes
      a loop most portfolios won't have.
- [ ] **Synthetic monitoring / status tile.** Scheduled workflow curls
      the live site, publishes a status JSON → status tile on the
      health rollup. Cheap SRE-lite signal; retires the existing
      "smoke test" nice-to-have at the same time.
- [ ] **Interview demo script (non-code).** Prepare a walkthrough of
      the site in JD order — each nav item maps to a pillar: Resume →
      who; DORA/Security/Health → insights program; 100-Day Plan →
      people leadership; Enablement page → Dojo; How-It-Was-Built →
      IDP + AI practices. The site's best use may be as the interview
      deck; a page-per-pillar narrative makes that deliberate.

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
- [x] Commit, push, open PR (#4), get CI green, merge.
- [x] Fixed two real bugs surfaced by the first live deploy (both shipped
      as follow-up PRs, not part of the original feature branch):
      - PR #5: jest picked up the compiled `dist/test/*.test.js` copy in
        addition to source `test/*.test.ts` once `tsc` ran before
        `npm test` in CI, and the compiled copy's `NodejsFunction` entry
        paths didn't resolve under `dist/lambda/*`. Fixed via
        `testPathIgnorePatterns` in `jest.config.json`.
      - PR #6: `@aws-sdk/client-cloudfront-keyvaluestore` signs with
        SigV4A, which the AWS SDK v3 doesn't auto-load — required an
        explicit side-effect import of `@aws-sdk/signature-v4a` in
        `kvsSeed/index.ts` and `common/kvsSecret.ts`.
      - PR #7: bumped CI Node.js version 20 → 24 (latest LTS) in both
        workflows, ahead of Node 20's actions/runner deprecation.
- [x] Live deploy confirmed fully successful end-to-end (all `deploy.yml`
      steps green, including `CDK deploy`, S3 sync, CloudFront invalidation).
      Site: `https://d3s3zqrhu1oidk.cloudfront.net`.
- [x] Verified `usafsting@gmail.com` as the SES sender identity (clicked
      the AWS verification email).
- [ ] **SES production access request DENIED** (case `178769115200354`,
      submitted via `aws sesv2 put-account-details --production-access-enabled`).
      Account remains in SES **sandbox mode** — emails can only be sent to
      individually-verified recipient addresses, not the full allowlist.
      Denial reason not visible via the API or CLI (requires a paid AWS
      Support plan to read the case detail); check the AWS root account's
      email inbox for the decision notice if a resubmission is attempted.
      **Accepted workaround for now**: before giving an interviewer the
      site link, manually verify their email as an SES recipient:
      `aws sesv2 create-email-identity --email-identity <their-email> --region us-east-1`
      (sends them a one-click AWS verification email — same low-friction
      pattern already used for the admin address). Domain-suffix allowlist
      entries (e.g. `@mutualofomaha.com`) will NOT work under sandbox mode
      no matter what — only exact, individually-verified addresses can
      receive mail. This is a known v1 limitation, not a bug.
- [x] **Bug fix**: after switching SES to domain-level verification
      (`pages-enterprise.com`), `/auth/request-code` started returning 500s
      — CloudWatch showed `ses:SendEmail AccessDeniedException`. The
      `RequestCodeFunction` IAM policy still granted `ses:SendEmail` on an
      address-shaped resource ARN (`identity/noreply@pages-enterprise.com`).
      Once an identity is verified at the domain level, SES authorizes
      `SendEmail` against the **domain's** identity ARN
      (`identity/pages-enterprise.com`), not an address-shaped ARN, even
      though the from-address itself is under that domain. Fixed in
      `infra/lib/resume-site-stack.ts` by building the policy resource from
      `siteHostedZone.zoneName` instead of `otpSesFromAddress`. Confirmed
      via direct `aws lambda invoke` testing before/after.
- [ ] Manual post-deploy verification: walk the login flow at the deployed
      URL end-to-end (request code → check email → verify code → session
      cookie → `/admin.html` allowlist CRUD).
- [ ] Mark this section shipped + note the SES-sandbox limitation in
      README once live.

Full technical detail (exact API shapes, CDK construct choices, security
rationale) is preserved in repo memory at
`infra/.copilot-memory` equivalent — see assistant's repo-scoped memory
file `otp-gate-implementation-status.md` if picked up by an AI assistant;
otherwise this checklist plus the code comments in the files above should
be enough to resume manually.

### 1. DORA metrics / SEI scorecard — DONE

JD explicitly calls out "own the DORA metrics and Software Engineering
Intelligence (SEI) program." Turn that resume claim into a working artifact
by instrumenting this repo's own pipeline:

- [x] `scripts/dora-metrics.mjs` — dependency-free Node script that pulls
      this repo's own `deploy.yml` run history via the GitHub REST API
      (`GH_TOKEN`/`GITHUB_TOKEN`) and computes the four DORA metrics:
      deployment frequency, lead time for changes, change failure rate,
      mean time to restore. Writes `site/dora-metrics.json`. Verified
      locally against the real repo (11 completed runs at time of writing).
- [x] `site/dora-metrics.html` + `site/dora-metrics.js` — scorecard page
      (same "content as data" pattern as `content.json`/`build.js`),
      fetches `dora-metrics.json` and renders metric cards + a recent-runs
      table. Linked from `index.html` nav/footer and
      `how-it-was-built.html` nav/footer.
- [x] Decided data source/refresh: a scheduled GitHub Actions workflow
      (`.github/workflows/dora-metrics.yml`, daily cron + `workflow_dispatch`
      for on-demand runs) that computes the JSON and writes it **directly
      to S3** via a new narrowly-scoped OIDC role (`GitHubActionsMetricsRole`
      in `resume-site-stack.ts`, `s3:PutObject` on `dora-metrics.json`
      only). Deliberately does **not** go through a git commit/PR/`cdk
      deploy`: a PR opened by the default `GITHUB_TOKEN` can never trigger
      `cdk-diff.yml`'s `pull_request` workflow (GitHub's anti-recursion
      rule for `GITHUB_TOKEN`-authored events), which is a *required*
      status check on `main` — an auto-merge would hang forever waiting on
      a check that never reports. Writing straight to S3 (like a
      mini-deploy scoped to one object) sidesteps that, and avoids an
      unnecessary full `cdk deploy` + whole-site S3 sync + `/*` CloudFront
      invalidation for a single JSON file refresh.
- [x] `site/dora-metrics.json` is git-untracked (`.gitignore`) — fully
      reproducible from GitHub's own Actions API at any time. `deploy.yml`'s
      `aws s3 sync --delete` steps explicitly `--exclude "dora-metrics.json"`
      so a normal site deploy never clobbers the live scorecard data (it's
      absent from the git checkout, so `--delete` would otherwise remove it).
- [x] Merged/deployed (PR #11) and fully verified end-to-end: `deploy.yml`
      deployed `GitHubActionsMetricsRole`; `AWS_METRICS_ROLE_ARN` GitHub
      secret set from the stack's `GitHubActionsMetricsRoleArn` output;
      `dora-metrics.yml` manually triggered via `workflow_dispatch` and
      confirmed successful (OIDC auth → bucket lookup → S3 publish all
      succeeded); `dora-metrics.json` confirmed live in the site bucket.
      Scorecard is reachable at `https://resume.pages-enterprise.com/dora-metrics.html`
      (behind the OTP login gate, same as the rest of the site). Cron
      updated to daily (`17 6 * * *`, ~06:17 UTC) (2026-08-27) to keep it
      fresher; previously weekly (`17 6 * * 1`, Monday).
- [ ] If historical run data before this repo's creation matters, note the
      metrics will only reflect activity captured going forward — no
      backdating trick needed, just be transparent about the data window
      on the page.


### 2. AI assistant applet — sitewide, page-aware ("ask about this page")

**Redesigned 2026-08-30** (was: standalone chat page backed by a Bedrock
Agent + Knowledge Base). New shape: a small persistent applet — floating
button + panel, injected via one shared script — present on **every**
page, that knows which page the visitor is currently on and answers
questions grounded in that context. This is the AI-assisted engineering
demo pillar; the goal is interactive proof, not another page to read.

**Architectural simplification (the key decision):** the site's entire
public data surface — `content.json`, `dora-metrics.json`,
`security-scorecard.json`, `100-day-plan.json` — totals well under
100KB, trivially small relative to any modern model's context window.
A Bedrock Knowledge Base (RAG) exists to solve "content too large to
fit in context," which isn't the problem here — and it requires a
vector store (OpenSearch Serverless has a real always-on minimum that
would likely blow the budget on its own). **Drop the Agent + Knowledge
Base entirely.** Call the Bedrock Runtime `Converse` API directly from
the Lambda, with a system prompt built fresh each request from all four
JSON files (read from S3 / cached briefly in `/tmp`, since DORA and
security data refresh daily via existing cron workflows). Fewer moving
parts to secure, operate, and pay for, with no retrieval-relevance
failure mode.

Budget ceiling: **< $20/month** (realistically ~$1-2/month at
portfolio/interview traffic volumes with no KB/vector-store overhead
and a small model).

Architecture: Browser (applet on every page) → CloudFront (`/api/chat`
behavior, not cached) → Lambda → Bedrock Runtime `Converse`/
`ConverseStream`. A backend is required — static site can't call
Bedrock directly since it needs signed AWS credentials. Sits behind the
existing OTP session gate, same as the rest of the site.

**Page-awareness:** the applet sends `document.body.dataset.page` (the
attribute `nav.js` already reads for nav highlighting) with every
message. The Lambda folds that into the system prompt — *"The visitor
is currently viewing the Security Scorecard page. Full site data:
<JSON>. Answer grounded only in this data..."* — and the UI surfaces it
back visibly (e.g. opening line: *"I can see you're looking at the
Security Scorecard — ask me anything."*) plus 2-3 hardcoded (not
AI-generated) suggested-question chips per page. The visible
page-awareness is the point — it's what makes this a memorable demo
rather than an invisible backend detail.

**Persistence:** this is a classic multi-page site (full navigation,
not an SPA), so store the transcript in `sessionStorage` and replay it
into the applet on each page load, appending a new page-context note
when the page changes — makes it feel like one assistant following the
visitor around instead of a chat box that resets on every click.

**Streaming — stretch goal, not a blocker:** Lambda Function URLs
support native response streaming (`InvokeMode: RESPONSE_STREAM`)
without needing a WebSocket API Gateway, and CloudFront can front that
as a custom origin — but CloudFront's handling of chunked/streamed
responses is the one piece worth prototyping early rather than
assuming, given the 2026-09-11 deadline. **Ship the plain buffered
request/response first** (typing indicator → full answer appears);
layer in streaming later if time allows.

**Model choice:** Claude Haiku via Bedrock over Nova Micro/Lite —
meaningfully better instruction-following for a small cost bump, and
at this traffic volume the cost difference is negligible.

**Trust/grounding requirement specific to a job-search tool:** the
system prompt must require the assistant to always disclose it's an AI
and always refer to the candidate in third person — never speak as
him. An assistant that could read as impersonating the candidate to a
hiring manager is a real trust problem here specifically, beyond the
generic prompt-injection concerns below.

Security requirements (must-have, not optional, given public exposure):

- [x] System prompt is built only from the four curated JSON files —
      never the raw résumé docx or JD, which contain phone/address and
      employer-internal names/req details not meant to be public.
      Re-verify whenever any of the four JSON files is edited.
      **Done:** `infra/lambda/chat/index.ts` fetches exactly
      `content.json`/`dora-metrics.json`/`security-scorecard.json`/
      `100-day-plan.json` from S3 (5-minute in-memory cache) and builds
      the system prompt from those alone.
- [x] Bedrock Guardrails configured: denied topics, PII filters, and a
      tightly scoped system prompt to resist prompt injection ("ignore
      previous instructions..." style attacks) — including via the
      page-context value, even though that's app-controlled, not raw
      user input. Treat all model output as untrusted before rendering
      client-side (no raw HTML injection).
      **Done:** `ChatGuardrail` (`AWS::Bedrock::Guardrail`) in
      `resume-site-stack.ts` — content filters (hate/insults/sexual/
      violence/misconduct/prompt-attack) plus PII anonymization (email/
      phone/name/address, SSN blocked outright). System prompt
      explicitly instructs the model to treat the page-context value
      and any instructions embedded in the JSON data or the visitor's
      message as untrusted content, not commands. Widget renders
      replies via `textContent`, never `innerHTML`.
- [x] Rate limiting per **session** (the existing signed OTP cookie is a
      stronger identity signal than IP alone here) in addition to
      IP/time-window throttling — public chat endpoints are a
      billing-DoS target.
      **Done:** combined with the message cap below (one atomic
      DynamoDB counter per session email) rather than a separate
      time-windowed limiter — proportionate at portfolio traffic
      volume; the `/auth/*`-style API Gateway stage throttle
      (`throttlingRateLimit: 10`) covers `/api/chat` too, for free,
      as a second layer.
- [x] Hard max-token cap per response, and a hard cap on messages per
      session, to bound cost per visitor.
      **Done:** `MAX_RESPONSE_TOKENS = 400`, `MAX_MESSAGES_PER_SESSION
      = 40` in `infra/lambda/chat/index.ts`, enforced via a
      conditional atomic `UpdateCommand` against the new
      `ChatSessionTable` (429 once the cap is hit, no Bedrock call
      made).
- [x] Dedicated least-privilege IAM role for the chat Lambda — scoped to
      `bedrock:InvokeModel`/`InvokeModelWithResponseStream` on only the
      chosen model ARN, plus read-only S3 access to the four JSON
      objects. Must be a separate role from the GitHub OIDC deploy/diff
      roles (different trust principal entirely — this role is assumed
      by Lambda, not GitHub Actions).
      **Done:** `ChatFunction`'s auto-generated role, scoped exactly as
      specified plus `bedrock:ApplyGuardrail` on the guardrail ARN.
      Covered by a jest assertion confirming none of the three GitHub
      OIDC roles carry any `bedrock:*` action.
- [x] CORS: **not needed** — `/api/chat` is same-origin via the
      CloudFront distribution (same reasoning already documented for
      `/auth/*`), so there's no cross-origin request to lock down.
- [ ] AWS Budgets alarm on the Bedrock/Lambda costs specifically (ties
      into the existing cost-alarm nice-to-have below) — alert well
      under the $20/month ceiling so there's room to react.
      **Deferred to follow-up** — needs cost-allocation tags activated
      in the Billing console first (a manual, non-CDK-automatable
      one-time step, same category as the existing OIDC-provider/SES
      bootstrap items already in this doc), not blocking the feature
      itself.
- [x] Feature flag / kill switch (env var read by the Lambda, or a CDK
      context flag that removes the CloudFront behavior/route) to
      instantly disable the applet without a full redeploy if abused.
      **Done:** `CHAT_ENABLED` Lambda env var (defaults `'true'`),
      checked first in the handler — flip it directly on the deployed
      Lambda to disable instantly, no redeploy required.
- [x] No PII in any conversation logging; if logs are kept for
      debugging, redact and add a one-line privacy note in the applet.
      **Done:** the Lambda does no explicit conversation logging
      (only default Lambda/API Gateway execution logs, which don't
      include the guardrail-protected chat content); the applet's
      disclosure line doubles as the privacy note ("I'm an AI
      assistant, not Raymond himself — I answer from this site's
      published data").
- [x] Applet is hidden under `@media print` sitewide, so it never
      appears in the 100-Day Plan's PDF export or any future print
      output.
      **Done:** verified via `emulateMediaType('print')` in a headless-
      Chromium pass — both the toggle button and panel compute to
      `display: none`.

**Implementation status (2026-08-30):** code-complete on branch
`feature/ai-assistant-applet` — `infra/lambda/chat/index.ts`,
`infra/lambda/common/http.ts` (new, promoted out of `admin/index.ts`
to avoid a second duplicate), the CDK stack wiring, `site/chat-widget.js`,
and the `styles.css` additions. `cdk synth` succeeds, all 14 jest tests
pass (8 pre-existing + 6 new), and the frontend was verified end-to-end
against a local static server with a mocked `/api/chat` response
(page-aware greeting, suggested chips, sessionStorage persistence
across a simulated page navigation with a page-change note, print-media
hiding — all confirmed via headless Chromium).

**Known blocker before a real `cdk deploy` can be verified live:** a
test `aws bedrock-runtime converse` call against this account returned
`AccessDeniedException: Your account is currently being verified...
normally takes less than 2 hours` — AWS's own account-verification
hold, not a model-access-request issue (the model itself,
`anthropic.claude-haiku-4-5-20251001-v1:0`, is listed `ACTIVE`). Retry
the live end-to-end check once that clears.

### 3. Golden-path / Internal Developer Platform demo

JD calls out IDP ownership and Backstage/Port/Cortex experience as
preferred. Cheap ways to demonstrate this without standing up a full IDP:

- [x] Turn this repo into an actual GitHub **template repository** (repo
      setting, "Template repository" checkbox) so it's a literal,
      clone-and-go golden path rather than just a description of one.
      Enabled via `gh api repos/afsting/developer-experience-concepts -X
      PATCH -f is_template=true` (2026-08-26).
- [x] Add a `catalog-info.yaml` (Backstage's service-catalog format) at
      the repo root describing this "service" — owner, links, docs,
      lifecycle stage. Doesn't require running Backstage to be a valid,
      inspectable artifact.
- [x] **Surface it on the demo site, not just the repo** (2026-08-27):
      added a "Use this template →" CTA button and a live
      `catalog-info.yaml` render (`site/catalog-render.js` fetches the
      raw file from `raw.githubusercontent.com` at page load — no YAML
      parsing, rendered verbatim as proof it's live, not pasted-in) to
      the Golden-Path section of `how-it-was-built.html`.

### 4. DevSecOps CI hardening

JD requires "strong understanding of... DevSecOps" — cheap, concrete wins
that extend the existing pipeline:

- [x] Add CodeQL scanning (GitHub's built-in code scanning) for the CDK
      TypeScript code. `.github/workflows/codeql.yml` — `javascript-typescript`
      language (covers `infra/**` TS and `site/**` JS, no build step
      needed), runs on push to `main`, PRs into `main`, and a weekly cron.
- [x] Add Dependabot config (this overlaps with the existing nice-to-have
      below — do them together). `.github/dependabot.yml` — weekly npm
      updates for `infra/` (grouped `@aws-sdk/*`/`aws-cdk*`) and weekly
      GitHub Actions version updates.
- [x] Add `npm audit` (or a dedicated tool) as a gating CI step. Added to
      both `cdk-diff.yml` (gated behind the existing infra-changed check)
      and `deploy.yml` (unconditional, before `cdk deploy`). Gated at
      `--audit-level=critical` rather than `high` for now: the current
      high/moderate findings (`ajv`, `minimatch`, `yaml`,
      `brace-expansion`) are all bundled transitive deps inside
      `aws-cdk-lib` 2.152.0 itself, only fixable by the aws-cdk-lib major
      bump already tracked below ("Un-pin / upgrade aws-cdk") — confirmed
      via `npm audit fix` (no-op) and `npm audit fix --force` (would pull
      `aws-cdk-lib@2.266.0`, outside the stated range). Tighten to `high`
      once that upgrade lands.
- [x] **Surface it on the demo site, not just CI config** (2026-08-27):
      added a "DevSecOps CI Hardening" section to `how-it-was-built.html`
      with live GitHub Actions status badges (CodeQL/Deploy/CDK Diff),
      plus a new **Security Scorecard** page
      (`site/security-scorecard.html` + `.js`), same "content as data"
      pattern as `dora-metrics.html`. A new daily-scheduled workflow
      (`.github/workflows/security-scorecard.yml`,
      `scripts/security-scorecard.mjs`) computes and publishes
      `site/security-scorecard.json` (git-untracked, same reasoning as
      `dora-metrics.json`) from three live sources:
        - CodeQL open-alert counts by severity + last analysis date, via
          the code-scanning REST API (needs `security-events: read`,
          grantable to `GITHUB_TOKEN`).
        - Dependabot PR activity (opened/merged-last-90-days counts) via
          the search API, as a proxy for "Dependabot is active" — the
          real Dependabot *alerts* API needs permissions that can't be
          granted to the default `GITHUB_TOKEN`.
        - Fresh `npm audit --json` vulnerability counts + whether the CI
          gate (`--audit-level=critical`) would currently pass.
      Reused the existing `GitHubActionsMetricsRole` (widened to
      `s3:PutObject` on both `dora-metrics.json` and
      `security-scorecard.json`, same `AWS_METRICS_ROLE_ARN` secret)
      rather than minting a third role, since the access pattern
      (overwrite one named object, no `cdk deploy`) is identical.

### 5. "My 100-Day Plan" page — people-leadership pillar

A mentor shared an example 100-day plan (Excel, in `.tmp/`, gitignored —
**never commit or reference the original file**; it belongs to the
mentor and may reflect employer-internal system/tool names). Idea: build
a genericized version of *my own* 100-day plan, informed by that
structure, as a public page — directly demonstrates the "people
leadership" pillar of the JD (stakeholder relationships, org onboarding
approach, roadmap-building cadence), same spirit as the DORA/Security
scorecards but for leadership practice instead of engineering metrics.

Mentor example's structure worth reusing (genericized, not copied
verbatim):
- **Time columns:** Pre-Start, Days 0-30, Days 31-60, Days 61-100.
- **Focus-area rows:** Baseline, People, Process, Technology, Personal.
- Each cell is a short list of concrete actions/goals for that
  intersection (e.g. People x Days 0-30: "learn leadership/stakeholder
  group", "initial 1:1s").

Plan:
- [x] Get the user's own plan content. Drafted from the target JD
      (`.tmp/IS Manager Position.docx`, gitignored — never committed) and
      resume, genericized: no names from the JD (hiring manager/recruiter),
      no req number/grade/salary, no employer-exclusive internal tool
      names. Content covers all 5 focus areas x 4 time periods, grounded in
      the JD's three pillars (DevEx/IDP, Engineering Enablement/DORA-SEI,
      People Leadership) plus AI-assisted engineering. User to review/edit
      for accuracy before this is considered final.
- [x] Modeled as a sibling JSON file `site/100-day-plan.json`
      (hand-authored, git-tracked — unlike the generated
      dora-metrics.json/security-scorecard.json, this one isn't
      gitignored), rendered by a new dedicated `site/100-day-plan.js`
      into `site/100-day-plan.html`, same "content as data" pattern as
      `dora-metrics.js`.
- [x] Added to the feature nav (`site/nav.js`) and the left-edge side-nav
      pattern (section anchors per focus area: Baseline/People/Process/
      Technology/Personal).
- [x] Added a framing paragraph (rendered from `data.framing` in the
      JSON) plus a callout noting this reflects the user's own approach,
      not a specific employer's internal strategy/tooling/org structure.
      No public mention of the mentor or the mentor-provided example
      (per user request 2026-08-28) — that context stays in this
      planning doc only.
- [x] No infra changes — pure content + one new static page. Verified
      locally: served `site/` via `python -m http.server`, confirmed
      `100-day-plan.json` is valid JSON, and screenshotted
      `100-day-plan.html` rendering correctly (header/nav, framing text,
      full 5x4 grid with bullets, side-nav anchors).
- [x] **Download PDF button** (user request 2026-08-28): a hiring
      manager should be able to download a nicely formatted copy.
      Static, pre-generated PDF (`site/100-day-plan.pdf`, ~65KB,
      letter portrait, 4 pages — see iteration history below; started
      landscape/7 pages, ended portrait/4 pages) linked via a
      `<a download>` button — not generated on the fly, matches the
      "static page" nature of this feature.
      - Print-specific CSS lives inline in `100-day-plan.html` (scoped to
        this page only, not `styles.css`, so it doesn't affect print
        behavior elsewhere): `@page { size: letter; margin: 0.6in; }`
        (portrait — user feedback 2026-08-28: initial landscape choice
        made sense for the on-screen 5-column matrix table, but the
        print-only per-focus-area section layout only needs 4 narrower
        columns, so portrait fits fine), hides side-nav/feature-nav/
        footer/the download button itself, adds a print-only source-URL
        footer line.
      - Print renders each focus area as its own compact section (4
        columns: Pre-Start/Days 0-30/Days 31-60/Days 61-100, focus-area
        name as a heading rather than a 5th table column) instead of
        reusing the on-screen big matrix table — a single wide table
        forced browsers to split rows mid-bullet-list across page
        breaks, leaving mostly-blank continuation pages. Each section
        has `break-inside: avoid` so it stays atomic when it fits on one
        page; an unusually long section (e.g. Baseline's Days 0-30
        column) can still spill to the next page, which is normal.
        Rendered by `renderPrintSections()` in `100-day-plan.js`
        (separate from `renderGrid()`, which still renders the on-screen
        table).
      - Generated via a headless-Chromium pass driven by `puppeteer-core`
        (CDP `page.pdf({ preferCSSPageSize: true, displayHeaderFooter:
        false, printBackground: true })`) against the locally-served
        page. Plain `chrome --print-to-pdf` CLI flags were tried first
        but wouldn't reliably suppress the browser's default
        date/title/URL header-footer or honor the `@page` landscape
        rule — CDP's `printToPDF` gives direct control instead.
        `puppeteer-core` was installed ad hoc in a scratch dir (not added
        to the repo — this is a manual, infrequent, dev-time step, and
        keeping it out preserves the "dependency-free" convention the
        committed `scripts/*.mjs` follow), pointed at the existing local
        Edge/Chrome install via `executablePath` (no bundled Chromium
        download).
      - **To regenerate** after editing `100-day-plan.json`: serve
        `site/` locally (`python -m http.server` from that directory),
        `npm install puppeteer-core` in a scratch dir, run a short script
        that launches Edge/Chrome headless, navigates to
        `100-day-plan.html`, waits for the table to render, and calls
        `page.pdf(...)` as above, then copy the output over
        `site/100-day-plan.pdf`. No committed script for this — it's
        infrequent enough (content changes rarely) that hand-running it
        each time was preferred over adding a new devDependency.
      - **Follow-up polish** (user feedback 2026-08-28): switched
        `@page` from landscape back to portrait (the per-section print
        layout only needs 4 narrower columns, so landscape's extra width
        wasn't needed); fixed the title page showing "My 100-Day Plan"
        twice (header subtitle is print-only "IS Manager – Developer
        Experience (DevEx) Applicant" via a `.screen-only-subtitle` /
        `.print-only` pair, on-screen subtitle unchanged); added a
        print-only marketing section (`renderPrintMarketing()` in
        `100-day-plan.js`, fetches `content.json` alongside the plan
        data) — resume summary + top 4 highlight cards — to fill what
        was dead whitespace on the title page; added `break-inside:
        avoid` to `#plan-framing`/`.callout`/`#print-marketing` after
        discovering the callout box itself was splitting mid-sentence
        across a page break; tightened print font sizes/margins
        throughout (table text down to 0.68rem, section/callout margins
        cut roughly in half) to reduce page count (9 → 7 → 6) and get
        the Baseline section's page break to land cleanly.
      - **Further polish** (user feedback 2026-08-28): table text
        capped smaller (0.6rem body / 0.58rem column labels, both well
        under a 14pt ceiling) and light gray borders added around each
        print column (`.print-plan-col { border: 1px solid
        var(--color-border) }`) so the print layout reads as an actual
        bordered table. The border/padding overhead nudged page count
        back up slightly (6 → 7) since it eats a bit of each column's
        usable width; not re-chased further given the marginal
        token-cost/benefit at this point.
      - **Bug fix** (user feedback 2026-08-28 — "no way that's 8pt,
        look how big it is"): user was right. A global rule in
        `styles.css` (`.prose li { font-size: var(--font-size-base) }`,
        added way back for the on-screen résumé/experience bullets)
        sets font-size directly on every `<li>` in any `.prose`
        container — including `#plan-grid-print`'s bullets, since
        `main` has class `prose`. A property set directly on an element
        always wins over a value inherited from an ancestor, so setting
        `font-size` on `.print-plan-col ul` had no effect: the bullets
        were silently rendering at 16px (12pt) regardless of what was
        specified there, explaining why the earlier 0.6rem reduction
        looked unchanged. Fixed by setting `font-size: 11pt !important`
        directly on `.print-plan-col li` (specificity-tied with
        `.prose li`, so `!important` avoids relying on source-order
        luck). Verified via direct computed-style extraction
        (`getComputedStyle` in a headless page with
        `emulateMediaType('print')`), not just visual inspection —
        confirmed bullets now compute to exactly 14.667px = 11pt. Page
        count now 6.
      - **Final sizing pass** (user feedback 2026-08-28 — the verified
        11pt still read as too large on a printed page): dropped
        `.print-plan-col li` to `10px !important` (verified via direct
        PDF character-extraction with `pdfplumber`, not just CSS
        inspection, that the embedded glyphs are exactly 7.5pt — 10px
        was briefly tried at `8px`/6pt per request, then reverted back
        to `10px` as "a little too small"). Final shipped state:
        10px/7.5pt body text, 4 pages.
      - **Found and fixed a pre-existing responsive layout bug** while
        building this: `body.has-side-nav > main` had no `min-width: 0`,
        and `.container` had no explicit `width: 100%` — so a grid item
        containing any wide content (here, the plan table, even though
        wrapped in its own `overflow-x: auto`) could inflate the whole
        single-column grid track past the viewport, forcing the *entire
        page* to scroll horizontally instead of just the wide element
        scrolling within its own wrapper. Fixed both properties in
        `styles.css` (`body.has-side-nav > main` and `.container`) —
        benign on every other existing page, necessary for this one.

## Nice-to-haves / "demonstrate more DX practices"

- [x] Add a LICENSE (all rights reserved) and README note clarifying the
      repo is public for portfolio purposes only, not for reuse or AI
      training datasets.
- [x] Dependabot config for `infra/package.json` and GitHub Actions versions.
      (Done as part of DevSecOps CI hardening above — `.github/dependabot.yml`.)
- [ ] PR template referencing the CDK diff comment / review checklist.
- [ ] Smoke-test step after deploy (curl the CloudFront URL, assert 200).
- [x] Custom domain: `resume.pages-enterprise.com`, registered via Route 53.
      ACM certificate (DNS-validated) + Route 53 alias A/AAAA records wired
      into `infra/lib/resume-site-stack.ts`, referencing the pre-existing
      hosted zone by fixed attributes (no `fromLookup`, so synth doesn't
      need account/region context). SES switched from a single
      `ses.Identity.email(...)` identity (personal Gmail sender, no
      SPF/DKIM/DMARC alignment — likely cause of an earlier production
      access denial) to a domain-verified `ses.Identity.publicHostedZone(...)`
      identity, with `OTP_SES_FROM_ADDRESS` updated to
      `noreply@pages-enterprise.com`.
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
- Branch protection (required st  atus checks, enforce-admins, no
  force-push/delete) requires the repo to be public on GitHub Free, or
  GitHub Pro for a private repo. Decided to stay public + rely on an
  explicit LICENSE to discourage scraping/reuse instead of going private.
