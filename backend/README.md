# CEX Backend — Foundation

Production-ready backend foundation for an INR ↔ USDT crypto exchange MVP.
This is **Module 0 (Platform Foundations)** from `../PRD.md`, implementing the
shared substrate every feature module builds on, plus a complete **auth**
module as the reference for the layered architecture.

## Stack

Node.js 20 · TypeScript · Express · PostgreSQL · Prisma · Redis · JWT · Docker

## Architecture (Clean / layered)

```
HTTP → Router → [rate-limit] → [validate] → [authenticate] → Controller → Service → Repository → Prisma/Postgres
                                                                   │
                                                                 Redis (cache / locks / rate-limit / revocation)
```

| Layer | Responsibility | Example |
|-------|----------------|---------|
| **Routes** | Wire middleware + map paths | `modules/auth/auth.routes.ts` |
| **Validation** | zod schemas, reject bad input at the edge | `auth.validators.ts`, `middleware/validate.ts` |
| **Controller** | HTTP in/out only, no business logic | `auth.controller.ts` |
| **Service** | Business logic + orchestration, framework-agnostic | `auth.service.ts` |
| **Repository** | The only place touching Prisma for a domain | `auth.repository.ts` |
| **Lib** | Cross-cutting infra (logger, errors, prisma, redis, jwt) | `lib/*` |
| **Middleware** | Request context, security, rate-limit, error handler | `middleware/*` |

## Folder structure

```
backend/
├── prisma/
│   ├── schema.prisma          # foundation + auth tables (mirrors ARCHITECTURE.md §17)
│   └── seed.ts                # baseline system flags
├── src/
│   ├── config/                # env validation (zod) + typed config
│   ├── lib/                   # logger, errors, prisma, redis, jwt
│   ├── middleware/            # request-context, security, rate-limit,
│   │                          # validate, authenticate, not-found, error-handler
│   ├── modules/
│   │   ├── health/            # liveness / readiness / version
│   │   └── auth/              # reference module: routes→controller→service→repository
│   ├── routes/                # API router aggregator
│   ├── utils/                 # response envelope, async handler
│   ├── types/                 # Express request augmentation
│   ├── app.ts                 # Express assembly (middleware order)
│   └── server.ts              # bootstrap + graceful shutdown
├── Dockerfile                 # multi-stage, non-root, healthcheck
├── docker-compose.yml         # api + postgres + redis
├── .env.example
└── tsconfig.json
```

## Quick start (local)

```bash
cp .env.example .env          # then edit secrets
npm install

# start postgres + redis only
docker compose up -d postgres redis

npm run prisma:migrate        # create tables
npm run db:seed               # seed system flags
npm run dev                   # http://localhost:4000
```

## Quick start (full stack in Docker)

```bash
cp .env.example .env
# Provide real JWT secrets via env or a .env consumed by compose:
JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... docker compose up --build
```

The `api` container runs `prisma migrate deploy` on boot, then starts the
server. Postgres and Redis come up first (compose waits on healthchecks).

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | — | Liveness |
| GET | `/ready` | — | Readiness (DB + Redis) |
| GET | `/version` | — | Build info |
| POST | `/api/v1/auth/register` | — | Create account → tokens |
| POST | `/api/v1/auth/login` | — | Login → tokens |
| POST | `/api/v1/auth/refresh` | — | Rotate refresh → new tokens |
| POST | `/api/v1/auth/logout` | Bearer | Revoke session |
| GET | `/api/v1/auth/me` | Bearer | Current user |

### Response envelope

```jsonc
// success
{ "success": true, "data": { /* ... */ } }
// error
{ "success": false, "error": { "code": "INVALID_CREDENTIALS", "message": "..." } }
```

## Security features in this foundation

- Argon2id password hashing (`@node-rs/argon2`, prebuilt — no native build).
- Short-lived access JWT + **rotating** refresh tokens stored **hashed**, with
  reuse detection (family revocation) and **instant revocation** via a Redis
  denylist checked on every authenticated request.
- Helmet headers, strict CORS allowlist, body-size limits.
- Redis-backed rate limiting (shared across replicas); tighter limiter on auth.
- Central error handler → no stack traces leak in production.
- Structured JSON logging with secret/PII redaction and per-request correlation id.
- Runs as non-root in Docker; fail-fast env validation on boot.

## Notes / next steps

- JWT uses HS256 here; migrate to **RS256** before production (ARCHITECTURE.md §11).
- This foundation deliberately stops at auth. The ledger, KYC, wallet, deposit,
  withdrawal, and admin modules slot into `src/modules/*` and register their
  routers in `src/routes/index.ts`, following the same layer pattern.
```
