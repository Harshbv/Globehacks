// app/api/driver-coach/route.ts
import { NextRequest, NextResponse } from 'next/server';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { driver_name, situation, current_speed, speed_limit, hos_remaining, fuel_pct, on_route, missed_fuel_stop, missed_rest, distance_to_destination, current_location, destination } = body;

  const key = process.env.GROQ_API_KEY;

  const prompt = `You are DispatchIQ Driver Coach — a real-time AI assistant helping commercial truck drivers be safer, more efficient, and more profitable.

Driver: ${driver_name}
Situation: ${situation || 'routine check'}
Current speed: ${current_speed || 0}mph ${speed_limit ? `(limit: ${speed_limit}mph)` : ''}
HOS remaining: ${hos_remaining || 8}h
Fuel level: ${fuel_pct || 60}%
On planned route: ${on_route !== false ? 'Yes' : 'No — DEVIATION DETECTED'}
Missed fuel stop: ${missed_fuel_stop ? 'YES' : 'No'}
Missed rest area: ${missed_rest ? 'YES' : 'No'}
Location: ${current_location || 'unknown'}
Destination: ${destination || 'unknown'}
Miles remaining: ${distance_to_destination || 'unknown'}

Provide a BRIEF, PRACTICAL coaching response (max 120 words). Include:
1. Immediate action (if urgent)
2. Why it matters for their profit/score
3. Specific recovery suggestion

Be direct and friendly, like a co-pilot. If speeding, be firm but supportive. Mention specific mile/time savings where possible. Return ONLY JSON:
{
  "urgency": "critical|warning|info|ok",
  "headline": "<10 word headline>",
  "message": "<coaching message — max 100 words>",
  "action": "<immediate action to take>",
  "impact": "<profit/score impact>",
  "score_change": "<e.g. −10 pts if not fixed>",
  "recovery_plan": "<specific steps to recover>"
}`;

  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 400, temperature: 0.3 }),
    });
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] || '{}');
    return NextResponse.json({ success: true, coaching: parsed });
  } catch {
    // Demo fallback
    const isSpeed = (current_speed || 0) > (speed_limit || 65);
    const isFuel  = (fuel_pct || 60) < 25;
    const isHOS   = (hos_remaining || 8) < 3;
    const urgency = isSpeed || isHOS ? 'critical' : isFuel ? 'warning' : 'ok';

    return NextResponse.json({
      success: true,
      coaching: {
        urgency,
        headline: isSpeed ? 'Reduce speed immediately' : isFuel ? 'Plan fuel stop now' : isHOS ? 'Rest stop needed soon' : 'You\'re on track — keep it up!',
        message: isSpeed
          ? `You're at ${current_speed}mph in a ${speed_limit||65}mph zone. Every speeding violation costs −5 safety points and risks a $200+ fine. Slow down now — you'll still make your delivery on time.`
          : isFuel
          ? `Fuel at ${fuel_pct}% — plan your stop at the next truck stop (within 10mi). Running dry on a highway costs $400+ in towing and delays your delivery by 3+ hours.`
          : isHOS
          ? `Only ${hos_remaining}h HOS remaining. Take your 30-min break at the next rest area. This keeps you compliant and prevents a $11,000 FMCSA violation.`
          : `Great driving ${driver_name}! HOS at ${hos_remaining}h, fuel at ${fuel_pct}%. Stay on route and you'll hit your ETA with margin to spare.`,
        action: isSpeed ? 'Reduce to speed limit immediately' : isFuel ? 'Stop at next truck stop' : isHOS ? 'Take 30-min break at next rest area' : 'Continue current pace',
        impact: isSpeed ? 'Avoids $200 fine + −5 safety score' : isFuel ? 'Avoids $400 tow + delivery delay' : '+5 safety bonus for clean run',
        score_change: isSpeed ? '−5 pts if continued' : isFuel ? '−10 pts if missed' : '+5 pts for clean week',
        recovery_plan: isSpeed
          ? 'Slow to 63mph now. You will reach Dallas only 8 min later but save your safety score and avoid citation risk.'
          : isFuel
          ? 'Exit at next fuel stop. Fill to 80%+. Rejoin I-10 E — only 12 min delay vs 3h breakdown risk.'
          : 'You\'re doing great — maintain current pace.',
      },
    });
  }
}
