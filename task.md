# Task Plan — developer-experience-concepts

Living planning doc for next steps. Update statuses as work progresses;
prune completed items periodically rather than letting this grow forever.

## Status (2026-09-01)

Site is live at `https://resume.pages-enterprise.com`, behind an
email-OTP access gate. Shipped: OTP access gate, DORA metrics
scorecard, golden-path template repo, DevSecOps CI hardening, My
100-Day Plan page (+ PDF export), a JD-competitiveness pass on the
résumé page itself, a sitewide page-aware AI assistant applet, and
infra/process hygiene (ESLint, PR template, smoke test, cost-budget
alarm). Full detail on each lives in "Planned features" below; only
what's still actionable is kept in detail, shipped work is condensed
to what future changes would need to know.

**Note on this doc's own history:** an earlier prune attempt (PR #48)
was closed without merging on 2026-08-31 — not a rejection of the
content, just a mix-up where a second, unrelated PR (#49) opened
immediately after it was assumed to supersede it. It didn't; #49 was
built on the pre-prune doc. This rewrite starts fresh from what's
actually on `main` today, incorporating everything from #49 onward
that never made it into the doc the first time.

## Open infra/process items

- [ ] PR template referencing the CDK-diff/review checklist and a
      post-deploy smoke test — done as part of infra/process cleanup,
      see Nice-to-haves below. *(kept here as a pointer only if new
      gaps surface; otherwise consider this line prunable next pass)*
- [ ] Consider a lightweight "who's visited" indicator (CloudFront
      standard logs → small summary), given the OTP gate already
      identifies visitors by email. Privacy note required if surfaced
      anywhere; purely optional.
- [ ] **SES production access — resubmitted, pending.** Case
      `178769115200354` was denied once (boilerplate, no specific
      reason given) and has been resubmitted with updated details
      (domain-verified SES identity + new custom MAIL FROM domain, see
      feature 0 below). Awaiting AWS's response; not expected to
      resolve quickly or necessarily favorably — see the reasoning
      captured under feature 0 for why. Check `aws sesv2 get-account`
      periodically rather than polling AWS.
- [ ] **Automate SES recipient verification on admin allowlist-add.**
      Proposed fallback so the site doesn't depend on AWS's production-
      access decision either way: when an email is added via the admin
      console, also trigger `ses:CreateEmailIdentity` for it
      automatically (currently a manual CLI step). Doesn't eliminate
      the one-time AWS verification click sandbox mode requires, but
      removes the manual admin step. Not yet built — proposed multiple
      times in conversation, not yet actioned.

## Site review — competitiveness recommendations (2026-08-30)

Full-site review against the target JD and résumé content.
**Application closes 2026-09-11.** Biggest finding at the time: the
JD's Engineering Enablement pillar calls out an "Engineering Dojo"
(workshops, learning paths, office hours, coaching) and the Engineering
Community of Practice — the résumé's strongest real stories (MuleSoft
Days training program, founding a CoP) map to these almost one-to-one,
but the site didn't surface either. P0 below is done; P1/P2 and the
further-ideas list are still open backlog, prioritized by JD impact
per unit of effort.

### P0 — quick wins — done

- [x] Resume page positioning fixed: header subtitle/meta description
      were still "Software Engineer / IS Manager" despite
      `content.json` already carrying the stronger headline;
      `build.js` now renders it from `content.json`'s `title` field.
- [x] Competencies expanded 12 → 16 with the JD's own vocabulary
      (DORA/SEI, Internal Developer Platform, golden paths, DevSecOps,
      GitHub Enterprise/Actions, engineering enablement) — the site
      already demonstrated these but never named them.
