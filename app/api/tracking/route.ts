// app/api/tracking/route.ts
// Live signal monitoring — detects GPS loss and fires alerts after 60s silence

import { NextRequest, NextResponse } from 'next/server';

// In-memory store for last known pings (in production: Redis)
const lastPing: Record<number, { time: number; lat: number; lng: number; speed: number; onRoute: boolean; fuelStop: boolean; }> = {};
const alertsSent: Record<number, number> = {};

const SIGNAL_TIMEOUT_MS  = 60_000;  // 60 seconds before alert
const ALERT_COOLDOWN_MS  = 300_000; // 5 min between repeat alerts

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { driver_id, lat, lng, speed, on_route, fuel_stop_made } = body;

  if (!driver_id) return NextResponse.json({ error: 'driver_id required' }, { status: 400 });

  // Update heartbeat
  lastPing[driver_id] = {
    time: Date.now(),
    lat: lat || 0,
    lng: lng || 0,
    speed: speed || 0,
    onRoute: on_route !== false,
    fuelStop: fuel_stop_made === true,
  };

  return NextResponse.json({ success: true, received: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const driver_id = parseInt(searchParams.get('driver_id') || '0');

  if (driver_id) {
    // Check single driver
    const ping = lastPing[driver_id];
    if (!ping) return NextResponse.json({ status: 'no_data', driver_id });

    const elapsed = Date.now() - ping.time;
    const lost    = elapsed > SIGNAL_TIMEOUT_MS;

    return NextResponse.json({
      driver_id,
      status: lost ? 'signal_lost' : 'active',
      last_ping_seconds_ago: Math.round(elapsed / 1000),
      on_route:     ping.onRoute,
      fuel_stop:    ping.fuelStop,
      lat: ping.lat,
      lng: ping.lng,
      speed: ping.speed,
    });
  }

  // Scan all drivers for signal loss
  const now    = Date.now();
  const alerts = [];

  for (const [id, ping] of Object.entries(lastPing)) {
    const elapsed  = now - ping.time;
    const lastAlert = alertsSent[+id] || 0;
    const cooldownOk = (now - lastAlert) > ALERT_COOLDOWN_MS;

    if (elapsed > SIGNAL_TIMEOUT_MS && cooldownOk) {
      alertsSent[+id] = now;
      alerts.push({
        driver_id:        +id,
        type:             'signal_lost',
        severity:         'critical',
        title:            `📡 Signal Lost — Driver ${id}`,
        message:          `No GPS ping for ${Math.round(elapsed / 60000)} minute(s). Driver may be in a dead zone, have a device issue, or need assistance.`,
        action:           'Call driver immediately. If no response in 5 minutes, contact emergency services.',
        last_known_lat:   ping.lat,
        last_known_lng:   ping.lng,
        last_known_speed: ping.speed,
        elapsed_seconds:  Math.round(elapsed / 1000),
        timestamp:        new Date().toISOString(),
      });
    }
  }

  // Also check for off-route and missed fuel stops (from driver data)
  return NextResponse.json({
    success:     true,
    alerts,
    active_drivers: Object.keys(lastPing).length,
    signal_lost: alerts.length,
    timestamp:   new Date().toISOString(),
  });
}
