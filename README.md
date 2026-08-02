# Grossify Backend API

> Hyperlocal multi-vendor marketplace platform connecting customers with local stores — grocery, fruits, dairy, electronics, pharmacy, and more.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL, Razorpay keys, MSG91 key

# Run database migrations
npx prisma migrate dev

# Seed initial data (categories, roles, permissions, plans)
npm run db:seed

# Start development server
npm run dev
```

Server runs at `http://localhost:3000`  
Swagger docs at `http://localhost:3000/api-docs`

---

## 📋 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + Express 5 |
| Database | PostgreSQL (Neon) |
| ORM | Prisma 5 |
| Cache | Valkey (Redis-compatible) |
| Auth | JWT (bcrypt + jsonwebtoken) |
| Payments | Razorpay SDK |
| SMS/OTP | MSG91 |
| File Upload | Multer + Sharp.js |
| Real-time | Socket.IO |
| Job Queue | BullMQ + node-cron |
| API Docs | Swagger (swagger-jsdoc + swagger-ui-express) |
| Testing | Jest + Supertest |

---

## 🏗️ Architecture: Modular Monolith

Each domain is a self-contained module with its own routes, controller, and service. Modules communicate through public service interfaces — never importing each other's internals.

```
src/
├── app.js                    # Express app composition
├── server.js                 # HTTP server + Socket.IO + Cron
│
├── modules/                  # Domain modules (each is independent)
│   ├── auth/                 # Register, Login, OTP (MSG91)
│   ├── users/                # Profile, addresses
│   ├── categories/           # Store/product categories
│   ├── stores/               # Store registration, discovery, geo-search
│   ├── products/             # CRUD, variants, inventory
│   ├── catalog/              # Master product catalog (admin)
│   ├── cart/                 # Multi-store shopping cart
│   ├── orders/               # Order lifecycle, stock management
│   ├── payments/             # Razorpay integration, webhooks
│   ├── subscriptions/        # Vendor plans, billing
│   ├── invoices/             # Auto-generated invoices
│   ├── refunds/              # Refund management
│   ├── settlements/          # Vendor payouts, transaction reports
│   ├── offers/               # Store deals/coupons
│   ├── reviews/              # Ratings with moderation
│   ├── notifications/        # In-app notifications
│   ├── tickets/              # Customer support ticketing
│   ├── referrals/            # Referral program + wallet
│   ├── search/               # Full-text search + autocomplete
│   ├── vendor/               # Vendor panel (orders, analytics, customers)
│   ├── delivery/             # Delivery order operations
│   ├── delivery-agent/       # Agent onboarding, availability
│   ├── analytics/            # Platform + store metrics
│   ├── uploads/              # Image/document upload + processing
│   └── admin/                # Admin dashboard, approvals, RBAC
│
├── shared/                   # Cross-cutting concerns
│   ├── config.js             # Environment config
│   ├── database.js           # Prisma client
│   ├── redis.js              # Valkey client + cache helpers
│   ├── errors.js             # Custom error classes
│   ├── logger.js             # Logging
│   ├── swagger.js            # Swagger/OpenAPI config
│   ├── middleware/
│   │   ├── auth.js           # JWT verify + RBAC authorize
│   │   ├── errorHandler.js   # Global error handler
│   │   ├── cache.js          # Valkey response caching
│   │   └── auditLog.js       # Audit trail logging
│   └── utils/
│       ├── asyncHandler.js   # Async route wrapper
│       ├── constants.js      # Enums, status codes
│       └── moderation.js     # Content moderation
│
├── jobs/                     # Background processing
│   ├── queue.js              # BullMQ queue setup
│   ├── notifications.js      # Notification dispatcher
│   └── cron/
│       ├── index.js          # Cron scheduler
│       ├── subscriptionCheck.js  # Trial/grace expiry
│       └── abandonedCart.js      # Cart recovery reminders
│
└── websocket/
    └── socket.handlers.js    # Socket.IO real-time events
```

---

## 📚 API Modules (100 endpoints)

