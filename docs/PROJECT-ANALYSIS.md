# OpenPLC Editor — Project Analysis

> **Version analysed:** 4.4.0  
> **Date:** 2026-11-26  
> **Author:** Autonomy Logic Inc.  
> **License:** GPL-3.0-only (baremetal runtime is dual-licensed: GPL-3.0 + commercial)

---

## 1. Executive Summary

**OpenPLC Editor** is a cross-platform desktop IDE built with **Electron + React + TypeScript** for creating, compiling, simulating, and deploying PLC (Programmable Logic Controller) programs targeting the OpenPLC Runtime. It supports IEC 61131-3 programming languages (Structured Text, Ladder Diagram, Function Block Diagram), features an integrated HMI (Human-Machine Interface) designer, a WebAssembly-based simulator, and provides connectivity to physical PLC devices via serial, SSH, Modbus, and EtherCAT.

The codebase is approximately **~25 MB of source code** across **3,400+ files** (2,045 `.ts` + 707 `.tsx` + 189 `.h` + 36 `.cpp` + 19 `.c` + others), making this a **large-scale, production-grade industrial IDE**.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Desktop Framework** | Electron v37 |
| **Language** | TypeScript 5.4+, C/C++ (runtime), Python (scripting) |
| **Frontend Framework** | React 18 |
| **State Management** | Zustand (with Immer) |
| **UI Components** | Radix UI primitives, Tailwind CSS, Lucide icons |
| **Code Editor** | Monaco Editor |
| **Flow/Diagram Editor** | @xyflow/react (React Flow) |
| **Data Fetching** | TanStack React Query, Axios |
| **Forms** | React Hook Form + Zod validation |
| **Bundler** | Webpack 5 |
| **Testing** | Jest (unit), Playwright (e2e) |
| **CI/CD** | GitHub Actions (22 workflow files) |
| **Compiler Toolchain** | STruC++ (IEC→C++), YoWASP Clang (WASM compilation) |
| **Runtime Env** | Wasmer SDK (WASM execution), embedded Python (CPython + NumPy) |
| **Communication** | Socket.IO, SSH2, serial port, WebRTC |
| **Package Format** | NSIS (Windows), DMG (macOS), AppImage (Linux) |

---

## 3. Architecture Overview

The project follows a **layered architecture** with clear separation between frontend, middleware, backend, and main process:

```
┌─────────────────────────────────────────────────────┐
│                   Electron Main Process             │
│  ┌───────────┐  ┌──────────┐  ┌───────────────────┐│
│  │ Lifecycle  │  │  IPC     │  │ Runtime           ││
│  │ Manager    │  │  Bridge  │  │ Provisioning      ││
│  │ (Quit/     │  │          │  │                   ││
│  │  Update)   │  │          │  │                   ││
│  └───────────┘  └────┬─────┘  └───────────────────┘│
└───────────────────────┼─────────────────────────────┘
                        │ IPC Channels
┌───────────────────────┼─────────────────────────────┐
│               Renderer Process                       │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │                 Frontend (React)               │  │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────────┐  │  │
│  │  │ Screens  │ │Components │ │  Zustand      │  │  │
│  │  │          │ │ (Atomic)  │ │  Store        │  │  │
│  │  │          │ │           │ │  (20 slices)  │  │  │
│  │  └──────────┘ └───────────┘ └──────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
│                        │                             │
│  ┌────────────────────────────────────────────────┐  │
│  │              Middleware (Adapters/Ports)        │  │
│  │  editor · runtime-auth · vendor-document       │  │
│  └────────────────────────────────────────────────┘  │
│                        │                             │
│  ┌────────────────────────────────────────────────┐  │
│  │                   Backend                      │  │
│  │  compiler · hardware · hmi · modbus · python   │  │
│  │  simulator · ethercat · license · packages     │  │
│  │  wasm-toolchain · runtime · project · AI       │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ STruC++  │  │ YoWASP   │  │ Physical │
   │ Compiler │  │ Clang    │  │  PLC     │
   │          │  │ (WASM)   │  │ Devices  │
   └──────────┘  └──────────┘  └──────────┘
```

