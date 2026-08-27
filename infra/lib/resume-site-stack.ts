import * as path from 'path';
import * as crypto from 'crypto';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cr from 'aws-cdk-lib/custom-resources';
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
 * Custom domain: resume.pages-enterprise.com, served over the
 * CloudFront distribution via an ACM certificate (DNS-validated) and
 * Route 53 alias A/AAAA records, both provisioned in this stack against
 * the pre-existing pages-enterprise.com hosted zone.
 */

export interface ResumeSiteStackProps extends cdk.StackProps {
  /**
   * Email seeded as the bootstrap admin for the OTP access gate's
   * /admin.html allowlist UI. Required for a real deploy — supplied by
   * bin/resume-site.ts from the OTP_ADMIN_EMAIL repo secret, which throws
   * if it's missing. Falls back to a non-functional placeholder only for
   * local/test synth (e.g. the jest suite constructs this stack directly
   * with no props).
   */
  readonly otpAdminEmail?: string;

  /**
   * SES identity OTP verification emails are sent from. Must be verified
   * in SES (this stack provisions the identity, but AWS still emails a
   * confirmation link that a human must click) before sends succeed.
   */
  readonly otpSesFromAddress?: string;

  /**
   * Hex-encoded HMAC secret used to sign/verify OTP-gate session cookies,
   * shared between the CloudFront Function and the verify-code/admin
   * Lambdas via the CloudFront KeyValueStore. Must stay stable across
   * deploys — regenerating it invalidates every active session. Supplied
   * via the OTP_HMAC_SECRET repo secret; falls back to a random per-synth
   * value only for local/test synth.
   */
  readonly otpHmacSecret?: string;
}

