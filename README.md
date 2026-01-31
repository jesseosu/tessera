# Tessera

A production-grade, cloud-native e-commerce platform built entirely on AWS serverless services. Features event-driven order processing, AI-powered product recommendations, comprehensive observability, and a full CI/CD pipeline.

> *Tessera* - a Roman token, voucher, or tile used as proof of identity, payment, or admission to the marketplace. A fitting name for a platform that handles digital transactions at scale.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│                     React SPA (S3 + CloudFront)                          │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     API GATEWAY (REST + Cognito Auth)                    │
│                X-Ray Tracing │ Rate Limiting │ CORS                      │
├──┬────┬───────┬────────┬──────┴─────┬──────────┬─────────────────────────┤
│  │    │       │        │            │          │                         │
│  ▼    ▼       ▼        ▼            ▼          ▼                         │
│┌────┐┌────┐┌─────┐┌──────────┐┌──────────┐┌──────────┐                   │
││Prod││User││Cart ││ Checkout ││ Search   ││Analytics │  Lambda Functions │
││uct ││    ││     ││          ││(Bedrock) ││          │  (Node.js 20.x)   │
│└─┬──┘└─┬──┘└──┬──┘└────┬─────┘└────┬─────┘└────┬─────┘                   │
│  │     │      │        │           │           │                         │
│  ▼     ▼      ▼        ▼           ▼           ▼                         │
│┌──────────────────┐  ┌─────┐  ┌─────────┐  ┌────────┐                    │
││    DynamoDB      │  │ SQS │  │ Bedrock │  │Kinesis │                    │
││ (4 tables, PITR) │  │FIFO │  │  (AI)   │  │Stream  │                    │
│└──────────────────┘  └──┬──┘  └─────────┘  └────────┘                    │
│                         │                                                │
│                         ▼                                                │
│                  ┌──────────────┐     ┌─────────────┐                    │
│                  │   Order      │──▶  │ EventBridge │                   │
│                  │  Processor   │     │  (Events)   │                    │
│                  └──────┬───────┘     └──────┬──────┘                    │
│                         │                    │                           │
│                    ┌────▼────┐         ┌─────▼─────┐                     │
│                    │  DLQ    │         │    SNS    │                     │
│                    │(Failed) │         │(Notify)   │                     │
│                    └─────────┘         └───────────┘                     │
└──────────────────────────────────────────────────────────────────────────┘

  Observability: CloudWatch Dashboard │ X-Ray Tracing │ Structured Logging
  CI/CD: GitHub Actions (lint → test → build → deploy)
