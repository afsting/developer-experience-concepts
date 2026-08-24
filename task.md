# Task Plan — developer-experience-concepts

Living planning doc for next steps. Update statuses as work progresses;
prune completed items periodically rather than letting this grow forever.

## Status: PR #1 merging

PR #1 ("Bootstrap résumé site: S3+CloudFront CDK stack, OIDC CI/CD,
data-driven static site") is merging into `main`. `cdk-diff.yml` is green
(OIDC trust policy + github-script injection bugs both fixed). `deploy.yml`
has **not yet run** — it only triggers on push to `main`.

## Immediate (verify the merge actually deploys cleanly)

- [ ] Watch the `deploy.yml` run triggered by the merge to `main`
      (`gh run watch` or `gh run list --workflow deploy.yml`).
- [ ] Confirm `AWS_DEPLOY_ROLE_ARN` trust policy also tolerates the
      ID-decorated `sub` claim on `push` events the same way the diff role
      does for `pull_request` (same wildcard pattern, different event) —
      this is the first real end-to-end test of that role.
- [ ] Once deployed, load the CloudFront URL (`DistributionDomainName`
      output) and confirm the résumé renders, `how-it-was-built.html` and
      `404.html` work, and cache headers look right (HTML no-cache,
      assets long-cache).
- [ ] If deploy fails on the same OIDC issue, apply the same wildcard `sub`
      fix pattern used for the diff role.

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
- [ ] Add branch protection on `main` requiring the `CDK Diff (PR)` check
      to pass before merge (currently advisory only).

## Nice-to-haves / "demonstrate more DX practices"

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