- [x] Added a 5th highlight card surfacing the MuleSoft Days training
      program (maps closely to the JD's "Dojo" bullet).
- [x] Favicon (inline SVG, no asset file) + Open Graph/Twitter meta on
      all 8 pages, so shared links unfurl with a title/description.
- [x] Reconsidered the public contact address — **kept as-is**. The
      original recommendation assumed an external job search, where a
      current-employer email reads oddly; this is an **internal hire**
      at Mutual of Omaha, so `raymond.page@mutualofomaha.com` is
      exactly the right contact address (expected channel for an
      internal move, no post-employment concern). No change needed.

### P1 — features (days; highest JD alignment per effort)

- [ ] **"Engineering Enablement" page (the Dojo pillar).** New static
      page, content-as-data pattern: a genericized sample learning
      path/workshop curriculum modeled on the MuleSoft Days structure,
      plus office-hours/coaching cadence. Closes the single biggest
      JD-coverage gap on the site.
- [ ] **Community of Practice playbook.** JD: "Facilitate the
      Engineering Community of Practice." A genericized playbook —
      founding, meeting formats, topic pipeline, sustaining momentum —
      drawn from actually having founded and run one (a "new
      technology" CoP spanning AI, AR/VR, and cloud engineering as
      topic areas within it — corrected 2026-08-31, not three separate
      CoPs as earlier drafts of this doc mistakenly said). Other CoP-
      style work exists (e.g. MuleSoft) but without a set/repeatable
      format, so the one with an actual established cadence is the
      real playbook material. Pairs with the Enablement page above.
- [ ] **"Time to first deploy" onboarding claim.** JD success measure:
      "faster onboarding." Document/measure elapsed time from "Use
      this template" to a live CloudFront URL and state it on
      `how-it-was-built.html`.
- [ ] Consider expanding the how-it-was-built AI section with the
      concrete AI-collaboration practices this repo actually uses
      (copilot-instructions.md as living context, this doc as a
      persistent planning artifact, AI-driven review loops) — a direct,
      low-effort answer to the JD's "evaluating and promoting
      AI-assisted engineering practices" line.

### P2 — post-application polish / interview ammunition

- [ ] **Name the governance story.** The site already does daily
      metric refreshes, content-as-data with a curated public subset,
      Dependabot, CodeQL cron, `catalog-info.yaml` — but never names
      it as governance. Add a short subsection to
      `how-it-was-built.html`.

### Further "showcase what's possible" ideas

Additional leverage ideas beyond the JD-gap fixes above, grouped by
what each one proves. Recommended picks: the AI-applet reuse
extraction below, the Engineering Health rollup, the devcontainer, and
ADRs — the rest are post-application/interview material.

- [ ] **Extract the AI assistant applet into a reusable golden-path
      component.** (2026-08-31, user's idea) The applet (feature 2
      below) currently only works on this site: the Lambda hardcodes
      the persona and its 4 data-source filenames, the frontend
      hardcodes page names/questions, the CDK resources are inlined
      in `resume-site-stack.ts` rather than a parameterized construct,
      and — the real blocker — the Lambda imports this site's bespoke
      OTP session-cookie verifier directly rather than accepting auth
      as a pluggable contract. Generalizing it is itself a strong
      "improving developer experience through reuse" demo, applied to
      something built this week rather than described abstractly.
      Staged approach, cheapest/most demo-able first:
      1. **Config-driven content** (hours): one small config (data
         source keys, page names, persona/trust-rules template) that
         both frontend and backend read instead of hardcoding.
      2. **CDK construct extraction** (~half day): pull the chat
         resources into a real parameterized `Construct` class (props:
         data sources, model ID, guardrail config, auth verifier).
      3. **Auth decoupling** (the real design work): a pluggable auth
         contract instead of importing this site's HMAC/KVS scheme
         directly — "bring your own auth" for sites without an
         equivalent gate.
      4. Frontend theming: built-in defaults instead of riding this
         site's own CSS custom properties.
      Worth documenting on the site once done (Golden-Path section of
      `how-it-was-built.html`, alongside the template-repo demo) —
      "built for one site, then generalized" is a concrete, provable
      reuse story.
- [ ] **Engineering Health rollup page.** DORA and Security are
      separate pages; a small rollup (or tile row on the résumé page)
      grading the site itself — delivery bands, security posture,
      content freshness, uptime — is literally the artifact the JD
      describes owning. While in there: annotate the DORA page with
      standard benchmark bands, not just raw numbers.
- [ ] **One-click golden-path environment (`devcontainer.json`).** Add
      to the template repo so "Use this template" opens straight into
      a ready Codespace. Strongest cheap move for the "faster
      onboarding" claim above — turns it into something clickable.
- [ ] **Architecture Decision Records.** The decisions log below
      already holds the raw material (OIDC over stored keys,
      CloudFront Functions over Lambda@Edge, squash-merge tradeoffs,
      SES sandbox saga). Formalize the big ones as ADRs and render
      them on the site.
- [ ] **Working-in-the-open delivery journal.** Auto-generated from
      the repo's own merged-PR history (same GitHub-API→S3 pattern as
      DORA) — demonstrates delivery cadence and review culture live.
