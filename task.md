# Task Plan — developer-experience-concepts

Living planning doc for next steps. Update statuses as work progresses;
prune completed items periodically rather than letting this grow forever.

## Status (2026-08-31)

Site is live at `https://resume.pages-enterprise.com`, behind an
email-OTP access gate. Shipped: OTP access gate, DORA metrics
scorecard, golden-path template repo, DevSecOps CI hardening, My
100-Day Plan page (+ PDF export), a JD-competitiveness pass on the
résumé page itself, and a sitewide page-aware AI assistant applet.
Full detail on each lives in "Planned features" below; only what's
still actionable is kept in detail, shipped work is condensed to what
future changes would need to know.

## Open infra/process items

- [ ] Un-pin / upgrade `aws-cdk` (currently 2.152.0 in some references;
      CLI notices suggest 2.1138.0+) — check for breaking changes in
      `cdk.json` feature flags before bumping. Also unblocks tightening
      `npm audit` gates from `--audit-level=critical` back to `high`
      (current moderate/high findings are transitive deps bundled
      inside `aws-cdk-lib` itself).
- [ ] Wire `npm run lint` into `deploy.yml`/`cdk-diff.yml` — script
      exists in `infra/package.json` but has no ESLint config in the
      repo at all yet, so it currently errors immediately if invoked.
- [ ] PR template referencing the CDK-diff/review checklist.
- [ ] Smoke-test step after deploy (curl the CloudFront URL, assert 200).
- [ ] Cost/budget alarm via AWS Budgets — covers both the general
      "< $1.50/month" site claim and the Bedrock-specific alarm noted
      under feature 2 below. Needs cost-allocation tags activated in
      the Billing console first (manual, non-CDK step).
- [ ] Consider a lightweight "who's visited" indicator (CloudFront
      standard logs → small summary), given the OTP gate already
      identifies visitors by email. Privacy note required if surfaced
      anywhere; purely optional.

## Site review — competitiveness recommendations (2026-08-30)

Full-site review against the target JD and résumé content.
**Application closes 2026-09-11.** Biggest finding at the time: the
JD's Engineering Enablement pillar calls out an "Engineering Dojo"
(workshops, learning paths, office hours, coaching) and the Engineering
Community of Practice — the résumé's strongest real stories (MuleSoft
Days training program, founding 3 CoPs) map to these almost
one-to-one, but the site didn't surface either. P0 below is done; P1/P2
and the further-ideas list are still open backlog, prioritized by JD
impact per unit of effort.

### P0 — quick wins — done (2026-08-30, closed out 2026-08-31)

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
      internal move, no post-employment concern since he isn't
      leaving). No change needed.

### P1 — features (days; highest JD alignment per effort)

- [ ] **"Engineering Enablement" page (the Dojo pillar).** New static
      page, content-as-data pattern: a genericized sample learning
      path/workshop curriculum modeled on the MuleSoft Days structure,
      plus office-hours/coaching cadence. Closes the single biggest
      JD-coverage gap on the site.
- [ ] **Community of Practice playbook.** JD: "Facilitate the
      Engineering Community of Practice." A genericized playbook —
      founding, meeting formats, topic pipeline, sustaining momentum —
      drawn from having founded three. Pairs with the Enablement page.
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

### Further "showcase what's possible" ideas (2026-08-30/31)

Additional leverage ideas beyond the JD-gap fixes above, grouped by
what each one proves. Recommended picks for the pre-2026-09-11 window:
the AI-applet reuse extraction below, the Engineering Health rollup,
the devcontainer, and ADRs — the rest are post-application/interview
material.

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
      SES sandbox workaround). Formalize the big ones as ADRs and
      render them on the site.
- [ ] **Working-in-the-open delivery journal.** Auto-generated from
      the repo's own merged-PR history (same GitHub-API→S3 pattern as
      DORA) — demonstrates delivery cadence and review culture live.
- [ ] **Developer feedback loop.** A tiny thumbs-up/down widget per
      page posting to the existing API Gateway/Lambda/DynamoDB stack.
- [ ] **Synthetic monitoring / status tile.** Scheduled workflow curls
      the live site, publishes status → tile on the health rollup;
      retires the "smoke test" item above at the same time.
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

