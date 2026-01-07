import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockDdbSend = jest.fn();
const mockSqsSend = jest.fn();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDdbSend }) },
  QueryCommand: jest.fn().mockImplementation((p) => ({ ...p, _type: 'Query' })),
  PutCommand: jest.fn().mockImplementation((p) => ({ ...p, _type: 'Put' })),
  DeleteCommand: jest.fn().mockImplementation((p) => ({ ...p, _type: 'Delete' })),
  UpdateCommand: jest.fn().mockImplementation((p) => p),
  TransactWriteCommand: jest.fn().mockImplementation((p) => ({ ...p, _type: 'TransactWrite' })),
}));
jest.unstable_mockModule('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: mockSqsSend })),
  SendMessageCommand: jest.fn().mockImplementation((p) => p),
}));

process.env.CART_TABLE = 'test-cart-table';
process.env.ORDER_TABLE = 'test-order-table';
process.env.PRODUCT_TABLE = 'test-product-table';
process.env.ORDER_QUEUE_URL = 'https://sqs.test.amazonaws.com/123456789/order-queue.fifo';

const { handler } = await import('../handler');

const authedEvent = (overrides: any) => ({
  requestContext: {
    requestId: 'test-req-123',
    authorizer: { claims: { sub: 'user-abc', email: 'test@example.com' } },
  },
  ...overrides,
});

describe('Checkout Service', () => {
  beforeEach(() => {
    mockDdbSend.mockReset();
    mockSqsSend.mockReset();
  });

  it('should return 401 when not authenticated', async () => {
    const result = await handler({
      httpMethod: 'POST',
      resource: '/checkout',
      requestContext: {},
    });
    expect(result.statusCode).toBe(401);
  });

  describe('POST /checkout', () => {
    it('should reject empty cart', async () => {
      mockDdbSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        authedEvent({ httpMethod: 'POST', resource: '/checkout' })
      );
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('cart is empty');
    });

    it('should reject orders exceeding $10,000', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          { sk: 'ITEM#p1', productId: 'p1', qty: 1, price: 11000 },
        ],
      });

      const result = await handler(
        authedEvent({ httpMethod: 'POST', resource: '/checkout' })
      );
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('$10,000');
    });

    it('should create order and publish to SQS', async () => {
      // Load cart
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          { sk: 'ITEM#p1', productId: 'p1', title: 'Widget', qty: 2, price: 25 },
          { sk: 'ITEM#p2', productId: 'p2', title: 'Gadget', qty: 1, price: 50 },
        ],
      });

      // TransactWrite (order + index)
      mockDdbSend.mockResolvedValueOnce({});

      // SQS publish
      mockSqsSend.mockResolvedValueOnce({});

      // Delete cart items (2 items)
      mockDdbSend.mockResolvedValueOnce({});
      mockDdbSend.mockResolvedValueOnce({});

      const result = await handler(
        authedEvent({ httpMethod: 'POST', resource: '/checkout' })
      );
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.orderId).toBeDefined();
      expect(body.total).toBe(100);
      expect(body.status).toBe('PENDING');

      // Verify SQS was called
      expect(mockSqsSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /orders', () => {
    it('should return user order history', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          { id: 'ord-1', total: 99.99, status: 'CONFIRMED', itemCount: 3, createdAt: '2025-01-15' },
          { id: 'ord-2', total: 49.99, status: 'PENDING', itemCount: 1, createdAt: '2025-01-10' },
        ],
      });

      const result = await handler(
        authedEvent({ httpMethod: 'GET', resource: '/orders' })
      );
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.orders).toHaveLength(2);
      expect(body.orders[0].status).toBe('CONFIRMED');
    });
  });

  describe('GET /order', () => {
    it('should require order id', async () => {
      const result = await handler(
        authedEvent({
          httpMethod: 'GET',
          resource: '/order',
          queryStringParameters: null,
        })
      );
      expect(result.statusCode).toBe(400);
    });

    it('should return specific order', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [{
          id: 'ord-123',
          total: 75,
          status: 'CONFIRMED',
          items: [{ productId: 'p1', qty: 3, price: 25 }],
          createdAt: '2025-01-15',
          updatedAt: '2025-01-15',
        }],
      });

      const result = await handler(
        authedEvent({
          httpMethod: 'GET',
          resource: '/order',
          queryStringParameters: { id: 'ord-123' },
        })
      );
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.id).toBe('ord-123');
      expect(body.items).toHaveLength(1);
    });

    it('should return 404 for nonexistent order', async () => {
      mockDdbSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        authedEvent({
          httpMethod: 'GET',
          resource: '/order',
          queryStringParameters: { id: 'nonexistent' },
        })
      );
      expect(result.statusCode).toBe(404);
    });
  });
});
