import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createHash, randomInt } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ddb } from '../common/dynamo';
import { checkAllowlist } from '../common/allowlist';

const OTP_TABLE_NAME = process.env.OTP_TABLE_NAME!;
const ALLOWLIST_TABLE_NAME = process.env.ALLOWLIST_TABLE_NAME!;
const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS!;
const OTP_TTL_SECONDS = 10 * 60;

const ses = new SESv2Client({});

// Anti-enumeration: always return the same response, whether or not the
// submitted email is actually allowlisted, so this endpoint can't be used
// to discover which addresses/domains are on the allowlist.
const GENERIC_RESPONSE: APIGatewayProxyStructuredResultV2 = {
  statusCode: 200,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify({ message: 'If that email is allowlisted, a verification code has been sent.' }),
};

function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  let email: string | undefined;
  try {
    const body = JSON.parse(event.body || '{}');
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request body.' }) };
  }

  if (!email || !isValidEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ message: 'A valid email address is required.' }) };
  }

  const { allowed } = await checkAllowlist(ALLOWLIST_TABLE_NAME, email);
  if (!allowed) {
    return GENERIC_RESPONSE;
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const codeHash = createHash('sha256').update(code).digest('hex');
  const nowSeconds = Math.floor(Date.now() / 1000);

  await ddb.send(new PutCommand({
    TableName: OTP_TABLE_NAME,
    Item: {
      email,
      codeHash,
      attempts: 0,
      createdAt: nowSeconds,
      ttl: nowSeconds + OTP_TTL_SECONDS,
    },
  }));

  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: SES_FROM_ADDRESS,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: 'Your verification code' },
          Body: {
            Text: { Data: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.` },
          },
        },
      },
    }));
  } catch (err) {
    console.error('Failed to send verification code email', err);
    // SES sandbox mode requires every recipient to be individually
    // verified (see task.md — SES production access). Surface that as an
    // actionable message rather than a bare 500; it's only reachable for
    // already-allowlisted emails, so it doesn't weaken the anti-enumeration
    // behavior above.
    if (err instanceof Error && err.name === 'MessageRejected') {
      return {
        statusCode: 503,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({
          message: 'Your email address needs to be verified before we can send a login code. Please contact the site owner to complete verification, then try again.',
        }),
      };
    }
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ message: 'Something went wrong sending the verification code. Please try again shortly.' }),
    };
  }

  return GENERIC_RESPONSE;
}
