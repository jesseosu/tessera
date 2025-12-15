import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock AWS SDK
const mockSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockSend }) },
  GetCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'Get' })),
  PutCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'Put' })),
  QueryCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'Query' })),
  UpdateCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'Update' })),
  BatchWriteCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'BatchWrite' })),
}));

// Set env before importing handler
process.env.PRODUCT_TABLE = 'test-product-table';

const { handler } = await import('../handler');

describe('Product Service', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('GET /product', () => {
    it('should return 400 when id is missing', async () => {
      const event = {
        httpMethod: 'GET',
        resource: '/product',
        queryStringParameters: null,
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('missing id query parameter');
    });

    it('should return product when found', async () => {
      const mockProduct = {
        pk: 'PRODUCT#123',
        sk: 'META',
        id: '123',
        title: 'Test Product',
        price: 29.99,
        stock: 10,
        category: 'electronics',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      mockSend.mockResolvedValueOnce({ Item: mockProduct });

      const event = {
        httpMethod: 'GET',
        resource: '/product',
        queryStringParameters: { id: '123' },
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.id).toBe('123');
      expect(body.title).toBe('Test Product');
      expect(body.price).toBe(29.99);
    });

    it('should return 404 when product not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const event = {
        httpMethod: 'GET',
        resource: '/product',
        queryStringParameters: { id: 'nonexistent' },
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(404);
    });
  });

  describe('GET /products', () => {
    it('should return paginated product list', async () => {
      const mockItems = [
        { id: '1', title: 'Product 1', price: 10, stock: 5, category: 'general' },
        { id: '2', title: 'Product 2', price: 20, stock: 3, category: 'general' },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockItems });

      const event = {
        httpMethod: 'GET',
        resource: '/products',
        queryStringParameters: null,
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(2);
      expect(body.count).toBe(2);
    });

    it('should filter by category', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const event = {
        httpMethod: 'GET',
        resource: '/products',
        queryStringParameters: { category: 'electronics' },
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('POST /product', () => {
    it('should validate required fields', async () => {
      const event = {
        httpMethod: 'POST',
        resource: '/product',
        body: JSON.stringify({ price: 10 }),
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('title');
    });

    it('should reject negative prices', async () => {
      const event = {
        httpMethod: 'POST',
        resource: '/product',
        body: JSON.stringify({ title: 'Test', price: -5, stock: 10 }),
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('price');
    });

    it('should create product successfully', async () => {
      mockSend.mockResolvedValue({}); // PutCommand succeeds

      const event = {
        httpMethod: 'POST',
        resource: '/product',
        body: JSON.stringify({ title: 'New Product', price: 49.99, stock: 100 }),
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(201);

      const body = JSON.parse(result.body);
      expect(body.title).toBe('New Product');
      expect(body.price).toBe(49.99);
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });

    it('should sanitize HTML in title', async () => {
      mockSend.mockResolvedValue({});

      const event = {
        httpMethod: 'POST',
        resource: '/product',
        body: JSON.stringify({ title: '<script>alert("xss")</script>Product', price: 10, stock: 5 }),
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.title).not.toContain('<script>');
    });
  });

  describe('POST /products (batch)', () => {
    it('should reject more than 25 products', async () => {
      const products = Array.from({ length: 26 }, (_, i) => ({
        title: `Product ${i}`,
        price: 10,
        stock: 5,
      }));

      const event = {
        httpMethod: 'POST',
        resource: '/products',
        body: JSON.stringify(products),
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('25');
    });

    it('should batch create products', async () => {
      mockSend.mockResolvedValue({});

      const products = [
        { title: 'Product A', price: 10, stock: 5 },
        { title: 'Product B', price: 20, stock: 3 },
      ];

      const event = {
        httpMethod: 'POST',
        resource: '/products',
        body: JSON.stringify(products),
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.inserted).toBe(2);
      expect(body.products).toHaveLength(2);
    });
  });

  describe('PATCH /product', () => {
    it('should require id', async () => {
      const event = {
        httpMethod: 'PATCH',
        resource: '/product',
        body: JSON.stringify({ title: 'Updated' }),
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should update product fields', async () => {
      mockSend.mockResolvedValueOnce({}); // UpdateCommand
      mockSend.mockResolvedValueOnce({ Item: { id: '123', title: 'Updated', price: 15, stock: 8 } }); // GetCommand
      mockSend.mockResolvedValueOnce({}); // PutCommand (index update)

      const event = {
        httpMethod: 'PATCH',
        resource: '/product',
        body: JSON.stringify({ id: '123', title: 'Updated', price: 15 }),
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).updated).toBe('123');
    });
  });

  describe('Unknown routes', () => {
    it('should return 404 for unknown routes', async () => {
      const event = {
        httpMethod: 'DELETE',
        resource: '/product',
        requestContext: { requestId: 'test-123' },
      };

      const result = await handler(event);
      expect(result.statusCode).toBe(404);
    });
  });
});