export class ResumeSiteStack extends cdk.Stack {
  /** The CloudFront distribution domain name, output for reference. */
  public readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props?: ResumeSiteStackProps) {
    super(scope, id, props);

    const otpAdminEmail = props?.otpAdminEmail ?? 'admin@example.invalid';
    const otpSesFromAddress = props?.otpSesFromAddress ?? 'admin@example.invalid';
    const otpHmacSecret = props?.otpHmacSecret ?? crypto.randomBytes(32).toString('hex');

    // ----------------------------------------------------------------
    // Custom domain — resume.pages-enterprise.com
    // Referenced by fixed attributes (not `fromLookup`) so synth doesn't
    // need an explicit account/region context lookup.
    // ----------------------------------------------------------------
    const siteDomainName = 'resume.pages-enterprise.com';
    const siteHostedZone = route53.PublicHostedZone.fromPublicHostedZoneAttributes(this, 'SiteHostedZone', {
      zoneName: 'pages-enterprise.com',
      hostedZoneId: 'Z09464661R0CYHRXA10JN',
    });

    const siteCertificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: siteDomainName,
      validation: acm.CertificateValidation.fromDns(siteHostedZone),
    });

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
    // Email OTP access gate
    //
    // Makes the deployed site invite-only: every request to the default
    // behavior is checked by a CloudFront Function for a signed session
    // cookie (fails closed — any error redirects to /login.html). A
    // session is only issued after verifying a one-time code sent to an
    // allowlisted email. Full design rationale in task.md.
    // ----------------------------------------------------------------

    // Allowlist: pk="EMAIL"/sk=<email> for exact addresses, pk="DOMAIN"/
    // sk=<domain> for suffix matches (e.g. "mutualofomaha.com" allows any
    // *@mutualofomaha.com address). Managed via /admin.html after the
    // bootstrap admin entry below is seeded.
    const allowlistTable = new dynamodb.Table(this, 'AllowlistTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // One-time codes, keyed by email. The `ttl` attribute auto-expires
    // codes via DynamoDB TTL; requestCode/verifyCode Lambdas also enforce
    // the 10-minute expiry and a max-attempts lockout independently.
    const otpTable = new dynamodb.Table(this, 'OtpTable', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // SES identity OTP emails are sent from. Verified at the *domain*
    // level (pages-enterprise.com) rather than a single email address —
    // CDK provisions the DKIM CNAME records directly in siteHostedZone, so
    // there's no confirmation-link email to click, and any address at the
    // domain (e.g. otpSesFromAddress) can send once DKIM propagates. This
    // replaced the old per-address `ses.Identity.email(...)` identity,
    // which relied on a personal Gmail sender and was hurting
    // deliverability (no SPF/DKIM/DMARC alignment). SES still starts in
    // sandbox mode, which requires each *recipient* to be individually
    // verified until production access is requested (see task.md —
    // decided to verify recipients manually rather than request
    // production access).
    new ses.EmailIdentity(this, 'OtpSesFromIdentity', {
      identity: ses.Identity.publicHostedZone(siteHostedZone),
    });

    // CloudFront KeyValueStore holding the HMAC secret used to sign/verify
    // session cookies — read by the CloudFront Function via cf.kvs() and
    // by the verify-code/admin Lambdas via the KVS data plane API, so
    // there's a single source of truth for the secret at the edge and in
    // Lambda. Seeded by the KvsSeed custom resource below (not
    // ImportSource — its update semantics on an existing store aren't
    // guaranteed safe for a secret that must survive redeploys).
    const sessionKvs = new cloudfront.KeyValueStore(this, 'SessionKvs');

    const kvsSeedFn = new lambdaNode.NodejsFunction(this, 'KvsSeedFunction', {
      entry: path.join(__dirname, '../lambda/kvsSeed/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(2),
      bundling: { externalModules: [] },
    });
    kvsSeedFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudfront-keyvaluestore:DescribeKeyValueStore', 'cloudfront-keyvaluestore:PutKey'],
      resources: [sessionKvs.keyValueStoreArn],
    }));

    const kvsSeedProvider = new cr.Provider(this, 'KvsSeedProvider', {
      onEventHandler: kvsSeedFn,
    });

    new cdk.CustomResource(this, 'KvsSeed', {
      serviceToken: kvsSeedProvider.serviceToken,
      properties: {
        kvsArn: sessionKvs.keyValueStoreArn,
        secretValue: otpHmacSecret,
      },
    });

    // Bootstrap admin allowlist entry — reasserted on every deploy
    // (Create *and* Update), so redeploying always restores your own
    // admin access even if it were ever accidentally removed via
    // /admin.html. Every other entry is managed exclusively through the
    // admin UI from here on.
    const bootstrapAdminItem = {
      TableName: allowlistTable.tableName,
      Item: {
        pk: { S: 'EMAIL' },
        sk: { S: otpAdminEmail },
        admin: { BOOL: true },
        createdAt: { N: `${Math.floor(Date.now() / 1000)}` },
      },
    };
    new cr.AwsCustomResource(this, 'SeedAdminAllowlistEntry', {
      onCreate: {
        service: 'DynamoDB',
        action: 'putItem',
        parameters: bootstrapAdminItem,
        physicalResourceId: cr.PhysicalResourceId.of(`${this.stackName}-bootstrap-admin`),
      },
      onUpdate: {
        service: 'DynamoDB',
        action: 'putItem',
        parameters: bootstrapAdminItem,
        physicalResourceId: cr.PhysicalResourceId.of(`${this.stackName}-bootstrap-admin`),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [allowlistTable.tableArn],
      }),
    });

    // ---- API Lambdas behind /auth/* ----
    const requestCodeFn = new lambdaNode.NodejsFunction(this, 'RequestCodeFunction', {
      entry: path.join(__dirname, '../lambda/requestCode/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      environment: {
        OTP_TABLE_NAME: otpTable.tableName,
        ALLOWLIST_TABLE_NAME: allowlistTable.tableName,
        SES_FROM_ADDRESS: otpSesFromAddress,
      },
      bundling: { externalModules: [] },
    });
    otpTable.grantReadWriteData(requestCodeFn);
    allowlistTable.grantReadData(requestCodeFn);
    // SES authorizes ses:SendEmail against the identity ARN of BOTH the
    // "From" identity and, while the account is in the SES sandbox, every
    // recipient — recipients must also resolve to an authorized identity
    // ARN. Recipients here are an arbitrary, dynamically-managed allowlist
    // (see AdminAllowlistFunction) and can't be enumerated up front, so
    // per AWS's own guidance for email-sending-only policies we use a
    // wildcard resource; the real access boundary is the allowlist check
    // in requestCode/index.ts, not this IAM policy.
    requestCodeFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    }));

    const verifyCodeFn = new lambdaNode.NodejsFunction(this, 'VerifyCodeFunction', {
      entry: path.join(__dirname, '../lambda/verifyCode/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      environment: {
        OTP_TABLE_NAME: otpTable.tableName,
        ALLOWLIST_TABLE_NAME: allowlistTable.tableName,
        KVS_ARN: sessionKvs.keyValueStoreArn,
      },
      bundling: { externalModules: [] },
    });
    otpTable.grantReadWriteData(verifyCodeFn);
    allowlistTable.grantReadData(verifyCodeFn);
    verifyCodeFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudfront-keyvaluestore:GetKey'],
      resources: [sessionKvs.keyValueStoreArn],
    }));

    const adminFn = new lambdaNode.NodejsFunction(this, 'AdminAllowlistFunction', {
      entry: path.join(__dirname, '../lambda/admin/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ALLOWLIST_TABLE_NAME: allowlistTable.tableName,
        KVS_ARN: sessionKvs.keyValueStoreArn,
      },
      bundling: { externalModules: [] },
    });
    allowlistTable.grantReadWriteData(adminFn);
    adminFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudfront-keyvaluestore:GetKey'],
      resources: [sessionKvs.keyValueStoreArn],
    }));

    // ---- HTTP API (API Gateway v2) fronting the three Lambdas ----
    // Built from L1 (Cfn*) constructs rather than the L2 HttpApi, which
    // still lives in a separate alpha module version-locked to a specific
    // aws-cdk-lib release — avoided here to keep the dependency surface
    // stable across routine `npm update`s.
    const authApi = new apigwv2.CfnApi(this, 'AuthApi', {
      name: `${this.stackName}-auth-api`,
      protocolType: 'HTTP',
    });

    new apigwv2.CfnStage(this, 'AuthApiDefaultStage', {
      apiId: authApi.ref,
      stageName: '$default',
      autoDeploy: true,
      defaultRouteSettings: {
        // Cheap baseline abuse mitigation for a v1: a stage-level request
        // rate cap. Not per-IP/per-user — see task.md for the known
        // limitation and the WAF/usage-plan alternative considered.
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      },
    });

    const addAuthRoute = (
      routeId: string,
      routeKey: string,
      fn: lambdaNode.NodejsFunction,
      permissionPath: string,
    ): void => {
      const integration = new apigwv2.CfnIntegration(this, `${routeId}Integration`, {
        apiId: authApi.ref,
        integrationType: 'AWS_PROXY',
        integrationUri: fn.functionArn,
        payloadFormatVersion: '2.0',
      });
      new apigwv2.CfnRoute(this, `${routeId}Route`, {
        apiId: authApi.ref,
        routeKey,
        target: `integrations/${integration.ref}`,
      });
      fn.addPermission(`${routeId}InvokePermission`, {
        principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${authApi.ref}/*/*${permissionPath}`,
      });
    };

    addAuthRoute('RequestCode', 'POST /auth/request-code', requestCodeFn, '/auth/request-code');
    addAuthRoute('VerifyCode', 'POST /auth/verify-code', verifyCodeFn, '/auth/verify-code');
    addAuthRoute('AdminAllowlistGet', 'GET /auth/admin/allowlist', adminFn, '/auth/admin/allowlist');
    addAuthRoute('AdminAllowlistPost', 'POST /auth/admin/allowlist', adminFn, '/auth/admin/allowlist');
    addAuthRoute('AdminAllowlistDelete', 'DELETE /auth/admin/allowlist', adminFn, '/auth/admin/allowlist');

    const authApiDomain = `${authApi.ref}.execute-api.${this.region}.${this.urlSuffix}`;

    // CloudFront Function gating the default (static site) behavior.
    // /login.html is exempted in the function code itself — it's the one
    // page that must stay reachable without a session.
    const sessionCheckFunction = new cloudfront.Function(this, 'SessionCheckFunction', {
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(__dirname, '../cloudfront-functions/session-check.js'),
      }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      keyValueStore: sessionKvs,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Raymond Page résumé site',

      // Default behavior — HTML (short cache), gated by the session-check
      // CloudFront Function.
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: htmlCachePolicy,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        functionAssociations: [{
          function: sessionCheckFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
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

      domainNames: [siteDomainName],
      certificate: siteCertificate,
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

    // ----------------------------------------------------------------
    // /auth/* — proxies to the HTTP API above. Same-origin from the
    // browser's perspective (same distribution/domain as the static
    // site), so no CORS configuration is needed anywhere. No CloudFront
    // Function attached here — these routes must stay reachable
    // pre-authentication.
    // ----------------------------------------------------------------
    distribution.addBehavior('/auth/*', new origins.HttpOrigin(authApiDomain), {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      // NOTE: must NOT forward the viewer's Host header (which is the
      // CloudFront distribution domain) to the API Gateway origin — API
      // Gateway rejects requests whose Host header doesn't match its own
      // execute-api domain with a 403, which CloudFront's
      // CustomErrorResponses then masks as the site's generic 404 page,
      // making this failure mode very confusing to diagnose from the
      // browser alone. ALL_VIEWER_EXCEPT_HOST_HEADER forwards everything
      // else (headers/cookies/query strings) but lets CloudFront set the
      // Host header to match the origin (API Gateway) domain instead.
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    });

    this.distributionDomainName = distribution.distributionDomainName;

    // Alias records pointing the custom domain at the CloudFront
    // distribution (A for IPv4, AAAA for IPv6 — CloudFront distributions
    // serve both by default).
    const cloudFrontAliasTarget = route53.RecordTarget.fromAlias(
      new route53Targets.CloudFrontTarget(distribution),
    );

    new route53.ARecord(this, 'SiteAliasRecordA', {
      zone: siteHostedZone,
      recordName: siteDomainName,
      target: cloudFrontAliasTarget,
    });

    new route53.AaaaRecord(this, 'SiteAliasRecordAAAA', {
      zone: siteHostedZone,
      recordName: siteDomainName,
      target: cloudFrontAliasTarget,
    });

    new cdk.CfnOutput(this, 'AllowlistTableName', {
      value: allowlistTable.tableName,
      description: 'DynamoDB table backing the OTP access gate allowlist',
    });

    new cdk.CfnOutput(this, 'OtpBootstrapAdminEmail', {
      value: otpAdminEmail,
      description: 'Email seeded as the bootstrap admin for /admin.html',
    });

    new cdk.CfnOutput(this, 'OtpSesFromAddressOutput', {
      value: otpSesFromAddress,
      description: 'SES sender address, verified via the pages-enterprise.com domain identity (no confirmation email to click)',
    });

    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${siteDomainName}`,
      description: 'Custom domain URL for the résumé site',
      exportName: `${this.stackName}-SiteUrl`,
    });

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

    // Narrowly-scoped role for the weekly DORA-metrics-refresh workflow
    // (.github/workflows/dora-metrics.yml, schedule + workflow_dispatch
    // triggers only). Deliberately NOT the deploy role: this workflow
    // only ever needs to overwrite one S3 object (site/dora-metrics.json)
    // — it doesn't run `cdk deploy` and doesn't touch any other site
    // file, so it gets its own least-privilege role rather than reusing
    // githubDeployRole's full bucket read/write + CloudFront invalidation
    // access. Written with Cache-Control: no-cache (like HTML), so no
    // CloudFront invalidation permission is needed either — the object
    // is always revalidated at the edge.
    const githubSubScheduledOrDispatch = `repo:${githubOwner}*/${githubRepoName}*:ref:refs/heads/main`;

    const githubMetricsRole = new iam.Role(this, 'GitHubActionsMetricsRole', {
      roleName: 'github-actions-resume-site-metrics',
      description: 'Role assumed by GitHub Actions to publish the DORA metrics scorecard JSON on a schedule',
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': githubSubScheduledOrDispatch,
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    githubMetricsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'PutDoraMetricsObjectOnly',
      actions: ['s3:PutObject'],
      resources: [siteBucket.arnForObjects('dora-metrics.json')],
    }));

    githubMetricsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ReadStackOutputsForBucketName',
      actions: ['cloudformation:DescribeStacks'],
      resources: [this.stackId],
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

    new cdk.CfnOutput(this, 'GitHubActionsMetricsRoleArn', {
      value: githubMetricsRole.roleArn,
      description: 'Set as the AWS_METRICS_ROLE_ARN secret in the GitHub repo',
      exportName: `${this.stackName}-GitHubActionsMetricsRoleArn`,
    });
  }
}
