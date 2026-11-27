export type Vc3000Polarity = 'PNP' | 'NPN'

export type Vc3000LightState = 'ON' | 'OFF' | 'TRIGGER'

export type Vc3000LightEdge = 'RISING' | 'FALLING'

export interface Vc3000LightChannelConfig {
  channel: 1 | 2 | 3 | 4
  brightness: number // 0-100 (%QW10-%QW13)
  state: Vc3000LightState
  edge: Vc3000LightEdge
  durationMs: number
}

export interface Vc3000ConnectConfig {
  /** COM port for Serial IO Board & Light Controller (e.g. "COM1"). Empty string disables serial board. */
  comPort: string
  /** Enable Mainboard GPIO via WinIO (requires Administrator privileges on Windows). */
  enableGpio: boolean
  /** Hardware input polarity (PNP = active high, NPN = active low). */
  diPolarity: Vc3000Polarity
  /** Hardware output polarity (PNP = active high, NPN = active low). */
  doPolarity: Vc3000Polarity
  /** Synchronous I/O polling interval in milliseconds (10-100). */
  pollIntervalMs: number
  /** Initial 4-channel light controller configuration. */
  lightChannels?: Vc3000LightChannelConfig[]
}

export interface Vc3000IoSnapshot {
  /** Serial IO Board DI1-DI8 -> %IX0.0 to %IX0.7 */
  di: boolean[]
  /** Mainboard GPIO GPI1-GPI8 -> %IX1.0 to %IX1.7 */
  gpi: boolean[]
  /** Serial IO Board DO1-DO16 -> %QX0.0 to %QX1.7 */
  doState: boolean[]
  /** Mainboard GPIO GPO1-GPO8 -> %QX2.0 to %QX2.7 */
  gpo: boolean[]
  /** Light Controller CH1-CH4 brightness (0-100) -> %QW10 to %QW13 */
  lightBrightness: [number, number, number, number]
}

export interface Vc3000Status {
  supported: boolean
  connected: boolean
  serialConnected: boolean
  gpioConnected: boolean
  comPort: string
  diPolarity: Vc3000Polarity
  doPolarity: Vc3000Polarity
  pollIntervalMs: number
  sdkVersion: string | null
  firmwareVersion: string | null
  lastError: string | null
  snapshot: Vc3000IoSnapshot
  lightChannels: Vc3000LightChannelConfig[]
}

export interface Vc3000ActionResult<T = void> {
  ok: boolean
  data?: T
  error?: string
}

export interface Vc3000DetectedPort {
  comPort: string
  firmwareVersion: string
}

export interface Vc3000IoIndexMap {
  di: Array<number | null>
  gpi: Array<number | null>
  doState: Array<number | null>
  gpo: Array<number | null>
  light: Array<number | null>
}

export const DEFAULT_VC3000_LIGHT_CHANNELS: Vc3000LightChannelConfig[] = [
  { channel: 1, brightness: 0, state: 'OFF', edge: 'RISING', durationMs: 1000 },
  { channel: 2, brightness: 0, state: 'OFF', edge: 'RISING', durationMs: 1000 },
  { channel: 3, brightness: 0, state: 'OFF', edge: 'RISING', durationMs: 1000 },
  { channel: 4, brightness: 0, state: 'OFF', edge: 'RISING', durationMs: 1000 },
]