```

## Key Features

| Feature | Implementation |
|---------|----------------|
| Microservices | 7 independent Lambda functions, each with a single responsibility |
| Event-Driven Architecture | SQS FIFO queue for order processing, EventBridge for domain events, SNS for notifications |
| AI-Powered Search | Amazon Bedrock (Titan) for product recommendations with category-based fallback |
| Infrastructure as Code | AWS CDK (TypeScript) — entire stack deployable in one command |
| Observability | X-Ray tracing, structured JSON logging, CloudWatch dashboard + alarms |
| CI/CD Pipeline | GitHub Actions: lint, test (with coverage), build, security scan, CDK synth, deploy |
| Authentication | Amazon Cognito with JWT-based API authorization |
| Resilience | Dead Letter Queue for failed order processing, retry policies, optimistic locking |
| Input Validation | Shared validation library with sanitization (XSS prevention) |
| Testing | Jest unit tests with mocked AWS SDK for all services |
| Local Development | Docker Compose with DynamoDB Local |

## AWS Services Used

| Service | Purpose |
|---------|---------|
| Lambda | Serverless compute (7 functions) |
| API Gateway | REST API with Cognito authorization, rate limiting |
| DynamoDB | NoSQL database (4 tables, point-in-time recovery, TTL on carts) |
| Cognito | User authentication and authorization |
| SQS (FIFO) | Async order processing with exactly-once delivery |
| EventBridge | Domain event routing (ORDER_CONFIRMED → SNS) |
| SNS | Order notification topics, CloudWatch alarm notifications |
| Kinesis | Real-time analytics event streaming |
| Bedrock | AI-powered product recommendations (Titan model) |
| S3 | Static website hosting (encrypted) |
| CloudFront | CDN with HTTPS enforcement |
| CloudWatch | Dashboard, alarms (checkout errors, DLQ depth, API 5xx) |
| X-Ray | Distributed tracing across all services |
| IAM | Least-privilege permissions per function |

## Project Structure

```
tessera/
├── .github/workflows/       # CI/CD pipelines
│   ├── ci.yml              # Lint, test, build, security scan
│   └── deploy.yml          # CDK deploy + frontend upload
├── frontend/                # React 18 + TypeScript + Vite
│   ├── src/
│   │   ├── components/     # Header, ProductCard, Guard, ErrorBoundary, Toast
│   │   ├── pages/          # Home, Product, Cart, Checkout, Orders, Search, Login, Profile
│   │   ├── api.ts          # Type-safe API client
│   │   ├── auth.ts         # Cognito session management
│   │   └── styles.css      # Production-ready responsive CSS
│   └── Dockerfile          # Local dev container
├── services/                # Lambda microservices
│   ├── product/            # CRUD with batch writes, pagination, validation
│   ├── user/               # Profile + address management
│   ├── cart/               # Cart ops with stock validation
│   ├── checkout/           # Order creation with SQS publishing + order history
│   ├── order-processor/    # SQS consumer: stock decrement, EventBridge events
│   ├── search/             # Full-text search + Bedrock AI recommendations
│   └── analytics/          # Kinesis event ingestion
├── shared/                  # Shared libraries
│   └── src/
│       ├── types.ts        # Domain models and API types
│       ├── logger.ts       # Structured JSON logging with X-Ray trace correlation
│       ├── response.ts     # Standardized API responses with CORS + security headers
│       └── validator.ts    # Input validation + sanitization
├── infra/                   # AWS CDK stack
│   └── lib/
│       └── tessera-stack.ts    # Full infrastructure definition (~300 lines)
├── docker-compose.yml       # Local dev: DynamoDB Local + frontend
├── jest.config.ts           # Test configuration
└── package.json             # Root workspace with scripts
```

## Quick Start

### Prerequisites

- Node.js 20+
- AWS CLI configured with credentials
- AWS CDK CLI (`npm install -g aws-cdk`)
- Docker (for local development)

### Deploy to AWS

```bash
# 1. Install dependencies
npm install
cd infra && npm install
cd ../frontend && npm install && cd ..

# 2. Deploy infrastructure
cd infra && npx cdk deploy --all

# 3. Note the stack outputs (ApiUrl, UserPoolId, UserPoolClientId, SpaUrl)

# 4. Build and deploy frontend
cd ../frontend
cat > .env << EOF
VITE_API_URL=<ApiUrl from step 3>
VITE_USER_POOL_ID=<UserPoolId from step 3>
VITE_USER_POOL_CLIENT_ID=<UserPoolClientId from step 3>
EOF
npm run build

# 5. Upload to S3 (bucket name from CDK outputs)
aws s3 sync dist/ s3://<bucket-name> --delete
```

### Local Development

```bash
# Start DynamoDB Local + frontend dev server
docker compose up -d

