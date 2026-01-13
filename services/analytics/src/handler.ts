import { KinesisClient, PutRecordCommand } from '@aws-sdk/client-kinesis';
import { createLogger } from '../../../shared/src/logger';
import { ok, bad } from '../../../shared/src/response';
import { parseBody } from '../../../shared/src/validator';
import type { AnalyticsEvent } from '../../../shared/src/types';

const logger = createLogger('analytics-service');
const streamName = process.env.ANALYTICS_STREAM!;
const kin = new KinesisClient({});

const VALID_EVENT_TYPES = new Set(['click', 'view', 'search', 'add_to_cart', 'checkout', 'purchase']);

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return bad('method not allowed', 405);

  const requestId = event.requestContext?.requestId ?? 'unknown';

  try {
    const body = parseBody(event.body);

    if (!body.type || !VALID_EVENT_TYPES.has(body.type as string)) {
      return bad(`invalid event type, must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`);
    }

    const analyticsEvent: AnalyticsEvent = {
      type: body.type as AnalyticsEvent['type'],
      userSub: body.userSub as string | undefined,
      payload: (body.payload as Record<string, unknown>) ?? {},
      ts: Date.now(),
      sessionId: body.sessionId as string | undefined,
    };

    const partition = analyticsEvent.userSub ?? analyticsEvent.sessionId ?? 'anonymous';

    await kin.send(
      new PutRecordCommand({
        StreamName: streamName,
        PartitionKey: partition,
        Data: new TextEncoder().encode(JSON.stringify(analyticsEvent)),
      })
    );

    logger.info('Analytics event ingested', {
      eventType: analyticsEvent.type,
      partition,
      requestId,
    });

    return ok({ accepted: true, eventType: analyticsEvent.type });
  } catch (err: any) {
    logger.error('Failed to ingest analytics event', {
      error: err.message,
      requestId,
    });
    return bad('internal server error', 500);
  }
};
