// lib/truckerpath.ts
// Official Trucker Path NavPro API v1 client

const BASE = process.env.TRUCKERPATH_BASE_URL || 'https://api.truckerpath.com/navpro';
const KEY  = process.env.TRUCKERPATH_API_KEY  || '';

async function navpro<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NavPro ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Driver APIs ──────────────────────────────────────────────────────────────
export interface Driver {
  driver_id: number;
  basic_info: {
    driver_first_name: string;
    driver_last_name: string;
    work_status: 'IN_TRANSIT' | 'AVAILABLE' | 'OFF_DUTY' | 'SLEEPER_BERTH';
    driver_phone_number?: string;
    driver_email?: string;
    driver_type?: string;
    terminal?: string;
  };
  driver_location?: {
    last_known_location: string;
    latest_update: number;
    timezone?: string;
  };
  loads?: {
    driver_current_load?: {
      origin: string;
      destination: string;
      revenue?: number;
      pickup_date?: number;
      delivery_date?: number;
    };
  };
}

export interface DriverPerformance {
  driver_id: number;
  oor_miles: number;       // Out-of-route miles
  schedule_miles: number;
  actual_miles: number;
  schedule_time: number;   // minutes
  actual_time: number;     // minutes
}

export async function queryDrivers(page = 0, pageSize = 50): Promise<Driver[]> {
  const data = await navpro<any>('/api/driver/query', { page, page_size: pageSize });
  return data.data || [];
}

export async function queryDriverPerformance(
  startTime: string,
  endTime: string,
  driverId?: number
): Promise<DriverPerformance[]> {
  const body: any = { start_time: startTime, end_time: endTime, page: 0, page_size: 50 };
  if (driverId) body.driver_id = driverId;
  const data = await navpro<any>('/api/driver/performance/query', body);
  return data.data || [];
}

// ─── Tracking APIs ────────────────────────────────────────────────────────────
export interface DriverDispatch {
  trail: Array<{ id: number; latitude: number; longitude: number; time: string }>;
  active_trip?: {
    trip_id: number;
    eta: string;
    origin: string;
    destination: string;
  };
}

export async function getDriverDispatch(driverId: number): Promise<DriverDispatch> {
  const data = await navpro<any>('/api/tracking/get/driver-dispatch', { driver_id: driverId });
  return data.data || { trail: [] };
}

// ─── Trip APIs ────────────────────────────────────────────────────────────────
export interface TripStop {
  latitude: number;
  longitude: number;
  address_name: string;
  appointment_time?: string;
  dwell_time?: number;
  notes?: string;
}

export async function createTrip(params: {
  driver_id: number;
  scheduled_start_time: string;
  stop_points: TripStop[];
  routing_profile_id?: number;
}): Promise<{ trip_id: number; success: boolean }> {
  const data = await navpro<any>('/api/trip/create', params);
  return { trip_id: data.trip_id, success: data.success };
}

// ─── Vehicle APIs ─────────────────────────────────────────────────────────────
export interface Vehicle {
  vehicle_id: number;
  vehicle_name?: string;
  vehicle_status: string;
  license_plate?: string;
  vin?: string;
}

export async function queryVehicles(): Promise<Vehicle[]> {
  const data = await navpro<any>('/api/vehicle/query', { page: 0, page_size: 50 });
  return data.data || [];
}

// ─── Document APIs ────────────────────────────────────────────────────────────
export interface NavProDocument {
  document_id: number;
  document_name: string;
  document_type: string;
  upload_time?: string;
}

export async function queryDocuments(driverId?: number): Promise<NavProDocument[]> {
  const body: any = { page: 0, page_size: 50 };
  if (driverId) body.driver_id = driverId;
  const data = await navpro<any>('/api/document/query', body);
  return data.data || [];
}

export async function addDocument(params: {
  document_name: string;
  document_type: string;
  file_base64: string;
  driver_ids?: number[];
}): Promise<{ document_id: number }> {
  const data = await navpro<any>('/api/document/add', params);
  return { document_id: data.document_result?.document_id };
}
