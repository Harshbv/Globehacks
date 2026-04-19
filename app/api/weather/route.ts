// app/api/weather/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getWeather } from '@/lib/external';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '33.4484');
  const lng = parseFloat(searchParams.get('lng') || '-112.074');

  try {
    const weather = await getWeather(lat, lng);
    return NextResponse.json({ success: true, weather });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { locations } = await req.json();
  // Batch weather for multiple driver locations
  const results = await Promise.allSettled(
    (locations || []).map((loc: { lat: number; lng: number; driver_id: number }) =>
      getWeather(loc.lat, loc.lng).then(w => ({ ...w, driver_id: loc.driver_id }))
    )
  );
  const weather = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<any>).value);

  return NextResponse.json({ success: true, weather, severe_count: weather.filter((w: any) => w.is_severe).length });
}
