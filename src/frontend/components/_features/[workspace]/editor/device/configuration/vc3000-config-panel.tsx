import {
  DEFAULT_VC3000_LIGHT_CHANNELS,
  type Vc3000DetectedPort,
  type Vc3000LightChannelConfig,
  type Vc3000LightEdge,
  type Vc3000LightState,
  type Vc3000Polarity,
  type Vc3000Status,
} from '@root/middleware/shared/ports/vc3000-types'
import { useCallback, useEffect, useState } from 'react'

import { Label } from '../../../../../_atoms/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../../../../_atoms/select'

type Vc3000Bridge = {
  vc3000GetStatus?: () => Promise<Vc3000Status>
  vc3000ScanPorts?: (candidatePorts: string[]) => Promise<{ ok: boolean; data?: Vc3000DetectedPort[]; error?: string }>
  vc3000Connect?: (config: {
    comPort: string
    enableGpio: boolean
    diPolarity: Vc3000Polarity
    doPolarity: Vc3000Polarity
    pollIntervalMs: number
    lightChannels?: Vc3000LightChannelConfig[]
  }) => Promise<{ ok: boolean; data?: Vc3000Status; error?: string }>
  vc3000Disconnect?: () => Promise<{ ok: boolean; data?: Vc3000Status; error?: string }>
  vc3000SetPolarity?: (
    target: 'DI' | 'DO',
    polarity: Vc3000Polarity,
  ) => Promise<{ ok: boolean; data?: Vc3000Status; error?: string }>
  vc3000SetLight?: (config: Vc3000LightChannelConfig) => Promise<{ ok: boolean; data?: Vc3000Status; error?: string }>
}

function getBridge(): Vc3000Bridge | undefined {
  return (window as unknown as { bridge?: Vc3000Bridge }).bridge
}

