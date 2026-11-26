import { createServer, type Server, Socket } from 'node:net'

import {
  formatEndChar,
  type TcpClientStatus,
  type TcpEndChar,
  type TcpRecvResult,
  type TcpSendResult,
  type TcpServerStatus,
} from '../../../middleware/shared/ports/tcp-types'

interface ManagedServer {
  port: number
  server: Server
  active: boolean
  clientIds: Set<number>
  error: string | null
}

interface ManagedConnection {
  connId: number
  socket: Socket
  isServerClient: boolean
  serverPort?: number
  host: string
  port: number
  connected: boolean
  error: string | null
  rxQueue: string[]
}

const MAX_RX_QUEUE_PER_CONN = 128

export class TcpManager {
  private nextConnId = 1
  private readonly servers = new Map<number, ManagedServer>()
  private readonly connections = new Map<number, ManagedConnection>()
  private readonly clientKeyToConnId = new Map<string, number>()

  startServer(port: number): TcpServerStatus {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return { port, active: false, clientCount: 0, clientIds: [], error: `Invalid TCP port: ${port}` }
    }

    const existing = this.servers.get(port)
    if (existing) {
      return {
        port,
        active: existing.active,
        clientCount: existing.clientIds.size,
        clientIds: [...existing.clientIds],
        error: existing.error,
      }
    }

    const server = createServer()
    const managed: ManagedServer = {
      port,
      server,
      active: false,
      clientIds: new Set<number>(),
      error: null,
    }
    this.servers.set(port, managed)

    server.on('connection', (socket) => {
      socket.setNoDelay(true)
      const connId = this.nextConnId++
      const conn: ManagedConnection = {
        connId,
        socket,
        isServerClient: true,
        serverPort: port,
        host: socket.remoteAddress ?? '0.0.0.0',
        port: socket.remotePort ?? 0,
        connected: true,
        error: null,
        rxQueue: [],
      }
      this.connections.set(connId, conn)
      managed.clientIds.add(connId)

      socket.on('data', (chunk: Buffer) => {
        if (conn.rxQueue.length >= MAX_RX_QUEUE_PER_CONN) {
          conn.rxQueue.shift()
        }
        conn.rxQueue.push(chunk.toString('utf8'))
      })

      socket.on('error', (err) => {
        conn.error = err.message
      })

      socket.on('close', () => {
        conn.connected = false
        managed.clientIds.delete(connId)
        this.connections.delete(connId)
      })
    })

    server.on('error', (err) => {
      managed.active = false
      managed.error = err.message
    })

    server.listen(port, '0.0.0.0', () => {
      managed.active = true
      managed.error = null
    })