### 3.1 Source Directory Structure

```
src/
├── backend/            # Core business logic & services
│   ├── editor/         # Editor-specific modules
│   │   ├── cli-shim/           # CLI integration shim
│   │   ├── compiler/           # IEC 61131-3 → C++ compilation
│   │   ├── edge-account/       # Cloud account management (OAuth)
│   │   ├── edge-ai/            # AI assistant integration
│   │   ├── edge-edit-sessions/ # Collaborative editing sessions
│   │   ├── edge-projects/      # Cloud project sync
│   │   ├── edge-version-control/ # Version control (Git-like)
│   │   ├── ethercat/           # EtherCAT fieldbus support
│   │   ├── hardware/           # Hardware abstraction & device mgmt
│   │   ├── hmi/                # HMI compilation & object building
│   │   ├── library-manager/    # PLC library management
│   │   ├── license/            # Licensing (commercial + GPL)
│   │   ├── modbus/             # Modbus protocol support
│   │   ├── package-manager/    # VPP package management
│   │   ├── package-trust/      # Package signing & verification
│   │   ├── project/            # Project file I/O
│   │   ├── python/             # Embedded Python runtime
│   │   ├── runtime/            # PLC runtime management
│   │   ├── runtime-provisioning/ # Device provisioning
│   │   ├── services/           # Core services (Project, POU, User)
│   │   ├── simulator/          # WASM-based PLC simulator
│   │   ├── utils/              # Shared utilities
│   │   └── wasm-toolchain/     # Clang WASM compilation pipeline
│   ├── shared/         # Shared business logic
│   │   ├── compile/            # Compilation pipeline
│   │   ├── debug/              # Debugger protocol
│   │   ├── ethercat/           # EtherCAT shared types
│   │   ├── firmware/           # Firmware handling
│   │   ├── hardware/           # Hardware definitions
│   │   ├── hmi/                # HMI shared logic
│   │   ├── library/            # Library shared types
│   │   ├── license/            # License shared types
│   │   ├── packages/           # Package shared types
│   │   ├── project/            # Project model
│   │   ├── python/             # Python runtime preparation
│   │   ├── simulator/          # Simulator shared logic
│   │   ├── transpilers/        # IEC language transpilers
│   │   └── wasm-toolchain/     # WASM toolchain shared
│   └── shared-data/    # Mock data & shared fixtures
│
├── cli/                # Command-line interface
│   ├── commands/       # CLI commands
│   │   ├── build.ts            # Compile project
│   │   ├── create.ts           # Create new project
│   │   ├── debug.ts            # Debug session
│   │   ├── devices.ts          # List/manage devices
│   │   ├── inspect.ts          # Inspect project
│   │   ├── install-cli.ts      # Install CLI globally
│   │   ├── packages.ts         # Manage packages
│   │   └── simulate.ts         # Run simulation
│   ├── compile/        # CLI compilation logic
│   ├── debug/          # CLI debug support
│   ├── project/        # CLI project management
│   └── session/        # CLI session management
│
├── frontend/           # React UI layer
│   ├── assets/         # Static assets (images, fonts)
│   ├── components/     # UI components (Atomic Design)
│   │   ├── ui/                 # Primitives (buttons, inputs, etc.)
│   │   ├── _atoms/             # Atomic components
│   │   ├── _molecules/         # Molecule components
│   │   ├── _organisms/         # Organism components
│   │   ├── _templates/         # Page templates
│   │   └── _features/          # Feature modules
│   │       ├── [app]/          # App-level features
│   │       ├── [start]/        # Start screen features
│   │       └── [workspace]/    # Workspace features
│   ├── data/           # Static data & constants
│   ├── hooks/          # 40+ custom React hooks
│   ├── locales/        # i18n translations
│   ├── screens/        # Page-level components
│   ├── services/       # Frontend services
│   ├── store/          # Zustand state management (20 slices)
│   └── utils/          # Frontend utilities
│
├── main/               # Electron main process
│   └── modules/
│       ├── ipc/                # IPC bridge (main ↔ renderer)
│       ├── lifecycle/          # App lifecycle (quit coordinator)
│       ├── preload/            # Preload scripts
│       ├── runtime-provisioning/ # Device provisioning service
│       ├── store/              # Electron store (persistent config)
│       ├── updater/            # Auto-update service
│       └── vendor-document/    # Vendor document serving
│
├── middleware/          # Adapter/port layer
│   ├── adapters/       # Concrete adapter implementations
│   │   ├── editor/             # Editor adapters
│   │   ├── ports/              # Port definitions
│   │   ├── providers/          # Provider implementations
│   │   ├── runtime-auth/       # Runtime authentication
│   │   ├── utils/              # Middleware utilities
│   │   └── vendor-document/    # Vendor document adapters
│   └── shared/         # Shared middleware types
│
├── types/              # Shared TypeScript type definitions
│   ├── IPC/            # IPC channel type contracts
│   └── PLC/            # PLC domain types
│
├── __architecture__/   # Architecture validation rules
├── __fixtures__/       # Test fixtures
└── __tests__/          # Integration tests
```

