# TCP Server/Client Feature — Feasibility Analysis

> **Date:** 2026-11-26  
> **Status:** Proposed  
> **Priority:** TBD

---

## 1. Overview

This document analyzes the feasibility of adding **TCP server/client** communication capabilities to the OpenPLC Editor. The feature would allow PLC programs to communicate over raw TCP sockets — enabling integration with SCADA systems, remote I/O devices, custom protocols, and inter-PLC communication.

---

## 2. Feasibility Assessment

### ✅ Verdict: Fully Feasible

The project already implements multiple network communication protocols (Socket.IO, SSH2, Modbus, EtherCAT, serial). TCP server/client follows the same architectural patterns and requires **no additional external dependencies** — Node.js provides the built-in `net` module.

---

## 3. Existing Patterns to Follow

| Existing Feature | Relevant Pattern |
|---|---|
| **Modbus** (`src/backend/editor/modbus/`) | Industrial protocol with server config UI, I/O group management |
| **EtherCAT** (`src/backend/editor/ethercat/`) | Device communication with connection state management |
| **SSH2** (device connectivity) | Remote host connection with authentication |
| **Socket.IO** (WebRTC/real-time) | Bidirectional real-time data transport |
| **Serial port** (`serialport` package) | Physical device communication with port config |

---

## 4. Proposed Architecture

### 4.1 Directory Structure

```
src/
├── backend/
│   ├── editor/
│   │   └── tcp/                          # NEW — TCP service module
│   │       ├── tcp-server-service.ts     # TCP server (listen, accept, broadcast)
│   │       ├── tcp-client-service.ts     # TCP client (connect, send, receive)
│   │       ├── tcp-connection-manager.ts # Connection lifecycle management
│   │       ├── tcp-protocol-parser.ts    # Data framing / protocol parsing
│   │       └── index.ts
│   └── shared/
│       └── tcp/                          # NEW — Shared TCP types
│           ├── types.ts                  # Connection config, message types
│           └── constants.ts             # Default ports, timeouts, buffer sizes
│
├── middleware/
│   ├── adapters/
│   │   └── tcp/                          # NEW — TCP adapter
│   │       └── tcp-adapter.ts
│   └── shared/
│       └── ports/
│           └── tcp-port.ts              # NEW — TCP port interface
│
├── frontend/
│   ├── components/
│   │   └── _features/
│   │       └── [workspace]/
│   │           └── tcp-monitor/          # NEW — TCP UI feature
│   │               ├── tcp-config-panel.tsx      # Host/port/mode config
│   │               ├── tcp-connection-list.tsx    # Active connections list
│   │               ├── tcp-data-console.tsx       # Send/receive data viewer
│   │               └── tcp-status-indicator.tsx   # Connection status badge
│   ├── hooks/
│   │   ├── use-tcp-server.ts            # NEW
│   │   └── use-tcp-client.ts            # NEW
│   └── store/
│       └── slices/
│           └── tcp.ts                   # NEW — Zustand slice (21st slice)
│
├── main/
│   └── modules/
│       └── ipc/
│           └── tcp-ipc-handlers.ts      # NEW — IPC channel handlers
│
└── types/
    └── IPC/
        └── tcp-service/                 # NEW — IPC type contracts
            ├── index.ts
            └── tcp-channels.ts
```

### 4.2 Layer Diagram

```
┌───────────────────────────────────────────────────┐
│                Frontend (React)                    │
│                                                    │
│  ┌──────────────┐  ┌───────────┐  ┌────────────┐ │
│  │ TCP Config   │  │ TCP Data  │  │ TCP Store  │ │
│  │ Panel        │  │ Console   │  │ (Zustand)  │ │
│  └──────┬───────┘  └─────┬─────┘  └──────┬─────┘ │
│         │                │               │        │
│         └────────────────┼───────────────┘        │
│                          │                         │
│                    IPC Channels                     │
├──────────────────────────┼─────────────────────────┤
│              Main Process (Electron)               │
│                          │                         │
│              ┌───────────┴───────────┐             │
│              │  TCP IPC Handlers     │             │
│              └───────────┬───────────┘             │
│                          │                         │
│         ┌────────────────┼────────────────┐        │
│         │                │                │        │
│  ┌──────┴──────┐  ┌─────┴──────┐  ┌──────┴─────┐ │
│  │ TCP Server  │  │ TCP Client │  │ Connection │ │
│  │ Service     │  │ Service    │  │ Manager    │ │
│  │ (net.Server)│  │ (net.Socket│  │            │ │
│  └─────────────┘  └────────────┘  └────────────┘ │
│                          │                         │
└──────────────────────────┼─────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Remote   │ │ SCADA    │ │ Other    │
        │ PLC      │ │ System   │ │ Devices  │
        └──────────┘ └──────────┘ └──────────┘
```

---

## 5. Implementation Details

### 5.1 TCP Server Service

```typescript
// src/backend/editor/tcp/tcp-server-service.ts
// Uses Node.js built-in `net` module — no extra dependencies

import { createServer, Server, Socket } from 'net'

interface TcpServerConfig {
  port: number
  host: string               // '0.0.0.0' for all interfaces
  maxConnections: number      // default: 10
  keepAlive: boolean
  timeout: number             // connection timeout in ms
  encoding: 'utf-8' | 'hex' | 'ascii' | 'binary'
}

interface TcpServerEvents {
  onClientConnected: (clientId: string, remoteAddress: string) => void
  onDataReceived: (clientId: string, data: Buffer) => void
  onClientDisconnected: (clientId: string) => void
  onError: (error: Error) => void
}
```

