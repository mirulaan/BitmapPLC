import {
  DEFAULT_VC3000_LIGHT_CHANNELS,
  type Vc3000ActionResult,
  type Vc3000ConnectConfig,
  type Vc3000DetectedPort,
  type Vc3000IoSnapshot,
  type Vc3000LightChannelConfig,
  type Vc3000Polarity,
  type Vc3000Status,
} from '../../../middleware/shared/ports/vc3000-types'
import {
  formatMvError,
  isVc3000PlatformSupported,
  loadVc3000NativeApi,
  MV_GIO_HIGH,
  MV_GIO_LOW,
  MV_IO_EDGE_FALLING,
  MV_IO_EDGE_RISING,
  MV_IO_ENABLE_END,
  MV_IO_ENABLE_NPN,
  MV_IO_ENABLE_PNP,
  MV_IO_ENABLE_START,
  MV_IO_LIGHTSTATE_OFF,
  MV_IO_LIGHTSTATE_ON,
  MV_IO_LIGHTSTATE_TRIGGER,
  MV_IO_PATTERN_PWM,
  MV_IO_PATTERN_SINGLE,
  MV_OK,
  type Vc3000NativeApi,
} from './vc3000-ffi'

const DI_COUNT = 8
const GPI_COUNT = 8
const DO_COUNT = 16
const GPO_COUNT = 8

function createEmptySnapshot(): Vc3000IoSnapshot {
  return {
    di: Array<boolean>(DI_COUNT).fill(false),
    gpi: Array<boolean>(GPI_COUNT).fill(false),
    doState: Array<boolean>(DO_COUNT).fill(false),
    gpo: Array<boolean>(GPO_COUNT).fill(false),
    lightBrightness: [0, 0, 0, 0],
  }
}

function encodeComName(comPort: string): number[] {
  const bytes = Array<number>(64).fill(0)
  for (let i = 0; i < Math.min(comPort.length, 63); i++) {
    bytes[i] = comPort.charCodeAt(i) & 0xff
  }
  return bytes
}

function formatVersion(v: Record<string, unknown>): string {
  const y = Number(v.nYear ?? 0)
  const m = Number(v.nMonth ?? 0)
  const d = Number(v.nDay ?? 0)
  const maj = Number(v.nMainVersion ?? 0)
  const min = Number(v.nSubVersion ?? 0)
  const mod = Number(v.nModifyVersion ?? 0)
  return `${maj}.${min}.${mod} (${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')})`
}

export class Vc3000Service {
  private readonly loadApi: () => Vc3000NativeApi
  private api: Vc3000NativeApi | null = null
  private serialHandle: unknown = null
  private serialConnected = false
  private gpioConnected = false
  private comPort = ''
  private diPolarity: Vc3000Polarity = 'PNP'
  private doPolarity: Vc3000Polarity = 'PNP'
  private pollIntervalMs = 50
  private sdkVersion: string | null = null
  private firmwareVersion: string | null = null
  private lastError: string | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private snapshot: Vc3000IoSnapshot = createEmptySnapshot()
  private lightChannels: Vc3000LightChannelConfig[] = DEFAULT_VC3000_LIGHT_CHANNELS.map((c) => ({ ...c }))

  constructor(loadApi: () => Vc3000NativeApi = loadVc3000NativeApi) {
    this.loadApi = loadApi
  }

  getStatus(): Vc3000Status {
    return {
      supported: isVc3000PlatformSupported(),
      connected: this.serialConnected || this.gpioConnected,
      serialConnected: this.serialConnected,
      gpioConnected: this.gpioConnected,
      comPort: this.comPort,
      diPolarity: this.diPolarity,
      doPolarity: this.doPolarity,
      pollIntervalMs: this.pollIntervalMs,
      sdkVersion: this.sdkVersion,
      firmwareVersion: this.firmwareVersion,
      lastError: this.lastError,
      snapshot: {
        di: [...this.snapshot.di],
        gpi: [...this.snapshot.gpi],
        doState: [...this.snapshot.doState],
        gpo: [...this.snapshot.gpo],
        lightBrightness: [...this.snapshot.lightBrightness] as [number, number, number, number],
      },
      lightChannels: this.lightChannels.map((c) => ({ ...c })),
    }
  }

