// app/types/index.ts

export interface Driver {
  driver_id: number;
  basic_info: {
    driver_first_name: string;
    driver_last_name: string;
    work_status: 'IN_TRANSIT' | 'AVAILABLE' | 'OFF_DUTY' | 'SLEEPER_BERTH';
    driver_phone_number?: string;
    driver_email?: string;
  };
  driver_location?: {
    last_known_location: string;
    latest_update: number;
  };
  loads?: {
    driver_current_load?: {
      origin: string;
      destination: string;
      revenue?: number;
    };
  };
  enriched: {
    hos_remaining: number;
    fuel_level_pct: number;
    speed_mph: number;
    cost_per_mile: number;
    safety_score: number;
    oor_miles: number;
    efficiency_pct: number;
    lat: number;
    lng: number;
  };
}

export interface DriverScore {
  driver_id: number;
  driver_name: string;
  total_score: number;
  hos_score: number;
  proximity_score: number;
  efficiency_score: number;
  safety_score: number;
  deadhead_miles: number;
  pickup_eta_minutes: number;
  estimated_cost_usd: number;
  recommended: boolean;
  reasoning: string;
}

export interface DispatchResult {
  recommended_driver_id: number;
  drivers: DriverScore[];
  load_summary: string;
  estimated_profit_usd: number;
  risk_flags: string[];
}

export interface Alert {
  type: 'weather' | 'fuel' | 'hos' | 'deviation' | 'safety';
  severity: 'critical' | 'warning' | 'info' | 'ok';
  title: string;
  message: string;
  action?: string;
  sms?: string;
  time?: string;
  driver?: string;
  nearest_station?: FuelStation;
  fuel_level_pct?: number;
  hos_remaining?: number;
}

export interface FuelStation {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance_miles: number;
  rating?: number;
  is_truck_stop: boolean;
  phone?: string;
}

export interface RouteOptimization {
  recommended_route: string;
  total_miles: number;
  estimated_hours: number;
  fuel_cost_usd: number;
  toll_cost_usd: number;
  total_cost_usd: number;
  profit_usd: number;
  margin_pct: number;
  rest_stops: RestStop[];
  fuel_stops: FuelStop[];
  cost_per_mile: number;
  optimization_notes: string;
}

export interface RestStop {
  location: string;
  miles_from_start: number;
  duration_minutes: number;
  reason: string;
}

export interface FuelStop {
  station_name: string;
  location: string;
  miles_from_start: number;
}

export interface SafetyReport {
  overall_score: number;
  hos_compliance: 'compliant' | 'warning' | 'violation';
  fatigue_risk: 'low' | 'medium' | 'high';
  flags: string[];
  recommendations: string[];
  block_dispatch: boolean;
  block_reason?: string;
}

export interface KnapsackResult {
  selected_loads: any[];
  total_revenue: number;
  total_miles: number;
  total_weight: number;
  profit_usd: number;
  utilization_pct: number;
}