- [ ] **Developer feedback loop.** A tiny thumbs-up/down widget per
      page posting to the existing API Gateway/Lambda/DynamoDB stack.
- [ ] **Synthetic monitoring / status tile.** Scheduled workflow curls
      the live site, publishes status → tile on the health rollup;
      retires the smoke-test item at the same time.
- [ ] **Interview demo script (non-code).** A walkthrough of the site
      in JD order — each nav item maps to a pillar. The site's best
      use may be as the interview deck; make that deliberate.

## Planned features — mapped to target job description (IS Manager, DevEx)

JD pillars: (1) golden paths / Internal Developer Platform, (2)
engineering enablement + DORA/SEI metrics, (3) people leadership, (4)
AI-assisted engineering.

### 0. Email OTP access gate — shipped

Deployed site is invite-only: visitors verify an allowlisted email via
a 6-digit OTP before reaching any page. Repo stays public; only the
*deployed* site is gated. Architecture: CloudFront default behavior
gated by a CloudFront Function checking a signed session cookie
(HttpOnly/Secure/SameSite=Lax, 14-day expiry); `/auth/*` behavior →
API Gateway → Lambda for `request-code`/`verify-code`/admin-allowlist
routes; OTP codes stored as hashes with short expiry, never plaintext;
admin allowlist management via `/admin.html`, gated on a signed
`admin` claim re-checked server-side on every request.

**Standing operational constraint: SES sandbox mode.** The AWS
account's SES is in sandbox mode (production access denied once
already — see below) — email can only be sent to individually-
verified recipient addresses, not the full allowlist, and domain-
suffix allowlist entries don't work under sandbox mode at all. Before
sharing the site link with anyone, verify their address first:
`aws sesv2 create-email-identity --email-identity <their-email> --region us-east-1`.
A static notice was added to `/login.html` (2026-09-01) explaining
this to first-time visitors directly, so the "please verify your
email" error isn't a confusing dead end.

**SES production-access saga (2026-08-31 → ongoing):**
- Original request denied (case `178769115200354`), boilerplate reason
  ("unable to approve... don't share specific criteria"), linking to
  AWS's SES best-practices doc.
