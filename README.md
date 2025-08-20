## Voyatek Assessment — Real-time Rooms Messaging Backend

TypeScript/Node.js backend with real-time messaging using Socket.IO, Prisma (MySQL), Redis, and InversifyJS. Features include authenticated room chat, presence, message read receipts, rate limiting, validation, and REST endpoints.

### API Documentation (Postman)
Comprehensive request/response examples are available in Postman docs: [Voyatek Messaging API (Postman)](https://documenter.getpostman.com/view/41950051/2sB3BKF8mv)

### Tech stack
- Express + inversify-express-utils (DI, controllers)
- Socket.IO (real-time)
- Prisma (MySQL) client
- Redis + BullMQ (queues, presence/rate limiting storage)
- JWT auth
- Class-validator/transformer (DTO validation)

---

## Running the app

### 1) With Docker Compose (recommended)
Prerequisites: Docker Desktop and docker compose.

1. Ensure a `.env` file exists at the project root (see `env.example`). This repo already reads your `.env` directly; you do not need to modify it.
2. Build and start the stack:
```bash
docker compose up -d --build
```
3. The app migrates the DB automatically and starts on `http://localhost:3000`.

Services started:
- MySQL (container hostname: `db`, exposed to host on `${DATABASE_PORT}`)
- Redis (container hostname: `redis`, exposed to host on `${REDIS_PORT}`)
- App (exposed to host on `3000`)

Useful compose commands:
```bash
docker compose logs -f app
docker compose ps
docker compose down -v
```

### 2) Local without Docker (optional)
Prerequisites: Node 20+, MySQL 8+/9+, Redis 6+.
1. Create a `.env` from `env.example`, and make sure DB/Redis credentials match your local services.
2. Install deps and generate Prisma client:
```bash
npm install
```
3. Run migrations and start:
```bash
npm run build
npm run start
# or for development
npm run start:dev
```

---

## Configuration

Environment variables are validated in `src/config/env.ts`. Important ones:
- Database: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_URL`
- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`
- JWT: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_PASSWORD_RESET_SECRET`
- App port: `PORT` (default via `src/internal/env.ts` fallback is 4000, compose sets 3000)

When running with Docker Compose, the app connects to `db` and `redis` internally; your host ports remain those in your `.env`.

---

## Domain features

### Authentication
- JWT-based auth. REST endpoints requiring auth use middlewares to extract and verify token.
- Socket connections must include the JWT via `socket.handshake.auth.token` or `Authorization: Bearer <token>` header.

### Rooms
- Users can create rooms (public/private) and join them.
- Only room members can join a room over WebSocket, send/receive messages, and see presence.

### Messaging
- Real-time message exchange with Socket.IO.
- Content validation and sanitization.
- Message rate limiting to prevent spam.

### Presence
- Online/offline + last seen, stored in Redis with TTL.
- Presence tracked per room; join/leave/ disconnect events update room presence and broadcast status.

### Message receipts (Read receipts)
- `delivered_at` is set by the DB default.
- The application tracks read state through `read_at`:
  - When a user joins a room, all unread messages for that user in that room are automatically marked as read.
  - When a user fetches room messages via REST, those messages are automatically marked as read for that user.
  - A client may also explicitly mark a message as read via the `message_read` socket event.

### Rate limiting
- Redis-backed sliding windows for message send, join, typing, and REST endpoints. REST responses include standard `X-RateLimit-*` headers where applicable.

---

## REST API (high-level)

Base URL: `http://localhost:3000`

- Rooms
  - `POST /rooms` — create room
  - `POST /rooms/:roomId/join?invite=` — join room (private requires invite)
  - `POST /rooms/:roomId/invite` — create invite token for private rooms
  - `GET /rooms/:roomId/messages` — list messages (paginated). Auto-marks fetched messages as read
  - `GET /rooms/:roomId/members` — list members with presence
  - `GET /rooms/:roomId/presence` — get presence summary for the room
  - `GET /rooms/:roomId/messages/:messageId/receipts` — read receipt details

See detailed DTOs in `src/app/rooms/dto` and controller in `src/app/rooms/rooms.controller.ts`.

---

## WebSocket API (Socket.IO)

Socket server: same origin as REST (`/socket.io`). Auth required.

Client must provide token:
```js
const socket = io('http://localhost:3000', {
  auth: { token: '<jwt>' }
  // or headers: { Authorization: `Bearer <jwt>` }
});
```

### Client → Server events
- `join_room` — `{ roomId }`
  - Requires membership. On success, you start receiving events for that room. Returns `joined_room` with current presence and unread count.
- `send_message` — `{ roomId, content }`
  - Sends a message to room members after validation/rate limit checks.
- `typing` — `{ roomId, isTyping }`
  - Broadcasts typing indicator to other room members.
- `message_read` — `{ roomId, messageId }`
  - Marks a specific message as read for the current user; broadcasts receipt.
- `mark_messages_read` — `{ roomId, messageIds[] }`
  - Bulk mark messages as read for the current user; broadcasts summary.
- `leave_room` — `{ roomId }`
  - Leaves the room and updates presence.

### Server → Client events
- `joined_room` — `{ roomId, presence, unreadCount, timestamp }`
- `receive_message` — `{ id, room_id, content, timestamp, sender: { ... } }`
- `typing` — `{ userId, isTyping, timestamp }`
- `user_joined` — `{ userId, status, timestamp }`
- `user_left` — `{ userId, timestamp }`
- `user_status` — `{ userId, status: 'online'|'offline', lastSeen, timestamp }`
- `message_receipt` — `{ messageId, recipientId, status: 'read', timestamp }`
- `messages_read` — `{ recipientId, messageCount, timestamp }`
- Errors: `join_room_error`, `message_error`

### Example client usage
```javascript
import { io } from 'socket.io-client';

const token = '<jwt-token>';
const roomId = 'room-uuid';

const socket = io('http://localhost:3000', {
  auth: { token }
});

socket.on('connect', () => {
  console.log('connected', socket.id);

  // join a room (must already be a member)
  socket.emit('join_room', { roomId });
});

// join results
socket.on('joined_room', (data) => {
  console.log('joined_room', data);
  // data: { roomId, presence: [...], unreadCount, timestamp }
});

socket.on('join_room_error', (err) => {
  console.warn('join_room_error', err);
});

// send a message
function sendMessage(content) {
  socket.emit('send_message', { roomId, content });
}

// typing indicator
function setTyping(isTyping) {
  socket.emit('typing', { roomId, isTyping });
}

// receive message and optionally mark as read
socket.on('receive_message', (message) => {
  console.log('receive_message', message);
  // explicit read receipt for a single message
  socket.emit('message_read', { roomId, messageId: message.id });
});

// bulk mark read (e.g., upon opening the chat history)
function markBulkRead(messageIds) {
  socket.emit('mark_messages_read', { roomId, messageIds });
}

// receipts
socket.on('message_receipt', (r) => {
  // { messageId, recipientId, status: 'read', timestamp }
  console.log('message_receipt', r);
});

socket.on('messages_read', (r) => {
  // { recipientId, messageCount, timestamp }
  console.log('messages_read', r);
});

// presence and activity
socket.on('user_status', (s) => console.log('user_status', s));
socket.on('user_joined', (s) => console.log('user_joined', s));
socket.on('user_left', (s) => console.log('user_left', s));
socket.on('typing', (t) => console.log('typing', t));

// errors / limits
socket.on('message_error', (err) => {
  // { message, retryAfter?, remaining?, errors? }
  console.warn('message_error', err);
});

// leave room
function leaveRoom() {
  socket.emit('leave_room', { roomId });
}
```

For a full, copy-pasteable reference of payloads and flows, see `MESSAGING_API.md`.

---

## Architecture notes
- DI container in `src/di/inversify.config.ts` wires Controllers, Services, and Libraries (Logger/DB/Redis).
- Database client is created in `src/config/db.ts` (Prisma + MySQL adapter). Schema in `prisma/schema.prisma`.
- Redis client and BullMQ workers in `src/config/redis.ts`.
- Socket gateway logic is implemented as a class in `src/app/realtime/socket.ts`.
- Business logic for rooms in `src/app/rooms/rooms.service.ts`.

---

## Operations

### Health and readiness
On start, the app performs a DB and Redis health check (see `src/index.ts`).

### Graceful shutdown
`src/index.ts` installs handlers for SIGINT/SIGTERM and uncaught errors to close HTTP server, DB, and Redis cleanly.

### Migrations
In Docker, migrations run automatically via `npx prisma migrate deploy` before the app starts. Locally, run `npx prisma migrate deploy` or `prisma migrate dev` as needed.

---

## Troubleshooting
- “ECONNREFUSED” to DB/Redis inside Docker: ensure the compose stack is up; the app connects to `db`/`redis` hostnames internally.
- Port already in use: stop local MySQL/Redis or change `DATABASE_PORT`/`REDIS_PORT` in `.env` and re-run `docker compose up -d`.
- Validation errors on startup: ensure `.env` contains all required variables (compare with `env.example`).


