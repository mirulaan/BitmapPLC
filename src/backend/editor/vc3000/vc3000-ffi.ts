import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const MV_OK = 0x00000000

export const MV_IO_PATTERN_PWM = 0x05
export const MV_IO_PATTERN_SINGLE = 0x06

export const MV_IO_EDGE_UNKNOWN = 0x00
export const MV_IO_EDGE_RISING = 0x01
export const MV_IO_EDGE_FALLING = 0x02

export const MV_IO_ENABLE_START = 0x00
export const MV_IO_ENABLE_END = 0x01

export const MV_IO_ENABLE_PNP = 0x01
export const MV_IO_ENABLE_NPN = 0x02

export const MV_IO_LIGHTSTATE_ON = 0x0001
export const MV_IO_LIGHTSTATE_OFF = 0x0002
export const MV_IO_LIGHTSTATE_TRIGGER = 0x0003

export const MV_GIO_LOW = 0x00
export const MV_GIO_HIGH = 0x01

export interface Vc3000NativeApi {
  MV_IO_CreateHandle(handleOut: [unknown]): number
  MV_IO_DestroyHandle(handle: unknown): number
  MV_IO_GetSDKVersion(versionOut: Record<string, unknown>): number
  MV_IO_Open(handle: unknown, serialIn: Record<string, unknown>): number
  MV_IO_Close(handle: unknown): number
  MV_IO_GetFirmwareVersion(handle: unknown, versionOut: Record<string, unknown>): number
  MV_IO_SetInput(handle: unknown, inputIn: Record<string, unknown>): number
  MV_IO_SetOutput(handle: unknown, outputIn: Record<string, unknown>): number
  MV_IO_SetOutputEnable(handle: unknown, enableIn: Record<string, unknown>): number
  MV_IO_ExcutePNPEnable(handle: unknown, pnpType: number): number
  MV_IO_GetPNPEnable(handle: unknown, pnpTypeOut: [number]): number
  MV_IO_GetInputLevel(handle: unknown, levelOut: Record<string, unknown>): number
  MV_IO_SetLightParam(handle: unknown, lightIn: Record<string, unknown>): number
  MV_IO_GetLightParam(handle: unknown, lightInOut: Record<string, unknown>): number
  MV_IO_WinIO_Init(): number
  MV_IO_WinIO_DeInit(): number
  MV_IO_MainIOInit(): number
  MV_IO_GetMainInputLevel(statusOut: Uint8Array): number
  MV_IO_SetMainOutputLevel(port: number, level: number): number
  MV_IO_SetMainGPO_NPN(enable: number): number
}

export function isVc3000PlatformSupported(): boolean {
  return process.platform === 'win32' && process.arch === 'x64'
}

