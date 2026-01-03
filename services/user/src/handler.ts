import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createLogger } from '../../../shared/src/logger';
import { ok, bad } from '../../../shared/src/response';
import { validate, parseBody, sanitize } from '../../../shared/src/validator';
import type { UserProfile } from '../../../shared/src/types';

const logger = createLogger('user-service');
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.USER_TABLE!;

const PROFILE_RULES = [
  { field: 'name', type: 'string' as const, maxLength: 100 },
];

const ADDRESS_RULES = [
  { field: 'line1', type: 'string' as const, required: true, maxLength: 200 },
  { field: 'city', type: 'string' as const, required: true, maxLength: 100 },
  { field: 'state', type: 'string' as const, required: true, maxLength: 100 },
  { field: 'postalCode', type: 'string' as const, required: true, maxLength: 20 },
  { field: 'country', type: 'string' as const, required: true, maxLength: 2 },
];

export const handler = async (event: any) => {
  const sub = event.requestContext?.authorizer?.claims?.sub;
  const email = event.requestContext?.authorizer?.claims?.email;
  if (!sub) return bad('unauthorized', 401);

  const method = event.httpMethod;
  const requestId = event.requestContext?.requestId ?? 'unknown';
  logger.info('Request received', { method, requestId, userSub: sub });

  try {
    if (method === 'GET') {
      return await getProfile(sub, email);
    }

    if (method === 'POST') {
      return await upsertProfile(sub, email, event);
    }

    if (method === 'PUT') {
      return await updateAddress(sub, event);
    }

    return bad('method not allowed', 405);
  } catch (err: any) {
    logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId });
    return bad('internal server error', 500);
  }
};

async function getProfile(sub: string, email: string) {
  const res = await client.send(
    new GetCommand({ TableName: TABLE, Key: { pk: `USER#${sub}`, sk: 'PROFILE' } })
  );

  if (!res.Item) {
    // Auto-create profile on first access
    const now = new Date().toISOString();
    const profile: any = {
      pk: `USER#${sub}`,
      sk: 'PROFILE',
      sub,
      email,
      createdAt: now,
      updatedAt: now,
    };
    await client.send(new PutCommand({ TableName: TABLE, Item: profile }));
    logger.info('Profile auto-created', { userSub: sub });
    return ok(toProfile(profile));
  }

  logger.info('Profile retrieved', { userSub: sub });
  return ok(toProfile(res.Item));
}

async function upsertProfile(sub: string, email: string, event: any) {
  const body = parseBody(event.body);
  const err = validate(body, PROFILE_RULES);
  if (err) return bad(err);

  const now = new Date().toISOString();
  const item: any = {
    pk: `USER#${sub}`,
    sk: 'PROFILE',
    sub,
    email,
    name: body.name ? sanitize(body.name as string) : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await client.send(new PutCommand({ TableName: TABLE, Item: item }));
  logger.info('Profile upserted', { userSub: sub });
  return ok(toProfile(item));
}

async function updateAddress(sub: string, event: any) {
  const body = parseBody(event.body);
  const err = validate(body, ADDRESS_RULES);
  if (err) return bad(err);

  const now = new Date().toISOString();
  const address = {
    line1: sanitize(body.line1 as string),
    line2: body.line2 ? sanitize(body.line2 as string) : undefined,
    city: sanitize(body.city as string),
    state: sanitize(body.state as string),
    postalCode: sanitize(body.postalCode as string),
    country: sanitize(body.country as string),
  };

  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: `USER#${sub}`, sk: 'PROFILE' },
    UpdateExpression: 'SET address = :addr, updatedAt = :now',
    ExpressionAttributeValues: { ':addr': address, ':now': now },
  }));

  logger.info('Address updated', { userSub: sub });
  return ok({ address, updatedAt: now });
}

function toProfile(item: any): UserProfile {
  return {
    sub: item.sub,
    email: item.email,
    name: item.name,
    address: item.address,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
