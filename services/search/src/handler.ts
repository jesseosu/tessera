import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { createLogger } from '../../../shared/src/logger';
import { ok, bad } from '../../../shared/src/response';
import { parseBody } from '../../../shared/src/validator';
import type { SearchResult, Product } from '../../../shared/src/types';

const logger = createLogger('search-service');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({});
const PRODUCT_TABLE = process.env.PRODUCT_TABLE!;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'amazon.titan-text-lite-v1';

export const handler = async (event: any) => {
  const method = event.httpMethod;
  const requestId = event.requestContext?.requestId ?? 'unknown';

  try {
    // GET /search?q=<query>&category=<cat>&minPrice=<n>&maxPrice=<n>
    if (method === 'GET') {
      return await searchProducts(event);
    }

    // POST /search/recommend — AI-powered product recommendations
    if (method === 'POST') {
      return await getRecommendations(event);
    }

    return bad('method not allowed', 405);
  } catch (err: any) {
    logger.error('Search error', { error: err.message, stack: err.stack, requestId });
    return bad('internal server error', 500);
  }
};

async function searchProducts(event: any) {
  const q = (event.queryStringParameters?.q ?? '').toLowerCase().trim();
  const category = event.queryStringParameters?.category;
  const minPrice = event.queryStringParameters?.minPrice
    ? Number(event.queryStringParameters.minPrice)
    : undefined;
  const maxPrice = event.queryStringParameters?.maxPrice
    ? Number(event.queryStringParameters.maxPrice)
    : undefined;
  const limit = Math.min(Number(event.queryStringParameters?.limit) || 20, 50);

  if (!q && !category) return bad('query (q) or category parameter required');

  // Query the product index
  const res = await ddb.send(
    new QueryCommand({
      TableName: PRODUCT_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'PRODUCT_INDEX' },
    })
  );

  let products = (res.Items ?? []) as any[];

  // Filter by search query (title + description + category)
  if (q) {
    products = products.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }

  // Filter by category
  if (category) {
    products = products.filter((p) => p.category?.toLowerCase() === category.toLowerCase());
  }

  // Filter by price range
  if (minPrice !== undefined) {
    products = products.filter((p) => p.price >= minPrice);
  }
  if (maxPrice !== undefined) {
    products = products.filter((p) => p.price <= maxPrice);
  }

  // Relevance scoring: exact title match > partial title > description match
  if (q) {
    products.sort((a, b) => {
      const aScore = scoreRelevance(a, q);
      const bScore = scoreRelevance(b, q);
      return bScore - aScore;
    });
  }

  const result: SearchResult = {
    products: products.slice(0, limit).map(toProduct),
    total: products.length,
    suggestions: generateSuggestions(q, products),
  };

  logger.info('Search completed', {
    query: q,
    category,
    resultCount: result.total,
  });

  return ok(result);
}

async function getRecommendations(event: any) {
  const body = parseBody(event.body);
  const productId = body.productId as string;
  const userHistory = body.history as string[] | undefined;

  if (!productId && (!userHistory || userHistory.length === 0)) {
    return bad('productId or history required');
  }

  // Load all products for context
  const allProducts = await ddb.send(
    new QueryCommand({
      TableName: PRODUCT_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'PRODUCT_INDEX' },
    })
  );

  const products = allProducts.Items ?? [];
  if (products.length === 0) return ok({ recommendations: [] });

  // Build a product catalog summary for the AI
  const catalogSummary = products
    .slice(0, 50) // Limit context size
    .map((p) => `- ${p.id}: ${p.title} ($${p.price}, category: ${p.category ?? 'general'})`)
    .join('\n');

  let currentProduct = '';
  if (productId) {
    const prod = products.find((p) => p.id === productId);
    if (prod) currentProduct = `Currently viewing: ${prod.title} ($${prod.price}, ${prod.category})`;
  }

  const prompt = `You are a product recommendation engine for an e-commerce store.

Product catalog:
${catalogSummary}

${currentProduct}
${userHistory ? `Recent browsing history: ${userHistory.join(', ')}` : ''}

Based on the context above, recommend up to 5 product IDs that the user would likely be interested in. Return ONLY a JSON array of product IDs, nothing else. Example: ["id1","id2","id3"]`;

  try {
    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(
          JSON.stringify({
            inputText: prompt,
            textGenerationConfig: {
              maxTokenCount: 200,
              temperature: 0.3,
              topP: 0.9,
            },
          })
        ),
      })
    );

    const result = JSON.parse(new TextDecoder().decode(response.body));
    const outputText = result.results?.[0]?.outputText ?? '[]';

    // Extract JSON array from response
    const match = outputText.match(/\[.*?\]/s);
    const recommendedIds: string[] = match ? JSON.parse(match[0]) : [];

    const recommendations = recommendedIds
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean)
      .map(toProduct);

    logger.info('AI recommendations generated', {
      productId,
      recommendationCount: recommendations.length,
    });

    return ok({ recommendations });
  } catch (err: any) {
    // Fallback: return products from the same category
    logger.warn('Bedrock call failed, using fallback recommendations', {
      error: err.message,
    });

    const currentProd = products.find((p) => p.id === productId);
    const fallback = products
      .filter(
        (p) => p.id !== productId && p.category === (currentProd?.category ?? 'general')
      )
      .slice(0, 5)
      .map(toProduct);

    return ok({ recommendations: fallback, source: 'fallback' });
  }
}

function scoreRelevance(product: any, query: string): number {
  let score = 0;
  const title = (product.title ?? '').toLowerCase();
  const desc = (product.description ?? '').toLowerCase();

  if (title === query) score += 100;
  else if (title.startsWith(query)) score += 80;
  else if (title.includes(query)) score += 60;

  if (desc.includes(query)) score += 20;
  if (product.stock > 0) score += 10; // Prefer in-stock items

  return score;
}

function generateSuggestions(query: string, matchedProducts: any[]): string[] {
  if (!query || matchedProducts.length === 0) return [];

  const categories = [...new Set(matchedProducts.map((p) => p.category).filter(Boolean))];
  return categories.slice(0, 3).map((cat) => `${query} in ${cat}`);
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