  connect(config: Vc3000ConnectConfig): Vc3000ActionResult<Vc3000Status> {
    this.disconnect()

    try {
      this.api = this.loadApi()
      this.diPolarity = config.diPolarity
      this.doPolarity = config.doPolarity
      this.pollIntervalMs = Math.max(10, Math.min(100, Math.round(config.pollIntervalMs || 50)))
      this.comPort = config.comPort.trim()
      if (config.lightChannels && config.lightChannels.length === 4) {
        this.lightChannels = config.lightChannels.map((c) => ({ ...c }))
      }

      const sdkVerOut: Record<string, unknown> = { nReserved: Array<number>(8).fill(0) }
      if (this.api.MV_IO_GetSDKVersion(sdkVerOut) === MV_OK) {
        this.sdkVersion = formatVersion(sdkVerOut)
      }

      if (this.comPort) {
        const handleOut: [unknown] = [null]
        let ret = this.api.MV_IO_CreateHandle(handleOut)
        if (ret !== MV_OK) {
          throw new Error(`MV_IO_CreateHandle failed: ${formatMvError(ret)}`)
        }
        this.serialHandle = handleOut[0]

        ret = this.api.MV_IO_Open(this.serialHandle, {
          strComName: encodeComName(this.comPort),
          nReserved: Array<number>(8).fill(0),
        })
        if (ret !== MV_OK) {
          this.api.MV_IO_DestroyHandle(this.serialHandle)
          this.serialHandle = null
          throw new Error(`MV_IO_Open(${this.comPort}) failed: ${formatMvError(ret)}`)
        }

        const fwVerOut: Record<string, unknown> = { nReserved: Array<number>(8).fill(0) }
        if (this.api.MV_IO_GetFirmwareVersion(this.serialHandle, fwVerOut) !== MV_OK) {
          this.api.MV_IO_Close(this.serialHandle)
          this.api.MV_IO_DestroyHandle(this.serialHandle)
          this.serialHandle = null
          throw new Error(`VC3000 IO board not available on ${this.comPort} (no firmware response)`)
        }
        this.firmwareVersion = formatVersion(fwVerOut)

        const pnpVal = this.doPolarity === 'NPN' ? MV_IO_ENABLE_NPN : MV_IO_ENABLE_PNP
        this.api.MV_IO_ExcutePNPEnable(this.serialHandle, pnpVal)
        this.serialConnected = true

        for (const ch of this.lightChannels) {
          this.applyLightChannel(ch)
        }
      }

      if (config.enableGpio) {
        let ret = this.api.MV_IO_WinIO_Init()
        if (ret !== MV_OK) {
          throw new Error(`MV_IO_WinIO_Init failed (Admin privileges required): ${formatMvError(ret)}`)
        }
        ret = this.api.MV_IO_MainIOInit()
        if (ret !== MV_OK) {
          this.api.MV_IO_WinIO_DeInit()
          throw new Error(`MV_IO_MainIOInit failed: ${formatMvError(ret)}`)
        }
        this.api.MV_IO_SetMainGPO_NPN(this.doPolarity === 'NPN' ? 2 : 1)
        this.gpioConnected = true
      }

      this.lastError = null
      this.startPolling()
      return { ok: true, data: this.getStatus() }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      this.disconnect()
      this.lastError = msg
      return { ok: false, error: msg }
    }
  }

