// app/api/fuel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { findNearbyFuelStations } from '@/lib/external';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '33.4484');
  const lng = parseFloat(searchParams.get('lng') || '-112.074');
  const radius = parseFloat(searchParams.get('radius') || '15');

  try {
    const stations = await findNearbyFuelStations(lat, lng, radius);
    return NextResponse.json({
      success: true,
      stations,
      count: stations.length,
      nearest: stations[0] || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { lat, lng, radius, driver_name, driver_phone } = await req.json();
  try {
    const stations = await findNearbyFuelStations(lat || 33.4484, lng || -112.074, radius || 15);
    const nearest = stations[0];

    return NextResponse.json({
      success: true,
      stations,
      nearest,
      dispatcher_message: nearest
        ? `${driver_name} is low on fuel. Nearest truck stop: ${nearest.name} at ${nearest.address} — ${nearest.distance_miles}mi away.${nearest.phone ? ' Phone: ' + nearest.phone : ''}`
        : `${driver_name} is low on fuel. No truck stops found within ${radius || 15} miles.`,
      driver_sms: nearest
        ? `DispatchIQ: Low fuel alert. Nearest stop: ${nearest.name}, ${nearest.address} (${nearest.distance_miles}mi). ${nearest.phone ? 'Call: ' + nearest.phone : ''}`
        : 'DispatchIQ: Low fuel alert. Contact dispatch for fuel stop assistance.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