# Frontend available at http://localhost:3000
```

### Run Tests

```bash
npm test                # Run all unit tests
npm run test:coverage   # With coverage report
npm run lint            # ESLint
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products` | No | List products (paginated, filterable) |
| GET | `/product?id=` | No | Get single product |
| POST | `/product` | Yes | Create product |
| PATCH | `/product` | Yes | Update product |
| POST | `/products` | Yes | Batch create (up to 25) |
| GET | `/cart` | Yes | View cart with total |
| POST | `/cart` | Yes | Add to cart (validates stock) |
| DELETE | `/cart?productId=` | Yes | Remove from cart |
| PATCH | `/cart` | Yes | Update quantity |
| POST | `/checkout` | Yes | Place order (async processing via SQS) |
| GET | `/orders` | Yes | Order history (newest first) |
| GET | `/order?id=` | Yes | Order details |
| GET | `/search?q=` | No | Search products (relevance ranked) |
| POST | `/search` | Yes | AI recommendations (Bedrock) |
| GET | `/user` | Yes | Get/auto-create profile |
| POST | `/user` | Yes | Update profile |
| PUT | `/user` | Yes | Update shipping address |
| POST | `/analytics` | No | Ingest analytics event to Kinesis |

## Event-Driven Order Flow

```
1. Customer clicks "Place Order"
          │
          ▼
2. Checkout Lambda
   ├── Validates cart & calculates total
   ├── Creates order (status: PENDING) via DynamoDB TransactWrite
   ├── Publishes ORDER_CREATED to SQS FIFO queue
   └── Clears cart & returns order ID
          │
          ▼
3. Order Processor Lambda (SQS trigger)
   ├── Decrements stock using optimistic locking (ConditionExpression)
   ├── On success: updates order status → CONFIRMED
   ├── On stock failure: updates order status → CANCELLED
   └── Publishes domain event to EventBridge
          │
          ▼
4. EventBridge Rule
   └── Routes ORDER_CONFIRMED → SNS topic (notifications)
          │
          ▼
5. If processing fails 3x → message sent to Dead Letter Queue
   └── CloudWatch alarm fires on DLQ depth > 0
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| SQS FIFO for orders | Guarantees exactly-once processing and message ordering per user |
| Optimistic locking for stock | `ConditionExpression: stock >= :qty` prevents overselling without distributed locks |
| DynamoDB TransactWrite | Atomic order creation across main record + user index |
| Bedrock with fallback | AI recommendations with category-based fallback if Bedrock unavailable |
| Structured JSON logging | Enables CloudWatch Insights queries and X-Ray trace correlation |
| Cart TTL | DynamoDB TTL auto-expires abandoned carts, reducing storage costs |
| Point-in-time recovery | Enabled on Product, User, and Order tables for data durability |
| FIFO DLQ | Failed orders preserved for 14 days for investigation and manual replay |

## Observability

- **CloudWatch Dashboard**: API request rates, Lambda p99 latency, error counts, queue depth
- **Alarms**: Checkout errors > 5/5min, DLQ messages > 0, API 5xx > 10/5min
- **X-Ray Tracing**: End-to-end request tracing from API Gateway through Lambda to DynamoDB
- **Structured Logs**: JSON format with service name, trace ID, and request context

## CI/CD Pipeline

```
Push to main/PR ──▶ ci.yml
                    ├── Lint (ESLint)
                    ├── Unit Tests (Jest + coverage)
                    ├── Build Frontend (Vite)
                    ├── CDK Synth (validates IaC)
                    └── Security Scan (npm audit + secret detection)

Push to main ──▶ deploy.yml
                 ├── CDK Deploy (infrastructure)
                 ├── Build Frontend (with real env vars)
                 ├── S3 Upload
                 └── CloudFront Cache Invalidation
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, React Router 6 |
| Backend | Node.js 20, TypeScript, AWS Lambda |
| Database | Amazon DynamoDB (single-table design) |
| Auth | Amazon Cognito |
| Messaging | SQS FIFO, EventBridge, SNS |
| AI/ML | Amazon Bedrock (Titan) |
| Streaming | Amazon Kinesis |
| IaC | AWS CDK (TypeScript) |
| CI/CD | GitHub Actions |
| Testing | Jest with AWS SDK mocks |
| Containerization | Docker, Docker Compose |

## License

MIT
