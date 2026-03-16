# FX Trading App — Backend

A production-grade backend for an FX Trading application built with NestJS, TypeORM, PostgreSQL, and Redis. Users can register, verify their email, fund multi-currency wallets, convert currencies using real-time FX rates, and trade Naira (NGN) against foreign currencies.

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> && cd credpal-assessment
npm install

# 2. Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# 3. Set up environment
cp .env.example .env
# Edit .env with your FX API key (get one free at https://www.exchangerate-api.com)

# 4. Run migrations
npm run migration:run

# 5. Start the server
npm run start:dev

# Swagger docs at http://localhost:3000/api/docs
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | NestJS 10 | Modular, TypeScript-first, production patterns |
| ORM | TypeORM 0.3 | PostgreSQL support, migrations, query builder |
| Database | PostgreSQL 16 | DECIMAL precision, `SELECT FOR UPDATE`, JSONB, timestamptz |
| Cache | Redis 7 | FX rate caching with TTL (5 min) |
| Auth | JWT (Passport) | Stateless, 15-minute access tokens |
| Money Math | decimal.js | No floating-point — all amounts as `DECIMAL(18,4)` |
| Docs | Swagger/OpenAPI | Auto-generated from decorators |
| Email | Nodemailer | SMTP transport (any provider) |

## Architecture

```
src/
├── common/
│   ├── decorators/     @CurrentUser, @VerifiedOnly, @Roles, @IdempotencyKey
│   ├── guards/         JwtAuthGuard, VerifiedGuard, RolesGuard
│   ├── interceptors/   IdempotencyInterceptor, ResponseTransformInterceptor
│   ├── filters/        GlobalExceptionFilter
│   ├── enums/          Currency, TransactionType, TransactionStatus, Role
│   └── utils/          decimal.util.ts (safe arithmetic), lock-order.util.ts
├── config/             database, redis, jwt, fx, mail (all typed with @nestjs/config)
├── modules/
│   ├── auth/           Register, verify OTP, resend OTP, login
│   ├── user/           User entity + service + admin controller
│   ├── otp/            OTP generation + validation (6-digit, 10-min expiry)
│   ├── wallet/         Multi-currency wallets, funding, conversion
│   ├── trading/        NGN ↔ foreign currency trades with spread
│   ├── fx/             FX rate fetching, Redis cache, circuit breaker, DB fallback
│   ├── transaction/    Transaction history with filtering + pagination
│   └── mail/           Email service (OTP delivery)
└── database/
    ├── migrations/
    └── data-source.ts
```

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register + send OTP email |
| POST | `/auth/verify-otp` | No | Verify email with 6-digit OTP |
| POST | `/auth/resend-otp` | No | Resend verification OTP |
| POST | `/auth/login` | No | Get JWT access token |

### Wallet
| Method | Path | Auth | Idempotent | Description |
|--------|------|------|-----------|-------------|
| GET | `/wallet` | Verified | — | List all currency balances |
| POST | `/wallet/fund` | Verified | Yes | Fund wallet in any currency |
| POST | `/wallet/convert` | Verified | Yes | Convert between any two currencies |
| POST | `/wallet/trade` | Verified | Yes | Trade NGN ↔ foreign currency (with spread) |

### FX Rates
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/fx/rates?base=NGN&currencies=USD,EUR,GBP` | No | Current FX rates |

### Transactions
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/transactions` | Verified | User's transaction history (paginated, filtered) |

### Admin (RBAC)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users` | Admin | List all users (paginated) |
| GET | `/admin/transactions` | Admin | View all transactions across users |

All mutation endpoints require an `X-Idempotency-Key` header (UUID) for replay protection.

## Key Architectural Decisions

### 1. Multi-Currency Wallet Model
One wallet row per `(user_id, currency)` pair with a `UNIQUE` constraint. This allows independent row-level locking per currency — two operations on different currencies for the same user don't block each other.

### 2. Concurrency Safety — Pessimistic Locking
All balance mutations use `SELECT ... FOR UPDATE` via TypeORM's `QueryRunner` inside database transactions. This prevents double-spending at the database level.

**Deadlock Prevention:** When a conversion/trade touches two wallets, locks are always acquired in alphabetical order by currency code (EUR < GBP < NGN < USD). This eliminates deadlocks when concurrent requests convert in opposite directions.

```
Example: Concurrent NGN→USD and USD→NGN
Both acquire: lock(NGN) → lock(USD)  ✓  No deadlock.
Without ordering: A locks NGN, B locks USD → deadlock.
```

### 3. Idempotency — Two Layers
- **Application layer:** `IdempotencyInterceptor` checks if the `X-Idempotency-Key` already exists in the transactions table before processing.
- **Database layer:** `UNIQUE` constraint on `transactions.idempotency_key` is the ultimate safety net for concurrent duplicate requests that pass the interceptor simultaneously.

