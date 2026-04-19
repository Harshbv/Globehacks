// lib/groq.ts
// Groq AI client - uses llama-3.3-70b-versatile (fast, free tier)

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_KEY  = process.env.GROQ_API_KEY || '';
const MODEL     = 'llama-3.3-70b-versatile';

interface GroqMessage { role: 'system' | 'user' | 'assistant'; content: string; }

async function groqChat(messages: GroqMessage[], maxTokens = 1024): Promise<string> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature: 0.2 }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJSON<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON in Groq response');
  return JSON.parse(match[0]);
}

// ─── Smart Dispatch Scoring ───────────────────────────────────────────────────
export interface DriverScore {
  driver_id: number;
  driver_name: string;
  total_score: number;        // 0-100
  hos_score: number;          // HOS hours remaining score
  proximity_score: number;    // Distance to pickup score  
  efficiency_score: number;   // Cost per mile score
  safety_score: number;       // Safety/compliance score
  deadhead_miles: number;
  pickup_eta_minutes: number;
  estimated_cost_usd: number;
  recommended: boolean;
  reasoning: string;
}

export interface DispatchRecommendation {
  recommended_driver_id: number;
  drivers: DriverScore[];
  load_summary: string;
  estimated_profit_usd: number;
  risk_flags: string[];
}

export async function scoreDriversForLoad(params: {
  load: { pickup: string; delivery: string; weight_lbs: number; distance_miles: number; revenue_usd: number; deadline: string; };
  drivers: Array<{ id: number; name: string; hos_remaining: number; location: string; lat: number; lng: number; pickup_lat: number; pickup_lng: number; status: string; cost_per_mile: number; safety_score: number; }>;
}): Promise<DispatchRecommendation> {
  const system = `You are DispatchIQ, an expert fleet dispatch AI for Trucker Path NavPro. 
You score drivers using multiple factors and apply the knapsack optimization concept — 
maximizing profit while respecting constraints (HOS, weight limits, time windows).
Always return valid JSON only.`;

  const user = `Score these drivers for this load and recommend the optimal assignment.

LOAD:
- Pickup: ${params.load.pickup}
- Delivery: ${params.load.delivery}
- Weight: ${params.load.weight_lbs.toLocaleString()} lbs
- Distance: ${params.load.distance_miles} miles
- Revenue: $${params.load.revenue_usd}
- Deadline: ${params.load.deadline}
- Estimated fuel cost: $${(params.load.distance_miles * 0.65).toFixed(0)}

DRIVERS:
${params.drivers.map(d => `
Driver ID ${d.id} — ${d.name}
  Status: ${d.status}
  Location: ${d.location}
  HOS Remaining: ${d.hos_remaining}h
  Deadhead to pickup: ${Math.round(Math.sqrt(Math.pow(d.lat - d.pickup_lat,2) + Math.pow(d.lng - d.pickup_lng,2)) * 69)} miles (approx)
  Cost/mile: $${d.cost_per_mile}
  Safety score: ${d.safety_score}/100`).join('\n')}

SCORING RULES (weighted):
- HOS (30%): Must have >2h. Optimal is >8h. Score 0 if <2h (disqualified).
- Proximity (25%): Shorter deadhead = higher score. <50mi = 100, >200mi = 0.
- Efficiency (25%): Lower cost/mile = higher score. Affects profit margin.
- Safety (20%): Higher safety score = lower incident risk.

Also apply knapsack optimization: find the driver assignment that maximizes profit = revenue - (deadhead_cost + trip_cost + driver_cost) while ensuring on-time delivery.

Return ONLY this JSON:
{
  "recommended_driver_id": <id>,
  "drivers": [
    {
      "driver_id": <id>,
      "driver_name": "<name>",
      "total_score": <0-100>,
      "hos_score": <0-100>,
      "proximity_score": <0-100>,
      "efficiency_score": <0-100>,
      "safety_score": <0-100>,
      "deadhead_miles": <number>,
      "pickup_eta_minutes": <number>,
      "estimated_cost_usd": <number>,
      "recommended": <true/false>,
      "reasoning": "<1 sentence>"
    }
  ],
  "load_summary": "<2 sentence summary of the dispatch decision>",
  "estimated_profit_usd": <number>,
  "risk_flags": ["<any risks like weather, HOS close to limit, etc>"]
}`;

  const raw = await groqChat([{ role: 'system', content: system }, { role: 'user', content: user }], 1500);
  return parseJSON<DispatchRecommendation>(raw);
}

