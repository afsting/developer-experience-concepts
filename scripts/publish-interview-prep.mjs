#!/usr/bin/env node
// Publishes .tmp/interview-prep.json (gitignored — candid prep material
// that must never land in the public repo) to the site bucket's private/
// prefix, where only the admin-gated InterviewPrepFunction can read it.
//
//   node scripts/publish-interview-prep.mjs [--profile default]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const profileIdx = process.argv.indexOf('--profile');
const profileArgs = profileIdx > -1 ? ['--profile', process.argv[profileIdx + 1]] : [];
const source = resolve('.tmp/interview-prep.json');

if (!existsSync(source)) {
  console.error(`Missing ${source}`);
  process.exit(1);
}

const aws = (args) => execFileSync('aws', [...args, ...profileArgs], { encoding: 'utf8' }).trim();

const bucket = aws([
  'cloudformation', 'describe-stacks', '--stack-name', 'ResumeSiteStack',
  '--query', "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue", '--output', 'text',
]);

aws([
  's3', 'cp', source, `s3://${bucket}/private/interview-prep.json`,
  '--content-type', 'application/json', '--cache-control', 'no-store',
]);
console.log(`Published to s3://${bucket}/private/interview-prep.json`);
