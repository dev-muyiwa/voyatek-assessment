## Schoolinka Backend v2

Node.js + TypeScript backend using Express and Inversify for DI, PostgreSQL via Knex/Postgrator, BullMQ on Redis for background jobs, Nodemailer/AWS SES for email, and AWS S3/CloudFront for storage and secure media delivery.

### Prerequisites
- Node 22+
- PostgreSQL 13+
- Redis 6+
- AWS credentials (S3, CloudFront, optionally SES)

### Quick start
1) Copy environment template and configure values
```
cp .env.example .env
```

2) Install and build
```
npm install
npm run build
```

3) Start
```
# Dev (ts-node + nodemon)
npm run start:dev

# Production
npm start
```

The app binds on port set by `port` in `.env` (defaults to 4000). Health endpoints:
- `/` – basic health check (runs DB/Redis checks)
- `/<api_version>` – e.g. `/api/v1` (string response; also runs health checks)

Controller routes are mounted under root path: `/api/${api_version}`. See Known notes below about `api_version`.

### Docker
Build and run the app container:
```
docker build -t schoolinka-backend:latest .
docker run -p 3000:3000 --env-file .env schoolinka-backend:latest
```

Redis via docker-compose (provides staging and production redis services for local usage/testing):
```
docker compose up -d
```
Provide both lowercase (for the app) and uppercase (for compose) Redis env vars as shown in `.env.example`.

### Environment
See `.env.example` for the full list. Keys are read case-insensitively and mapped to lowercase. Use lowercase names in `.env` (e.g., `postgres_host`). For docker-compose, also include `REDIS_PORT` and `REDIS_PASSWORD`.

Highlights:
- Database: `postgres_*`
- Redis/BullMQ: `redis_*`
- JWT: `jwt_access_secret`, `jwt_refresh_secret`, `jwt_password_reset_secret`
- Mail (dev via SMTP, non-dev via SES): `mail_*` and `aws_*`
- URLs: `frontend_base_url`, `creator_base_url`, `admin_frontend_base_url`
- AWS S3/CloudFront: `aws_region`, `aws_s3_public_bucket`, `aws_s3_private_bucket`, `aws_cloudfront_*`
- Payments: `flutterwave_secret_key`, `flutterwave_secret_hash`
- Admin backdoor for login: `admin_password`

CloudFront private key: store as a single-line string with `\n` for newlines; it is converted at runtime.

### Database & migrations
Knex is used for querying; Postgrator executes SQL migrations from `migrations/`. Migrations run automatically on startup. Naming follows `NNN.do.*.sql` and `NNN.undo.*.sql`. See `docs/Database.md`.

### Architecture
- Express with Inversify (`src/di/inversify.config.ts`)
- Modules in `src/app/**`
- Config in `src/config/**` (DB, Redis/BullMQ, Mail, Storage, Jobs, Logger, Env)
- Jobs: `RedisClient` + `JobProcessor` consume BullMQ queues
- Email templates in `emails/`
- Postman collections in `postman/collections/`

Detailed overview in `docs/Architecture.md`.

### Common operations
See `docs/Runbook.md` for day-2 operations (migrations, queues, resetting tokens, generating certificates, etc.).

### API Collections
Import Postman collections from `postman/collections/`:
- Schoolinka API.json
- Schoolinka Admin API.json

### Known notes
- `api_version` validation currently allows values like `/api/v1`, but the server root path is composed as `/api/${api_version}`. Using `/api/v1` results in `/api//api/v1`. Adjust either config or value as needed. Controllers are bound under that computed root path.
- SSL for PostgreSQL is enabled by default when `node_env !== 'local'`.

### Scripts
```
npm run start:dev   # Run in dev with nodemon
npm run build       # Transpile TypeScript to dist/
npm start           # Run compiled server
```

