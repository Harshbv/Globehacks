// app/api/optimize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { optimizeRoute } from '@/lib/groq';
import { geocode, findNearbyFuelStations, getWeather } from '@/lib/external';

// ─── Knapsack Optimization for Multi-Load Assignment ─────────────────────────
interface Load {
  id: string;
  pickup: string;
  delivery: string;
  weight_lbs: number;
  revenue_usd: number;
  distance_miles: number;
  deadline_hours: number;
  priority: number;
}

interface KnapsackResult {
  selected_loads: Load[];
  total_revenue: number;
  total_miles: number;
  total_weight: number;
  profit_usd: number;
  utilization_pct: number;
}

function knapsackOptimize(loads: Load[], truck_capacity_lbs: number, max_hours: number): KnapsackResult {
  // Dynamic programming knapsack — maximize revenue within weight + time constraints
  const n = loads.length;
  const W = Math.floor(truck_capacity_lbs / 1000); // scale to integer
  const T = Math.floor(max_hours * 2); // 30-min slots

  // 3D DP: items × weight × time
  const dp: number[][][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: W + 1 }, () => Array(T + 1).fill(0))
  );

  for (let i = 1; i <= n; i++) {
    const load = loads[i - 1];
    const w = Math.ceil(load.weight_lbs / 1000);
    const t = Math.ceil((load.distance_miles / 55) * 2); // hours × 2 for slots
    const v = load.revenue_usd;

    for (let wrem = 0; wrem <= W; wrem++) {
      for (let trem = 0; trem <= T; trem++) {
        dp[i][wrem][trem] = dp[i-1][wrem][trem];
        if (wrem >= w && trem >= t) {
          dp[i][wrem][trem] = Math.max(dp[i][wrem][trem], dp[i-1][wrem-w][trem-t] + v);
        }
      }
    }
  }

  // Backtrack to find selected loads
  const selected: Load[] = [];
  let wrem = W, trem = T;
  for (let i = n; i >= 1; i--) {
    if (dp[i][wrem][trem] !== dp[i-1][wrem][trem]) {
      selected.push(loads[i-1]);
      const w = Math.ceil(loads[i-1].weight_lbs / 1000);
      const t = Math.ceil((loads[i-1].distance_miles / 55) * 2);
      wrem -= w; trem -= t;
    }
  }

  const totalRevenue = selected.reduce((s, l) => s + l.revenue_usd, 0);
  const totalMiles = selected.reduce((s, l) => s + l.distance_miles, 0);
  const totalWeight = selected.reduce((s, l) => s + l.weight_lbs, 0);
  const fuelCost = totalMiles * 0.65;
  const driverCost = totalMiles * 0.45;

  return {
    selected_loads: selected,
    total_revenue: totalRevenue,
    total_miles: totalMiles,
    total_weight: totalWeight,
    profit_usd: totalRevenue - fuelCost - driverCost,
    utilization_pct: Math.round((totalWeight / truck_capacity_lbs) * 100),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, pickup, delivery, distance_miles, revenue_usd, driver_hos_remaining, truck_mpg, fuel_price, weight_lbs, available_loads, truck_capacity_lbs } = body;

    if (mode === 'knapsack' && available_loads) {
      // ── Multi-load knapsack optimization ──────────────────────────────────
      const capacity = truck_capacity_lbs || 45000;
      const maxHours = driver_hos_remaining || 11;
      const result = knapsackOptimize(available_loads, capacity, maxHours);

      return NextResponse.json({
        success: true,
        mode: 'knapsack',
        optimization: result,
        algorithm: 'Dynamic Programming Knapsack — maximizes revenue within weight + HOS time constraints',
        timestamp: new Date().toISOString(),
      });
    }

    // ── Single route optimization ──────────────────────────────────────────
    if (!pickup || !delivery) {
      return NextResponse.json({ error: 'pickup and delivery required' }, { status: 400 });
    }

    const dist = distance_miles || 750;
    const pickupCoords = await geocode(pickup);

    // Get weather and fuel stations along route
    let weather = null;
    let fuelStations: any[] = [];
    if (pickupCoords) {
      [weather, fuelStations] = await Promise.all([
        getWeather(pickupCoords.lat, pickupCoords.lng),
        findNearbyFuelStations(pickupCoords.lat, pickupCoords.lng, 50),
      ]);
    }

    // AI route optimization with Groq
    const optimization = await optimizeRoute({
      pickup, delivery,
      distance_miles: dist,
      revenue_usd: revenue_usd || 2500,
      driver_hos_remaining: driver_hos_remaining || 11,
      truck_mpg: truck_mpg || 6.5,
      fuel_price_per_gallon: fuel_price || 4.20,
      weight_lbs: weight_lbs || 40000,
    });

    return NextResponse.json({
      success: true,
      mode: 'single_route',
      optimization,
      weather,
      fuel_stations: fuelStations.slice(0, 3),
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Optimize error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
