import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * ResumeSiteStack
 *
 * Provisions a private S3 bucket and a CloudFront distribution using
 * Origin Access Control (OAC) — the current AWS-recommended approach,
 * replacing the legacy Origin Access Identity (OAI).
 *
 * Architecture decisions documented in site/how-it-was-built.html.
 *
 * To add a custom domain later (no stack rebuild required):
 * 1. Request an ACM certificate in us-east-1.
 * 2. Uncomment the `domainNames` and `certificate` props below.
 * 3. Add a Route 53 ARecord pointing at the distribution.
 * 4. Run `cdk deploy`.
 */
export class ResumeSiteStack extends cdk.Stack {
  /** The CloudFront distribution domain name, output for reference. */
  public readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ----------------------------------------------------------------
    // S3 Bucket — private, all public access blocked
    // ----------------------------------------------------------------
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // ----------------------------------------------------------------
    // Origin Access Control (OAC)
    // OAC is preferred over OAI for new distributions.
    // ----------------------------------------------------------------
    const oac = new cloudfront.CfnOriginAccessControl(this, 'OAC', {
      originAccessControlConfig: {
        name: `${this.stackName}-OAC`,
        description: 'OAC for resume site S3 origin',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    });

    // ----------------------------------------------------------------
    // Cache policies
    // ----------------------------------------------------------------

    // HTML: short/no-cache so content updates appear immediately
    // after a CloudFront invalidation
    const htmlCachePolicy = new cloudfront.CachePolicy(this, 'HtmlCachePolicy', {
      cachePolicyName: `${this.stackName}-html-no-cache`,
      comment: 'No cache for HTML — invalidate on deploy',
      defaultTtl: cdk.Duration.seconds(1),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(31536000),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Static assets (CSS, JS, images): long cache (1 year)
    // Bust by changing the filename/content hash on deploy
    const staticAssetCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetCachePolicy', {
      cachePolicyName: `${this.stackName}-static-1y`,
      comment: 'Long-lived cache for versioned static assets',
      defaultTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.days(365),
      maxTtl: cdk.Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // ----------------------------------------------------------------
    // CloudFront Distribution
    // ----------------------------------------------------------------
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Raymond Page résumé site',

      // Default behavior — HTML (short cache)
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: htmlCachePolicy,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },

      // Static assets — long cache
      additionalBehaviors: {
        '*.css': {
          origin: new origins.S3Origin(siteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetCachePolicy,
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
        '*.js': {
          origin: new origins.S3Origin(siteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetCachePolicy,
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
      },

      defaultRootObject: 'index.html',

      // Custom 404 page
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.seconds(10),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.seconds(10),
        },
      ],

      // To add a custom domain, uncomment the following and
      // supply an ACM certificate ARN (certificate must be in us-east-1):
      //
      // domainNames: ['resume.yourdomain.com'],
      // certificate: acm.Certificate.fromCertificateArn(
      //   this, 'Cert', 'arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID'
      // ),
    });

    // ----------------------------------------------------------------
    // Wire OAC to the distribution's S3 origin
    // CDK's S3Origin uses OAI by default; we override at the L1 level
    // to attach our OAC and remove any OAI reference.
    // ----------------------------------------------------------------
    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;

    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity',
      '',
    );
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      oac.getAtt('Id'),
    );

