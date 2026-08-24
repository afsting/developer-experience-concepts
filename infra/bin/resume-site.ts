#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ResumeSiteStack } from '../lib/resume-site-stack';

const app = new cdk.App();

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
});
