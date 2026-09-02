import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { randomBytes } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../common/dynamo';
import { checkAllowlist } from '../common/allowlist';
import { signSession, verifySession } from '../common/session';
import { getHmacSecret } from '../common/kvsSecret';
import { getSessionToken, forbidden, jsonResponse } from '../common/http';

const MAGIC_LINK_TABLE_NAME = process.env.MAGIC_LINK_TABLE_NAME!;
const ALLOWLIST_TABLE_NAME = process.env.ALLOWLIST_TABLE_NAME!;
const SITE_DOMAIN = process.env.SITE_DOMAIN!;
const LINK_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // matches verifyCode's session length

function loginErrorRedirect(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 302,
    headers: { location: `https://${SITE_DOMAIN}/login.html`, 'cache-control': 'no-store' },
  };
}

// Admin-issued fallback login path: an admin generates a short-lived,
// single-use link for a specific allowlisted email and shares it via a
// channel they already trust (Teams, an existing email thread, etc.),
// bypassing SES delivery entirely. In addition to, not instead of, the
// normal email-OTP flow — see task.md for why this exists (corporate spam
// filters can silently swallow OTP emails from an unfamiliar domain, with
// zero visibility on either end when that happens).
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;

  if (method === 'POST') {
    const token = getSessionToken(event);
    if (!token) return forbidden();
    const hmacSecret = await getHmacSecret();
    const session = verifySession(token, hmacSecret);
    if (!session || !session.admin) return forbidden();

    let email: string | undefined;
    try {
      const body = JSON.parse(event.body || '{}');
      email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
    } catch {
      return jsonResponse(400, { message: 'Invalid request body.' });
    }
    if (!email) return jsonResponse(400, { message: 'email is required.' });

    const { allowed, admin } = await checkAllowlist(ALLOWLIST_TABLE_NAME, email);
    if (!allowed) {
      return jsonResponse(400, { message: 'That email is not on the allowlist. Add it first.' });
    }

    const linkToken = randomBytes(32).toString('base64url');
    const nowSeconds = Math.floor(Date.now() / 1000);
    await ddb.send(new PutCommand({
      TableName: MAGIC_LINK_TABLE_NAME,
      Item: {
        token: linkToken,
        email,
        admin,
        createdAt: nowSeconds,
        ttl: nowSeconds + LINK_TTL_SECONDS,
      },
    }));

    return jsonResponse(201, {
      url: `https://${SITE_DOMAIN}/auth/consume-link?token=${linkToken}`,
      expiresInMinutes: LINK_TTL_SECONDS / 60,
    });
  }

  // GET /auth/consume-link — public, single-use. Anyone holding a valid,
  // unexpired token is logged in as the email it was issued for; that's
  // the deliberate tradeoff of a magic link, bounded by the short TTL and
  // one-time consumption below.
  const linkToken = event.queryStringParameters?.token;
  if (!linkToken) return loginErrorRedirect();

  const record = await ddb.send(new GetCommand({ TableName: MAGIC_LINK_TABLE_NAME, Key: { token: linkToken } }));
  const item = record.Item;
  if (!item) return loginErrorRedirect();

  // One-time use: remove immediately, regardless of what happens next.
  await ddb.send(new DeleteCommand({ TableName: MAGIC_LINK_TABLE_NAME, Key: { token: linkToken } }));

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof item.ttl !== 'number' || item.ttl < nowSeconds) {
    return loginErrorRedirect();
  }

  const hmacSecret = await getHmacSecret();
  const sessionToken = signSession(
    { email: item.email as string, admin: !!item.admin, exp: nowSeconds + SESSION_TTL_SECONDS },
    hmacSecret,
  );

  return {
    statusCode: 302,
    headers: { location: `https://${SITE_DOMAIN}/`, 'cache-control': 'no-store' },
    cookies: [
      `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
    ],
  };
}
