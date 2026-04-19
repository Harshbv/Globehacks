# DispatchIQ — AI Fleet Command Center
### GlobeHack Season 1 · Trucker Path Marketplace & Growth Track

> *One AI that knows every driver, every load, every dollar — so your dispatcher never has to guess.*

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Add API keys to .env.local (or skip for demo mode)
# TRUCKERPATH_API_KEY=your_token
# GROQ_API_KEY=your_groq_key        ← free at console.groq.com
# NEXT_PUBLIC_GOOGLE_MAPS_KEY=...
# OPENWEATHER_API_KEY=...            ← free tier

# 3. Run
npm run dev
# → http://localhost:3000
```

**No API keys?** The app runs in demo mode automatically with 7 realistic sample drivers.

---

## Features — All 5 Problem Areas

| Area | What DispatchIQ does |
|---|---|
| ⚡ **Smart Dispatch** | Groq AI scores all drivers by HOS remaining, GPS proximity, $/mile, safety score. Best driver recommended with full reasoning. Assigns trip via NavPro `/api/trip/create`. Sends SMS confirmation to driver. |
| 🔔 **Proactive Alerts** | Real-time monitoring of fuel level, HOS, weather (OpenWeather), and route deviation. Fires alerts *before* problems hit. Auto-finds nearest truck stops (Google Places). Auto-sends SMS via Twilio. |
| 💰 **Cost Intelligence** | Route optimization with mandatory FMCSA rest stops + fuel stops. **Knapsack DP algorithm** selects the most profitable combination of loads within weight + HOS time constraints. |
| 🛡 **Safety & Compliance** | Pre-dispatch FMCSA compliance check. Blocks dispatch if HOS < 2h. Fatigue risk scoring. Per-driver weekly safety report. Full DOT audit log. |
| 📄 **Billing Autopilot** | Groq Vision (llama-3.2-11b) reads BOL/POD/receipt photos. Extracts every field. Generates invoice. Pushes to NavPro via `/api/document/add`. 45 min → 90 sec. |

---

## Tech Stack

| | |
|---|---|
| Framework | Next.js 16 App Router + TypeScript |
| AI | **Groq** `llama-3.3-70b-versatile` (dispatch/alerts/optimize/safety) + `llama-3.2-11b-vision-preview` (billing OCR) |
| Fleet API | **Trucker Path NavPro** — drivers, trips, tracking, documents |
| Maps | Google Maps JavaScript API (dark theme, live markers) |
| Weather | OpenWeather API (severe weather detection) |
| Fuel Stations | Google Places API (nearest truck stops) |
| SMS | Twilio (driver alerts + trip assignments) |
| Optimization | Custom Dynamic Programming Knapsack implementation |

---

## API Routes

| Route | Method | What it does |
|---|---|---|
| `/api/drivers` | GET | Fetch all drivers from NavPro + enrich HOS/fuel/safety |
| `/api/dispatch` | POST | Groq AI scores all drivers for a load + safety check |
| `/api/dispatch/assign` | POST | Creates trip in NavPro + SMS driver |
| `/api/alerts` | POST | Proactive check: weather + fuel + HOS + deviation |
| `/api/alerts` | GET | Current fleet alert feed |
| `/api/optimize` | POST | Route optimization or knapsack multi-load selection |
| `/api/safety` | POST | FMCSA pre-dispatch compliance check |
| `/api/billing` | POST | Groq Vision OCR + NavPro document upload |
| `/api/weather` | GET/POST | Weather at location(s) |
| `/api/fuel` | GET/POST | Nearest fuel stations + driver SMS |

---

## Architecture

```
Next.js 16 (App Router)
├── Frontend (React + TypeScript)
│   ├── FleetPanel    — driver list, HOS bars, fuel bars, cost/mile
│   ├── MapView       — Google Maps dark theme + SVG demo fallback
│   ├── Analytics     — KPIs, revenue/cost charts, OOR miles
│   ├── DispatchPanel — Groq AI scoring UI + trip assignment
│   ├── AlertsPanel   — proactive alert feed + driver check
│   ├── CostPanel     — route optimizer + knapsack DP
│   ├── SafetyPanel   — FMCSA compliance per driver
│   └── BillingPanel  — Groq Vision OCR + NavPro push
│
└── Backend (API Routes)
    ├── lib/truckerpath.ts — NavPro API client (all endpoints)
    ├── lib/groq.ts        — All Groq AI functions
    └── lib/external.ts    — OpenWeather · Google Places · Twilio
```

---

## Demo Script (2 minutes for judges)

1. **Open** → 7 drivers load on map in demo mode
2. **Click Marcus Johnson** (T1) → Smart Dispatch tab opens
3. **Enter**: Phoenix AZ → Dallas TX · 42,000 lbs · $2,800 · 6am Friday
4. **Click "Find Best Driver"** → Groq AI scores all 7 drivers in real time
5. **See scores**: HOS fitness · proximity · efficiency · safety — each with reasoning
6. **Click Assign** → trip sent via NavPro `/api/trip/create` + SMS to driver
7. **Switch to Alerts** → see HOS critical (Derek), low fuel (James) with nearest Pilot Travel Center + phone
8. **Switch to Cost AI → Knapsack** → DP algorithm selects optimal load combo across 4 available loads
9. **Switch to Safety** → click Derek Williams → FMCSA violation flagged, dispatch blocked
10. **Switch to Billing** → upload any BOL photo → Groq Vision reads every field → generate invoice

---

*Built for GlobeHack Season 1 · Trucker Path Marketplace & Growth Track*