---

## 4. Key Features

### 4.1 IEC 61131-3 Programming Languages
- **Structured Text (ST)** — text-based PLC programming with Monaco Editor integration
- **Ladder Diagram (LD)** — graphical relay logic editor using React Flow
- **Function Block Diagram (FBD)** — graphical function block editor using React Flow
- 59 `.st` example/test files included

### 4.2 Compilation Pipeline
- **STruC++ Compiler** (v0.8.1) — transpiles IEC 61131-3 → C++ source code
- **YoWASP Clang** — compiles C++ to WASM for browser-based simulation
- **Arduino toolchain** — compiles for physical microcontroller targets
- Build matrix support for multiple target architectures

### 4.3 HMI Designer
- Visual drag-and-drop HMI panel designer
- Widget library system (openplc-hmi-widgets v1.4.0)
- Live preview with WASM-compiled rendering engine
- C-based core rendering (19 `.c` files in tests, header files in `resources/sources/hmi`)
- Baremetal HMI support for embedded targets
- Animation and data binding support

### 4.4 Simulator
- **WebAssembly-based** PLC simulator (runs entirely in-browser via Wasmer SDK)
- Debugger with variable inspection, breakpoints, and stepping
- Real-time I/O monitoring and diagnostics

### 4.5 Device Connectivity
- **Serial port** communication (via `serialport` package)
- **SSH** remote deployment (`ssh2` package)
- **Modbus** protocol support (master/slave configuration)
- **EtherCAT** industrial fieldbus (SDO configuration, modular I/O)
- Runtime provisioning and firmware upload
- Device discovery over local network

### 4.6 Cloud & Collaboration Features
- **Edge Account** — OAuth-based cloud authentication
- **Cloud Projects** — project sync and storage
- **Edit Sessions** — collaborative editing support
- **Version Control** — Git-like branching, commit history, source control UI
- **WebRTC** — real-time communication layer

### 4.7 AI Integration
- AI chat assistant panel in workspace
- AI settings configuration panel
- Edge AI backend service

### 4.8 CLI Interface
Full-featured command-line interface with commands:
| Command | Description |
|---|---|
| `create` | Create a new OpenPLC project |
| `build` | Compile a project |
| `simulate` | Run simulation |
| `debug` | Start debug session |
| `devices` | List/manage connected devices |
| `inspect` | Inspect project structure |
| `packages` | Manage PLC packages |
| `install-cli` | Install CLI globally |

### 4.9 Additional Capabilities
- **PDF export** — project documentation generation (via `pdf-lib`)
- **Library Manager** — import/manage PLC function block libraries
- **Package Manager** — VPP package ecosystem with trust/signing
- **Python scripting** — embedded CPython runtime with NumPy
- **i18n** — internationalization support via `i18next`
- **Auto-updater** — Electron auto-update mechanism
- **Project search** — full-text search across project elements

---

## 5. State Management