| Module | Base Path | Auth | Description |
|--------|-----------|------|-------------|
| Auth | `/api/v1/auth` | No | Register, login, OTP, refresh token |
| Users | `/api/v1/users` | Yes | Profile, addresses |
| Categories | `/api/v1/categories` | No | Category tree (cached) |
| Stores | `/api/v1/stores` | Mixed | Nearby search (public), create/update (auth) |
| Products | `/api/v1/products` | Mixed | Browse (public), CRUD (auth) |
| Catalog | `/api/v1/catalog` | Mixed | Master catalog, vendor pick-from-catalog |
| Cart | `/api/v1/cart` | Yes | Multi-store cart management |
| Orders | `/api/v1/orders` | Yes | Place, track, cancel orders |
| Payments | `/api/v1/payments` | Mixed | Razorpay verify, webhooks |
| Subscriptions | `/api/v1/subscriptions` | Mixed | Plans (public), subscribe (auth) |
| Invoices | `/api/v1/invoices` | Yes | Auto-generated invoices |
| Refunds | `/api/v1/refunds` | Yes | Initiate and track refunds |
| Settlements | `/api/v1/settlements` | Yes | Vendor earnings, transaction reports |
| Offers | `/api/v1/offers` | Mixed | Store deals/coupons |
| Reviews | `/api/v1/reviews` | Mixed | Ratings, moderation, report |
| Notifications | `/api/v1/notifications` | Yes | In-app notification center |
| Tickets | `/api/v1/tickets` | Yes | Support ticketing system |
| Referrals | `/api/v1/referrals` | Yes | Referral codes, wallet |
| Search | `/api/v1/search` | No | Full-text + autocomplete |
| Vendor | `/api/v1/vendor` | Yes | Store panel operations |
| Delivery | `/api/v1/delivery` | Yes | Order pickup/deliver |
| Delivery Agent | `/api/v1/delivery-agent` | Yes | Agent onboarding, go online/offline |
| Analytics | `/api/v1/analytics` | Yes | Platform + store metrics |
| Admin | `/api/v1/admin` | Yes | Dashboard, approvals, RBAC, audit |
| Upload | `/api/v1/upload` | Yes | Image/document upload |

---

## 🗄️ Database (28 tables)

Key models: `users`, `stores`, `products`, `product_variants`, `orders`, `order_items`, `payments`, `subscriptions`, `plans`, `categories`, `carts`, `cart_items`, `invoices`, `refunds`, `settlements`, `offers`, `reviews`, `notifications`, `tickets`, `ticket_messages`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permission_overrides`, `audit_logs`, `wallets`, `wallet_transactions`, `referral_rewards`, `delivery_agents`, `master_products`, `addresses`

View full schema: `prisma/schema.prisma`

---

## 🧪 Testing

```bash
# Run all tests (101 tests across 5 suites)
npm test

# Run specific test file
npx jest tests/integration/api.test.js --runInBand --forceExit
```

Test suites:
- `api.test.js` — Core API tests (auth, users, categories, stores, products, orders, subscriptions, admin)
- `new-modules.test.js` — Vendor, offers, reviews, search, upload
- `full-flow.test.js` — End-to-end lifecycle (customer → vendor → delivery → review)
- `phase2-3.test.js` — Cart, invoices, refunds, settlements
- `tickets-cron.test.js` — Ticketing system, subscription lifecycle cron

---

## 🔧 Scripts

```bash
npm run dev          # Start with nodemon (auto-reload)
npm start            # Production start
npm test             # Run all tests
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed categories, roles, plans
npm run db:studio    # Open Prisma Studio (visual DB browser)
```

---

## 🌐 Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://...

# Valkey (Redis-compatible)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx

# MSG91
MSG91_AUTH_KEY=xxx
MSG91_SENDER_ID=GROSFY

# App
APP_NAME=Grossify
APP_URL=http://localhost:3000
```

---

## 📦 Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Architecture | Modular Monolith | Clean boundaries, easy to extract later, one deployment unit |
| ORM | Prisma | Type-safe, auto-migrations, great DX |
| Auth | JWT (not sessions) | Stateless, mobile-friendly, scalable |
| Payments | Razorpay Route | Legal compliance (Grossify never holds vendor money) |
| Cache | Valkey | Free, Redis-compatible, open-source |
| Real-time | Socket.IO | Bi-directional, room-based events |
| Search | Prisma text search (MVP) | Works for launch, Meilisearch upgrade path exists |
| File processing | Sharp.js | Fast, generates WebP variants |
| Background jobs | node-cron + BullMQ | Simple cron for scheduled, BullMQ for queued |

---

## 🚀 Deployment

**Local development:**
```bash
brew install valkey      # Install Valkey
brew services start valkey  # Start Valkey
npm run dev              # Start API server
```

**Production (VPS):**
- Docker Compose available in `docker-compose.yml`
- Or run natively with PM2: `pm2 start src/server.js --name grossify-api`

---

## 📊 Current Stats

- **100 API endpoints** (all documented in Swagger)
- **25 Swagger tags**
- **28 database tables**
- **101 passing tests**
- **Covers Phases 1–4** of the PRD

---

## 📖 Related Docs

- `Grossify-PRD.md` — Product Requirements Document
- `Grossify-TDD.md` — Technical Design Document

---

Built by [Kunal Gharate](https://github.com/kunalgharate)
