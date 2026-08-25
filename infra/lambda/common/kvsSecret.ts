import {
  CloudFrontKeyValueStoreClient,
  GetKeyCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';

const client = new CloudFrontKeyValueStoreClient({});

// Cache across warm invocations so we don't call the KVS data plane on
// every request; the secret only rotates via a redeploy, so a short TTL
// is enough to pick up a rotation without much delay.
let cached: { value: string; fetchedAt: number } | undefined;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getHmacSecret(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const kvsArn = process.env.KVS_ARN;
  if (!kvsArn) {
    throw new Error('KVS_ARN environment variable is not set');
  }

  const result = await client.send(new GetKeyCommand({ KvsARN: kvsArn, Key: 'hmacSecret' }));
  if (!result.Value) {
    throw new Error('hmacSecret key not found in CloudFront KeyValueStore');
  }

  cached = { value: result.Value, fetchedAt: now };
  return cached.value;
}
