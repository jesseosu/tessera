// ─── Domain Models ───────────────────────────────────────────────
export interface Product {
  id: string;
  title: string;
  description?: string;
  price: number;
  image?: string;
  stock: number;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  title: string;
  qty: number;
  price: number;
  addedAt: string;
}

export interface Order {
  id: string;
  userSub: string;
  email: string;
  total: number;
  status: OrderStatus;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface UserProfile {
  sub: string;
  email: string;
  name?: string;
  address?: Address;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface AnalyticsEvent {
  type: 'click' | 'view' | 'search' | 'add_to_cart' | 'checkout' | 'purchase';
  userSub?: string;
  payload: Record<string, unknown>;
  ts: number;
  sessionId?: string;
}

// ─── API Types ───────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  count: number;
}

// ─── Event-Driven Architecture ───────────────────────────────────
export interface OrderEvent {
  eventType: 'ORDER_CREATED' | 'ORDER_CONFIRMED' | 'ORDER_CANCELLED' | 'STOCK_RESERVED' | 'STOCK_RELEASED';
  orderId: string;
  userSub: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

// ─── Search Types ────────────────────────────────────────────────
export interface SearchRequest {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  nextToken?: string;
}

export interface SearchResult {
  products: Product[];
  total: number;
  nextToken?: string;
  suggestions?: string[];
}
