import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { createLogger } from '../../../shared/src/logger';
import { ok, created, bad } from '../../../shared/src/response';
import { validate, parseBody, sanitize } from '../../../shared/src/validator';
import type { Product, PaginatedResult } from '../../../shared/src/types';

const logger = createLogger('product-service');
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.PRODUCT_TABLE!;

const PRODUCT_RULES = [
  { field: 'title', type: 'string' as const, required: true, maxLength: 200 },
  { field: 'price', type: 'number' as const, required: true, min: 0.01, max: 99999.99 },
  { field: 'stock', type: 'number' as const, required: true, min: 0, max: 999999 },
  { field: 'category', type: 'string' as const, maxLength: 100 },
  { field: 'description', type: 'string' as const, maxLength: 2000 },
];

export const handler = async (event: any) => {
  const method = event.httpMethod;
  const path = event.resource;
  const requestId = event.requestContext?.requestId ?? 'unknown';

  logger.info('Request received', { method, path, requestId });

  try {
    // GET /product?id=<id> — fetch a single product
    if (method === 'GET' && path.endsWith('/product')) {
      return await getProduct(event);
    }

    // GET /products — list all products with optional pagination
    if (method === 'GET' && path.endsWith('/products')) {
      return await listProducts(event);
    }

    // POST /product — create a single product
    if (method === 'POST' && path.endsWith('/product')) {
      return await createProduct(event);
    }

    // POST /products — batch create products
    if (method === 'POST' && path.endsWith('/products')) {
      return await batchCreateProducts(event);
    }

    // PATCH /product — update a product
    if (method === 'PATCH' && path.endsWith('/product')) {
      return await updateProduct(event);
    }

    return bad('route not found', 404);
  } catch (err: any) {
    logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId });
    return bad('internal server error', 500);
  }
};

async function getProduct(event: any) {
  const id = event.queryStringParameters?.id;
  if (!id) return bad('missing id query parameter');

  const res = await client.send(
    new GetCommand({ TableName: TABLE, Key: { pk: `PRODUCT#${id}`, sk: 'META' } })
  );

  if (!res.Item) {
    logger.info('Product not found', { productId: id });
    return bad('product not found', 404);
  }

  logger.info('Product retrieved', { productId: id });
  return ok(toProduct(res.Item));
}

async function listProducts(event: any) {
  const limit = Math.min(Number(event.queryStringParameters?.limit) || 50, 100);
  const nextToken = event.queryStringParameters?.nextToken;
  const category = event.queryStringParameters?.category;

  let params: any = {
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'PRODUCT_INDEX' },
    Limit: limit,
  };

  if (category) {
    params.FilterExpression = 'category = :cat';
    params.ExpressionAttributeValues[':cat'] = category;
  }

  if (nextToken) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString());
  }

  const res = await client.send(new QueryCommand(params));
  const items = (res.Items ?? []).map(toProduct);

  const result: PaginatedResult<Product> = {
    items,
    count: items.length,
    nextToken: res.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64url')
      : undefined,
  };

  logger.info('Products listed', { count: result.count });
  return ok(result);
}

async function createProduct(event: any) {
  const body = parseBody(event.body);
  const err = validate(body, PRODUCT_RULES);
  if (err) return bad(err);

  const id = randomUUID();
  const now = new Date().toISOString();
  const item = {
    pk: `PRODUCT#${id}`,
    sk: 'META',
    id,
    title: sanitize(body.title as string),
    description: body.description ? sanitize(body.description as string) : undefined,
    price: Number(body.price),
    stock: Number(body.stock),
    image: body.image as string | undefined,
    category: body.category ? sanitize(body.category as string) : 'general',
    createdAt: now,
    updatedAt: now,
  };

  // Write item + index entry in parallel
  await Promise.all([
    client.send(new PutCommand({ TableName: TABLE, Item: item })),
    client.send(new PutCommand({
      TableName: TABLE,
      Item: {
        pk: 'PRODUCT_INDEX',
        sk: `PRODUCT#${id}`,
        ...toProduct(item),
      },
    })),
  ]);

  logger.info('Product created', { productId: id });
  return created(toProduct(item));
}

async function batchCreateProducts(event: any) {
  const body = parseBody(event.body);
  const products = Array.isArray(body) ? body : (body as any).products;
  if (!Array.isArray(products) || products.length === 0) return bad('array of products required');
  if (products.length > 25) return bad('max 25 products per batch');

  const now = new Date().toISOString();
  const created: Product[] = [];

  // DynamoDB BatchWrite supports up to 25 items
  const writeRequests: any[] = [];

  for (const p of products) {
    const err = validate(p, PRODUCT_RULES);
    if (err) return bad(`item validation failed: ${err}`);

    const id = p.id ?? randomUUID();
    const item = {
      pk: `PRODUCT#${id}`,
      sk: 'META',
      id,
      title: sanitize(p.title),
      description: p.description ? sanitize(p.description) : undefined,
      price: Number(p.price),
      stock: Number(p.stock),
      image: p.image,
      category: p.category ? sanitize(p.category) : 'general',
      createdAt: now,
      updatedAt: now,
    };

    writeRequests.push(
      { PutRequest: { Item: item } },
      { PutRequest: { Item: { pk: 'PRODUCT_INDEX', sk: `PRODUCT#${id}`, ...toProduct(item) } } },
    );

    created.push(toProduct(item));
  }

  // BatchWrite in chunks of 25
  for (let i = 0; i < writeRequests.length; i += 25) {
    const chunk = writeRequests.slice(i, i + 25);
    await client.send(new BatchWriteCommand({ RequestItems: { [TABLE]: chunk } }));
  }

  logger.info('Batch products created', { count: created.length });
  return ok({ inserted: created.length, products: created });
}

async function updateProduct(event: any) {
  const body = parseBody(event.body);
  if (!body.id) return bad('missing id');

  const now = new Date().toISOString();
  const updates: string[] = ['updatedAt = :now'];
  const values: Record<string, any> = { ':now': now };
  const names: Record<string, string> = {};

  if (body.title) { updates.push('#t = :t'); values[':t'] = sanitize(body.title as string); names['#t'] = 'title'; }
  if (body.price !== undefined) { updates.push('price = :p'); values[':p'] = Number(body.price); }
  if (body.stock !== undefined) { updates.push('stock = :s'); values[':s'] = Number(body.stock); }
  if (body.description !== undefined) { updates.push('description = :d'); values[':d'] = sanitize(body.description as string); }
  if (body.category) { updates.push('category = :c'); values[':c'] = sanitize(body.category as string); }

  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: `PRODUCT#${body.id}`, sk: 'META' },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: values,
    ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
    ConditionExpression: 'attribute_exists(pk)',
    ReturnValues: 'ALL_NEW',
  }));

  // Update the index row too
  const full = await client.send(
    new GetCommand({ TableName: TABLE, Key: { pk: `PRODUCT#${body.id}`, sk: 'META' } })
  );
  if (full.Item) {
    await client.send(new PutCommand({
      TableName: TABLE,
      Item: { pk: 'PRODUCT_INDEX', sk: `PRODUCT#${body.id}`, ...toProduct(full.Item) },
    }));
  }

  logger.info('Product updated', { productId: body.id });
  return ok({ updated: body.id });
}

function toProduct(item: any): Product {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    price: item.price,
    image: item.image,
    stock: item.stock,
    category: item.category,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
