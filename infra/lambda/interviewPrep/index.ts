import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { verifySession } from '../common/session';
import { getHmacSecret } from '../common/kvsSecret';
import { getSessionToken, forbidden, jsonResponse } from '../common/http';

const s3 = new S3Client({});
const BUCKET_NAME = process.env.CONTENT_BUCKET_NAME!;
const OBJECT_KEY = process.env.CONTENT_OBJECT_KEY!;

/**
 * Serves the private interview-prep JSON to admin sessions only.
 *
 * The content lives in S3 under a key the bucket policy denies to
 * CloudFront (see resume-site-stack.ts), so this Lambda is the only way
 * to read it over HTTP — the static page that renders it ships no content.
 * The admin check comes from the signed session's `admin` claim, same as
 * the allowlist admin Lambda.
 */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const token = getSessionToken(event);
  if (!token) return forbidden();

  const session = verifySession(token, await getHmacSecret());
  if (!session || !session.admin) return forbidden();

  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: OBJECT_KEY }));
    const body = await result.Body!.transformToString('utf8');
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body,
    };
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') {
      return jsonResponse(404, { message: 'Interview prep content has not been published yet.' });
    }
    throw err;
  }
}