    return {
      port,
      active: managed.active,
      clientCount: managed.clientIds.size,
      clientIds: [...managed.clientIds],
      error: managed.error,
    }
  }

  stopServer(port: number): void {
    const managed = this.servers.get(port)
    if (!managed) return
    for (const connId of [...managed.clientIds]) {
      const conn = this.connections.get(connId)
      if (conn) {
        conn.socket.destroy()
        this.connections.delete(connId)
      }
    }
    managed.clientIds.clear()
    managed.active = false
    managed.server.close()
    this.servers.delete(port)
  }

  getServerStatus(port: number): TcpServerStatus {
    const managed = this.servers.get(port)
    if (!managed) {
      return { port, active: false, clientCount: 0, clientIds: [], error: null }
    }
    return {
      port,
      active: managed.active,
      clientCount: managed.clientIds.size,
      clientIds: [...managed.clientIds],
      error: managed.error,
    }
  }

  connectClient(host: string, port: number): TcpClientStatus {
    const cleanHost = host.trim()
    if (!cleanHost || !Number.isInteger(port) || port <= 0 || port > 65535) {
      return { connId: 0, host: cleanHost, port, connected: false, error: 'Invalid host or port' }
    }

    const key = `${cleanHost}:${port}`
    const existingId = this.clientKeyToConnId.get(key)
    if (existingId !== undefined) {
      const existing = this.connections.get(existingId)
      if (existing) {
        return {
          connId: existing.connId,
          host: existing.host,
          port: existing.port,
          connected: existing.connected,
          error: existing.error,
        }
      }
      this.clientKeyToConnId.delete(key)
    }

    const connId = this.nextConnId++
    const socket = new Socket()
    socket.setNoDelay(true)
    const conn: ManagedConnection = {
      connId,
      socket,
      isServerClient: false,
      host: cleanHost,
      port,
      connected: false,
      error: null,
      rxQueue: [],
    }
    this.connections.set(connId, conn)
    this.clientKeyToConnId.set(key, connId)

    socket.on('connect', () => {
      conn.connected = true
      conn.error = null
    })

    socket.on('data', (chunk: Buffer) => {
      if (conn.rxQueue.length >= MAX_RX_QUEUE_PER_CONN) {
        conn.rxQueue.shift()
      }
      conn.rxQueue.push(chunk.toString('utf8'))
    })

    socket.on('error', (err) => {
      conn.connected = false
      conn.error = err.message
    })

    socket.on('close', () => {
      conn.connected = false
      this.clientKeyToConnId.delete(key)
      this.connections.delete(connId)
    })

    socket.connect(port, cleanHost)

    return {
      connId,
      host: cleanHost,
      port,
      connected: conn.connected,
      error: conn.error,
    }
  }

  disconnectClient(connId: number): void {
    const conn = this.connections.get(connId)
    if (!conn) return
    conn.socket.destroy()
    if (!conn.isServerClient) {
      this.clientKeyToConnId.delete(`${conn.host}:${conn.port}`)
    } else if (conn.serverPort !== undefined) {
      this.servers.get(conn.serverPort)?.clientIds.delete(connId)
    }
    this.connections.delete(connId)
  }

  send(connId: number, data: string, endChar: string | TcpEndChar = 'NONE'): TcpSendResult {
    const payload = `${data}${formatEndChar(endChar)}`

    // connId === 0 broadcasts to all active connections
    if (connId === 0) {
      if (this.connections.size === 0) {
        return { done: false, error: true, errorMessage: 'No active TCP connections' }
      }
      let sentAny = false
      for (const conn of this.connections.values()) {
        if (conn.connected && !conn.socket.destroyed) {
          conn.socket.write(payload, 'utf8')
          sentAny = true
        }
      }
      return sentAny
        ? { done: true, error: false }
        : { done: false, error: true, errorMessage: 'No connected TCP sockets' }
    }

    const conn = this.connections.get(connId)
    if (!conn || !conn.connected || conn.socket.destroyed) {
      return { done: false, error: true, errorMessage: `Connection ${connId} is not connected` }
    }

    conn.socket.write(payload, 'utf8')
    return { done: true, error: false }
  }

  receive(connId: number): TcpRecvResult {
    // connId === 0 polls the first available connection with queued data
    if (connId === 0) {
      for (const conn of this.connections.values()) {
        if (conn.rxQueue.length > 0) {
          const msg = conn.rxQueue.shift() ?? ''
          return { newData: true, data: msg, length: Buffer.byteLength(msg, 'utf8'), error: false }
        }
      }
      return { newData: false, data: '', length: 0, error: false }
    }

    const conn = this.connections.get(connId)
    if (!conn) {
      return { newData: false, data: '', length: 0, error: true, errorMessage: `Connection ${connId} not found` }
    }
    if (conn.rxQueue.length === 0) {
      return { newData: false, data: '', length: 0, error: false }
    }
    const msg = conn.rxQueue.shift() ?? ''
    return { newData: true, data: msg, length: Buffer.byteLength(msg, 'utf8'), error: false }
  }

  stopAll(): void {
    for (const port of [...this.servers.keys()]) {
      this.stopServer(port)
    }
    for (const connId of [...this.connections.keys()]) {
      this.disconnectClient(connId)
    }
  }
}

export const tcpManager = new TcpManager()
