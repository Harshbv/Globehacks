// app/api/driver-portal/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { queryDrivers } from '@/lib/truckerpath';

// Demo drivers for fallback
const DEMO_DRIVERS = [
  { driver_id:1001, name:'Marcus Johnson',  phone:'602-555-0101', email:'m.johnson@fleet.com' },
  { driver_id:1002, name:'Sarah Chen',      phone:'602-555-0102', email:'s.chen@fleet.com' },
  { driver_id:1003, name:'James Rivera',    phone:'602-555-0103', email:'j.rivera@fleet.com' },
  { driver_id:1004, name:'Amy Patel',       phone:'602-555-0104', email:'a.patel@fleet.com' },
  { driver_id:1005, name:'Derek Williams',  phone:'602-555-0105', email:'d.williams@fleet.com' },
  { driver_id:1006, name:'Linda Torres',    phone:'602-555-0106', email:'l.torres@fleet.com' },
  { driver_id:1007, name:'Kevin Park',      phone:'602-555-0107', email:'k.park@fleet.com' },
];

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const input = name.trim().toLowerCase();

  try {
    // Try real NavPro first
    const drivers = await queryDrivers();
    const match = drivers.find(d => {
      const full = `${d.basic_info.driver_first_name} ${d.basic_info.driver_last_name}`.toLowerCase();
      return full.includes(input) || input.includes(d.basic_info.driver_first_name.toLowerCase());
    });
    if (match) {
      return NextResponse.json({
        success: true,
        driver_id: match.driver_id,
        name: `${match.basic_info.driver_first_name} ${match.basic_info.driver_last_name}`,
        source: 'navpro',
      });
    }
  } catch {}

  // Demo fallback
  const demo = DEMO_DRIVERS.find(d =>
    d.name.toLowerCase().includes(input) || input.split(' ').some((w: string) => d.name.toLowerCase().includes(w))
  );
  if (demo) {
    return NextResponse.json({ success: true, driver_id: demo.driver_id, name: demo.name, source: 'demo' });
  }

  return NextResponse.json({ success: false, error: `No driver named "${name}" found in NavPro. Try: Marcus Johnson, Sarah Chen, James Rivera, Amy Patel, Derek Williams, Linda Torres, Kevin Park` }, { status: 404 });
}
