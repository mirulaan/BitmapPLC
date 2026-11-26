import { MV_IO_ENABLE_NPN, MV_IO_ENABLE_PNP, MV_OK, type Vc3000NativeApi } from '../vc3000-ffi'
import { Vc3000Service } from '../vc3000-service'

function createMockApi(): Vc3000NativeApi {
  return {
    MV_IO_CreateHandle: jest.fn((out: [unknown]) => {
      out[0] = { mockHandle: 1 }
      return MV_OK
    }),
    MV_IO_DestroyHandle: jest.fn(() => MV_OK),
    MV_IO_GetSDKVersion: jest.fn((v) => {
      v.nMainVersion = 2
      v.nSubVersion = 0
      v.nModifyVersion = 0
      v.nYear = 2024
      v.nMonth = 3
      v.nDay = 18
      return MV_OK
    }),
    MV_IO_Open: jest.fn(() => MV_OK),
    MV_IO_Close: jest.fn(() => MV_OK),
    MV_IO_GetFirmwareVersion: jest.fn((_h, v) => {
      v.nMainVersion = 1
      v.nSubVersion = 2
      v.nModifyVersion = 0
      v.nYear = 2024
      v.nMonth = 1
      v.nDay = 10
      return MV_OK
    }),
    MV_IO_SetInput: jest.fn(() => MV_OK),
    MV_IO_SetOutput: jest.fn(() => MV_OK),
    MV_IO_SetOutputEnable: jest.fn(() => MV_OK),
    MV_IO_ExcutePNPEnable: jest.fn(() => MV_OK),
    MV_IO_GetPNPEnable: jest.fn(() => MV_OK),
    MV_IO_GetInputLevel: jest.fn((_h, levelOut) => {
      levelOut.nLevel0 = 1
      levelOut.nLevel1 = 0
      levelOut.nLevel2 = 1
      return MV_OK
    }),
    MV_IO_SetLightParam: jest.fn(() => MV_OK),
    MV_IO_GetLightParam: jest.fn(() => MV_OK),
    MV_IO_WinIO_Init: jest.fn(() => MV_OK),
    MV_IO_WinIO_DeInit: jest.fn(() => MV_OK),
    MV_IO_MainIOInit: jest.fn(() => MV_OK),
    MV_IO_GetMainInputLevel: jest.fn((buf: Uint8Array) => {
      buf[0] = 0b00000101 // GPI1=1, GPI3=1
      return MV_OK
    }),
    MV_IO_SetMainOutputLevel: jest.fn(() => MV_OK),
    MV_IO_SetMainGPO_NPN: jest.fn(() => MV_OK),
  }
}

describe('Vc3000Service', () => {
  it('connects Serial IO, Mainboard GPIO, and Light Controller, then disconnects cleanly', () => {
    const api = createMockApi()
    const svc = new Vc3000Service(() => api)

    const res = svc.connect({
      comPort: 'COM3',
      enableGpio: true,
      diPolarity: 'PNP',
      doPolarity: 'PNP',
      pollIntervalMs: 50,
    })

    expect(res.ok).toBe(true)
    expect(res.data?.connected).toBe(true)
    expect(res.data?.serialConnected).toBe(true)
    expect(res.data?.gpioConnected).toBe(true)
    expect(res.data?.sdkVersion).toBe('2.0.0 (2024-03-18)')
    expect(res.data?.firmwareVersion).toBe('1.2.0 (2024-01-10)')
    expect(api.MV_IO_ExcutePNPEnable).toHaveBeenCalledWith(expect.anything(), MV_IO_ENABLE_PNP)
    expect(api.MV_IO_SetLightParam).toHaveBeenCalledTimes(4)

    svc.disconnect()
    expect(api.MV_IO_Close).toHaveBeenCalledTimes(1)
    expect(api.MV_IO_DestroyHandle).toHaveBeenCalledTimes(1)
    expect(api.MV_IO_WinIO_DeInit).toHaveBeenCalledTimes(1)
    expect(svc.getStatus().connected).toBe(false)
  })

  it('syncs DO, GPO, Light brightness, and reads DI/GPI with PNP and NPN polarity', () => {
    const api = createMockApi()
    const svc = new Vc3000Service(() => api)

    svc.connect({
      comPort: 'COM3',
      enableGpio: true,
      diPolarity: 'PNP',
      doPolarity: 'PNP',
      pollIntervalMs: 100,
    })

    const doArr = Array<boolean>(16).fill(false)
    doArr[0] = true
    const gpoArr = Array<boolean>(8).fill(false)
    gpoArr[1] = true

    const snapPnp = svc.syncScanCycle({
      doState: doArr,
      gpo: gpoArr,
      lightBrightness: [75, 0, 0, 0],
    })

    expect(snapPnp.di[0]).toBe(true)
    expect(snapPnp.di[1]).toBe(false)
    expect(snapPnp.di[2]).toBe(true)
    expect(snapPnp.gpi[0]).toBe(true)
    expect(snapPnp.gpi[1]).toBe(false)
    expect(snapPnp.gpi[2]).toBe(true)
    expect(snapPnp.lightBrightness[0]).toBe(75)
    expect(api.MV_IO_SetOutput).toHaveBeenCalled()
    expect(api.MV_IO_SetMainOutputLevel).toHaveBeenCalledWith(0x2, 1)

    svc.setPolarity('DO', 'NPN')
    expect(api.MV_IO_ExcutePNPEnable).toHaveBeenCalledWith(expect.anything(), MV_IO_ENABLE_NPN)

    svc.setPolarity('DI', 'NPN')
    const snapNpn = svc.syncScanCycle()
    expect(snapNpn.di[0]).toBe(false)
    expect(snapNpn.di[1]).toBe(true)
    expect(snapNpn.gpi[0]).toBe(false)
    expect(snapNpn.gpi[1]).toBe(true)

    svc.disconnect()
  })

  it('scanPorts only returns COM ports where MV_IO_GetFirmwareVersion succeeds', () => {
    const api = createMockApi()
    let currentPort = ''
    api.MV_IO_Open = jest.fn((_h, serialIn) => {
      const bytes = serialIn.strComName as number[]
      currentPort = String.fromCharCode(...bytes.filter((b) => b !== 0))
      return MV_OK
    })
    api.MV_IO_GetFirmwareVersion = jest.fn((_h, v) => {
      if (currentPort !== 'COM3') return 0x80000004
      v.nMainVersion = 1
      v.nSubVersion = 2
      v.nModifyVersion = 0
      v.nYear = 2024
      v.nMonth = 1
      v.nDay = 10
      return MV_OK
    })

    const svc = new Vc3000Service(() => api)
    const res = svc.scanPorts(['COM1', 'COM2', 'COM3'])
    expect(res.ok).toBe(true)
    expect(res.data).toEqual([{ comPort: 'COM3', firmwareVersion: '1.2.0 (2024-01-10)' }])
  })
})
