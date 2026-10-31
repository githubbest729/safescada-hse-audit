# SafeSCADA HSE Audit

<div align="center">

```
   ███████╗ █████╗ ███████╗███████╗███████╗ ██████╗ █████╗ ██████╗  █████╗ 
   ██╔════╝██╔══██╗██╔════╝██╔════╝██╔════╝██╔════╝██╔══██╗██╔══██╗██╔══██╗
   ███████╗███████║█████╗  █████╗  ███████╗██║     ███████║██║  ██║███████║
   ╚════██║██╔══██║██╔══╝  ██╔══╝  ╚════██║██║     ██╔══██║██║  ██║██╔══██║
   ███████║██║  ██║██║     ███████╗███████║╚██████╗██║  ██║██████╔╝██║  ██║
   ╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝
                    HSE AUDIT & COMPLIANCE TRACKER
```

**Industrial-grade, offline-first Progressive Web App (PWA) engineered for SCADA and Instrumentation & Control (I&C) engineers.**  
Built for process facilities, automated substations, utility infrastructure, and Wonderware/PLC operations.

[![PWA Ready](https://img.shields.io/badge/PWA-2026_Compliant-059669?style=flat-square&logo=pwa)](manifest.webmanifest)
[![Storage](https://img.shields.io/badge/Storage-IndexedDB_Persistent-2563eb?style=flat-square)](js/db.js)
[![Safety Standards](https://img.shields.io/badge/Standards-ISO_45001_%7C_14001_%7C_9001-f59e0b?style=flat-square)](#compliance-frameworks)
[![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)

</div>

---

## Overview

**SafeSCADA HSE Audit** enforces operational and safety process compliance (e.g., Annexure-SCT-HR-001, ISO 45001, ISO 14001, and ISO 9001). Designed specifically for field automation engineers operating in air-gapped, network-isolated control rooms and field environments, the application provides digital safety checklists, automatic Corrective and Preventive Action (CAPA) routing, risk matrix evaluations, and multi-year local data persistence.

---

## System Architecture

## System Architecture

```mermaid
flowchart TD
    subgraph CR["Client Runtime"]
        subgraph UI["Presentation Layer"]
            UI1["Dashboard Telemetry"]
            UI2["Digital Checklists"]
            UI3["Hazard 5x5 Matrix"]
            UI4["CAPA Board"]
        end

        subgraph CORE["Core Engine"]
            APP["App Lifecycle"]
            AUDIT["Audit Engine"]
            CAPA["CAPA Manager"]
        end

        subgraph PWA["PWA Runtime"]
            SW["Service Worker"]
            MAN["Web Manifest"]
        end

        subgraph STORE["Storage Engine"]
            IDB["IndexedDB"]
            BAK["Backup & Export"]
        end
    end

    UI --> CORE
    CORE --> PWA
    CORE --> STORE

### Complete Icon Suite Hierarchy
Icons reside in `./icons/` and adhere to Chromium and iOS maskable specifications:

| Asset Name | Resolution | Format | Purpose |
| :--- | :--- | :--- | :--- |
| `favicon.ico` | Multi-size | ICO | Browser tab icon |
| `favicon.svg` | Scalable Vector | SVG | Scalable vector / responsive UI icon |
| `apple-touch-icon.png` | 180×180 px | PNG | iOS Home Screen launch icon |
| `icon-72.png` | 72×72 px | PNG | Legacy low-DPI Android displays |
| `icon-96.png` | 96×96 px | PNG | Standard display shortcut indicator |
| `icon-128.png` | 128×128 px | PNG | Web store & launcher standard |
| `icon-144.png` | 144×144 px | PNG | Windows PWA pin tile asset |
| `icon-152.png` | 152×152 px | PNG | iPad home screen target |
| `icon-192.png` | 192×192 px | PNG | Standard Android launch & install icon |
| `icon-384.png` | 384×384 px | PNG | High-DPI splash screen icon |
| `icon-512.png` | 512×512 px | PNG | Splash screen & manifest standard |
| `icon-maskable-192.png`| 192×192 px | PNG | Adaptive maskable icon (squircle/circle) |
| `icon-maskable-512.png`| 512×512 px | PNG | Large adaptive maskable icon |

To generate or re-render missing icon assets directly from Python:
```bash
python3 tools/make_icons.py
```
*(Requires Pillow: `pip install Pillow`)*

---

## Directory Structure

```
safescada-hse-audit/
├── index.html                   # HTML5 Entry Point with mobile & desktop safe-area styling
├── manifest.webmanifest         # PWA Manifest (display: standalone, window controls overlay)
├── sw.js                        # Cache-first service worker with stale-while-revalidate routes
├── offline.html                 # Offline fallback view showing cached telemetry
├── favicon.ico                  # Browser tab icon
├── favicon.svg                  # Vector badge icon
├── apple-touch-icon.png         # iOS Home Screen asset
├── robots.txt                   # Search index rules
├── tools/
│   └── make_icons.py            # Automated Pillow icon batch renderer
├── icons/                       # Complete PWA / OS icons
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png
│   ├── icon-384.png
│   ├── icon-512.png
│   ├── icon-maskable-192.png
│   └── icon-maskable-512.png
├── css/
│   ├── tokens.css               # Design tokens, themes (dark/light), WCAG AA color palette
│   ├── layout.css               # Mobile-first grid, safe-area viewport paddings
│   └── components.css           # Forms, buttons, signature canvas, cards (min 44px targets)
└── js/
    ├── app.js                   # Application lifecycle, routing, and PWA updates
    ├── db.js                    # IndexedDB schema, persistence request, data migration
    ├── audit-engine.js          # Checklists, dynamic CAPA generation, matrix calculators
    └── ui.js                    # Dynamic component renderers, dialogs, signature pads
```

---

## Core Modules

### 1. Executive HSE Dashboard
- **Compliance Score Index**: Dynamic score computed from weighted audit checklists.
- **CAPA Counter**: Tracks Open, Rectification, and Verified Closed states.
- **Safety Milestones**: Days Without LTI (Lost Time Injury) counter with reset controls.
- **Telemetry Badge**: Monitors IndexedDB persistent storage grant and connectivity states.

### 2. SCADA / Automation Checklists
Pre-configured templates with weighted scoring (Low: 1, Med: 2, High: 3, Critical: 5):
* **Control Panel & PLC Cabinet**: Lockout/Tagout (LOTO), 24VDC/230VAC segregation, ferrule numbering, IP rating, cooling ventilation.
* **Server Room & Cyber-Physical Security**: UPS runtimes, FM200 suppression arming, ESD earthing, trench seals, HVAC limits.
* **Field Instrumentation & Hot Work**: Calibration validity, intrinsic safety barriers, ATEX compliance, permit verification.
* **Wonderware / PLC Maintenance Routines**: Pre-maintenance logic backups, alarm bypass documentation, fail-safe verification.

### 3. Hazard Assessment (5×5 Risk Matrix)
Calculates overall risk score by multiplying Probability ($1-5$) $\times$ Consequence ($1-5$):
* **Score $\ge 10$**: Automatically initiates a High-Severity CAPA with a required closure window.
* **Score $\ge 20$**: Flags Critical Severity requiring immediate operational pause and engineer sign-off.

### 4. CAPA Tracker & SLA Timers
Enforces strict resolution schedules based on risk tier:
* **Critical**: 24-hour resolution timer.
* **High**: 7-day resolution timer.
* **Medium**: 30-day resolution timer.
* **Low**: 90-day resolution timer.
* Closing an item requires an engineer sign-off via touch canvas and audit log timestamp.

### 5. Multi-Year Offline Storage (2–3 Year Horizon)
* Runs on client-side **IndexedDB**.
* Calls `navigator.storage.persist()` on boot to protect data from browser eviction cycles.
* Provides full database **Export (JSON/CSV)** and **Import** tools under `Archive` for long-term offline retention and regulatory submissions.

---

## Installation & Deployment

### Local Development
To serve locally, host from your project root:

```bash
# Python 3
python3 -m http.server 8080

# Node.js (via npx)
npx serve -p 8080 .
```
Open [http://localhost:8080/](http://localhost:8080/) in any modern Chromium, Safari, or Firefox browser.

> **Note:** Service Workers and browser installation mechanisms require an isolated origin context (`http://localhost` or a secure `https://` domain).

### Hosting Requirements
* Host files at the domain root (`/`) to match the manifest definition (`start_url: "/index.html"` and `scope: "/"`).
* If serving from a subpath (e.g., `https://your-domain.github.io/safescada-hse-audit/`), update `scope` and `start_url` inside `manifest.webmanifest` and ensure asset references in `index.html` use relative paths (`./css/...`, `./js/...`).

---

## Compliance Frameworks

| Standard | Scope Covered |
| :--- | :--- |
| **ISO 45001:2018** | Occupational Health & Safety: Hazard identification, digital risk matrices, and incident logging |
| **ISO 14001:2015** | Environmental Management: Server room cooling efficiencies, leak inspections, trench safety |
| **ISO 9001:2015** | Quality Assurance: Standardized maintenance check routines, backup validation, change management |
| **Annexure-SCT-HR-001** | Internal QHSE adherence guidelines for automation facilities and SCADA control centers |
