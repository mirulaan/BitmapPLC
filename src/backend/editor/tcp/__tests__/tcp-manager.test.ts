import { formatEndChar } from '../../../../middleware/shared/ports/tcp-types'
import { TcpManager } from '../tcp-manager'

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('TcpManager', () => {
  let manager: TcpManager

  beforeEach(() => {
    manager = new TcpManager()
  })

  afterEach(() => {
    manager.stopAll()
  })

  it('formats end characters properly', () => {
    expect(formatEndChar('NONE')).toBe('')
    expect(formatEndChar('CR')).toBe('\r')
    expect(formatEndChar('LF')).toBe('\n')
    expect(formatEndChar('CRLF')).toBe('\r\n')
  })

  it('exchanges TCP messages between server and client with CRLF end character', async () => {
    const port = 49155
    manager.startServer(port)
    await waitMs(50)

    const client = manager.connectClient('127.0.0.1', port)
    await waitMs(100)

    const serverStatus = manager.getServerStatus(port)
    expect(serverStatus.active).toBe(true)
    expect(serverStatus.clientCount).toBe(1)

    const sendRes = manager.send(client.connId, 'Hello world', 'CRLF')
    expect(sendRes.done).toBe(true)
    expect(sendRes.error).toBe(false)

    await waitMs(50)
    const serverClientId = serverStatus.clientIds[0]
    const recv = manager.receive(serverClientId)
    expect(recv.newData).toBe(true)
    expect(recv.data).toBe('Hello world\r\n')
    expect(recv.length).toBe(13)
    expect(recv.error).toBe(false)

    // Subsequent poll without new data returns newData=false
    const recvEmpty = manager.receive(serverClientId)
    expect(recvEmpty.newData).toBe(false)
  })
})