// ─── Proactive Alert Analysis ─────────────────────────────────────────────────
export interface AlertAnalysis {
  severity: 'critical' | 'warning' | 'info';
  alert_type: string;
  message: string;
  action_required: string;
  notify_dispatcher: boolean;
  notify_driver: boolean;
  suggested_sms: string;
  nearest_fuel_station?: { name: string; address: string; distance_miles: number; phone?: string; };
}

export async function analyzeAlertCondition(params: {
  driver_name: string;
  driver_phone: string;
  condition: 'low_fuel' | 'bad_weather' | 'hos_warning' | 'route_deviation' | 'breakdown';
  context: string;
  nearest_fuel_stations?: Array<{ name: string; address: string; distance_miles: number; }>;
  weather_data?: object;
}): Promise<AlertAnalysis> {
  const system = `You are a proactive fleet safety AI. You analyze conditions and generate precise, actionable alerts for dispatchers and drivers. Always return valid JSON.`;

  const user = `Analyze this fleet condition and generate an alert.

Driver: ${params.driver_name} (${params.driver_phone})
Condition: ${params.condition}
Context: ${params.context}
${params.nearest_fuel_stations ? `Nearest fuel stations: ${JSON.stringify(params.nearest_fuel_stations)}` : ''}
${params.weather_data ? `Weather data: ${JSON.stringify(params.weather_data)}` : ''}

Return ONLY this JSON:
{
  "severity": "critical|warning|info",
  "alert_type": "<type>",
  "message": "<clear dispatcher message>",
  "action_required": "<specific action>",
  "notify_dispatcher": true/false,
  "notify_driver": true/false,
  "suggested_sms": "<SMS to send driver — max 160 chars>",
  "nearest_fuel_station": { "name": "<n>", "address": "<a>", "distance_miles": <n>, "phone": "<phone or null>" }
}`;

  const raw = await groqChat([{ role: 'system', content: system }, { role: 'user', content: user }]);
  return parseJSON<AlertAnalysis>(raw);
}

// ─── Cost Intelligence / Knapsack Optimization ───────────────────────────────
export interface RouteOptimization {
  recommended_route: string;
  total_miles: number;
  estimated_hours: number;
  fuel_cost_usd: number;
  toll_cost_usd: number;
  total_cost_usd: number;
  profit_usd: number;
  margin_pct: number;
  rest_stops: Array<{ location: string; miles_from_start: number; duration_minutes: number; reason: string; }>;
  fuel_stops: Array<{ station_name: string; location: string; miles_from_start: number; }>;
  cost_per_mile: number;
  optimization_notes: string;
}