### 4. FX Rate Resilience — Three-Tier Resolution
```
Redis Cache (5-min TTL) → External API (5s timeout) → DB Fallback (latest snapshot)
```
A circuit breaker protects the external API: opens after 3 consecutive failures, transitions to half-open after 30 seconds to allow a probe request. All rate snapshots are persisted for audit and fallback.

### 5. Financial-Grade Arithmetic
All monetary calculations use `decimal.js` with `ROUND_DOWN` mode. Amounts are stored as `DECIMAL(18,4)` in PostgreSQL and handled as `string` in TypeScript — never JavaScript `number`. This eliminates floating-point errors (e.g., `0.1 + 0.2 !== 0.3`).

### 6. Trade Spread
`/wallet/convert` uses the raw market rate. `/wallet/trade` applies a configurable spread (default 1.5%):
- **BUY** foreign currency: user pays more NGN (rate × 1.015)
- **SELL** foreign currency: user receives less NGN (rate × 0.985)

Both the raw rate and applied rate are recorded in the transaction for transparency.

## Database Schema

### Core Tables
- **users** — Authentication, roles (USER/ADMIN), email verification status
- **otps** — 6-digit OTP codes with 10-minute expiry, single-use
- **wallets** — One per (user, currency) pair, `DECIMAL(18,4)` balance
- **transactions** — Ledger of all actions (FUNDING, CONVERSION, TRADE) with rates and idempotency keys
- **fx_rate_snapshots** — Audit trail of all FX rates fetched (for fallback + compliance)

### Key Indexes
- `UNIQUE(user_id, currency)` on wallets — one wallet per currency per user
- `UNIQUE(idempotency_key)` on transactions — replay protection
- `(user_id, created_at DESC)` on transactions — paginated history
- `(base_currency, target_currency, created_at DESC)` on fx_rate_snapshots — fast fallback

## Key Assumptions

1. **FX API**: Uses [ExchangeRate-API](https://www.exchangerate-api.com) (free tier). The system gracefully degrades to cached/DB rates if the API is down.
2. **Funding**: Wallet funding is simulated (no payment gateway integration). The `POST /wallet/fund` endpoint directly credits the wallet.
3. **Spread**: A 1.5% spread is applied on `/wallet/trade` (not on `/wallet/convert`). Configurable via `FX_SPREAD_PERCENT` env var.
4. **Currency Support**: NGN, USD, EUR, GBP. Extending to new currencies requires only adding to the `Currency` enum and running a migration.
5. **Email**: OTP delivery uses SMTP. If the email provider is down, registration still succeeds — the email is fire-and-forget with error logging.
6. **No Payment Gateway**: This is a backend assessment — wallet funding doesn't integrate with Paystack/Flutterwave/etc.

## Running Tests

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov
```

Test coverage includes:
- **AuthService** (12 tests): Registration, OTP verification, login, error cases
- **WalletService** (10 tests): Funding, conversion math, insufficient balance, decimal precision
- **TradingService** (7 tests): Spread calculation (BUY/SELL), NGN enforcement, validation
- **FxService** (9 tests): Cache hit/miss, circuit breaker states, DB fallback, unavailability

## Scripts

```bash
npm run start:dev          # Development mode with hot reload
npm run start:prod         # Production mode
npm run build              # Compile TypeScript
npm run test               # Run unit tests
npm run migration:generate # Generate a new migration
npm run migration:run      # Run pending migrations
npm run migration:revert   # Revert last migration
```

## Security Measures

- **Password hashing**: bcrypt with 12 salt rounds
- **JWT**: 15-minute access tokens, secret via environment variable
- **Rate limiting**: 3-5 requests/minute on auth endpoints, 30/minute globally
- **Input validation**: `class-validator` with whitelist (strips unknown fields) + `forbidNonWhitelisted` (rejects unknown fields)
- **Error messages**: Login never reveals whether email or password was wrong
- **RBAC**: Admin-only endpoints guarded by `@Roles(Role.ADMIN)` with `RolesGuard`
- **OTP security**: Invalidates previous OTPs on resend, 10-minute expiry, single-use
- **Idempotency**: All mutation endpoints require `X-Idempotency-Key` header

## Bonus Features Implemented

- [x] **Role-based access control (RBAC)**: Admin vs. regular users with dedicated admin endpoints
- [x] **Redis caching**: FX rates cached with configurable TTL
- [x] **Idempotency / Transaction verification**: Duplicate detection via header + DB constraint
- [x] **Circuit breaker**: Protects against FX API failures with automatic recovery
- [x] **Spread on trades**: Configurable margin on NGN trading pairs
- [x] **Health check endpoint**: `/health` with database connectivity check
- [x] **Docker Compose**: One-command infrastructure setup
- [x] **Comprehensive test suite**: 38 unit tests across 4 service modules
