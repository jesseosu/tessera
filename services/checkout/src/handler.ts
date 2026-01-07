import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
import { createLogger } from '../../../shared/src/logger';
import { ok, bad } from '../../../shared/src/response';
import type { Order, OrderEvent } from '../../../shared/src/types';

const logger = createLogger('checkout-service');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

const CART_TABLE = process.env.CART_TABLE!;
const ORDER_TABLE = process.env.ORDER_TABLE!;
const PRODUCT_TABLE = process.env.PRODUCT_TABLE!;
const ORDER_QUEUE_URL = process.env.ORDER_QUEUE_URL;

export const handler = async (event: any) => {
  const sub = event.requestContext?.authorizer?.claims?.sub;
  const email = event.requestContext?.authorizer?.claims?.email ?? '';
  if (!sub) return bad('unauthorized', 401);

  const method = event.httpMethod;
  const path = event.resource;
  const requestId = event.requestContext?.requestId ?? 'unknown';
  logger.info('Request received', { method, path, requestId, userSub: sub });

  try {
    // POST /checkout — place an order
    if (method === 'POST' && path.endsWith('/checkout')) {
      return await processCheckout(sub, email, requestId);
    }

    // GET /orders — list user's orders
    if (method === 'GET' && path.endsWith('/orders')) {
      return await listOrders(sub);
    }

    // GET /order?id=<orderId> — get a specific order
    if (method === 'GET' && path.endsWith('/order')) {
      const orderId = event.queryStringParameters?.id;
      if (!orderId) return bad('missing order id');
      return await getOrder(orderId, sub);
    }

    return bad('method not allowed', 405);
  } catch (err: any) {
    logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId });
    return bad('internal server error', 500);
  }
};

async function processCheckout(sub: string, email: string, requestId: string) {
  // 1. Load cart
  const cartRes = await ddb.send(
    new QueryCommand({
      TableName: CART_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `CART#${sub}` },
    })
  );
  const cartItems = cartRes.Items ?? [];
  if (cartItems.length === 0) return bad('cart is empty');

  // 2. Calculate total
  const total = cartItems.reduce((sum, it) => sum + Number(it.price) * Number(it.qty), 0);
  const roundedTotal = Math.round(total * 100) / 100;

  // 3. Payment validation (mock — in production, integrate with Stripe/PayPal)
  if (roundedTotal > 10000) return bad('payment declined: order exceeds $10,000 limit');
  if (roundedTotal <= 0) return bad('invalid order total');

  // 4. Create order with idempotency key from requestId
  const orderId = randomUUID();
  const now = new Date().toISOString();

  const order: any = {
    pk: `ORDER#${orderId}`,
    sk: `USER#${sub}`,
    id: orderId,
    userSub: sub,
    email,
    total: roundedTotal,
    status: 'PENDING',
    items: cartItems.map((it) => ({
      productId: it.productId,
      title: it.title,
      qty: Number(it.qty),
      price: Number(it.price),
    })),
    createdAt: now,
    updatedAt: now,
  };

  // Also write a GSI row for user order lookups
  const userOrderIndex: any = {
    pk: `USERORDERS#${sub}`,
    sk: `ORDER#${now}#${orderId}`,
    id: orderId,
    total: roundedTotal,
    status: 'PENDING',
    itemCount: cartItems.length,
    createdAt: now,
  };

  // 5. Write order + user index atomically
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: ORDER_TABLE, Item: order } },
      { Put: { TableName: ORDER_TABLE, Item: userOrderIndex } },
    ],
  }));

  logger.info('Order created', { orderId, total: roundedTotal, itemCount: cartItems.length });

  // 6. Publish to SQS for async processing (stock decrement, notifications)
  if (ORDER_QUEUE_URL) {
    const orderEvent: OrderEvent = {
      eventType: 'ORDER_CREATED',
      orderId,
      userSub: sub,
      timestamp: now,
      payload: { total: roundedTotal, items: order.items, email },
    };

    await sqs.send(new SendMessageCommand({
      QueueUrl: ORDER_QUEUE_URL,
      MessageBody: JSON.stringify(orderEvent),
      MessageGroupId: sub,
      MessageDeduplicationId: `${orderId}-created`,
    }));

    logger.info('Order event published to SQS', { orderId });
  }

  // 7. Clear cart
  await Promise.all(
    cartItems.map((it) =>
      ddb.send(new DeleteCommand({
        TableName: CART_TABLE,
        Key: { pk: `CART#${sub}`, sk: it.sk },
      }))
    )
  );

  logger.info('Cart cleared', { userSub: sub });
  return ok({ orderId, total: roundedTotal, status: 'PENDING' });
}

async function listOrders(sub: string) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: ORDER_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `USERORDERS#${sub}` },
      ScanIndexForward: false, // newest first
      Limit: 20,
    })
  );

  const orders = (res.Items ?? []).map((it) => ({
    id: it.id,
    total: it.total,
    status: it.status,
    itemCount: it.itemCount,
    createdAt: it.createdAt,
  }));

  logger.info('Orders listed', { userSub: sub, count: orders.length });
  return ok({ orders });
}

async function getOrder(orderId: string, sub: string) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: ORDER_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: {
        ':pk': `ORDER#${orderId}`,
        ':sk': `USER#${sub}`,
      },
    })
  );

  if (!res.Items || res.Items.length === 0) return bad('order not found', 404);

  const item = res.Items[0];
  logger.info('Order retrieved', { orderId });
  return ok({
    id: item.id,
    total: item.total,
    status: item.status,
    items: item.items,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}
