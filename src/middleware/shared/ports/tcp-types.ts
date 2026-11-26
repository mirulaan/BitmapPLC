export type TcpEndChar = 'NONE' | 'CR' | 'LF' | 'CRLF'

export interface TcpServerStatus {
  port: number
  active: boolean
  clientCount: number
  clientIds: number[]
  error: string | null
}

export interface TcpClientStatus {
  connId: number
  host: string
  port: number
  connected: boolean
  error: string | null
}

export interface TcpSendResult {
  done: boolean
  error: boolean
  errorMessage?: string
}

export interface TcpRecvResult {
  newData: boolean
  data: string
  length: number
  error: boolean
  errorMessage?: string
}

export function formatEndChar(endChar: string | TcpEndChar): string {
  switch (String(endChar).toUpperCase()) {
    case 'CR':
    case '\\R':
      return '\r'
    case 'LF':
    case '\\N':
      return '\n'
    case 'CRLF':
    case '\\R\\N':
      return '\r\n'
    default:
      return ''
  }
}
