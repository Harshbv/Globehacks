// app/api/alerts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { analyzeAlertCondition } from '@/lib/groq';
import { getWeather, findNearbyFuelStations, sendSMS } from '@/lib/external';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { driver_id, driver_name, driver_phone, driver_lat, driver_lng, condition, fuel_level_pct, hos_remaining, route_deviation_miles } = body;

    const results: any[] = [];

    // ── 1. Weather Alert ──────────────────────────────────────────────────────
    if (driver_lat && driver_lng) {
      const weather = await getWeather(driver_lat, driver_lng);
      if (weather.is_severe || weather.wind_mph > 45 || weather.visibility_miles < 2) {
        const analysis = await analyzeAlertCondition({
          driver_name, driver_phone,
          condition: 'bad_weather',
          context: `Weather: ${weather.condition}, Wind: ${weather.wind_mph}mph, Visibility: ${weather.visibility_miles}mi, Temp: ${weather.temp_f}°F. ${weather.alerts.join('. ')}`,
          weather_data: weather,
        });

        results.push({
          type: 'weather',
          severity: analysis.severity,
          title: `⛈ Weather Alert — ${driver_name}`,
          message: analysis.message,
          action: analysis.action_required,
          sms: analysis.suggested_sms,
          weather,
          auto_notify: analysis.notify_dispatcher,
        });

        // Auto-send SMS if critical
        if (analysis.severity === 'critical' && driver_phone) {
          await sendSMS(driver_phone, analysis.suggested_sms);
        }
      }
    }

    // ── 2. Low Fuel Alert ─────────────────────────────────────────────────────
    if (fuel_level_pct !== undefined && fuel_level_pct < 25) {
      const stations = driver_lat && driver_lng
        ? await findNearbyFuelStations(driver_lat, driver_lng, 15)
        : [];

      const analysis = await analyzeAlertCondition({
        driver_name, driver_phone,
        condition: 'low_fuel',
        context: `Fuel level: ${fuel_level_pct}%. Driver location: lat ${driver_lat}, lng ${driver_lng}. ${fuel_level_pct < 10 ? 'CRITICALLY LOW — risk of running out on highway.' : 'Getting low — plan fuel stop soon.'}`,
        nearest_fuel_stations: stations.slice(0, 3),
      });

      const nearest = stations[0];
      results.push({
        type: 'fuel',
        severity: fuel_level_pct < 10 ? 'critical' : 'warning',
        title: `⛽ Low Fuel — ${driver_name}`,
        message: analysis.message,
        action: analysis.action_required,
        sms: analysis.suggested_sms,
        nearest_station: nearest || analysis.nearest_fuel_station,
        all_stations: stations,
        fuel_level_pct,
        auto_notify: true,
      });

      // Send SMS to driver with nearest station info
      if (driver_phone && nearest) {
        const sms = `DispatchIQ Alert: Low fuel (${fuel_level_pct}%). Nearest stop: ${nearest.name} - ${nearest.address} (${nearest.distance_miles}mi). ${nearest.phone ? 'Call: '+nearest.phone : ''}`;
        await sendSMS(driver_phone, sms);
      }
    }

    // ── 3. HOS Warning ────────────────────────────────────────────────────────
    if (hos_remaining !== undefined && hos_remaining < 3) {
      const analysis = await analyzeAlertCondition({
        driver_name, driver_phone,
        condition: 'hos_warning',
        context: `HOS remaining: ${hos_remaining}h. ${hos_remaining < 1 ? 'CRITICAL — driver must stop NOW per FMCSA regulations.' : 'Warning — approaching HOS limit. Plan rest stop.'}`,
      });

      results.push({
        type: 'hos',
        severity: hos_remaining < 1 ? 'critical' : 'warning',
        title: `⏰ HOS ${hos_remaining < 1 ? 'VIOLATION' : 'Warning'} — ${driver_name}`,
        message: analysis.message,
        action: analysis.action_required,
        sms: analysis.suggested_sms,
        hos_remaining,
        block_dispatch: hos_remaining < 2,
        auto_notify: true,
      });

      if (driver_phone && hos_remaining < 2) {
        await sendSMS(driver_phone, `DispatchIQ URGENT: ${hos_remaining.toFixed(1)}h HOS remaining. You must take a mandatory rest break. Do NOT accept new loads.`);
      }
    }

    // ── 4. Route Deviation Alert ──────────────────────────────────────────────
    if (route_deviation_miles !== undefined && route_deviation_miles > 5) {
      const analysis = await analyzeAlertCondition({
        driver_name, driver_phone,
        condition: 'route_deviation',
        context: `Driver is ${route_deviation_miles} miles off planned route. This is costing extra deadhead miles and affecting delivery ETA.`,
      });

      results.push({
        type: 'deviation',
        severity: route_deviation_miles > 20 ? 'warning' : 'info',
        title: `🗺 Route Deviation — ${driver_name}`,
        message: analysis.message,
        action: analysis.action_required,
        sms: analysis.suggested_sms,
        deviation_miles: route_deviation_miles,
        auto_notify: route_deviation_miles > 15,
      });
    }

    return NextResponse.json({
      success: true,
      driver_id,
      alerts: results,
      alert_count: results.length,
      critical_count: results.filter(r => r.severity === 'critical').length,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Alerts error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET - poll alerts for all drivers
export async function GET() {
  // In production, this would poll all active drivers
  // For demo, return sample alerts
  return NextResponse.json({
    success: true,
    alerts: [
      { type: 'hos', severity: 'critical', driver: 'Derek Williams', title: '⏰ HOS Critical', message: '0.8h remaining — dispatch blocked', time: '2m ago' },
      { type: 'fuel', severity: 'warning', driver: 'James Rivera', title: '⛽ Low Fuel', message: '22% fuel — nearest Pilot 3.8mi', time: '8m ago' },
      { type: 'weather', severity: 'warning', driver: 'All I-40 loads', title: '⛈ Weather Alert', message: 'Thunderstorm warning — I-40 Flagstaff corridor', time: '15m ago' },
      { type: 'deviation', severity: 'info', driver: 'Amy Patel', title: '🗺 Route Deviation', message: '12mi off planned route — ETA adjusted', time: '22m ago' },
    ],
  });
}