The application uses **Zustand** with **20 state slices**, reflecting the breadth of features:

| Slice | Responsibility |
|---|---|
| `AI` | AI assistant state |
| `Console` | Build/debug console output |
| `Device` | Connected device state |
| `Editor` | Active editor state |
| `FBDFlow` | Function Block Diagram canvas |
| `File` | File system operations |
| `History` | Undo/redo history |
| `HmiDesigner` | HMI designer canvas state |
| `LadderFlow` | Ladder Diagram canvas |
| `Library` | PLC library catalog |
| `Modal` | Dialog/modal management |
| `Print` | PDF export state |
| `Project` | Current project model |
| `Readme` | Project readme |
| `RuntimeProvisioning` | Device provisioning state |
| `Search` | Project search state |
| `Shared` | Cross-cutting shared state |
| `Tabs` | Editor tab management |
| `VersionControl` | Git-like VCS state |
| `WebRTC` | Real-time communication |
| `Workspace` | Workspace layout state |

---

## 6. Build & Development

### 6.1 Prerequisites
- **Node.js** 22.x
- **npm** ≥ 10.x

### 6.2 Key Scripts

```bash
npm install          # Install deps + download binaries + build DLL
npm run dev          # Dev server on port 1313 with hot reload
npm run build        # Production build (HMI objects → main + renderer)
npm run package      # Build + create platform installer
npm run test         # Jest unit tests with coverage
npm run test:e2e     # Playwright end-to-end tests
npm run lint         # ESLint check
npm run format       # Prettier formatting
npm run validate:arch # Architecture layer validation
npm run cli          # Run CLI mode
```

### 6.3 Build Pipeline
1. **Build HMI objects** (`build:hmi-objects`) — compiles HMI C sources
2. **Prepare YoWASP Clang** — sets up WASM compiler toolchain
3. **Package trust preparation** — signs bundled packages
4. **Build main process** (Webpack, production mode)
5. **Build renderer** (Webpack, production mode)
6. **Electron Builder** — packages into platform-specific installers

### 6.4 Platform Targets

| Platform | Architectures | Format |
|---|---|---|
| **macOS** | x64, ARM64 | DMG (signed + notarized) |
| **Windows** | x64 | NSIS installer |
| **Linux** | x64 | AppImage |

---

## 7. Testing Strategy

### 7.1 Unit Tests (Jest)
- Located in `__tests__/` directories alongside source
- Uses `@testing-library/react` for component tests
- Coverage collection enabled
- Max 2 workers for parallel execution

### 7.2 End-to-End Tests (Playwright)
- **68 e2e test files** covering extensive scenarios:
  - HMI designer, preview, animations, widget libraries
  - EtherCAT configuration (modular, plain slave, SDO)
  - Compiler & build workflows
  - Debugger connectivity
  - Simulator play/build
  - Project management (search, dirty flags, PDF export)
  - Runtime provisioning
  - Modbus I/O configuration
  - Package manager trust
  - WASM toolchain

### 7.3 Native Tests (C/C++)
- `tests/hmi-core/` — HMI rendering engine unit tests (C)
- `tests/hmi-unit/` — HMI unit driver tests (C)
- `tests/hmi-baremetal/` — Baremetal HMI tests (C/C++)
- `tests/hmi-preview/` — HMI preview integration tests
- `tests/hmi-client/` — HMI client tests
- Run with GCC and Clang with sanitizers enabled

---

## 8. CI/CD Pipeline

**22 GitHub Actions workflows** covering:

| Workflow | Purpose |
|---|---|
| `ci.yml` | Main CI orchestrator |
| `ci-build.yml` | Build verification |
| `ci-unit-tests.yml` | Unit test execution |
| `ci-lint.yml` | ESLint checks |
| `ci-format.yml` | Prettier formatting checks |
| `ci-architecture.yml` | Architecture layer validation |
| `ci-hmi-core.yml` | HMI C core tests |
| `ci-e2e-debug-lock.yml` | E2E debug lock tests |
| `ci-sync.yml` | Branch sync checks |
| `build.yml` | Full build pipeline |
| `release.yml` | Release automation |
| `rebuild-release.yml` | Release rebuild |
| `test.yml` | Test orchestration |
| `cla.yml` | CLA verification |
| `codeql-analysis.yml` | CodeQL security scanning |
| `code_quality.yml` | Code quality gates |
| `security-monthly.yml` | Monthly security audit |
| `security-pr-gate.yml` | PR security gate |
| `security-release-vulns.yml` | Release vulnerability check |
| `security-sbom.yml` | Software Bill of Materials |
| `claude-code-review.yml` | AI-assisted code review |
| `claude.yml` | Claude AI automation |

---

## 9. Security

The project has a dedicated `security/` directory and comprehensive security practices:

- **Package trust & signing** — cryptographic verification of bundled packages
- **Electron fuses** — hardened with security fuses:
  - `runAsNode: false`
  - `enableNodeOptionsEnvironmentVariable: false`
  - `enableNodeCliInspectArguments: false`
  - `enableEmbeddedAsarIntegrityValidation: true`
  - `onlyLoadAppFromAsar: true`
- **ASAR packaging** with integrity validation
- **macOS** — hardened runtime, notarization, entitlements
- **CodeQL** analysis in CI
- **Monthly security audits**
- **SBOM (Software Bill of Materials)** generation
- **OSV vulnerability scanning** (`osv-raw.toml`)
- **PR security gates** — automated vulnerability checks on PRs
- **DOMPurify** — XSS prevention for rendered content

---

## 10. External Dependencies & Tooling

### 10.1 Pinned Binaries (`binary-versions.json`)
| Binary | Version | Source |
|---|---|---|
| **STruC++** | v0.8.1 | `Autonomy-Logic/STruCpp` |
| **HMI Widgets** | v1.4.0 | `Autonomy-Logic/openplc-hmi-widgets` |

### 10.2 WASM Toolchain
- **YoWASP Clang** 22.0.0 — C/C++ → WASM compiler
- **Wasmer SDK** 0.19.1 — WASM execution runtime

### 10.3 Embedded Runtime
- **Python** (CPython) — embedded for scripting support
- **NumPy** — numerical computation library
- Platform-specific native binaries in `resources/bin/{darwin,linux,win32}`

### 10.4 Runtime Sources
Bundled in `resources/sources/`:
- `arduino/` — Arduino framework adaptation
- `avr-libstdcpp/` — AVR C++ standard library
- `Baremetal/` — Baremetal PLC runtime (dual-licensed)
- `boards/` — Board definitions
- `hal/` — Hardware Abstraction Layer
- `hmi/` — HMI rendering engine source
- `wasm-sim/` — WASM simulator runtime

---

## 11. Frontend Component Architecture

The frontend follows **Atomic Design** methodology:

```
components/
├── ui/           → Primitives (shadcn/ui-style components via Radix)
├── _atoms/       → Smallest reusable UI elements
├── _molecules/   → Compositions of atoms
├── _organisms/   → Complex UI sections
├── _templates/   → Page-level layouts
└── _features/    → Feature-scoped modules
    ├── [app]/
    │   ├── loading-overlay
    │   └── toast
    ├── [start]/
    │   ├── account
    │   ├── cloud-projects
    │   ├── menu
    │   ├── new-project
    │   ├── open-cloud-project
    │   └── upload-to-cloud
    └── [workspace]/
        ├── ai-chat
        ├── ai-settings-panel
        ├── branches
        ├── build-options
        ├── commit-history
        ├── create-element
        ├── data-type
        ├── editor
        ├── global-variable-list
        ├── search
        └── source-control
```

---

## 12. Custom React Hooks (40+)

The project includes an extensive library of domain-specific hooks:

