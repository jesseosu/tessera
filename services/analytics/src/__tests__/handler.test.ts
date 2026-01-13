import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-kinesis', () => ({
  KinesisClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutRecordCommand: jest.fn().mockImplementation((p) => p),
}));

process.env.ANALYTICS_STREAM = 'test-analytics-stream';

const { handler } = await import('../handler');

describe('Analytics Service', () => {
  beforeEach(() => mockSend.mockReset());

  it('should reject non-POST methods', async () => {
    const result = await handler({
      httpMethod: 'GET',
      requestContext: { requestId: 'test' },
    });
    expect(result.statusCode).toBe(405);
  });

  it('should reject invalid event types', async () => {
    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ type: 'invalid_type' }),
      requestContext: { requestId: 'test' },
    });
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('invalid event type');
  });

  it('should accept valid analytics event', async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        type: 'view',
        userSub: 'user-abc',
        payload: { page: 'home' },
      }),
      requestContext: { requestId: 'test' },
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).accepted).toBe(true);
  });

  it('should accept event with sessionId fallback', async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        type: 'click',
        sessionId: 'sess-123',
        payload: { target: 'buy-button' },
      }),
      requestContext: { requestId: 'test' },
    });
    expect(result.statusCode).toBe(200);
  });

  it.each(['click', 'view', 'search', 'add_to_cart', 'checkout', 'purchase'] as const)(
    'should accept %s event type',
    async (eventType) => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler({
        httpMethod: 'POST',
        body: JSON.stringify({ type: eventType, payload: {} }),
        requestContext: { requestId: 'test' },
      });
      expect(result.statusCode).toBe(200);
    }
  );
});