export function resolveVc3000DllDirectory(): string {
  const isPackaged = Boolean((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath && !process.defaultApp)
  if (isPackaged) {
    return join((process as NodeJS.Process & { resourcesPath: string }).resourcesPath, 'bin', 'vc3000')
  }
  return join(process.cwd(), 'resources', 'bin', 'win32', 'x64', 'vc3000')
}

export function formatMvError(code: number): string {
  const unsigned = code >>> 0
  const map: Record<number, string> = {
    0x00000000: 'MV_OK',
    0x80000000: 'MV_E_HANDLE (Invalid handle)',
    0x80000001: 'MV_E_SUPPORT (Unsupported)',
    0x80000002: 'MV_E_BUFOVER (Buffer full)',
    0x80000003: 'MV_E_CALLORDER (Wrong call order)',
    0x80000004: 'MV_E_PARAMETER (Invalid parameter)',
    0x80000006: 'MV_E_RESOURCE (Resource allocation failed)',
    0x80000007: 'MV_E_NODATA (No data)',
    0x80000008: 'MV_E_PRECONDITION (Precondition failed)',
    0x80000009: 'MV_E_VERSION (Version mismatch)',
    0x800000ff: 'MV_E_UNKNOW (Unknown error)',
  }
  return `${map[unsigned] ?? 'SDK_ERROR'} [0x${unsigned.toString(16).toUpperCase().padStart(8, '0')}]`
}

let cachedApi: Vc3000NativeApi | null = null

export function loadVc3000NativeApi(): Vc3000NativeApi {
  if (cachedApi) return cachedApi
  if (!isVc3000PlatformSupported()) {
    throw new Error('HIK VC3000 SDK is only supported on Windows x64.')
  }

  const dllDir = resolveVc3000DllDirectory()
  const dllPath = join(dllDir, 'MvIOInterfaceBox.dll')
  if (!existsSync(dllPath)) {
    throw new Error(`MvIOInterfaceBox.dll not found at: ${dllPath}`)
  }

  // Ensure dependent DLLs (MvSerial.dll, WinIo64.dll) in dllDir are discoverable.
  const currentPath = process.env.PATH ?? ''
  if (!currentPath.toLowerCase().includes(dllDir.toLowerCase())) {
    process.env.PATH = `${dllDir};${currentPath}`
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-eval
  const koffi = (eval('require') as NodeRequire)('koffi') as typeof import('koffi')
  const lib = koffi.load(dllPath)

  const MV_IO_SERIAL = koffi.struct('MV_IO_SERIAL', {
    strComName: koffi.array('char', 64),
    nReserved: koffi.array('uint32', 8),
  })

  const MV_IO_VERSION = koffi.struct('MV_IO_VERSION', {
    nMainVersion: 'uint32',
    nSubVersion: 'uint32',
    nModifyVersion: 'uint32',
    nYear: 'uint32',
    nMonth: 'uint32',
    nDay: 'uint32',
    nReserved: koffi.array('uint32', 8),
  })

  const MV_IO_SET_INPUT = koffi.struct('MV_IO_SET_INPUT', {
    nPort: 'uint32',
    nEnable: 'uint32',
    nEdge: 'uint32',
    nDelayTime: 'uint32',
    nGlitch: 'uint32',
    nReserved: koffi.array('uint32', 8),
  })

  const MV_IO_SET_OUTPUT = koffi.struct('MV_IO_SET_OUTPUT', {
    nPort: 'uint32',
    nType: 'uint32',
    nPulseWidth: 'uint32',
    nPulsePeriod: 'uint32',
    nDurationTime: 'uint32',
    nValidLevel: 'uint32',
    nReserved: koffi.array('uint32', 8),
  })

  const MV_IO_OUTPUT_ENABLE = koffi.struct('MV_IO_OUTPUT_ENABLE', {
    nPortNumber: 'uint16',
    nType: 'uint8',
    nReserved: koffi.array('uint32', 4),
  })

  const MV_IO_INPUT_LEVEL = koffi.struct('MV_IO_INPUT_LEVEL', {
    nPortNumber: 'uint8',
    nLevel0: 'uint8',
    nLevel1: 'uint8',
    nLevel2: 'uint8',
    nLevel3: 'uint8',
    nLevel4: 'uint8',
    nLevel5: 'uint8',
    nLevel6: 'uint8',
    nLevel7: 'uint8',
    nReserved: koffi.array('uint32', 8),
  })

  const MV_IO_LIGHT_PARAM = koffi.struct('MV_IO_LIGHT_PARAM', {
    nPortNumber: 'uint8',
    nLightValue: 'uint16',
    nLightState: 'uint16',
    nLightEdge: 'uint16',
    nDurationTime: 'uint32',
    nReserved: koffi.array('uint32', 3),
  })

  const HandlePtr = koffi.pointer('void')

  cachedApi = {
    MV_IO_CreateHandle: lib.func('__stdcall', 'MV_IO_CreateHandle', 'int', [koffi.out(koffi.pointer(HandlePtr))]),
    MV_IO_DestroyHandle: lib.func('__stdcall', 'MV_IO_DestroyHandle', 'int', [HandlePtr]),
    MV_IO_GetSDKVersion: lib.func('__stdcall', 'MV_IO_GetSDKVersion', 'int', [koffi.out(koffi.pointer(MV_IO_VERSION))]),
    MV_IO_Open: lib.func('__stdcall', 'MV_IO_Open', 'int', [HandlePtr, koffi.pointer(MV_IO_SERIAL)]),
    MV_IO_Close: lib.func('__stdcall', 'MV_IO_Close', 'int', [HandlePtr]),
    MV_IO_GetFirmwareVersion: lib.func('__stdcall', 'MV_IO_GetFirmwareVersion', 'int', [
      HandlePtr,
      koffi.out(koffi.pointer(MV_IO_VERSION)),
    ]),
    MV_IO_SetInput: lib.func('__stdcall', 'MV_IO_SetInput', 'int', [HandlePtr, koffi.pointer(MV_IO_SET_INPUT)]),
    MV_IO_SetOutput: lib.func('__stdcall', 'MV_IO_SetOutput', 'int', [HandlePtr, koffi.pointer(MV_IO_SET_OUTPUT)]),
    MV_IO_SetOutputEnable: lib.func('__stdcall', 'MV_IO_SetOutputEnable', 'int', [
      HandlePtr,
      koffi.pointer(MV_IO_OUTPUT_ENABLE),
    ]),
    MV_IO_ExcutePNPEnable: lib.func('__stdcall', 'MV_IO_ExcutePNPEnable', 'int', [HandlePtr, 'uint32']),
    MV_IO_GetPNPEnable: lib.func('__stdcall', 'MV_IO_GetPNPEnable', 'int', [HandlePtr, koffi.out(koffi.pointer('uint32'))]),
    MV_IO_GetInputLevel: lib.func('__stdcall', 'MV_IO_GetInputLevel', 'int', [
      HandlePtr,
      koffi.out(koffi.pointer(MV_IO_INPUT_LEVEL)),
    ]),
    MV_IO_SetLightParam: lib.func('__stdcall', 'MV_IO_SetLightParam', 'int', [
      HandlePtr,
      koffi.pointer(MV_IO_LIGHT_PARAM),
    ]),
    MV_IO_GetLightParam: lib.func('__stdcall', 'MV_IO_GetLightParam', 'int', [
      HandlePtr,
      koffi.inout(koffi.pointer(MV_IO_LIGHT_PARAM)),
    ]),
    MV_IO_WinIO_Init: lib.func('__stdcall', 'MV_IO_WinIO_Init', 'int', []),
    MV_IO_WinIO_DeInit: lib.func('__stdcall', 'MV_IO_WinIO_DeInit', 'int', []),
    MV_IO_MainIOInit: lib.func('__stdcall', 'MV_IO_MainIOInit', 'int', []),
    MV_IO_GetMainInputLevel: lib.func('__stdcall', 'MV_IO_GetMainInputLevel', 'int', [koffi.out(koffi.pointer('uint8'))]),
    MV_IO_SetMainOutputLevel: lib.func('__stdcall', 'MV_IO_SetMainOutputLevel', 'int', ['uint32', 'uint32']),
    MV_IO_SetMainGPO_NPN: lib.func('__stdcall', 'MV_IO_SetMainGPO_NPN', 'int', ['uint32']),
  }

  return cachedApi
}
