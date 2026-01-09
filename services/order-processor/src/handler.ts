import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { createLogger } from '../../../shared/src/logger';
import type { OrderEvent } from '../../../shared/src/types';

const logger = createLogger('order-processor');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const eb = new EventBridgeClient({});

const ORDER_TABLE = process.env.ORDER_TABLE!;
const PRODUCT_TABLE = process.env.PRODUCT_TABLE!;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'default';

export const handler = async (event: any) => {
  for (const record of event.Records) {
    const orderEvent: OrderEvent = JSON.parse(record.body);
    logger.info('Processing order event', {
      eventType: orderEvent.eventType,
      orderId: orderEvent.orderId,
    });

    try {
      switch (orderEvent.eventType) {
        case 'ORDER_CREATED':
          await handleOrderCreated(orderEvent);
          break;
        default:
          logger.warn('Unknown event type', { eventType: orderEvent.eventType });
      }
    } catch (err: any) {
      logger.error('Failed to process order event', {
        orderId: orderEvent.orderId,
        error: err.message,
        stack: err.stack,
      });
      throw err; // Let SQS retry via redrive policy -> DLQ
    }
  }
};

async function handleOrderCreated(orderEvent: OrderEvent) {
  const { orderId, userSub, payload } = orderEvent;
  const items = payload.items as Array<{ productId: string; qty: number; price: number }>;

  // 1. Decrement stock for each item using optimistic locking
  const stockResults = await Promise.allSettled(
    items.map((item) =>
      ddb.send(
        new UpdateCommand({
          TableName: PRODUCT_TABLE,
          Key: { pk: `PRODUCT#${item.productId}`, sk: 'META' },
          UpdateExpression: 'SET stock = stock - :qty, updatedAt = :now',
          ConditionExpression: 'stock >= :qty',
          ExpressionAttributeValues: {
            ':qty': item.qty,
            ':now': new Date().toISOString(),
          },
        })
      )
    )
  );

  // Check if any stock decrements failed
  const failures = stockResults.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    logger.error('Stock reservation failed for some items', {
      orderId,
      failedCount: failures.length,
    });

    // Update order status to CANCELLED
    await updateOrderStatus(orderId, userSub, 'CANCELLED');
    await publishEvent('ORDER_CANCELLED', orderId, userSub, {
      reason: 'insufficient_stock',
    });
    return;
  }

  // 2. Update order status to CONFIRMED
  await updateOrderStatus(orderId, userSub, 'CONFIRMED');

  // 3. Publish confirmation event to EventBridge
  await publishEvent('ORDER_CONFIRMED', orderId, userSub, {
    total: payload.total,
    email: payload.email,
    itemCount: items.length,
  });

  logger.info('Order confirmed', { orderId, itemCount: items.length });
}

async function updateOrderStatus(orderId: string, userSub: string, status: string) {
  const now = new Date().toISOString();

  // Update main order record
  await ddb.send(
    new UpdateCommand({
      TableName: ORDER_TABLE,
      Key: { pk: `ORDER#${orderId}`, sk: `USER#${userSub}` },
      UpdateExpression: 'SET #s = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status, ':now': now },
    })
  );

  logger.info('Order status updated', { orderId, status });
}

async function publishEvent(
  eventType: string,
  orderId: string,
  userSub: string,
  detail: Record<string, unknown>
) {
  await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: 'ecommerce.orders',
          DetailType: eventType,
          Detail: JSON.stringify({
            orderId,
            userSub,
            timestamp: new Date().toISOString(),
            ...detail,
          }),
          EventBusName: EVENT_BUS_NAME,
        },
      ],
    })
  );

  logger.info('Event published to EventBridge', { eventType, orderId });
}
