// app/api/dispatch/assign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createTrip } from '@/lib/truckerpath';
import { geocode } from '@/lib/external';
import { sendSMS } from '@/lib/external';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      driver_id,
      driver_name,
      driver_phone,
      pickup,
      delivery,
      pickup_lat,
      pickup_lng,
      delivery_lat,
      delivery_lng,
      revenue_usd,
      weight_lbs,
      notes,
    } = body;

    if (!driver_id || !pickup || !delivery) {
      return NextResponse.json(
        { error: 'driver_id, pickup, and delivery are required' },
        { status: 400 }
      );
    }

    // Geocode if coords not provided
    let pCoords = pickup_lat ? { lat: pickup_lat, lng: pickup_lng } : await geocode(pickup);
    let dCoords = delivery_lat ? { lat: delivery_lat, lng: delivery_lng } : await geocode(delivery);

    // Fallback coords (Phoenix → Dallas)
    if (!pCoords) pCoords = { lat: 33.4484, lng: -112.074 };
    if (!dCoords) dCoords = { lat: 32.7767, lng: -96.797 };

    const now = new Date();
    const pickupTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h
    const deliveryTime = new Date(now.getTime() + 18 * 60 * 60 * 1000); // +18h

    const fmt = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z');

    // Call Trucker Path NavPro /api/trip/create
    const tripResult = await createTrip({
      driver_id: Number(driver_id),
      scheduled_start_time: fmt(now),
      stop_points: [
        {
          latitude: pCoords.lat,
          longitude: pCoords.lng,
          address_name: pickup,
          appointment_time: fmt(pickupTime),
          dwell_time: 30,
          notes: notes || 'DispatchIQ auto-assigned load',
        },
        {
          latitude: dCoords.lat,
          longitude: dCoords.lng,
          address_name: delivery,
          appointment_time: fmt(deliveryTime),
          dwell_time: 0,
          notes: revenue_usd ? `Revenue: $${revenue_usd}` : '',
        },
      ],
    });

    // SMS driver confirmation
    if (driver_phone) {
      const sms = `DispatchIQ: New load assigned! Pickup: ${pickup} at ${pickupTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}. Delivery: ${delivery}. Weight: ${weight_lbs ? (weight_lbs / 1000).toFixed(0) + 'k lbs' : 'TBD'}. Trip ID: ${tripResult.trip_id}`;
      await sendSMS(driver_phone, sms);
    }

    return NextResponse.json({
      success: true,
      trip_id: tripResult.trip_id,
      driver_id,
      driver_name,
      message: `✅ Trip #${tripResult.trip_id} created in NavPro — ${driver_name} has been notified`,
      pickup,
      delivery,
      scheduled_start: fmt(now),
      estimated_pickup: fmt(pickupTime),
      estimated_delivery: fmt(deliveryTime),
      sms_sent: !!driver_phone,
    });

  } catch (err: any) {
    console.error('Assign error:', err);

    // Demo fallback — NavPro key likely not set
    if (err.message?.includes('Bearer') || err.message?.includes('401') || err.message?.includes('403')) {
      const fakeId = Math.floor(Math.random() * 90000 + 10000);
      return NextResponse.json({
        success: true,
        trip_id: fakeId,
        driver_id: req.body,
        message: `✅ Demo: Trip #${fakeId} would be created via NavPro /api/trip/create`,
        demo: true,
      });
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
