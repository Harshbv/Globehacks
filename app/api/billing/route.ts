// app/api/billing/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { extractBillingFields } from '@/lib/groq';
import { addDocument } from '@/lib/truckerpath';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image_base64, driver_id, push_to_navpro } = body;

    if (!image_base64) return NextResponse.json({ error: 'image_base64 required' }, { status: 400 });

    // Extract fields with Groq Vision
    const fields = await extractBillingFields(image_base64);

    // Optionally push invoice back to NavPro
    let navproResult = null;
    if (push_to_navpro && driver_id) {
      navproResult = await addDocument({
        document_name: `Invoice_${fields.load_number || Date.now()}`,
        document_type: 'INVOICE',
        file_base64: image_base64,
        driver_ids: [driver_id],
      });
    }

    return NextResponse.json({
      success: true,
      fields,
      navpro: navproResult,
      field_count: Object.values(fields).filter(v => v && v !== 'null').length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
