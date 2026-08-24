# Copilot Instructions — developer-experience-concepts

## What this repo is

A résumé site for Raymond Page that doubles as a working demo of
platform-engineering practices: static site on AWS (S3 + CloudFront),
infra as code (CDK v2/TypeScript), and CI/CD via GitHub Actions using
OIDC federation (no long-lived AWS credentials). The narrative
("how it was built") is as much the point as the résumé content itself.

## Repository layout

```
infra/                      AWS CDK app (TypeScript)
  bin/resume-site.ts        CDK entry point
  lib/resume-site-stack.ts  S3 + CloudFront + IAM/OIDC stack (single stack: ResumeSiteStack)
  test/                     jest unit tests (aws-cdk-lib assertions)
site/                       Static site, no build tooling required to view
  content.json              ← résumé content lives here, edit this not the HTML
  build.js                  renders content.json into the HTML pages
  index.html, how-it-was-built.html, 404.html, styles.css
.github/workflows/
  deploy.yml                push to main → cdk deploy → s3 sync → CF invalidation
  cdk-diff.yml              PR touching infra/** → cdk diff posted as PR comment
```

## Infra conventions (infra/lib/resume-site-stack.ts)

- S3 bucket is **private**, `BlockPublicAccess.BLOCK_ALL`, `RemovalPolicy.RETAIN`.
  CloudFront reaches it via **Origin Access Control (OAC)**, not the legacy OAI.
- One CDK stack (`ResumeSiteStack`) holds site infra (S3/CloudFront) *and*
  the GitHub OIDC provider + IAM roles for CI/CD — keep it that way unless
  there's a strong reason to split.
- CDK bootstrap qualifier is `hnb659fds` (default). Account `315326805073`,
  region `us-east-1`.
- Custom domain support exists but is commented out — see the class doc
  comment at the top of the stack for the exact steps to enable it.

## GitHub Actions OIDC — the one thing to get right

- `deploy.yml` and `cdk-diff.yml` use `aws-actions/configure-aws-credentials@v4`
  with `role-to-assume` from a repo secret (`AWS_DEPLOY_ROLE_ARN`,
  `AWS_CDK_DIFF_ROLE_ARN`) and `permissions: id-token: write`. No stored AWS keys.
- **Do not** write IAM trust-policy conditions that do exact-string-match the
  `sub` claim against `repo:{owner}/{repo}:...`. GitHub decorates `sub` with
  internal numeric owner/repo IDs whenever the org or repo has ever been
  renamed (e.g. `repo:owner@12345/repo@67890:pull_request`), which silently
  breaks exact matches. Use `StringLike` wildcards after the owner/repo name
  (see `githubSubPullRequest` / `githubSubMainPush` in the stack) instead.
  AWS also rejects trust policies whose `sub`/`job_workflow_ref` condition is
  a bare wildcard, so `repository`/`ref` claims alone are not a valid
  substitute — you need a scoped `sub` (or `job_workflow_ref`) condition.
- Verify actual OIDC claims via CloudTrail `lookup-events` on
  `AssumeRoleWithWebIdentity` if a trust policy mismatch is suspected —
  `userIdentity.principalId` shows the exact `sub` GitHub sent.

## `actions/github-script` steps — avoid template-literal injection

Never splice a step output directly into a `github-script` JS template
literal like `` `${{ steps.x.outputs.y }}` ``. If that output contains
backticks or `${...}` (which `cdk diff` output regularly does), it breaks
the script syntax and is also an injection risk. Pass the value through
`env:` on the step and read it via `process.env.VAR_NAME` instead.

## Local dev commands

```bash
cd infra
npm install
npm run build       # tsc
npm test            # jest unit tests
npx cdk synth        # dry-run CloudFormation synth
npx cdk diff --profile default
npx cdk deploy --profile default --require-approval never
```

Site has no build step — open `site/*.html` directly or serve with
`npx serve site` / `python3 -m http.server 8080`.

## Environment quirks worth knowing

- Windows PowerShell terminals in this workspace often don't pick up PATH
  updates from `winget install` (e.g. for `gh`) in new terminal sessions.
  Prefix commands with:
  ```powershell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  ```
- GitHub repo: `afsting/developer-experience-concepts`. AWS account
  `315326805073`, `us-east-1`, IAM user `af_sting`.