    // ----------------------------------------------------------------
    // Bucket policy — allow CloudFront service principal via OAC
    // ----------------------------------------------------------------
    siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipal',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [siteBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      }),
    );

    this.distributionDomainName = distribution.distributionDomainName;

    // ----------------------------------------------------------------
    // GitHub Actions OIDC — lets GitHub Actions assume short-lived AWS
    // roles instead of storing long-lived access keys as secrets.
    // The OIDC provider is account-wide (only one is allowed per AWS
    // account for a given issuer URL), so future repos deployed into
    // this account can reuse it by importing the same provider ARN
    // instead of creating a new one.
    // ----------------------------------------------------------------
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const githubOwner = 'afsting';
    const githubRepoName = 'developer-experience-concepts';
    const githubRepo = `${githubOwner}/${githubRepoName}`;

    // GitHub decorates the `sub` claim with internal owner/repo IDs (e.g.
    // `repo:owner@12345/repo@67890:pull_request`) whenever the org or repo
    // has ever been renamed. AWS also requires the trust policy to condition
    // on `sub` (or `job_workflow_ref`) with something more specific than a
    // bare wildcard, so we match on `sub` using wildcards after the owner
    // and repo name to tolerate the optional ID suffix, rather than an exact
    // string match.
    //
    // The deploy job in deploy.yml declares `environment: production`,
    // which changes the sub claim's suffix from `:ref:refs/heads/main` to
    // `:environment:production` — GitHub Actions uses the environment name
    // in `sub` instead of the ref whenever a job targets an environment.
    // If the environment is ever removed from that job, this pattern must
    // change back to `:ref:refs/heads/main`.
    const githubSubPullRequest = `repo:${githubOwner}*/${githubRepoName}*:pull_request`;
    const githubSubMainPush = `repo:${githubOwner}*/${githubRepoName}*:environment:production`;

    // CDK bootstrap roles (created once per account/region by `cdk bootstrap`)
    // that GitHub Actions assumes in order to run `cdk diff` / `cdk deploy`.
    const cdkQualifier = 'hnb659fds'; // default CDK bootstrap qualifier
    const cdkDeployRoleArn = `arn:aws:iam::${this.account}:role/cdk-${cdkQualifier}-deploy-role-${this.account}-${this.region}`;
    const cdkFilePublishingRoleArn = `arn:aws:iam::${this.account}:role/cdk-${cdkQualifier}-file-publishing-role-${this.account}-${this.region}`;
    const cdkLookupRoleArn = `arn:aws:iam::${this.account}:role/cdk-${cdkQualifier}-lookup-role-${this.account}-${this.region}`;

    // Read-only role for the CDK Diff workflow (runs on pull_request from
    // this repo). Can only assume the lookup/deploy roles to read stack
    // state — no write access to the site bucket or CloudFront.
    const githubDiffRole = new iam.Role(this, 'GitHubActionsDiffRole', {
      roleName: 'github-actions-resume-site-diff',
      description: 'Read-only role assumed by GitHub Actions to run `cdk diff` on pull requests',
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': githubSubPullRequest,
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    githubDiffRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AssumeCdkBootstrapRoles',
      actions: ['sts:AssumeRole'],
      resources: [cdkDeployRoleArn, cdkLookupRoleArn],
    }));

    // Deploy role for the Deploy workflow (runs on push to main only).
    // Can assume the CDK bootstrap roles needed to deploy, plus write
    // directly to the site bucket and invalidate CloudFront (used by the
    // `aws s3 sync` / `aws cloudfront create-invalidation` steps).
    const githubDeployRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      roleName: 'github-actions-resume-site-deploy',
      description: 'Role assumed by GitHub Actions to deploy the resume site on push to main',
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': githubSubMainPush,
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    githubDeployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AssumeCdkBootstrapRoles',
      actions: ['sts:AssumeRole'],
      resources: [cdkDeployRoleArn, cdkFilePublishingRoleArn, cdkLookupRoleArn],
    }));

    siteBucket.grantReadWrite(githubDeployRole);

    githubDeployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'InvalidateCloudFrontCache',
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
    }));

    // ----------------------------------------------------------------
    // Stack outputs
    // ----------------------------------------------------------------
    new cdk.CfnOutput(this, 'BucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket containing site content',
      exportName: `${this.stackName}-BucketName`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID (used for cache invalidation)',
      exportName: `${this.stackName}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain name for the résumé site',
      exportName: `${this.stackName}-DistributionDomainName`,
    });

    new cdk.CfnOutput(this, 'GitHubActionsDiffRoleArn', {
      value: githubDiffRole.roleArn,
      description: 'Set as the AWS_CDK_DIFF_ROLE_ARN secret in the GitHub repo',
      exportName: `${this.stackName}-GitHubActionsDiffRoleArn`,
    });

    new cdk.CfnOutput(this, 'GitHubActionsDeployRoleArn', {
      value: githubDeployRole.roleArn,
      description: 'Set as the AWS_DEPLOY_ROLE_ARN secret in the GitHub repo',
      exportName: `${this.stackName}-GitHubActionsDeployRoleArn`,
    });
  }
}
