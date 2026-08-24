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