export function Vc3000ConfigPanel({ availablePorts }: { availablePorts: string[] }) {
  const [detectedPorts, setDetectedPorts] = useState<Vc3000DetectedPort[]>([])
  const [scanning, setScanning] = useState<boolean>(false)
  const [comPort, setComPort] = useState<string>('')
  const [enableGpio, setEnableGpio] = useState<boolean>(false)
  const [diPolarity, setDiPolarity] = useState<Vc3000Polarity>('PNP')
  const [doPolarity, setDoPolarity] = useState<Vc3000Polarity>('PNP')
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(50)
  const [lightChannels, setLightChannels] = useState<Vc3000LightChannelConfig[]>(() =>
    DEFAULT_VC3000_LIGHT_CHANNELS.map((c) => ({ ...c })),
  )
  const [status, setStatus] = useState<Vc3000Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<boolean>(false)

  const refreshStatus = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.vc3000GetStatus) return
    try {
      const next = await bridge.vc3000GetStatus()
      setStatus(next)
      if (next.lastError) setError(next.lastError)
    } catch {
      // ignore if bridge unavailable
    }
  }, [])

  const scanForVc3000 = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.vc3000ScanPorts) return
    setScanning(true)
    try {
      const res = await bridge.vc3000ScanPorts(availablePorts)
      if (res.ok && res.data) {
        setDetectedPorts(res.data)
        if (res.data.length > 0) {
          setComPort((prev) => (res.data?.some((d) => d.comPort === prev) ? prev : res.data![0].comPort))
        } else {
          setComPort('')
        }
      } else if (!res.ok && res.error) {
        setError(res.error)
      }
    } finally {
      setScanning(false)
    }
  }, [availablePorts])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const bridge = getBridge()
      if (bridge?.vc3000GetStatus) {
        try {
          const st = await bridge.vc3000GetStatus()
          if (cancelled) return
          setStatus(st)
          if (st.lastError) setError(st.lastError)
          if (st.serialConnected && st.comPort) {
            setDetectedPorts([{ comPort: st.comPort, firmwareVersion: st.firmwareVersion ?? 'Connected' }])
            setComPort(st.comPort)
            return
          }
        } catch {
          // ignore if bridge unavailable
        }
      }
      if (!cancelled && detectedPorts.length === 0) {
        await scanForVc3000()
      }
    })()
    return () => {
      cancelled = true
    }
    // Only auto-scan on mount if no IO board is already connected/found
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnectToggle = async () => {
    const bridge = getBridge()
    if (!bridge?.vc3000Connect || !bridge?.vc3000Disconnect) return
    setBusy(true)
    setError(null)
    try {
      const res = status?.connected
        ? await bridge.vc3000Disconnect()
        : await bridge.vc3000Connect({
            comPort,
            enableGpio,
            diPolarity,
            doPolarity,
            pollIntervalMs,
            lightChannels,
          })
      if (!res.ok) {
        setError(res.error ?? 'Operation failed')
      }
      if (res.data) setStatus(res.data)
    } finally {
      setBusy(false)
    }
  }

  const handlePolarityChange = async (target: 'DI' | 'DO', next: Vc3000Polarity) => {
    if (target === 'DI') setDiPolarity(next)
    else setDoPolarity(next)
    const bridge = getBridge()
    if (status?.connected && bridge?.vc3000SetPolarity) {
      const res = await bridge.vc3000SetPolarity(target, next)
      if (!res.ok) setError(res.error ?? 'Failed to update polarity')
      if (res.data) setStatus(res.data)
    }
  }

  const handleLightChange = async (idx: number, patch: Partial<Vc3000LightChannelConfig>) => {
    const updated = { ...lightChannels[idx], ...patch }
    setLightChannels((prev) => prev.map((ch, i) => (i === idx ? updated : ch)))
    const bridge = getBridge()
    if (status?.connected && bridge?.vc3000SetLight) {
      const res = await bridge.vc3000SetLight(updated)
      if (!res.ok) setError(res.error ?? 'Failed to update light channel')
      if (res.data) setStatus(res.data)
    }
  }

  return (
    <div id='vc3000-config-panel' className='flex w-full flex-col gap-5 pt-2'>
      <hr className='h-[1px] w-full self-stretch bg-brand-light' />

      <div className='flex items-center justify-between'>
        <div className='flex flex-col'>
          <h2 className='text-lg font-medium text-neutral-950 dark:text-white'>HIK VC3000 Configuration</h2>
          {status?.firmwareVersion && (
            <span className='text-xs text-neutral-600 dark:text-neutral-400'>FW: {status.firmwareVersion}</span>
          )}
        </div>
        <div className='flex items-center gap-3'>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              status?.connected
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
            }`}
          >
            {status?.connected ? 'Connected' : 'Disconnected'}
          </span>
          <button
            type='button'
            disabled={busy}
            onClick={handleConnectToggle}
            className='h-8 rounded-md bg-brand px-4 font-caption text-xs font-medium text-white hover:bg-brand-medium-dark disabled:opacity-50'
          >
            {status?.connected ? 'Disconnect' : 'Connect VC3000'}
          </button>
        </div>
      </div>

      {error && (
        <div className='rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400'>
          {error}
        </div>
      )}

      <div className='grid grid-cols-2 gap-4'>
        <div className='flex flex-col gap-1.5'>
          <Label className='text-xs text-neutral-950 dark:text-white'>Serial IO Board COM Port</Label>
          <div className='flex items-center gap-2'>
            <Select value={comPort || '__none__'} onValueChange={(v) => setComPort(v === '__none__' ? '' : v)}>
              <SelectTrigger className='h-[30px] w-full rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-850 dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'>
                {scanning
                  ? 'Scanning COM ports...'
                  : detectedPorts.length === 0
                    ? 'IO board not available'
                    : (() => {
                        const match = detectedPorts.find((d) => d.comPort === comPort)
                        return match ? `${match.comPort} (FW ${match.firmwareVersion})` : 'Select VC3000 COM port'
                      })()}
              </SelectTrigger>
              <SelectContent className='z-50 rounded-md border border-neutral-300 bg-white p-1 shadow-md dark:border-neutral-850 dark:bg-neutral-950'>
                {detectedPorts.length === 0 ? (
                  <SelectItem value='__none__'>IO board not available</SelectItem>
                ) : (
                  detectedPorts.map((d) => (
                    <SelectItem key={d.comPort} value={d.comPort}>
                      {d.comPort} (FW {d.firmwareVersion})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <button
              type='button'
              disabled={scanning || busy}
              onClick={() => void scanForVc3000()}
              className='h-[30px] shrink-0 rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-850 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-850 dark:text-neutral-200 dark:hover:bg-neutral-900'
            >
              {scanning ? 'Scanning...' : 'Scan'}
            </button>
          </div>
        </div>

        <div className='flex flex-col gap-1.5'>
          <Label className='text-xs text-neutral-950 dark:text-white'>Input Polarity (DI / GPI)</Label>
          <Select value={diPolarity} onValueChange={(v) => void handlePolarityChange('DI', v as Vc3000Polarity)}>
            <SelectTrigger className='h-[30px] w-full rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-850 dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'>
              {diPolarity === 'PNP' ? 'PNP (Active High - Default)' : 'NPN (Active Low)'}
            </SelectTrigger>
            <SelectContent className='z-50 rounded-md border border-neutral-300 bg-white p-1 shadow-md dark:border-neutral-850 dark:bg-neutral-950'>
              <SelectItem value='PNP'>PNP (Active High - Default)</SelectItem>
              <SelectItem value='NPN'>NPN (Active Low)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='flex flex-col gap-1.5'>
          <Label className='text-xs text-neutral-950 dark:text-white'>Output Polarity (DO / GPO)</Label>
          <Select value={doPolarity} onValueChange={(v) => void handlePolarityChange('DO', v as Vc3000Polarity)}>
            <SelectTrigger className='h-[30px] w-full rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-850 dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'>
              {doPolarity === 'PNP' ? 'PNP (Active High - Default)' : 'NPN (Active Low)'}
            </SelectTrigger>
            <SelectContent className='z-50 rounded-md border border-neutral-300 bg-white p-1 shadow-md dark:border-neutral-850 dark:bg-neutral-950'>
              <SelectItem value='PNP'>PNP (Active High - Default)</SelectItem>
              <SelectItem value='NPN'>NPN (Active Low)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='flex flex-col gap-1.5'>
          <Label className='text-xs text-neutral-950 dark:text-white'>Scan Poll Interval (10–100 ms)</Label>
          <input
            type='number'
            min={10}
            max={100}
            value={pollIntervalMs}
            onChange={(e) => setPollIntervalMs(Math.max(10, Math.min(100, Number(e.target.value) || 50)))}
            className='h-[30px] rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-850 outline-none dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'
          />
        </div>

        <div className='flex items-center gap-2 pt-5'>
          <input
            id='vc3000-enable-gpio'
            type='checkbox'
            checked={enableGpio}
            onChange={(e) => setEnableGpio(e.target.checked)}
            className='h-4 w-4 rounded border-neutral-300 accent-brand'
          />
          <Label htmlFor='vc3000-enable-gpio' className='text-xs text-neutral-950 dark:text-white'>
            Enable Mainboard GPIO (WinIO — requires Admin)
          </Label>
        </div>
      </div>

      <div className='flex flex-col gap-2'>
        <Label className='text-xs font-semibold text-neutral-950 dark:text-white'>
          Light Source Controller (4 Channels — %QW10 to %QW13)
        </Label>
        <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
          {lightChannels.map((ch, idx) => (
            <div
              key={ch.channel}
              className='flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-850'
            >
              <div className='flex items-center justify-between text-xs font-medium text-neutral-950 dark:text-white'>
                <span>
                  Channel {ch.channel} (%QW{9 + ch.channel})
                </span>
                <span>{ch.brightness}%</span>
              </div>
              <input
                type='range'
                min={0}
                max={100}
                value={ch.brightness}
                onChange={(e) => void handleLightChange(idx, { brightness: Number(e.target.value) })}
                className='w-full accent-brand'
              />
              <div className='grid grid-cols-3 gap-2'>
                <Select
                  value={ch.state}
                  onValueChange={(v) => void handleLightChange(idx, { state: v as Vc3000LightState })}
                >
                  <SelectTrigger className='h-[28px] px-2 text-[11px]'>{ch.state}</SelectTrigger>
                  <SelectContent className='z-50 rounded-md border border-neutral-300 bg-white p-1 shadow-md dark:border-neutral-850 dark:bg-neutral-950'>
                    <SelectItem value='ON'>ON</SelectItem>
                    <SelectItem value='OFF'>OFF</SelectItem>
                    <SelectItem value='TRIGGER'>TRIGGER</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={ch.edge}
                  onValueChange={(v) => void handleLightChange(idx, { edge: v as Vc3000LightEdge })}
                >
                  <SelectTrigger className='h-[28px] px-2 text-[11px]'>{ch.edge}</SelectTrigger>
                  <SelectContent className='z-50 rounded-md border border-neutral-300 bg-white p-1 shadow-md dark:border-neutral-850 dark:bg-neutral-950'>
                    <SelectItem value='RISING'>RISING</SelectItem>
                    <SelectItem value='FALLING'>FALLING</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type='number'
                  min={1}
                  value={ch.durationMs}
                  onChange={(e) => void handleLightChange(idx, { durationMs: Number(e.target.value) || 1000 })}
                  title='Duration (ms)'
                  className='h-[28px] rounded-md border border-neutral-300 bg-white px-2 text-[11px] text-neutral-850 outline-none dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className='rounded-md border border-neutral-200 p-3 text-xs text-neutral-700 dark:border-neutral-850 dark:text-neutral-300'>
        <div className='mb-1 font-semibold text-neutral-950 dark:text-white'>IEC Address Mapping</div>
        <div className='grid grid-cols-2 gap-1'>
          <span>DI1–DI8 (Serial Board): %IX0.0 – %IX0.7</span>
          <span>DO1–DO16 (Serial Board): %QX0.0 – %QX1.7</span>
          <span>GPI1–GPI8 (Mainboard): %IX1.0 – %IX1.7</span>
          <span>GPO1–GPO8 (Mainboard): %QX2.0 – %QX2.7</span>
          <span>Light CH1–CH4 (0–100): %QW10 – %QW13</span>
        </div>
      </div>
    </div>
  )
}
