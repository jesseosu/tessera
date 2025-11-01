const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'X-Content-Type-Options': 'nosniff',
};

export const ok = (body: unknown) => ({
  statusCode: 200,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

export const created = (body: unknown) => ({
  statusCode: 201,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

export const bad = (message: string, statusCode = 400) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify({ error: message }),
});
