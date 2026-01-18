const API_URL = import.meta.env.VITE_API_URL as string;

async function request(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {
      message = text;
    }
    throw new Error(message);
  }
  return res.json();
}

function auth(jwt: string) {
  return { Authorization: jwt };
}

export const api = {
  // Products
  listProducts: (params?: { category?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request(`/products${query ? `?${query}` : ''}`);
  },
  getProduct: (id: string) => request(`/product?id=${encodeURIComponent(id)}`),
  createProduct: (jwt: string, p: any) =>
    request('/product', { method: 'POST', body: JSON.stringify(p), headers: auth(jwt) }),

  // Cart
  getCart: (jwt: string) => request('/cart', { headers: auth(jwt) }),
  addToCart: (jwt: string, productId: string, qty: number) =>
    request('/cart', { method: 'POST', body: JSON.stringify({ productId, qty }), headers: auth(jwt) }),
  removeFromCart: (jwt: string, productId: string) =>
    request(`/cart?productId=${encodeURIComponent(productId)}`, { method: 'DELETE', headers: auth(jwt) }),
  updateCartQty: (jwt: string, productId: string, qty: number) =>
    request('/cart', { method: 'PATCH', body: JSON.stringify({ productId, qty }), headers: auth(jwt) }),

  // Checkout & Orders
  checkout: (jwt: string) => request('/checkout', { method: 'POST', headers: auth(jwt) }),
  listOrders: (jwt: string) => request('/orders', { headers: auth(jwt) }),
  getOrder: (jwt: string, id: string) => request(`/order?id=${encodeURIComponent(id)}`, { headers: auth(jwt) }),

  // User
  me: (jwt: string) => request('/user', { headers: auth(jwt) }),
  updateProfile: (jwt: string, data: any) =>
    request('/user', { method: 'POST', body: JSON.stringify(data), headers: auth(jwt) }),
  updateAddress: (jwt: string, address: any) =>
    request('/user', { method: 'PUT', body: JSON.stringify(address), headers: auth(jwt) }),

  // Search
  search: (query: string, params?: { category?: string; minPrice?: number; maxPrice?: number }) => {
    const qs = new URLSearchParams({ q: query });
    if (params?.category) qs.set('category', params.category);
    if (params?.minPrice) qs.set('minPrice', String(params.minPrice));
    if (params?.maxPrice) qs.set('maxPrice', String(params.maxPrice));
    return request(`/search?${qs.toString()}`);
  },
  getRecommendations: (productId: string) =>
    request('/search', { method: 'POST', body: JSON.stringify({ productId }) }),

  // Analytics
  analytics: (event: any) =>
    request('/analytics', { method: 'POST', body: JSON.stringify(event) }).catch(() => {}),
};