### 5.2 TCP Client Service

```typescript
// src/backend/editor/tcp/tcp-client-service.ts

interface TcpClientConfig {
  host: string
  port: number
  reconnect: boolean          // auto-reconnect on disconnect
  reconnectInterval: number   // ms between retries
  timeout: number
  encoding: 'utf-8' | 'hex' | 'ascii' | 'binary'
}

interface TcpClientEvents {
  onConnected: () => void
  onDataReceived: (data: Buffer) => void
  onDisconnected: () => void
  onError: (error: Error) => void
}
```

### 5.3 IPC Channels

```typescript
// Proposed IPC channel names (following existing conventions)
'tcp:server:start'          // Start TCP server
'tcp:server:stop'           // Stop TCP server
'tcp:server:broadcast'      // Send to all connected clients
'tcp:server:send'           // Send to specific client
'tcp:client:connect'        // Connect to remote server
'tcp:client:disconnect'     // Disconnect
'tcp:client:send'           // Send data
'tcp:data:received'         // Data received event (server or client)
'tcp:connection:status'     // Connection state change event
```

### 5.4 Zustand Store Slice

```typescript
// src/frontend/store/slices/tcp.ts

interface TcpSlice {
  // Server state
  serverRunning: boolean
  serverPort: number
  serverHost: string
  connectedClients: TcpClient[]

  // Client state
  clientConnected: boolean
  clientTarget: { host: string; port: number } | null

  // Data log
  dataLog: TcpDataEntry[]      // timestamped send/receive log

  // Actions
  startServer: (config: TcpServerConfig) => void
  stopServer: () => void
  connectClient: (config: TcpClientConfig) => void
  disconnectClient: () => void
  sendData: (data: string | Buffer) => void
  clearLog: () => void
}
```

---

## 6. UI Design

### 6.1 TCP Configuration Panel

| Field | Type | Description |
|---|---|---|
| **Mode** | Toggle | Server / Client |
| **Host** | Text input | IP address or hostname |
| **Port** | Number input | TCP port (1–65535) |
| **Encoding** | Dropdown | UTF-8, HEX, ASCII, Binary |
| **Auto-reconnect** | Switch | Client mode only |
| **Max connections** | Number input | Server mode only |
| **Keep-alive** | Switch | Enable TCP keep-alive |

### 6.2 TCP Data Console

- Timestamped log of sent/received messages
- Hex / ASCII / UTF-8 view toggle
- Send input field with Enter-to-send
- Clear log button
- Export log to file

### 6.3 Connection Status

- Green indicator: Connected / Listening
- Yellow indicator: Connecting / Reconnecting
- Red indicator: Disconnected / Error
- Client count badge (server mode)

---

## 7. Dependencies

| Dependency | Status | Notes |
|---|---|---|
| `net` (Node.js built-in) | ✅ Already available | TCP server/client core |
| `dgram` (Node.js built-in) | ✅ Already available | UDP support (future) |
| Zustand | ✅ Already installed | State management |
| Radix UI | ✅ Already installed | UI components |
| Tailwind CSS | ✅ Already installed | Styling |

**No new npm packages required.**

---

## 8. Estimated Effort

| Component | Effort |
|---|---|
| TCP Server/Client backend services | ~2 days |
| IPC channel wiring | ~0.5 day |
| Middleware adapter/port | ~0.5 day |
| Zustand store slice | ~0.5 day |
| Frontend UI (config + console + status) | ~2 days |
| Custom hooks | ~0.5 day |
| Unit tests | ~1 day |
| E2E tests | ~1 day |
| Documentation | ~0.5 day |
| **Total** | **~8–9 days** |

---

## 9. Build & Packaging

The TCP feature uses only Node.js built-in modules, so it has **zero impact on the build pipeline**:

- ✅ No native modules to rebuild
- ✅ No extra binaries to bundle
- ✅ No changes to `electron-builder.json`
- ✅ No changes to `extraResources`
- ✅ Standard `npm run package` produces the `.exe` as usual

### Build Commands (unchanged)

```bash
npm run build      # Build main + renderer
npm run package    # Build + create Windows NSIS installer (.exe)
```

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Firewall blocking TCP ports | Show clear error message, suggest port alternatives |
| Data buffer overflow | Implement configurable buffer limits and backpressure |
| Connection leaks on app quit | Integrate with existing `quit-coordinator` lifecycle |
| Security (open ports) | Bind to localhost by default, warn on 0.0.0.0 |
| Architecture validation | Register new module in `__architecture__/validate.ts` |

---

## 11. Future Extensions

- **UDP support** — using `dgram` module (same architecture)
- **Protocol templates** — predefined parsers for common industrial protocols
- **Data logging** — persistent TCP traffic recording to file
- **PLC variable binding** — map TCP data directly to PLC variables
- **TLS/SSL** — encrypted TCP via `tls` module
- **Multi-connection client** — connect to multiple servers simultaneously
