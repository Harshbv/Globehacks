// app/api/safety/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { analyzeSafety } from '@/lib/groq';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const report = await analyzeSafety(body);
    return NextResponse.json({ success: true, ...report });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