**Standing operational constraint:** the AWS account's SES is in
**sandbox mode** (production access request was denied) — email can
only be sent to individually-verified recipient addresses, not the
full allowlist, and domain-suffix allowlist entries (e.g.
`@mutualofomaha.com`) don't work under sandbox mode at all. Before
sharing the site link with anyone, verify their address first:
`aws sesv2 create-email-identity --email-identity <their-email> --region us-east-1`
(sends a one-click AWS verification email). This is a known v1
limitation, not a bug — revisit requesting production access again if
it becomes a real blocker.

- [ ] Update README/LICENSE framing to note the *deployed* site is
      access-gated even though the repo/source remains public, and note
      the SES-sandbox recipient-verification limitation above so it's
      documented somewhere other than this planning doc.

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
greeting/suggested chips. Transcript persisted in `sessionStorage`,
replayed across page loads with a page-change note. Sits behind the
same OTP session gate as the rest of the site; a dedicated
least-privilege IAM role (never shared with the GitHub OIDC roles); a
Bedrock Guardrail (content filters incl. prompt-attack, PII
anonymization); a combined rate-limit/message-cap via one atomic
DynamoDB counter per session (40 messages, 400-token response cap);
and a `CHAT_ENABLED` env-var kill switch. See `infra/lambda/chat/`,
`infra/lib/resume-site-stack.ts`, `site/chat-widget.js`.

Shipped across PRs #43-46, with four real bugs found and fixed via
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
  single session, not just across a refresh. Most visible after a
  refresh (visible transcript restored, but the model had no memory of
  it — answering a question the assistant's last reply had asked
  produced a non-sequitur), but the gap existed for any mid-session
  follow-up too. Fixed (PR #47) by sending the full accumulated
  conversation with every request instead of just the latest message;
  client-supplied history is validated and re-scored by the guardrail
  as input on every call, same as a single message always was.

- [ ] AWS Budgets alarm specific to Bedrock/Lambda costs (folded into
      the general cost-alarm item above — needs cost-allocation tags
      activated in the Billing console first).

### 3. Golden-path / Internal Developer Platform demo — shipped

Repo is an actual GitHub template repository (clone-and-go, not just
described). `catalog-info.yaml` at the repo root (Backstage
service-catalog format). Surfaced on the site itself, not just the
repo: a "Use this template →" CTA and a live `catalog-info.yaml`
render (fetched from `raw.githubusercontent.com` at page load, no
YAML parsing — proof it's live) on the Golden-Path section of
`how-it-was-built.html`.

### 4. DevSecOps CI hardening — shipped

CodeQL scanning (`javascript-typescript`, covers `infra/**`
TS and `site/**` JS), Dependabot (weekly npm + GitHub Actions
updates), `npm audit --audit-level=critical` gating both `cdk-diff.yml`
and `deploy.yml` (tighten to `high` once the aws-cdk upgrade above
lands). Surfaced on the site: live GitHub Actions status badges plus a
**Security Scorecard** page (`site/security-scorecard.html`/`.js`,
same content-as-data pattern as DORA), refreshed daily from CodeQL
alert counts, Dependabot PR activity, and fresh `npm audit` results —
reuses the same `GitHubActionsMetricsRole` as the DORA workflow.

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
      cause of an earlier production-access denial) to a
      domain-verified identity.

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
  original technical blocker (Pro unlocks branch protection on private
  repos too) — reaffirmed public. Two concrete features would break
  going private: the "Use this template →" golden-path CTA (a private
  template repo only works for people explicitly granted access,
  defeating the point of an open invitation) and the live
  `catalog-info.yaml` render on `how-it-was-built.html`, which fetches
  from `raw.githubusercontent.com` — that 404s on unauthenticated
  requests to a private repo. The security architecture (OTP scheme,
  IAM scoping, guardrails) is safe to keep public regardless — it's
  secure by design, not by obscurity; the actual secrets never touch
  the repo.
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
  pushing more commits to its branch — pushing to an already-merged
  PR's branch does *not* add those commits to `main`, and `gh pr edit`
  on a merged PR silently succeeds (metadata-only), giving no signal
  that anything is wrong.
