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
});
