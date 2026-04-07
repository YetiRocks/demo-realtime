<p align="center">
  <img src="https://cdn.prod.website-files.com/68e09cef90d613c94c3671c0/697e805a9246c7e090054706_logo_horizontal_grey.png" alt="Yeti" width="200" />
</p>

---

# demo-realtime

[![Yeti](https://img.shields.io/badge/Yeti-Demo-blue)](https://yetirocks.com/demo-realtime)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **[Yeti](https://yetirocks.com)** - The Performance Platform for Agent-Driven Development.
> Schema-driven APIs, real-time streaming, and vector search. From prompt to production.

**Five protocols, one schema, zero glue code.** WebSocket, SSE, REST, MQTT, and gRPC side by side.

Send a message through a single REST endpoint and watch it propagate simultaneously across five different transport protocols in real time. One GraphQL schema declaration generates every endpoint, every subscription, every streaming connection. No custom server code, no message broker configuration, no WebSocket handlers, no SSE plumbing.

---

## Why demo-realtime

Real-time applications typically require stitching together multiple services: a WebSocket server for bidirectional messaging, an SSE endpoint for server-push, an MQTT broker for IoT pub/sub, a REST API for CRUD, and a gRPC service for high-performance streaming. Each transport demands its own server code, connection management, serialization logic, and deployment infrastructure.

demo-realtime eliminates all of that:

- **One schema, five transports** -- a single `@export` directive on a GraphQL type generates REST, SSE, WebSocket, MQTT, and gRPC endpoints automatically. No handler code, no routing configuration, no serialization boilerplate.
- **Live visual comparison** -- a React dashboard connects to all five protocols simultaneously, showing message delivery side-by-side. Perfect for evaluating latency, connection behavior, and reconnect semantics across transports.
- **Instant MQTT pub/sub** -- yeti's native MQTT broker (MQTTS on port 8883, WebSocket proxy at `/mqtt`) is available with zero configuration. Publish from `mosquitto_pub`, subscribe from the browser.
- **Auto-reconnect everywhere** -- the frontend demonstrates production-ready reconnection patterns for WebSocket, SSE, and MQTT with configurable backoff.
- **Public access by default** -- the schema declares `public: [read, create, delete, subscribe, connect]`, making all demo endpoints accessible without authentication.
- **Single binary** -- no external message broker, no Redis, no separate WebSocket server. Everything runs inside yeti.

---

## Quick Start

### 1. Install

```bash
cd ~/yeti/applications
git clone https://github.com/yetirocks/demo-realtime.git
```

Restart yeti. The frontend builds automatically on first load (~30 seconds for npm install + vite build) and is cached for subsequent starts.

### 2. Open the dashboard

Navigate to `https://localhost:9996/demo-realtime/` in your browser. You will see five panels -- WebSocket, SSE, REST Poll, gRPC Stream, and MQTT/WS -- each with a connection status indicator.

### 3. Create a message via REST

```bash
curl -s -X POST https://localhost:9996/demo-realtime/message \
  -H "Content-Type: application/json" \
  -d '{
    "id": "msg_001",
    "title": "Hello from curl",
    "content": "This message arrives on all five channels"
  }'
```

Response:
```json
{
  "id": "msg_001",
  "title": "Hello from curl",
  "content": "This message arrives on all five channels",
  "__createdAt__": "2026-03-29T12:00:00.000Z"
}
```

All five dashboard panels update simultaneously.

### 4. Subscribe via SSE

Open a second terminal and subscribe to the SSE stream:

```bash
curl -N https://localhost:9996/demo-realtime/message/
```

The connection stays open. Now post another message from a third terminal:

```bash
curl -s -X POST https://localhost:9996/demo-realtime/message \
  -H "Content-Type: application/json" \
  -d '{"id": "msg_002", "title": "SSE test", "content": "Watch the other terminal"}'
```

The SSE terminal immediately outputs:

```
event: update
data: {"id":"msg_002","title":"SSE test","content":"Watch the other terminal","__createdAt__":"2026-03-29T12:00:01.000Z"}
```

### 5. Subscribe via MQTT

Requires `mosquitto_sub` / `mosquitto_pub` (install via `brew install mosquitto`).

Subscribe to the MQTT topic:

```bash
mosquitto_sub -h localhost -p 8883 -t "demo-realtime/Message/#" --cafile ~/yeti/certs/localhost/cert.pem
```

Publish a message via MQTT:

```bash
mosquitto_pub -h localhost -p 8883 -t "demo-realtime/Message" \
  --cafile ~/yeti/certs/localhost/cert.pem \
  -m '{"type":"update","id":"msg_003","data":{"id":"msg_003","title":"From MQTT","content":"Published via mosquitto"}}'
```

The subscriber terminal receives the message. The dashboard MQTT panel also updates in real time.

### 6. Subscribe via WebSocket

Using `websocat` (install via `brew install websocat`):

```bash
websocat wss://localhost:9996/demo-realtime/message/ --insecure
```

Messages posted via REST, MQTT, or the dashboard form appear as JSON frames:

```json
{"type":"put","id":"msg_004","data":{"id":"msg_004","title":"WebSocket delivery","content":"Bidirectional channel","__createdAt__":"2026-03-29T12:00:02.000Z"}}
```

### 7. List all messages via REST

```bash
curl -s https://localhost:9996/demo-realtime/message/?limit=50 | python3 -m json.tool
```

Response:
```json
[
  {
    "id": "msg_001",
    "title": "Hello from curl",
    "content": "This message arrives on all five channels",
    "__createdAt__": "2026-03-29T12:00:00.000Z"
  },
  {
    "id": "msg_002",
    "title": "SSE test",
    "content": "Watch the other terminal",
    "__createdAt__": "2026-03-29T12:00:01.000Z"
  }
]
```

### 8. Delete a message

```bash
curl -s -X DELETE https://localhost:9996/demo-realtime/message/msg_001
```

All connected SSE, WebSocket, and MQTT subscribers receive a `delete` event. The dashboard panels remove the message in real time.

---

## Architecture

```
                         Browser (React + Vite)
                              |
          +-------------------+--------------------+
          |          |        |        |            |
       WebSocket   SSE     REST    MQTT/WS      gRPC
       (wss://)  (GET+     (GET/   (wss://     (SSE relay
        bidi     stream)   POST/    /mqtt)      in browser)
                           DELETE)
          |          |        |        |            |
          +-------------------+--------------------+
                              |
                      +-------+-------+
                      |  Yeti Router  |
                      |  (Axum)       |
                      +-------+-------+
                              |
          +-------------------+--------------------+
          |          |        |        |            |
       WS Handler  SSE     REST    MQTT Broker   gRPC
       (per-table) Layer   CRUD    (native,      Service
                                   port 8883)
          |          |        |        |            |
          +-------------------+--------------------+
                              |
                    +---------+---------+
                    |   Message Table   |
                    |   (RocksDB)       |
                    |                   |
                    |   PubSub Layer    |
                    |   (broadcast to   |
                    |    all transports)|
                    +-------------------+
```

**Write path:** Client sends POST to `/demo-realtime/message` -> Yeti validates against schema -> stores in RocksDB -> PubSub broadcasts to all active subscribers (WebSocket frames, SSE events, MQTT messages) simultaneously.

**Read path:** REST GET returns records from RocksDB. Streaming transports (SSE, WebSocket, MQTT) hold open connections and receive push notifications on every write or delete.

**MQTT path:** Native MQTTS broker on port 8883 with WebSocket proxy at `wss://host/mqtt`. Browser connects via the `mqtt` npm package over the WebSocket proxy. External tools (`mosquitto_pub`/`mosquitto_sub`) connect directly to the TCP port.

---

## Features

### WebSocket (Bidirectional)

Full-duplex messaging over a persistent connection. The browser opens a WebSocket to `wss://host/demo-realtime/message/` and receives JSON frames for every create, update, and delete operation.

- Automatic reconnection on disconnect (5-second backoff)
- Messages include `type` field: `"put"` for creates/updates, `"delete"` for removals
- Connection status tracked via `onopen`, `onerror`, `onclose` events
- Clean close with code 1000 on page unload

### SSE (Server-Sent Events)

Unidirectional server-push over HTTP. The browser opens an `EventSource` to the same message endpoint and receives typed events.

- Event types: `update` (create/modify), `delete` (removal)
- Automatic browser-native reconnection with `Last-Event-ID` support
- Works through HTTP/2 multiplexing -- no extra TCP connections
- Ideal for dashboards, notifications, and monitoring

### REST (Polling)

Standard HTTP CRUD with JSON payloads. The dashboard fetches the full message list on demand.

- `GET /demo-realtime/message/?limit=50` -- list messages
- `POST /demo-realtime/message` -- create a message
- `DELETE /demo-realtime/message/{id}` -- delete a message
- `GET /demo-realtime/message/{id}` -- read a single message
- `PUT /demo-realtime/message/{id}` -- update a message

### MQTT (Pub/Sub)

Native MQTT 5.0 broker with TLS. The browser connects via WebSocket proxy; external clients connect via TCP.

- Topic: `demo-realtime/Message` and `demo-realtime/Message/#`
- Protocol version 5 with clean session semantics
- Health check gate: panel shows "disabled" if MQTT broker is not enabled in `yeti-config.yaml`
- Message format: `{"type": "update"|"delete", "id": "...", "data": {...}}`

Enable the MQTT broker in `~/yeti/yeti-config.yaml`:

```yaml
interfaces:
  mqtt:
    enabled: true
    port: 8883
```

### gRPC (Streaming)

gRPC server streaming for high-performance subscriptions. Since browsers cannot speak native gRPC, the dashboard uses an SSE relay that mirrors the gRPC Subscribe RPC data path.

- Health check gate: panel shows "disabled" if gRPC is not enabled in `yeti-config.yaml`
- Same event semantics as SSE (`update`, `delete`)
- Production clients use native gRPC for lower overhead and binary serialization

Enable gRPC in `~/yeti/yeti-config.yaml`:

```yaml
interfaces:
  grpc:
    enabled: true
    port: 50051
```

### React Dashboard (Web UI)

A single-page React application built with Vite, served as static files by yeti.

- Five side-by-side panels with live connection status indicators (green/yellow/red/grey)
- Message count badges per panel
- Inline message form with random sample data for quick testing
- "Delete All" bulk operation with confirmation modal
- New message highlight animation (2-second fade)
- Newest-first sort by `__createdAt__` timestamp
- SPA routing with automatic base path detection from `config.yaml`

---

## Data Model

### Message Table

| Field | Type | Description |
|-------|------|-------------|
| `id` | ID! (primary key) | Unique message identifier (client-generated or auto) |
| `title` | String! | Message title (required) |
| `content` | String! | Message body (required) |
| `__createdAt__` | String | Auto-populated ISO 8601 creation timestamp |

The schema declares five transport exports:

```graphql
type Message @table(database: "demo-realtime") @export(
    name: "message"
    rest: true
    sse: true
    ws: true
    mqtt: true
    public: [read, create, delete, subscribe, connect]
) {
    id: ID! @primaryKey
    title: String!
    content: String!
    __createdAt__: String
}
```

### Public Access

The `public` directive grants unauthenticated access to:

| Permission | Operations |
|------------|-----------|
| `read` | GET single message, GET list |
| `create` | POST new message |
| `delete` | DELETE message by ID |
| `subscribe` | SSE and MQTT subscriptions |
| `connect` | WebSocket connections |

Write operations (`update`) require authentication in production mode.

### Auto-Generated Endpoints

From this single schema declaration, yeti generates:

| Endpoint | Method | Transport | Description |
|----------|--------|-----------|-------------|
| `/demo-realtime/message` | POST | REST | Create a message |
| `/demo-realtime/message/?limit=N` | GET | REST | List messages |
| `/demo-realtime/message/{id}` | GET | REST | Read one message |
| `/demo-realtime/message/{id}` | PUT | REST | Update a message |
| `/demo-realtime/message/{id}` | DELETE | REST | Delete a message |
| `/demo-realtime/message/` | GET (EventSource) | SSE | Stream create/update/delete events |
| `/demo-realtime/message/` | WS upgrade | WebSocket | Bidirectional message stream |
| `demo-realtime/Message` | MQTT topic | MQTT | Pub/sub message channel |

---

## Configuration

### config.yaml

```yaml
name: "Realtime Demo"
app_id: "demo-realtime"
version: "1.0.0"
description: "Side-by-side comparison of WebSocket, SSE, REST polling, gRPC streaming, and MQTT"
schemas:
  path: schemas/realtime.graphql

static:
  path: web
  route: /
  spa: true
  build:
    source: source
    command: npm run build
```

| Key | Value | Description |
|-----|-------|-------------|
| `app_id` | `demo-realtime` | URL prefix for all endpoints |
| `schemas` | `schemas/realtime.graphql` | Schema file defining the Message table |
| `static_files.path` | `web` | Directory containing built frontend assets |
| `static_files.spa` | `true` | SPA mode -- serves `index.html` for all unmatched routes |
| `static_files.build.sourceDir` | `source` | React/Vite source directory |
| `static_files.build.command` | `npm run build` | Build command executed on first load |

### Optional: Enable MQTT and gRPC

The MQTT and gRPC panels require their respective interfaces to be enabled in the global yeti configuration at `~/yeti/yeti-config.yaml`:

```yaml
interfaces:
  port: 9996
  mqtt:
    enabled: true
    port: 8883
  grpc:
    enabled: true
    port: 50051
```

Without these, the dashboard panels display a "not enabled" state with configuration hints.

### TLS

All connections use TLS by default. Development certificates are generated via `mkcert`:

```bash
mkcert -install
mkcert -cert-file ~/yeti/certs/localhost/cert.pem \
       -key-file ~/yeti/certs/localhost/key.pem \
       localhost 127.0.0.1 ::1
```

MQTT clients connecting via `mosquitto_sub`/`mosquitto_pub` need `--cafile` pointing to the certificate.

---

## Project Structure

```
demo-realtime/
├── config.yaml                  # App configuration
├── schemas/
│   └── realtime.graphql         # Message table with 5-transport export
└── source/                      # React/Vite frontend
    ├── index.html               # Entry HTML with GTM
    ├── package.json             # Dependencies (react, mqtt, vite)
    ├── vite.config.ts           # Vite config with auto base path
    ├── tsconfig.json            # TypeScript config
    └── src/
        ├── main.tsx             # React entry point
        ├── App.tsx              # App shell with nav bar
        ├── theme.ts             # Theme persistence (localStorage)
        ├── utils.ts             # JSON syntax highlighting
        ├── index.css            # Global styles
        ├── yeti.css             # Yeti design system
        ├── auth.css             # Auth form styles
        ├── pages/
        │   └── RealtimePage.tsx # Main page -- 5 protocol panels
        └── components/
            └── Footer.tsx       # Page footer
```

---

## Development

### Frontend development with HMR

```bash
cd ~/yeti/applications/demo-realtime/source

# Install dependencies
npm install

# Start Vite dev server with hot module replacement
npm run dev
# -> http://localhost:5181/demo-realtime/
```

The Vite dev server proxies API requests to the running yeti instance. Edit React components and see changes instantly without rebuilding.

### Production build

```bash
npm run build
```

Output goes to `../web/` which yeti serves as static files. On restart, yeti detects the existing `web/` directory and skips the build step.

### Testing with curl

```bash
# Create
curl -s -X POST https://localhost:9996/demo-realtime/message \
  -H "Content-Type: application/json" \
  -d '{"id":"test_1","title":"Test","content":"Hello"}'

# Read
curl -s https://localhost:9996/demo-realtime/message/test_1

# Update
curl -s -X PUT https://localhost:9996/demo-realtime/message/test_1 \
  -H "Content-Type: application/json" \
  -d '{"id":"test_1","title":"Updated","content":"Modified"}'

# Delete
curl -s -X DELETE https://localhost:9996/demo-realtime/message/test_1

# List
curl -s https://localhost:9996/demo-realtime/message/?limit=10

# Stream (SSE -- hold open)
curl -N https://localhost:9996/demo-realtime/message/
```

---

## Comparison

| | demo-realtime | Traditional Approach |
|---|---|---|
| **WebSocket server** | Auto-generated from `ws: true` | Custom handler, connection pool, heartbeat logic |
| **SSE endpoint** | Auto-generated from `sse: true` | Custom streaming response, keep-alive, reconnect IDs |
| **MQTT broker** | Native yeti broker, zero config | Separate Mosquitto/EMQX deployment |
| **REST API** | Auto-generated from `rest: true` | Express/Axum routes, validation, serialization |
| **gRPC service** | Auto-generated from schema | Protobuf definitions, code generation, server impl |
| **Message fanout** | Built-in PubSub layer | Redis Pub/Sub or custom broadcast logic |
| **Frontend** | React SPA served by yeti | Separate static host or nginx |
| **Schema** | 10 lines of GraphQL | Separate schemas per transport + REST OpenAPI |
| **Server code** | 0 lines | Hundreds of lines per transport |
| **Deployment** | One binary, one config file | Multiple services, Docker compose, load balancer |
| **TLS** | Built-in, all transports | Per-service certificate configuration |
| **Auth** | Schema-level `public` directive | Per-endpoint middleware |

---

## Protocol Behavior Reference

| Property | WebSocket | SSE | REST | MQTT | gRPC |
|----------|-----------|-----|------|------|------|
| Direction | Bidirectional | Server -> Client | Request/Response | Pub/Sub | Server -> Client (stream) |
| Connection | Persistent | Persistent | Per-request | Persistent | Persistent |
| Create event | `{"type":"put"}` | `event: update` | Poll required | `{"type":"update"}` | `event: update` |
| Delete event | `{"type":"delete"}` | `event: delete` | Poll required | `{"type":"delete"}` | `event: delete` |
| Reconnect | Manual (5s backoff) | Browser-native | N/A | Library-managed | Manual (5s backoff) |
| Browser support | Native | Native | Native | Via WebSocket proxy | Via SSE relay |
| CLI tool | `websocat` | `curl -N` | `curl` | `mosquitto_sub` | `grpcurl` |
| Default port | 443 (shared) | 443 (shared) | 443 (shared) | 8883 (dedicated) | 50051 (dedicated) |

---

Built with [Yeti](https://yetirocks.com) | The Performance Platform for Agent-Driven Development
