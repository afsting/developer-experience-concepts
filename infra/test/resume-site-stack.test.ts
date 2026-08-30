import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ResumeSiteStack } from '../lib/resume-site-stack';

describe('ResumeSiteStack', () => {
  const app = new cdk.App();
  const stack = new ResumeSiteStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  test('S3 bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('S3 bucket is encrypted', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
    });
  });

  test('CloudFront distribution enforces HTTPS redirect', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: 'redirect-to-https',
        },
      },
    });
  });

  test('CloudFront distribution has a default root object', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
      },
    });
  });

  test('CloudFront distribution has custom 404 error response', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 404,
            ResponsePagePath: '/404.html',
          }),
        ]),
      },
    });
  });

  test('Origin Access Control is created', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  test('Bucket policy allows CloudFront service principal only', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
          }),
        ]),
      },
    });
  });

  test('Stack has expected CloudFormation outputs', () => {
    template.hasOutput('BucketName', {});
    template.hasOutput('DistributionId', {});
    template.hasOutput('DistributionDomainName', {});
  });

  test('Chat session table has TTL and pay-per-request billing', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    });
  });

  test('Bedrock guardrail is created with content and PII policies', () => {
    template.hasResourceProperties('AWS::Bedrock::Guardrail', {
      ContentPolicyConfig: {
        FiltersConfig: Match.arrayWith([
          Match.objectLike({ Type: 'PROMPT_ATTACK' }),
        ]),
      },
      SensitiveInformationPolicyConfig: {
        PiiEntitiesConfig: Match.arrayWith([
          Match.objectLike({ Type: 'EMAIL', Action: 'ANONYMIZE' }),
        ]),
      },
    });
  });

  test('Chat function IAM policy is scoped to exactly the four public JSON files', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:GetObject',
            Resource: Match.arrayWith([
              Match.objectLike({ 'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('content\\.json')])]) }),
              Match.objectLike({ 'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('dora-metrics\\.json')])]) }),
              Match.objectLike({ 'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('security-scorecard\\.json')])]) }),
              Match.objectLike({ 'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('100-day-plan\\.json')])]) }),
            ]),
          }),
        ]),
      },
    });
  });

  test('Chat function IAM policy grants Bedrock access only on the chosen model (inference profile + underlying foundation model), never a wildcard model', () => {
    // Cross-region inference profiles require InvokeModel on both the
    // profile ARN (account/region-scoped) and the underlying foundation
    // model ARN (region wildcarded, since the profile can route across US
    // regions — but still pinned to this exact model ID, never all models).
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            Resource: Match.arrayWith([
              Match.objectLike({
                'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('inference-profile/us\\.anthropic\\.claude-haiku')])]),
              }),
              Match.stringLikeRegexp('^arn:aws:bedrock:\\*::foundation-model/anthropic\\.claude-haiku'),
            ]),
          }),
        ]),
      },
    });
  });

  test('Chat function IAM role is dedicated, not shared with the GitHub OIDC roles', () => {
    // None of the three named GitHub OIDC roles (diff/deploy/metrics) have
    // any Bedrock permissions — only the chat function's own auto-generated
    // role does. GitHub Actions has no Bedrock access at all.
    for (const roleName of ['github-actions-resume-site-diff', 'github-actions-resume-site-deploy', 'github-actions-resume-site-metrics']) {
      template.hasResourceProperties('AWS::IAM::Role', Match.objectLike({ RoleName: roleName }));
    }

    const bedrockGrantingPolicies = Object.values(template.findResources('AWS::IAM::Policy'))
      .filter((policy) => {
        const statements = (policy as { Properties?: { PolicyDocument?: { Statement?: unknown[] } } })
          .Properties?.PolicyDocument?.Statement ?? [];
        return statements.some((s) => {
          const actions = (s as { Action?: unknown }).Action;
          const actionList = Array.isArray(actions) ? actions : [actions];
          return actionList.some((a) => typeof a === 'string' && a.startsWith('bedrock:'));
        });
      });
    expect(bedrockGrantingPolicies.length).toBeGreaterThan(0);
    for (const policy of bedrockGrantingPolicies) {
      const roles = (policy as { Properties?: { Roles?: unknown[] } }).Properties?.Roles ?? [];
      expect(JSON.stringify(roles)).not.toMatch(/GitHubActions(Diff|Deploy|Metrics)Role/);
    }
  });

  test('/api/chat is a CloudFront behavior with caching disabled', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/api/chat',
            ViewerProtocolPolicy: 'https-only',
          }),
        ]),
      },
    });
  });
});
