// app/api/drivers/route.ts
import { NextResponse } from 'next/server';
import { queryDrivers, queryDriverPerformance } from '@/lib/truckerpath';

export async function GET() {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const [drivers, performance] = await Promise.allSettled([
      queryDrivers(),
      queryDriverPerformance(sevenDaysAgo.toISOString(), now.toISOString()),
    ]);

    const driverList = drivers.status === 'fulfilled' ? drivers.value : getDemoDrivers();
    const perfData = performance.status === 'fulfilled' ? performance.value : [];

    // Enrich drivers with performance + simulated HOS/location
    const enriched = driverList.map((d, i) => {
      const perf = perfData.find((p: any) => p.driver_id === d.driver_id);
      const oor = perf?.oor_miles || 0;
      const actualMiles = perf?.actual_miles || 500;
      const schedMiles = perf?.schedule_miles || 500;

      return {
        ...d,
        enriched: {
          hos_remaining: +(8 + Math.random() * 3).toFixed(1),
          fuel_level_pct: Math.round(25 + Math.random() * 70),
          speed_mph: d.basic_info?.work_status === 'IN_TRANSIT' ? Math.round(52 + Math.random() * 18) : 0,
          cost_per_mile: +(1.85 + Math.random() * 1.1).toFixed(2),
          safety_score: Math.round(65 + Math.random() * 35),
          oor_miles: +oor.toFixed(1),
          efficiency_pct: schedMiles > 0 ? Math.round((schedMiles / actualMiles) * 100) : 100,
          lat: 33.4484 + (Math.random() - 0.5) * 4,
          lng: -112.074 + (Math.random() - 0.5) * 4,
        },
      };
    });

    return NextResponse.json({
      success: true,
      drivers: enriched,
      count: enriched.length,
      data_source: drivers.status === 'fulfilled' && driverList.length > 0 ? 'navpro_api' : 'demo',
    });

  } catch (error: any) {
    return NextResponse.json({ success: true, drivers: getDemoDrivers(), data_source: 'demo' });
  }
}

function getDemoDrivers() {
  return [
    { driver_id:1001, basic_info:{ driver_first_name:'Marcus', driver_last_name:'Johnson', work_status:'IN_TRANSIT', driver_phone_number:'602-555-0101', driver_email:'m.johnson@fleet.com' }, driver_location:{ last_known_location:'I-17 N near Cordes Junction, AZ', latest_update: Date.now() }, loads:{ driver_current_load:{ origin:'Phoenix, AZ', destination:'Albuquerque, NM', revenue:2800 } }, enriched:{ hos_remaining:9.5, fuel_level_pct:68, speed_mph:62, cost_per_mile:2.31, safety_score:88, oor_miles:12.5, efficiency_pct:97, lat:34.1, lng:-112.3 } },
    { driver_id:1002, basic_info:{ driver_first_name:'Sarah', driver_last_name:'Chen', work_status:'IN_TRANSIT', driver_phone_number:'602-555-0102', driver_email:'s.chen@fleet.com' }, driver_location:{ last_known_location:'US-60 E near Wickenburg, AZ', latest_update: Date.now()-300000 }, loads:{ driver_current_load:{ origin:'Tucson, AZ', destination:'Flagstaff, AZ', revenue:1200 } }, enriched:{ hos_remaining:7.2, fuel_level_pct:41, speed_mph:58, cost_per_mile:2.14, safety_score:94, oor_miles:4.2, efficiency_pct:99, lat:33.97, lng:-112.73 } },
    { driver_id:1003, basic_info:{ driver_first_name:'James', driver_last_name:'Rivera', work_status:'IN_TRANSIT', driver_phone_number:'602-555-0103', driver_email:'j.rivera@fleet.com' }, driver_location:{ last_known_location:'I-10 E near Benson, AZ', latest_update: Date.now()-600000 }, loads:{ driver_current_load:{ origin:'Phoenix, AZ', destination:'El Paso, TX', revenue:3200 } }, enriched:{ hos_remaining:11.0, fuel_level_pct:22, speed_mph:65, cost_per_mile:1.87, safety_score:91, oor_miles:8.1, efficiency_pct:98, lat:31.96, lng:-110.29 } },
    { driver_id:1004, basic_info:{ driver_first_name:'Amy', driver_last_name:'Patel', work_status:'IN_TRANSIT', driver_phone_number:'602-555-0104', driver_email:'a.patel@fleet.com' }, driver_location:{ last_known_location:'AZ-89 near Congress, AZ', latest_update: Date.now()-1200000 }, loads:{ driver_current_load:{ origin:'Kingman, AZ', destination:'Phoenix, AZ', revenue:980 } }, enriched:{ hos_remaining:2.1, fuel_level_pct:55, speed_mph:55, cost_per_mile:2.67, safety_score:76, oor_miles:31.4, efficiency_pct:88, lat:34.17, lng:-112.85 } },
    { driver_id:1005, basic_info:{ driver_first_name:'Derek', driver_last_name:'Williams', work_status:'AVAILABLE', driver_phone_number:'602-555-0105', driver_email:'d.williams@fleet.com' }, driver_location:{ last_known_location:'Pilot Travel Center, Flagstaff, AZ', latest_update: Date.now()-3600000 }, loads:{}, enriched:{ hos_remaining:0.8, fuel_level_pct:78, speed_mph:0, cost_per_mile:2.94, safety_score:65, oor_miles:0, efficiency_pct:82, lat:35.19, lng:-111.65 } },
    { driver_id:1006, basic_info:{ driver_first_name:'Linda', driver_last_name:'Torres', work_status:'IN_TRANSIT', driver_phone_number:'602-555-0106', driver_email:'l.torres@fleet.com' }, driver_location:{ last_known_location:'I-19 N near Sahuarita, AZ', latest_update: Date.now()-900000 }, loads:{ driver_current_load:{ origin:'Nogales, AZ', destination:'Phoenix, AZ', revenue:1500 } }, enriched:{ hos_remaining:8.3, fuel_level_pct:61, speed_mph:61, cost_per_mile:2.22, safety_score:89, oor_miles:6.8, efficiency_pct:95, lat:31.95, lng:-110.98 } },
    { driver_id:1007, basic_info:{ driver_first_name:'Kevin', driver_last_name:'Park', work_status:'AVAILABLE', driver_phone_number:'602-555-0107', driver_email:'k.park@fleet.com' }, driver_location:{ last_known_location:'Phoenix Sky Harbor area, AZ', latest_update: Date.now()-7200000 }, loads:{}, enriched:{ hos_remaining:10.0, fuel_level_pct:88, speed_mph:0, cost_per_mile:2.05, safety_score:96, oor_miles:0, efficiency_pct:100, lat:33.44, lng:-112.01 } },
  ];
}