| Hook | Purpose |
|---|---|
| `use-active-branch` | Current VCS branch tracking |
| `use-device-connect` | Device connection management |
| `use-device-configuration` | Hardware configuration state |
| `use-device-license` | Device licensing state |
| `use-device-plc-state` | Real-time PLC state monitoring |
| `use-edge-account` | Cloud account state |
| `use-editing-lock` | Concurrent editing lock |
| `use-ethercat-alias-edit` | EtherCAT alias configuration |
| `use-hold-hmi-toolchain` | HMI compilation lifecycle |
| `use-io-diagnostics` | I/O diagnostics monitoring |
| `use-modbus-server-config` | Modbus configuration |
| `use-navigate-to-compile-error` | Error navigation |
| `use-project-edit-session` | Collaborative edit session |
| `use-runtime-connect` | Runtime connection state |
| `use-simulator-debug-run` | Simulator debug lifecycle |
| `use-target-capabilities` | Target platform capabilities |
| `useDebugSession` | Debug session management |
| `useDebugPolling` | Debug variable polling |
| ...and more | |

---

## 13. Project Statistics Summary

| Metric | Value |
|---|---|
| **Source code size** | ~25 MB |
| **TypeScript files** | 2,045 `.ts` + 707 `.tsx` |
| **C/C++ files** | 189 `.h` + 36 `.cpp` + 19 `.c` |
| **JSON configs** | 77 files |
| **Markdown docs** | 48 files |
| **E2E test specs** | 68 Playwright tests |
| **CI workflows** | 22 GitHub Actions |
| **Build scripts** | 35+ custom scripts |
| **Zustand slices** | 20 state slices |
| **Custom hooks** | 40+ React hooks |
| **IEC 61131 examples** | 59 `.st` files |
| **Font files** | 6 `.ttf` |
| **WASM modules** | 3 `.wasm` files |
| **Supported platforms** | macOS (x64/ARM64), Windows (x64), Linux (x64) |

---

## 14. Development Workflow

### Git Branching Strategy
- **`main`** — production branch
- **`development`** — integration branch (PR target)
- Feature branches: `feature/DOPE-<n>-<kebab-slug>`
- Bug fix branches: `bugfix/DOPE-<n>-<kebab-slug>`
- External contributors: `feature/gh-<n>-<kebab-slug>`

### Commit Convention
- **Conventional Commits** style
- Jira key (DOPE project) in branch name and PR title
- CLA checkbox required on all PRs

### Pre-push Checks
```bash
npx tsc --noEmit              # Type checking
npx prettier --check "./src/**/*.{ts,tsx}"   # Format check
npx eslint "./src/**/*.{ts,tsx}"             # Lint check
npx jest --config jest.config.json --collectCoverage --ci  # Unit tests
npm run validate:arch          # Architecture validation
npm run test:e2e               # End-to-end tests
```

---

## 15. Release Process

Releases are automated via GitHub Actions:

1. Create and push a semantic version tag: `git tag v4.x.x && git push origin v4.x.x`
2. CI automatically:
   - Builds for all 3 platforms (macOS x64/ARM64, Windows x64, Linux x64)
   - Signs and notarizes macOS builds
   - Creates a GitHub Release with all artifacts
   - Generates release notes from commits
3. Pre-release support: tags like `v4.x.x-beta`, `-alpha`, `-rc1`

---

## 16. Notable Design Decisions

1. **Layered architecture with validation** — The `__architecture__/validate.ts` script enforces import boundaries between layers, preventing architectural drift.
2. **WASM-first simulation** — PLC programs compile to WebAssembly and run in-browser via Wasmer, eliminating the need for physical hardware during development.
3. **Embedded Python** — Full CPython + NumPy bundled as an extra resource, enabling Python scripting blocks in PLC programs.
4. **Dual compiler targets** — Same IEC source can compile to either Arduino-compatible C++ (for physical devices) or WASM (for simulation).
5. **Package trust chain** — Cryptographic signing and verification for installable PLC packages, with CI-enforced bundle integrity checks.
6. **HMI in C** — The HMI rendering engine is written in C for performance on embedded targets, compiled to WASM for preview in the editor.
7. **Atomic Design** — UI components follow the Atomic Design methodology (atoms → molecules → organisms → templates → features).
8. **20-slice Zustand store** — Modular state management where each domain has its own slice, composed into a single root store.
