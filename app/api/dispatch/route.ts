// app/api/dispatch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { queryDrivers, queryDriverPerformance } from '@/lib/truckerpath';
import { scoreDriversForLoad, analyzeSafety } from '@/lib/groq';
import { geocode, getWeather } from '@/lib/external';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pickup, delivery, weight_lbs, distance_miles, revenue_usd, deadline } = body;

    if (!pickup || !delivery) {
      return NextResponse.json({ error: 'pickup and delivery are required' }, { status: 400 });
    }

    // 1. Geocode pickup location
    const pickupCoords = await geocode(pickup);
    const deliveryCoords = await geocode(delivery);

    // 2. Fetch real drivers from NavPro
    let drivers = await queryDrivers();

    // 3. Fetch driver performance data (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    let performance: any[] = [];
    try {
      performance = await queryDriverPerformance(
        thirtyDaysAgo.toISOString(),
        now.toISOString()
      );
    } catch { /* performance data optional */ }

    // 4. Filter only available/in-transit drivers (not off-duty)
    const eligibleDrivers = drivers.filter(d =>
      ['AVAILABLE', 'IN_TRANSIT'].includes(d.basic_info?.work_status || '')
    );

    // 5. Build driver scoring input
    const driverInputs = eligibleDrivers.map(d => {
      const perf = performance.find(p => p.driver_id === d.driver_id);
      const oor = perf?.oor_miles || 0;
      const scheduledMiles = perf?.schedule_miles || 500;
      const efficiency = oor / scheduledMiles; // lower = better
      const costPerMile = 1.8 + (efficiency * 2); // estimate from perf data

      // Mock HOS for demo (real system gets from ELD integration)
      const hos = d.basic_info?.work_status === 'AVAILABLE' ? 10 + Math.random() * 1 : 5 + Math.random() * 6;

      return {
        id: d.driver_id,
        name: `${d.basic_info?.driver_first_name} ${d.basic_info?.driver_last_name}`,
        hos_remaining: +hos.toFixed(1),
        location: d.driver_location?.last_known_location || 'Unknown',
        lat: pickupCoords ? pickupCoords.lat + (Math.random() - 0.5) * 3 : 33.4,
        lng: pickupCoords ? pickupCoords.lng + (Math.random() - 0.5) * 3 : -112,
        pickup_lat: pickupCoords?.lat || 33.4,
        pickup_lng: pickupCoords?.lng || -112,
        status: d.basic_info?.work_status || 'AVAILABLE',
        cost_per_mile: +costPerMile.toFixed(2),
        safety_score: 70 + Math.round(Math.random() * 30),
      };
    });

    // If no real drivers, use demo data
    const scoringDrivers = driverInputs.length > 0 ? driverInputs : getDemoDrivers(pickupCoords);

    // 6. Get weather at pickup
    let weatherRisk = false;
    let weatherInfo = null;
    if (pickupCoords) {
      weatherInfo = await getWeather(pickupCoords.lat, pickupCoords.lng);
      weatherRisk = weatherInfo.is_severe;
    }

    // 7. Score drivers with Groq AI
    const dist = distance_miles || estimateDistance(pickup, delivery);
    const recommendation = await scoreDriversForLoad({
      load: {
        pickup, delivery,
        weight_lbs: weight_lbs || 40000,
        distance_miles: dist,
        revenue_usd: revenue_usd || 2500,
        deadline: deadline || 'ASAP',
      },
      drivers: scoringDrivers,
    });

    // 8. Run safety check on recommended driver
    const topDriver = scoringDrivers.find(d => d.id === recommendation.recommended_driver_id) || scoringDrivers[0];
    let safetyReport = null;
    if (topDriver) {
      safetyReport = await analyzeSafety({
        driver_name: topDriver.name,
        hos_remaining: topDriver.hos_remaining,
        hours_driven_today: 11 - topDriver.hos_remaining,
        last_rest_hours_ago: 2,
        speed_violations_7d: 0,
        hos_violations_30d: 0,
        load_distance_miles: dist,
      });
    }

    return NextResponse.json({
      success: true,
      recommendation,
      safety_report: safetyReport,
      weather: weatherInfo,
      weather_risk: weatherRisk,
      pickup_coords: pickupCoords,
      delivery_coords: deliveryCoords,
      driver_count: scoringDrivers.length,
      data_source: driverInputs.length > 0 ? 'navpro_api' : 'demo',
    });

  } catch (error: any) {
    console.error('Dispatch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getDemoDrivers(pickupCoords: any) {
  const base = pickupCoords || { lat: 33.4484, lng: -112.0740 };
  return [
    { id: 1001, name: 'Marcus Johnson', hos_remaining: 9.5, location: 'I-17 N, Phoenix AZ', lat: base.lat + 0.15, lng: base.lng - 0.2, pickup_lat: base.lat, pickup_lng: base.lng, status: 'IN_TRANSIT', cost_per_mile: 2.31, safety_score: 88 },
    { id: 1002, name: 'Sarah Chen', hos_remaining: 7.2, location: 'US-60 E, Mesa AZ', lat: base.lat - 0.1, lng: base.lng + 0.3, pickup_lat: base.lat, pickup_lng: base.lng, status: 'IN_TRANSIT', cost_per_mile: 2.14, safety_score: 94 },
    { id: 1003, name: 'James Rivera', hos_remaining: 11.0, location: 'I-10 E, Chandler AZ', lat: base.lat - 0.18, lng: base.lng + 0.15, pickup_lat: base.lat, pickup_lng: base.lng, status: 'AVAILABLE', cost_per_mile: 1.87, safety_score: 91 },
    { id: 1004, name: 'Amy Patel', hos_remaining: 2.1, location: 'AZ-89, Wickenburg AZ', lat: base.lat + 0.5, lng: base.lng - 0.6, pickup_lat: base.lat, pickup_lng: base.lng, status: 'IN_TRANSIT', cost_per_mile: 2.67, safety_score: 76 },
    { id: 1005, name: 'Derek Williams', hos_remaining: 0.8, location: 'Flagstaff, AZ', lat: base.lat + 1.7, lng: base.lng + 0.55, pickup_lat: base.lat, pickup_lng: base.lng, status: 'AVAILABLE', cost_per_mile: 2.94, safety_score: 65 },
    { id: 1006, name: 'Linda Torres', hos_remaining: 8.3, location: 'I-19 N, Tucson AZ', lat: base.lat - 1.1, lng: base.lng + 0.25, pickup_lat: base.lat, pickup_lng: base.lng, status: 'IN_TRANSIT', cost_per_mile: 2.22, safety_score: 89 },
  ];
}

function estimateDistance(pickup: string, delivery: string): number {
  // Rough estimate by state pairs — real app uses Google Distance Matrix
  const routes: Record<string, number> = {
    'AZ-TX': 1050, 'AZ-CA': 380, 'AZ-NM': 320, 'TX-IL': 1100,
    'CA-WA': 1140, 'AZ-CO': 600, 'TX-FL': 1280,
  };
  for (const [k, v] of Object.entries(routes)) {
    const [from, to] = k.split('-');
    if (pickup.includes(from) && delivery.includes(to)) return v;
    if (pickup.includes(to) && delivery.includes(from)) return v;
  }
  return 750; // default
}
