<p align="center">
  <img src="https://cdn.prod.website-files.com/68e09cef90d613c94c3671c0/697e805a9246c7e090054706_logo_horizontal_grey.png" alt="Yeti" width="200" />
</p>

---

# demo-realtime

[![Yeti](https://img.shields.io/badge/Yeti-Demo-blue)](https://yetirocks.com/demo-realtime)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **[Yeti](https://yetirocks.com)** - The Performance Platform for Agent-Driven Development.
> Schema-driven APIs, real-time streaming, and vector search. From prompt to production.

Side-by-side comparison of WebSocket, Server-Sent Events, and REST polling. Send a message and watch all three channels update simultaneously.

## Features

- WebSocket bidirectional messaging
- SSE server-push with auto-reconnect
- REST polling baseline
- Simultaneous multi-protocol updates

## Installation

```bash
cd ~/yeti/applications
git clone https://github.com/yetirocks/demo-realtime.git
cd demo-realtime/source
npm install
npm run build
```

## Project Structure

```
demo-realtime/
├── config.yaml              # App configuration
├── schemas/
│   └── realtime.graphql     # Message table
└── source/                  # React/Vite frontend
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── src/
```

## Configuration

```yaml
name: "Realtime Demo"
app_id: "demo-realtime"
version: "1.0.0"
description: "Side-by-side comparison of WebSocket, SSE, REST polling, gRPC streaming, and MQTT"
schemas:
  - schemas/realtime.graphql

static_files:
  path: web
  route: /
  index: index.html
  not_found:
    file: index.html
    statusCode: 200
  build:
    source_dir: source
    command: npm run build
```

## Schema

**realtime.graphql** -- Message with REST, SSE, and WebSocket export:
```graphql
type Message @table(database: "demo-realtime") @export(
    name: "message"
    rest: true
    sse: true
    ws: true
) {
    id: ID! @primaryKey
    title: String!
    content: String!
    __createdAt__: String
}
```

## Development

```bash
cd source

# Install dependencies
npm install

# Start dev server with HMR
npm run dev

# Build for production
npm run build
```

---

Built with [Yeti](https://yetirocks.com) | The Performance Platform for Agent-Driven Development