export async function optimizeRoute(params: {
  pickup: string; delivery: string;
  distance_miles: number; revenue_usd: number;
  driver_hos_remaining: number; truck_mpg: number;
  fuel_price_per_gallon: number; weight_lbs: number;
}): Promise<RouteOptimization> {
  const system = `You are a freight route optimization AI. Apply knapsack problem methodology to maximize profit while respecting HOS regulations (11h driving, 14h on-duty), mandatory rest breaks (30min after 8h), and fuel constraints. Return valid JSON only.`;

  const fuelGallons = params.distance_miles / params.truck_mpg;
  const fuelCost = fuelGallons * params.fuel_price_per_gallon;

  const user = `Optimize this freight route.

TRIP DETAILS:
- Pickup: ${params.pickup}
- Delivery: ${params.delivery}
- Distance: ${params.distance_miles} miles
- Revenue: $${params.revenue_usd}
- Driver HOS remaining: ${params.driver_hos_remaining}h
- Truck MPG: ${params.truck_mpg}
- Fuel price: $${params.fuel_price_per_gallon}/gal
- Estimated fuel: ${fuelGallons.toFixed(0)} gallons = $${fuelCost.toFixed(0)}
- Weight: ${params.weight_lbs.toLocaleString()} lbs

Apply FMCSA HOS rules: 11h max driving, mandatory 30min break after 8h, 10h off-duty between shifts.
Include realistic rest stops and fuel stops.
Calculate true profit = revenue - fuel - tolls - driver_pay (estimate $0.45/mile).

Return ONLY this JSON:
{
  "recommended_route": "<route description>",
  "total_miles": <n>,
  "estimated_hours": <n>,
  "fuel_cost_usd": <n>,
  "toll_cost_usd": <n>,
  "total_cost_usd": <n>,
  "profit_usd": <n>,
  "margin_pct": <n>,
  "rest_stops": [{"location":"<city>","miles_from_start":<n>,"duration_minutes":<n>,"reason":"<HOS break/overnight/mandatory>"}],
  "fuel_stops": [{"station_name":"<n>","location":"<city, state>","miles_from_start":<n>}],
  "cost_per_mile": <n>,
  "optimization_notes": "<key insight about this route>"
}`;

  const raw = await groqChat([{ role: 'system', content: system }, { role: 'user', content: user }], 1200);
  return parseJSON<RouteOptimization>(raw);
}

// ─── Safety Analysis ──────────────────────────────────────────────────────────
export interface SafetyReport {
  overall_score: number;
  hos_compliance: 'compliant' | 'warning' | 'violation';
  fatigue_risk: 'low' | 'medium' | 'high';
  flags: string[];
  recommendations: string[];
  block_dispatch: boolean;
  block_reason?: string;
}

export async function analyzeSafety(params: {
  driver_name: string;
  hos_remaining: number;
  hours_driven_today: number;
  last_rest_hours_ago: number;
  speed_violations_7d: number;
  hos_violations_30d: number;
  load_distance_miles: number;
}): Promise<SafetyReport> {
  const system = `You are a FMCSA compliance AI. Analyze driver safety data and flag risks before they become incidents. Return valid JSON only.`;

  const user = `Analyze this driver's safety profile before dispatching a new load.

Driver: ${params.driver_name}
HOS remaining: ${params.hos_remaining}h
Hours driven today: ${params.hours_driven_today}h
Last rest: ${params.last_rest_hours_ago}h ago
Speed violations (7 days): ${params.speed_violations_7d}
HOS violations (30 days): ${params.hos_violations_30d}
New load distance: ${params.load_distance_miles} miles
Required driving time: ~${(params.load_distance_miles/55).toFixed(1)}h

FMCSA Rules: 11h max driving, 14h on-duty window, 30min break after 8h, 10h off between shifts.

Return ONLY this JSON:
{
  "overall_score": <0-100>,
  "hos_compliance": "compliant|warning|violation",
  "fatigue_risk": "low|medium|high",
  "flags": ["<specific flag>"],
  "recommendations": ["<action>"],
  "block_dispatch": <true/false>,
  "block_reason": "<reason if blocked, null otherwise>"
}`;

  const raw = await groqChat([{ role: 'system', content: system }, { role: 'user', content: user }]);
  return parseJSON<SafetyReport>(raw);
}

// ─── Billing OCR Extraction ───────────────────────────────────────────────────
export async function extractBillingFields(imageBase64: string): Promise<Record<string, string>> {
  // Note: Groq vision uses llama-3.2-11b-vision-preview
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-preview',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: 'Extract all fields from this freight document (BOL/POD/receipt). Return ONLY JSON: {"document_type":"","load_number":"","shipper":"","consignee":"","pickup":"","delivery":"","weight":"","commodity":"","rate":"","fuel_surcharge":"","total":"","date":"","driver_signature":"present|absent","notes":""}' }
        ]
      }],
      max_tokens: 600,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`Groq vision error: ${res.status}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  return parseJSON<Record<string, string>>(raw);
}
