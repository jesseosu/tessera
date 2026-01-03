import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockSend }) },
  GetCommand: jest.fn().mockImplementation((p) => p),
  PutCommand: jest.fn().mockImplementation((p) => p),
  UpdateCommand: jest.fn().mockImplementation((p) => p),
}));

process.env.USER_TABLE = 'test-user-table';

const { handler } = await import('../handler');

const authedEvent = (overrides: any) => ({
  requestContext: {
    requestId: 'test-123',
    authorizer: { claims: { sub: 'user-abc', email: 'test@example.com' } },
  },
  ...overrides,
});

describe('User Service', () => {
  beforeEach(() => mockSend.mockReset());

  it('should return 401 when not authenticated', async () => {
    const result = await handler({ httpMethod: 'GET', requestContext: {} });
    expect(result.statusCode).toBe(401);
  });

  describe('GET /user', () => {
    it('should auto-create profile on first access', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined }); // GetCommand - not found
      mockSend.mockResolvedValueOnce({}); // PutCommand - auto-create

      const result = await handler(authedEvent({ httpMethod: 'GET' }));
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.sub).toBe('user-abc');
      expect(body.email).toBe('test@example.com');
      expect(body.createdAt).toBeDefined();
    });

    it('should return existing profile', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          pk: 'USER#user-abc',
          sk: 'PROFILE',
          sub: 'user-abc',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });

      const result = await handler(authedEvent({ httpMethod: 'GET' }));
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.name).toBe('Test User');
    });
  });

  describe('POST /user', () => {
    it('should upsert profile', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        authedEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ name: 'New Name' }),
        })
      );
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.name).toBe('New Name');
      expect(body.email).toBe('test@example.com');
    });
  });

  describe('PUT /user (address)', () => {
    it('should validate address fields', async () => {
      const result = await handler(
        authedEvent({
          httpMethod: 'PUT',
          body: JSON.stringify({ line1: '123 Main St' }),
        })
      );
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('city');
    });

    it('should update address', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        authedEvent({
          httpMethod: 'PUT',
          body: JSON.stringify({
            line1: '42 Wallaby Way',
            city: 'Sydney',
            state: 'NSW',
            postalCode: '2000',
            country: 'AU',
          }),
        })
      );
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.address.city).toBe('Sydney');
      expect(body.address.country).toBe('AU');
    });
  });
});