  scanPorts(candidatePorts: string[]): Vc3000ActionResult<Vc3000DetectedPort[]> {
    if (!isVc3000PlatformSupported() && this.loadApi === loadVc3000NativeApi) {
      return { ok: false, error: 'HIK VC3000 SDK is only supported on Windows x64.' }
    }
    try {
      const api = this.api ?? this.loadApi()
      const ports = candidatePorts.length > 0 ? candidatePorts : Array.from({ length: 12 }, (_, i) => `COM${i + 1}`)
      const detected: Vc3000DetectedPort[] = []

      for (const port of ports) {
        const clean = port.trim()
        if (!clean) continue
        if (this.serialConnected && clean.toUpperCase() === this.comPort.toUpperCase()) {
          detected.push({ comPort: this.comPort, firmwareVersion: this.firmwareVersion ?? 'Connected' })
          continue
        }
        const handleOut: [unknown] = [null]
        if (api.MV_IO_CreateHandle(handleOut) !== MV_OK || !handleOut[0]) continue
        const h = handleOut[0]
        try {
          const openRet = api.MV_IO_Open(h, {
            strComName: encodeComName(clean),
            nReserved: Array<number>(8).fill(0),
          })
          if (openRet === MV_OK) {
            const fwVerOut: Record<string, unknown> = { nReserved: Array<number>(8).fill(0) }
            if (api.MV_IO_GetFirmwareVersion(h, fwVerOut) === MV_OK) {
              detected.push({ comPort: clean, firmwareVersion: formatVersion(fwVerOut) })
            }
            api.MV_IO_Close(h)
          }
        } finally {
          api.MV_IO_DestroyHandle(h)
        }
      }
      return { ok: true, data: detected }
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  disconnect(): Vc3000ActionResult<Vc3000Status> {
    this.stopPolling()

    if (this.api && this.serialHandle !== null) {
      try {
        this.api.MV_IO_Close(this.serialHandle)
      } catch {
        // ignore close error on teardown
      }
      try {
        this.api.MV_IO_DestroyHandle(this.serialHandle)
      } catch {
        // ignore destroy error on teardown
      }
    }
    this.serialHandle = null
    this.serialConnected = false

    if (this.api && this.gpioConnected) {
      try {
        this.api.MV_IO_WinIO_DeInit()
      } catch {
        // ignore deinit error on teardown
      }
    }
    this.gpioConnected = false
    this.snapshot = createEmptySnapshot()

    return { ok: true, data: this.getStatus() }
  }

  setPolarity(target: 'DI' | 'DO', polarity: Vc3000Polarity): Vc3000ActionResult<Vc3000Status> {
    if (target === 'DI') {
      this.diPolarity = polarity
      return { ok: true, data: this.getStatus() }
    }
    this.doPolarity = polarity
    if (this.api && this.serialConnected && this.serialHandle !== null) {
      const ret = this.api.MV_IO_ExcutePNPEnable(
        this.serialHandle,
        polarity === 'NPN' ? MV_IO_ENABLE_NPN : MV_IO_ENABLE_PNP,
      )
      if (ret !== MV_OK) {
        const error = `MV_IO_ExcutePNPEnable failed: ${formatMvError(ret)}`
        this.lastError = error
        return { ok: false, error }
      }
    }
    if (this.api && this.gpioConnected) {
      const ret = this.api.MV_IO_SetMainGPO_NPN(polarity === 'NPN' ? 2 : 1)
      if (ret !== MV_OK) {
        const error = `MV_IO_SetMainGPO_NPN failed: ${formatMvError(ret)}`
        this.lastError = error
        return { ok: false, error }
      }
    }
    return { ok: true, data: this.getStatus() }
  }

  setLightChannel(config: Vc3000LightChannelConfig): Vc3000ActionResult<Vc3000Status> {
    const idx = config.channel - 1
    if (idx < 0 || idx >= 4) {
      return { ok: false, error: `Invalid light channel ${config.channel}` }
    }
    const clamped: Vc3000LightChannelConfig = {
      ...config,
      brightness: Math.max(0, Math.min(100, Math.round(config.brightness))),
      durationMs: Math.max(1, Math.round(config.durationMs)),
    }
    this.lightChannels[idx] = clamped
    this.snapshot.lightBrightness[idx] = clamped.brightness

    if (this.serialConnected && this.serialHandle !== null && this.api) {
      const err = this.applyLightChannel(clamped)
      if (err) {
        this.lastError = err
        return { ok: false, error: err }
      }
    }
    return { ok: true, data: this.getStatus() }
  }

  setOutputChannel(target: 'DO' | 'GPO', channel: number, active: boolean): Vc3000ActionResult<Vc3000Status> {
    if (target === 'DO') {
      if (channel < 1 || channel > DO_COUNT) {
        return { ok: false, error: `Invalid DO channel ${channel}` }
      }
      if (!this.serialConnected || this.serialHandle === null) {
        return { ok: false, error: 'Serial IO board is not connected' }
      }
      this.snapshot.doState[channel - 1] = active
      const err = this.writeSerialDo(channel, active)
      if (err) {
        this.lastError = err
        return { ok: false, error: err, data: this.getStatus() }
      }
      return { ok: true, data: this.getStatus() }
    }

    if (channel < 1 || channel > GPO_COUNT) {
      return { ok: false, error: `Invalid GPO channel ${channel}` }
    }
    if (!this.gpioConnected) {
      return { ok: false, error: 'Mainboard GPIO is not connected' }
    }
    this.snapshot.gpo[channel - 1] = active
    this.writeGpo(channel, active)
    return { ok: true, data: this.getStatus() }
  }

  clearAllOutputs(): Vc3000ActionResult<Vc3000Status> {
    if (this.serialConnected && this.serialHandle !== null) {
      for (let i = 0; i < DO_COUNT; i++) {
        this.snapshot.doState[i] = false
        this.writeSerialDo(i + 1, false)
      }
    }
    if (this.gpioConnected) {
      for (let i = 0; i < GPO_COUNT; i++) {
        this.snapshot.gpo[i] = false
        this.writeGpo(i + 1, false)
      }
    }
    return { ok: true, data: this.getStatus() }
  }

  /**
   * Synchronous scan-cycle I/O exchange:
   * 1. Writes DO1-DO16 (%QX0.0-%QX1.7), GPO1-GPO8 (%QX2.0-%QX2.7), and Light1-4 (%QW10-%QW13)
   * 2. Reads DI1-DI8 (%IX0.0-%IX0.7) and GPI1-GPI8 (%IX1.0-%IX1.7)
   */
  syncScanCycle(outputs?: {
    doState?: boolean[]
    gpo?: boolean[]
    lightBrightness?: [number, number, number, number]
  }): Vc3000IoSnapshot {
    if (outputs?.doState) {
      for (let i = 0; i < Math.min(DO_COUNT, outputs.doState.length); i++) {
        const next = Boolean(outputs.doState[i])
        if (next !== this.snapshot.doState[i]) {
          this.snapshot.doState[i] = next
          this.writeSerialDo(i + 1, next)
        }
      }
    }

    if (outputs?.gpo) {
      for (let i = 0; i < Math.min(GPO_COUNT, outputs.gpo.length); i++) {
        const next = Boolean(outputs.gpo[i])
        if (next !== this.snapshot.gpo[i]) {
          this.snapshot.gpo[i] = next
          this.writeGpo(i + 1, next)
        }
      }
    }

    if (outputs?.lightBrightness) {
      for (let i = 0; i < 4; i++) {
        const next = Math.max(0, Math.min(100, Math.round(outputs.lightBrightness[i])))
        if (next !== this.snapshot.lightBrightness[i]) {
          this.lightChannels[i].brightness = next
          this.snapshot.lightBrightness[i] = next
          if (this.serialConnected) {
            this.applyLightChannel(this.lightChannels[i])
          }
        }
      }
    }

    this.pollInputs()
    return {
      di: [...this.snapshot.di],
      gpi: [...this.snapshot.gpi],
      doState: [...this.snapshot.doState],
      gpo: [...this.snapshot.gpo],
      lightBrightness: [...this.snapshot.lightBrightness] as [number, number, number, number],
    }
  }

  private pollInputs(): void {
    if (!this.api) return

    if (this.serialConnected && this.serialHandle !== null) {
      const levelOut: Record<string, unknown> = {
        nPortNumber: 0xff,
        nLevel0: 0,
        nLevel1: 0,
        nLevel2: 0,
        nLevel3: 0,
        nLevel4: 0,
        nLevel5: 0,
        nLevel6: 0,
        nLevel7: 0,
        nReserved: Array<number>(8).fill(0),
      }
      if (this.api.MV_IO_GetInputLevel(this.serialHandle, levelOut) === MV_OK) {
        const isNpn = this.diPolarity === 'NPN'
        for (let i = 0; i < DI_COUNT; i++) {
          const rawHigh = Number(levelOut[`nLevel${i}`] ?? 0) !== 0
          this.snapshot.di[i] = isNpn ? !rawHigh : rawHigh
        }
      }
    }

    if (this.gpioConnected) {
      const statusBuf = new Uint8Array(1)
      if (this.api.MV_IO_GetMainInputLevel(statusBuf) === MV_OK) {
        const mask = statusBuf[0]
        const isNpn = this.diPolarity === 'NPN'
        for (let i = 0; i < GPI_COUNT; i++) {
          const rawHigh = (mask & (1 << i)) !== 0
          this.snapshot.gpi[i] = isNpn ? !rawHigh : rawHigh
        }
      }
    }
  }

  private writeSerialDo(channel: number, active: boolean): string | null {
    if (!this.api || !this.serialConnected || this.serialHandle === null) return null
    const portMask = 1 << (channel - 1)
    if (active) {
      // In NPN mode, active state is logic 0 (sinking to GND); in PNP mode, active state is logic 1 (+24V).
      const validLevel = this.doPolarity === 'NPN' ? 0 : 1
      // Try continuous-style PWM (nPulseWidth < nPulsePeriod, non-zero nDurationTime divisible by nPulsePeriod),
      // then fall back to SINGLE with large valid durations (avoiding 0 which means 0 pulses / 0ms).
      const candidates = [
        {
          nPort: portMask,
          nType: MV_IO_PATTERN_PWM,
          nPulseWidth: 999,
          nPulsePeriod: 1000,
          nDurationTime: 10000000,
          nValidLevel: validLevel,
          nReserved: Array<number>(8).fill(0),
        },
        {
          nPort: portMask,
          nType: MV_IO_PATTERN_PWM,
          nPulseWidth: 999,
          nPulsePeriod: 1000,
          nDurationTime: 60000,
          nValidLevel: validLevel,
          nReserved: Array<number>(8).fill(0),
        },
        {
          nPort: portMask,
          nType: MV_IO_PATTERN_SINGLE,
          nPulseWidth: 0,
          nPulsePeriod: 0,
          nDurationTime: 10000000,
          nValidLevel: validLevel,
          nReserved: Array<number>(8).fill(0),
        },
        {
          nPort: portMask,
          nType: MV_IO_PATTERN_SINGLE,
          nPulseWidth: 0,
          nPulsePeriod: 0,
          nDurationTime: 60000,
          nValidLevel: validLevel,
          nReserved: Array<number>(8).fill(0),
        },
        {
          nPort: portMask,
          nType: MV_IO_PATTERN_SINGLE,
          nPulseWidth: 0,
          nPulsePeriod: 0,
          nDurationTime: 0xffffffff,
          nValidLevel: validLevel,
          nReserved: Array<number>(8).fill(0),
        },
      ]
      let setRet = MV_OK
      for (const cfg of candidates) {
        setRet = this.api.MV_IO_SetOutput(this.serialHandle, cfg)
        if (setRet === MV_OK) break
      }
      if (setRet !== MV_OK) {
        return `MV_IO_SetOutput(DO${channel}) failed: ${formatMvError(setRet)}`
      }
      const enRet = this.api.MV_IO_SetOutputEnable(this.serialHandle, {
        nPortNumber: portMask,
        nType: MV_IO_ENABLE_START,
        nReserved: Array<number>(4).fill(0),
      })
      if (enRet !== MV_OK) {
        return `MV_IO_SetOutputEnable(DO${channel}, START) failed: ${formatMvError(enRet)}`
      }
    } else {
      const enRet = this.api.MV_IO_SetOutputEnable(this.serialHandle, {
        nPortNumber: portMask,
        nType: MV_IO_ENABLE_END,
        nReserved: Array<number>(4).fill(0),
      })
      if (enRet !== MV_OK) {
        return `MV_IO_SetOutputEnable(DO${channel}, END) failed: ${formatMvError(enRet)}`
      }
    }
    return null
  }

  private writeGpo(channel: number, active: boolean): void {
    if (!this.api || !this.gpioConnected) return
    const portMask = 1 << (channel - 1)
    this.api.MV_IO_SetMainOutputLevel(portMask, active ? MV_GIO_HIGH : MV_GIO_LOW)
  }

  private applyLightChannel(ch: Vc3000LightChannelConfig): string | null {
    if (!this.api || this.serialHandle === null) return null
    const stateMap = {
      ON: MV_IO_LIGHTSTATE_ON,
      OFF: MV_IO_LIGHTSTATE_OFF,
      TRIGGER: MV_IO_LIGHTSTATE_TRIGGER,
    }
    const ret = this.api.MV_IO_SetLightParam(this.serialHandle, {
      nPortNumber: ch.channel - 1,
      nLightValue: ch.brightness,
      nLightState: stateMap[ch.state],
      nLightEdge: ch.edge === 'FALLING' ? MV_IO_EDGE_FALLING : MV_IO_EDGE_RISING,
      nDurationTime: ch.durationMs,
      nReserved: Array<number>(3).fill(0),
    })
    return ret === MV_OK ? null : `MV_IO_SetLightParam(CH${ch.channel}) failed: ${formatMvError(ret)}`
  }

  private startPolling(): void {
    this.stopPolling()
    this.pollTimer = setInterval(() => {
      this.pollInputs()
    }, this.pollIntervalMs)
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}

export const vc3000Service = new Vc3000Service()