- Checked what could actually be verified: DKIM was already passing,
  but no custom **MAIL FROM domain** was configured (envelope sender
  was a generic `amazonses.com` address instead of something under
  `pages-enterprise.com`) — a specific, named item in AWS's best-
  practices guidance. Added `mailFromDomain: mail.pages-enterprise.com`
  to the `OtpSesFromIdentity` construct; CDK auto-provisions the MX +
  SPF TXT records the same way it already manages the DKIM CNAME
  records. Deployed and confirmed live (`MailFromDomainStatus:
  SUCCESS`, AWS's own automated confirmation email received).
- Attempted to resubmit via `aws sesv2 put-account-details` —
  `ConflictException`: the API won't accept a new request while a
  denied case is on file. Attempted via the Support API directly —
  requires a paid Premium Support subscription, not available on this
  account's plan. The only path was the AWS Console's Support Center,
  replying directly on the existing (Resolved, but reopenable) case.
- User submitted a detailed reply covering the full use case (content,
  volume, recipient/allowlist management, bounce/complaint handling,
  sending identity) plus a short follow-up specifically noting the new
  MAIL FROM domain. **Still pending as of 2026-09-01** — no new
  decision yet.
- **Why this may not resolve quickly regardless of how well-argued the
  request is:** SES production-access review for small/new accounts is
  largely automated risk scoring (account age, billing/usage history,
  domain age/reputation), not a human weighing the specific merits
  described. Compounding that, "OTP/verification code" framing — while
  completely accurate here — is also one of the most common cover
  stories used by actual abuse operations requesting SES access, which
  may make automated systems *more* cautious of this exact framing, not
  less. The practical implication: don't block the site's usability on
  this being approved (see the automated-fallback item above); treat
  any approval as a bonus, not the plan.

- [ ] Update README/LICENSE framing to note the *deployed* site is
      access-gated even though the repo/source remains public, and
      note the SES-sandbox recipient-verification limitation above so
      it's documented somewhere other than this planning doc.

### 1. DORA metrics / SEI scorecard — shipped

`scripts/dora-metrics.mjs` computes the four DORA metrics from this
repo's own `deploy.yml` run history via the GitHub REST API;
`site/dora-metrics.html`/`.js` render them (content-as-data pattern).
Refreshed daily by `.github/workflows/dora-metrics.yml`, which writes
straight to S3 via a narrowly-scoped `GitHubActionsMetricsRole`
(deliberately bypasses git/PR/`cdk deploy` — a `GITHUB_TOKEN`-authored
PR can never trigger the required `cdk-diff.yml` check, which would
hang an auto-merge forever). `dora-metrics.json` is git-untracked and
fully reproducible from GitHub's Actions API at any time.

### 2. AI assistant applet — sitewide, page-aware — shipped

A floating chat button/panel present on every public page, aware of
which page the visitor is on, answering grounded in the site's own
public JSON data (`content.json`, `dora-metrics.json`,
`security-scorecard.json`, `100-day-plan.json`). Direct Bedrock
Runtime `Converse` calls (Claude Haiku via its `us.*` cross-region
inference profile) — deliberately **no** Bedrock Agent/Knowledge Base;
the site's entire public data surface is well under 100KB, trivially
small relative to any model's context window, so a vector store buys
nothing and would add real always-on cost. System prompt built fresh
per request from those four files (S3, 5-minute cache); page context
sent as `document.body.dataset.page` and surfaced back visibly in the
greeting/suggested chips. The full conversation is sent with every
request (not just the newest message), so the assistant has real
memory across turns. Sits behind the same OTP session gate as the rest
of the site; a dedicated least-privilege IAM role (never shared with
the GitHub OIDC roles); a Bedrock Guardrail (content filters incl.
prompt-attack, PII anonymization); a combined rate-limit/message-cap
via one atomic DynamoDB counter per session (40 messages, 400-token
response cap); and a `CHAT_ENABLED` env-var kill switch. See
`infra/lambda/chat/`, `infra/lib/resume-site-stack.ts`,
`site/chat-widget.js`.

Shipped across PRs #43-47, with four real bugs found and fixed via
actual live usage in quick succession after launch:
- The Bedrock Guardrail's `NAME` and `EMAIL` PII entities anonymize
  both input *and* output by default — since this site's whole
  purpose is answering questions about a named person and surfacing
  his contact email, the guardrail was redacting its own core
  content ("Based on **{NAME}**'s 100-Day Plan...", "reach out at
  **{EMAIL}**"). Fixed by removing both entities from
  `sensitiveInformationPolicyConfig.piiEntitiesConfig`;
  `PHONE`/`SSN`/`ADDRESS` stay since `content.json` never includes
  those and the model has no legitimate reason to output them. Jest
  regression test added.
- Model replies contained literal markdown syntax (`**bold**`, `##`,
  `-` bullets) instead of formatting — the widget correctly
  HTML-escaped output for safety but never interpreted markdown. Fixed
  with a small hand-rolled markdown-to-HTML renderer
  (`renderMarkdown`/`inlineMarkdown` in `chat-widget.js`) that stays
  exactly as XSS-safe: text is escaped *first*, then wrapped only in a
  fixed set of hardcoded tags, never anything from raw model output.
- Reopening the panel after a page refresh restored history but
  scrolled to the top instead of the latest message — a hidden
  (`display: none`) element always reports `scrollHeight` as 0, so the
  scroll-to-bottom calls during the initial (still-hidden) history
  replay were no-ops. Fixed by re-applying scroll-to-bottom in
  `openPanel()`, after the panel is actually visible.
- Every request sent only the newest message, with zero conversation
  history — the model answered each turn in isolation even *within* a
  single session, not just across a refresh. Fixed by sending the full
  accumulated conversation with every request; client-supplied history
  is validated and re-scored by the guardrail as input on every call,
  same as a single message always was.

- [x] AWS Budgets alarm on costs — implemented as a single whole-
      account $10/month budget rather than a Bedrock-filtered one (see
      the cost-alarm nice-to-have below); simpler, needed no cost-
      allocation-tag activation step, still catches runaway Bedrock/
      Lambda cost well under the $20/month ceiling set for this
      feature specifically.

### 3. Golden-path / Internal Developer Platform demo — shipped

Repo is an actual GitHub template repository (clone-and-go, not just
described). `catalog-info.yaml` at the repo root (Backstage
service-catalog format). Surfaced on the site itself, not just the
repo: a "Use this template →" CTA and a live `catalog-info.yaml`
render (fetched from `raw.githubusercontent.com` at page load, no
YAML parsing — proof it's live) on the Golden-Path section of
`how-it-was-built.html`.

### 4. DevSecOps CI hardening — shipped

CodeQL scanning (`javascript-typescript`, covers `infra/**` TS and
`site/**` JS), Dependabot (weekly npm + GitHub Actions updates),
`npm audit --audit-level=high` (tightened from `critical` once the
aws-cdk-lib upgrade — see infra/process items history — resolved the
underlying transitive-dep findings), and ESLint, all gating both
`cdk-diff.yml` and `deploy.yml`. Surfaced on the site: live GitHub
Actions status badges plus a **Security Scorecard** page
(`site/security-scorecard.html`/`.js`, same content-as-data pattern as
DORA), refreshed daily from CodeQL alert counts, Dependabot PR
activity, and fresh `npm audit` results — reuses the same
`GitHubActionsMetricsRole` as the DORA workflow.

### 5. "My 100-Day Plan" page — people-leadership pillar — shipped

Genericized 100-day plan (no employer-internal names/tools, no
mentor-example references — see repo `.tmp/` convention) covering 5
focus areas × 4 time periods, grounded in the JD's three pillars.
Content-as-data: `site/100-day-plan.json` (hand-authored, git-tracked)
rendered by `site/100-day-plan.js` into `100-day-plan.html`. Includes
a downloadable, pre-generated PDF (`site/100-day-plan.pdf`, letter
portrait, 4 pages) with its own print-only CSS and layout (per-focus-
area sections rather than reusing the on-screen matrix table, which
split badly across page breaks).

**To regenerate the PDF** after editing `100-day-plan.json`: serve
`site/` locally (`python -m http.server`), `npm install puppeteer-core`
in a scratch dir, run a short script that launches local Edge/Chrome
headless via `executablePath`, navigates to `100-day-plan.html`, waits
for render, and calls `page.pdf({ preferCSSPageSize: true,
displayHeaderFooter: false, printBackground: true })` — then copy the
output over `site/100-day-plan.pdf`. No committed script for this
(infrequent enough that hand-running it beats a new devDependency).

Also fixed while building this: a pre-existing responsive bug where
`body.has-side-nav > main` lacked `min-width: 0` and `.container`
lacked explicit `width: 100%`, so any wide content could inflate the
whole page to scroll horizontally instead of just the wide element
scrolling within its own wrapper (`styles.css`).

## Nice-to-haves / "demonstrate more DX practices"

- [x] LICENSE (all rights reserved) + README note: repo is public for
      portfolio purposes only, not reuse/AI training.
- [x] Dependabot config (done as part of DevSecOps CI hardening above).
- [x] Custom domain `resume.pages-enterprise.com` via Route 53 + ACM,
      wired in `infra/lib/resume-site-stack.ts`. SES switched from a
      personal-Gmail identity (no SPF/DKIM/DMARC alignment — likely
      cause of the first production-access denial) to a domain-
      verified identity, then further to a custom MAIL FROM domain
      (see feature 0's SES saga).
- [x] Un-pin / upgrade `aws-cdk` — was already at 2.1138.0 /
      `aws-cdk-lib` 2.266.0 (an earlier version reference in this doc
      was stale); confirmed `npm audit --audit-level=high` finds 0
      vulnerabilities, tightened both workflows from `critical`.
- [x] Wired `npm run lint` into `deploy.yml`/`cdk-diff.yml`. The script
      existed but had never actually run — no ESLint config existed at
      all, and the glob-quoted invocation silently broke on Windows/
      cmd.exe. Added `infra/.eslintrc.json` and a portable script form
      (`eslint lib bin test lambda --ext .ts`). First real run found
      one genuine issue (an unused variable) — fixed.
- [x] PR template referencing the CDK diff comment / review checklist:
      `.github/pull_request_template.md`.
- [x] Smoke-test step after deploy: curls `/login.html` specifically
      (not the homepage, which the OTP gate correctly redirects for an
      unauthenticated request), with retries to absorb any brief
      propagation lag right after the CloudFront invalidation.
- [x] Cost/budget alarm via AWS Budgets: `MonthlyCostBudget`
      (`AWS::Budgets::Budget`), $10/month whole-account threshold, with
      FORECASTED (advance warning) and ACTUAL notifications both
      emailing `OTP_ADMIN_EMAIL`.

## Notes / decisions log

- OIDC trust policies must use wildcard `sub` matching, not exact
  string match — GitHub decorates `sub` with owner/repo IDs after
  renames. Full context in [copilot-instructions.md](copilot-instructions.md).
- `actions/github-script` steps must pass step outputs via `env:`,
  never splice them into the JS template literal directly (injection +
  syntax risk when output contains backticks).
- GitHub jobs with `environment:` set change the OIDC `sub` claim
  suffix to `:environment:<name>` instead of `:ref:refs/heads/<branch>`
  — trust policies must match whichever one actually applies.
- Branch protection (required status checks, enforce-admins, no
  force-push/delete) requires the repo to be public on GitHub Free, or
  GitHub Pro for a private repo. Decided to stay public + rely on an
  explicit LICENSE to discourage scraping/reuse instead of going
  private. **Revisited 2026-08-31** after GitHub Pro removed the
  original technical blocker — reaffirmed public anyway: going private
  would break the live "Use this template" CTA and the live
  `catalog-info.yaml` render on `how-it-was-built.html`, and no new
  reason to go private emerged.
- `cdk-diff.yml` intentionally has no `paths:` filter, since it's a
  *required* branch-protection check — a required check with a path
  filter leaves non-matching PRs hanging forever waiting on a status
  that never reports. It always runs, but internally no-ops via a
  git-diff-based gate when nothing under `infra/` changed.
- Reusing a git branch after its PR has been squash-merged is risky:
  the branch's own history still has the pre-squash commits, so a
  later merge/rebase against `main` can produce spurious conflicts
  even when the actual content is identical. Prefer branching fresh
  from `origin/main` for each new piece of work. Relatedly: always
  check a PR's merge state (`gh pr view <n> --json state`) before
  pushing more commits to its branch, or before reporting it as
  merged — pushing to an already-merged PR's branch does *not* add
  those commits to `main`, and `gh pr edit` on a merged PR silently
  succeeds (metadata-only), giving no signal that anything is wrong.
- When opening two independent, non-overlapping PRs close together
  (e.g. two separate `task.md` edits), say explicitly that they don't
  depend on each other — otherwise it's a reasonable assumption that
  the second supersedes the first, which can lead to the first being
  closed unmerged by mistake (happened with PR #48 vs #49 on
  2026-08-31 — see the note at the top of this doc).
