#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ResumeSiteStack } from '../lib/resume-site-stack';

const app = new cdk.App();

/**
 * Required for a real synth/diff/deploy — the OTP access gate must not
 * silently fall back to the stack's placeholder defaults outside of
 * direct-instantiation test contexts (e.g. the jest suite, which
 * constructs ResumeSiteStack with no props at all). Fail fast instead.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it before running ` +
        'cdk synth/diff/deploy (see task.md — Email OTP access gate).',
    );
  }
  return value;
}

new ResumeSiteStack(app, 'ResumeSiteStack', {
  /**
   * To target a specific AWS account and region, uncomment the env block below
   * and set values via CDK context, environment variables, or parameter store.
   * Do not hard-code account IDs or credentials here.
   *
   * env: {
   *   account: process.env.CDK_DEFAULT_ACCOUNT,
   *   region: process.env.CDK_DEFAULT_REGION,
   * },
   */
  description: 'Raymond Page résumé site: S3 + CloudFront (OAC)',
  otpAdminEmail: requireEnv('OTP_ADMIN_EMAIL'),
  otpSesFromAddress: requireEnv('OTP_SES_FROM_ADDRESS'),
  otpHmacSecret: requireEnv('OTP_HMAC_SECRET'),
});
