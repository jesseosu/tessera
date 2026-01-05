import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockSend }) },
  GetCommand: jest.fn().mockImplementation((p) => p),
  PutCommand: jest.fn().mockImplementation((p) => p),
  QueryCommand: jest.fn().mockImplementation((p) => p),
  DeleteCommand: jest.fn().mockImplementation((p) => p),
  UpdateCommand: jest.fn().mockImplementation((p) => p),
}));

process.env.CART_TABLE = 'test-cart-table';
process.env.PRODUCT_TABLE = 'test-product-table';

const { handler } = await import('../handler');

const authedEvent = (overrides: any) => ({
  requestContext: {
    requestId: 'test-123',
    authorizer: { claims: { sub: 'user-abc', email: 'test@example.com' } },
  },
  ...overrides,
});

describe('Cart Service', () => {
  beforeEach(() => mockSend.mockReset());

  it('should return 401 when not authenticated', async () => {
    const result = await handler({ httpMethod: 'GET', requestContext: {} });
    expect(result.statusCode).toBe(401);
  });

  describe('GET /cart', () => {
    it('should return empty cart', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(authedEvent({ httpMethod: 'GET' }));
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(0);
      expect(body.itemCount).toBe(0);
    });

    it('should return cart with items and total', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          { productId: 'p1', title: 'Item 1', qty: 2, price: 10, addedAt: '2025-01-01' },
          { productId: 'p2', title: 'Item 2', qty: 1, price: 25.5, addedAt: '2025-01-01' },
        ],
      });

      const result = await handler(authedEvent({ httpMethod: 'GET' }));
      const body = JSON.parse(result.body);

      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(45.5);
      expect(body.itemCount).toBe(2);
    });
  });

  describe('POST /cart', () => {
    it('should validate required fields', async () => {
      const result = await handler(
        authedEvent({ httpMethod: 'POST', body: JSON.stringify({ qty: 1 }) })
      );
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('productId');
    });

    it('should reject qty < 1', async () => {
      const result = await handler(
        authedEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ productId: 'p1', qty: 0 }),
        })
      );
      expect(result.statusCode).toBe(400);
    });

    it('should return 404 for nonexistent product', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await handler(
        authedEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ productId: 'p1', qty: 1 }),
        })
      );
      expect(result.statusCode).toBe(404);
    });

    it('should reject when insufficient stock', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { id: 'p1', title: 'Product', price: 10, stock: 2 },
      });

      const result = await handler(
        authedEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ productId: 'p1', qty: 5 }),
        })
      );
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('insufficient stock');
    });

    it('should add item to cart', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { id: 'p1', title: 'Widget', price: 19.99, stock: 50 },
      });
      mockSend.mockResolvedValueOnce({}); // PutCommand

      const result = await handler(
        authedEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ productId: 'p1', qty: 2 }),
        })
      );
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.productId).toBe('p1');
      expect(body.title).toBe('Widget');
      expect(body.qty).toBe(2);
      expect(body.price).toBe(19.99);
    });
  });

  describe('DELETE /cart', () => {
    it('should require productId', async () => {
      const result = await handler(
        authedEvent({ httpMethod: 'DELETE', queryStringParameters: null })
      );
      expect(result.statusCode).toBe(400);
    });

    it('should remove item from cart', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        authedEvent({
          httpMethod: 'DELETE',
          queryStringParameters: { productId: 'p1' },
        })
      );
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).removed).toBe('p1');
    });
  });
});
