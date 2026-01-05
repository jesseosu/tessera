import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { createLogger } from '../../../shared/src/logger';
import { ok, bad } from '../../../shared/src/response';
import { validate, parseBody } from '../../../shared/src/validator';
import type { CartItem } from '../../../shared/src/types';

const logger = createLogger('cart-service');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CART_TABLE = process.env.CART_TABLE!;
const PRODUCT_TABLE = process.env.PRODUCT_TABLE!;

const ADD_RULES = [
  { field: 'productId', type: 'string' as const, required: true },
  { field: 'qty', type: 'number' as const, required: true, min: 1, max: 99 },
];

export const handler = async (event: any) => {
  const sub = event.requestContext?.authorizer?.claims?.sub;
  if (!sub) return bad('unauthorized', 401);

  const method = event.httpMethod;
  const requestId = event.requestContext?.requestId ?? 'unknown';
  logger.info('Request received', { method, requestId, userSub: sub });

  try {
    if (method === 'GET') return await getCart(sub);
    if (method === 'POST') return await addToCart(sub, event);
    if (method === 'DELETE') return await removeFromCart(sub, event);
    if (method === 'PATCH') return await updateQty(sub, event);
    return bad('method not allowed', 405);
  } catch (err: any) {
    logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId });
    return bad('internal server error', 500);
  }
};

async function getCart(sub: string) {
  const pk = `CART#${sub}`;
  const res = await ddb.send(
    new QueryCommand({
      TableName: CART_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
    })
  );

  const items = (res.Items ?? []).map(toCartItem);
  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);

  logger.info('Cart retrieved', { userSub: sub, itemCount: items.length });
  return ok({ items, total: Math.round(total * 100) / 100, itemCount: items.length });
}

async function addToCart(sub: string, event: any) {
  const body = parseBody(event.body);
  const err = validate(body, ADD_RULES);
  if (err) return bad(err);

  const productId = body.productId as string;
  const qty = Number(body.qty);

  // Validate product exists and has stock
  const prod = await ddb.send(
    new GetCommand({
      TableName: PRODUCT_TABLE,
      Key: { pk: `PRODUCT#${productId}`, sk: 'META' },
    })
  );

  if (!prod.Item) return bad('product not found', 404);
  if (prod.Item.stock < qty) return bad(`insufficient stock (available: ${prod.Item.stock})`);

  const now = new Date().toISOString();
  const item = {
    pk: `CART#${sub}`,
    sk: `ITEM#${productId}`,
    productId,
    title: prod.Item.title,
    qty,
    price: Number(prod.Item.price),
    addedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: CART_TABLE, Item: item }));
  logger.info('Item added to cart', { userSub: sub, productId, qty });
  return ok(toCartItem(item));
}

async function removeFromCart(sub: string, event: any) {
  const productId = event.queryStringParameters?.productId;
  if (!productId) return bad('productId query parameter required');

  await ddb.send(
    new DeleteCommand({
      TableName: CART_TABLE,
      Key: { pk: `CART#${sub}`, sk: `ITEM#${productId}` },
    })
  );

  logger.info('Item removed from cart', { userSub: sub, productId });
  return ok({ removed: productId });
}

async function updateQty(sub: string, event: any) {
  const body = parseBody(event.body);
  const err = validate(body, ADD_RULES);
  if (err) return bad(err);

  const productId = body.productId as string;
  const qty = Number(body.qty);

  await ddb.send(
    new UpdateCommand({
      TableName: CART_TABLE,
      Key: { pk: `CART#${sub}`, sk: `ITEM#${productId}` },
      UpdateExpression: 'SET qty = :q',
      ExpressionAttributeValues: { ':q': qty },
      ConditionExpression: 'attribute_exists(pk)',
    })
  );

  logger.info('Cart item quantity updated', { userSub: sub, productId, qty });
  return ok({ productId, qty });
}

function toCartItem(item: any): CartItem {
  return {
    productId: item.productId,
    title: item.title,
    qty: item.qty,
    price: item.price,
    addedAt: item.addedAt,
  };
}
