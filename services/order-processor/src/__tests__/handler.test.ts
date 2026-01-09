import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockDdbSend = jest.fn();
const mockEbSend = jest.fn();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDdbSend }) },
  UpdateCommand: jest.fn().mockImplementation((p) => p),
  GetCommand: jest.fn().mockImplementation((p) => p),
}));
jest.unstable_mockModule('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: jest.fn().mockImplementation(() => ({ send: mockEbSend })),
  PutEventsCommand: jest.fn().mockImplementation((p) => p),
}));

process.env.ORDER_TABLE = 'test-order-table';
process.env.PRODUCT_TABLE = 'test-product-table';
process.env.EVENT_BUS_NAME = 'test-event-bus';

const { handler } = await import('../handler');

describe('Order Processor', () => {
  beforeEach(() => {
    mockDdbSend.mockReset();
    mockEbSend.mockReset();
  });

  it('should confirm order when stock is available', async () => {
    // Stock decrements (2 items)
    mockDdbSend.mockResolvedValueOnce({}); // item 1 stock decrement
    mockDdbSend.mockResolvedValueOnce({}); // item 2 stock decrement
    // Update order status
    mockDdbSend.mockResolvedValueOnce({});
    // EventBridge publish
    mockEbSend.mockResolvedValueOnce({});

    const sqsEvent = {
      Records: [
        {
          body: JSON.stringify({
            eventType: 'ORDER_CREATED',
            orderId: 'ord-123',
            userSub: 'user-abc',
            timestamp: '2025-01-15T00:00:00.000Z',
            payload: {
              total: 75,
              email: 'test@example.com',
              items: [
                { productId: 'p1', qty: 2, price: 25 },
                { productId: 'p2', qty: 1, price: 25 },
              ],
            },
          }),
        },
      ],
    };

    await handler(sqsEvent);

    // Verify stock was decremented
    expect(mockDdbSend).toHaveBeenCalledTimes(3); // 2 stock updates + 1 order status
    // Verify EventBridge event was published
    expect(mockEbSend).toHaveBeenCalledTimes(1);
  });

  it('should cancel order when stock is insufficient', async () => {
    // First stock decrement succeeds, second fails
    mockDdbSend.mockResolvedValueOnce({});
    mockDdbSend.mockRejectedValueOnce(new Error('ConditionalCheckFailedException'));
    // Update order status to CANCELLED
    mockDdbSend.mockResolvedValueOnce({});
    // EventBridge - ORDER_CANCELLED
    mockEbSend.mockResolvedValueOnce({});

    const sqsEvent = {
      Records: [
        {
          body: JSON.stringify({
            eventType: 'ORDER_CREATED',
            orderId: 'ord-456',
            userSub: 'user-abc',
            timestamp: '2025-01-15T00:00:00.000Z',
            payload: {
              total: 100,
              email: 'test@example.com',
              items: [
                { productId: 'p1', qty: 1, price: 50 },
                { productId: 'p2', qty: 1, price: 50 },
              ],
            },
          }),
        },
      ],
    };

    await handler(sqsEvent);

    // Order should be cancelled
    expect(mockDdbSend).toHaveBeenCalledTimes(3);
    expect(mockEbSend).toHaveBeenCalledTimes(1);
  });
});
