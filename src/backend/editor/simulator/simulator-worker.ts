/** Worker thread entry: runs the OpenPLC Simulator's module through the shared simulator thread host. */
import { parentPort } from 'node:worker_threads'

import { serveSimulatorThread } from '@root/backend/shared/simulator/simulator-thread'
import { WasmSimulatorModule } from '@root/backend/shared/simulator/wasm-simulator-module'

import { TcpManager } from '../tcp'

const tcp = new TcpManager()

const port = parentPort
if (port) {
  serveSimulatorThread(
    {
      post: (message) => port.postMessage(message),
      onMessage: (listener) => port.on('message', listener),
    },
    () => {
      const mod = new WasmSimulatorModule()
      mod.onTcpHandler = {
        serverStep: (en, p) => {
          if (!en) {
            tcp.stopServer(p)
            return { active: false, clientCount: 0, error: false }
          }
          const st = tcp.startServer(p)
          return { active: st.active, clientCount: st.clientCount, error: Boolean(st.error) }
        },
        clientStep: (en, host, p) => {
          if (!en) return { connected: false, connId: 0, error: false }
          const st = tcp.connectClient(host, p)
          if (st.error) console.error('[simulator-worker] TCP client error:', host, p, st.error)
          return { connected: st.connected, connId: st.connId, error: Boolean(st.error) }
        },
        send: (en, connId, data, endChar) => {
          if (!en) return { done: false, error: false }
          const res = tcp.send(connId, data, endChar)
          return { done: res.done, error: res.error }
        },
        recv: (en, connId) => {
          if (!en) return { newData: false, data: '', error: false }
          const res = tcp.receive(connId)
          return { newData: res.newData, data: res.data, error: res.error }
        },
        stopAll: () => tcp.stopAll(),
      }
      return mod
    },
  )
}
