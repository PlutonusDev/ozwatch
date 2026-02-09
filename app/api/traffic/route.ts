// app/api/traffic/route.ts
import { NextResponse } from 'next/server';

// Simple in-memory cache
let cache = {
  data: null as any,
  lastFetched: 0,
};

// VATSIM Data URL
const VATSIM_URL = 'https://data.vatsim.net/v3/vatsim-data.json';

// Bounding Box for Australian FIR (Rough approximation)
const AUS_BOUNDS = {
  latMin: -55, latMax: -5,
  lonMin: 62, lonMax: 180,
};

export async function GET() {
  const now = Date.now();

  // Your custom 15s timer handles the "caching" logic
  if (!cache.data || now - cache.lastFetched > 15000) {
    try {
      // OLD: const res = await fetch(VATSIM_URL, { next: { revalidate: 15 } });
      
      // NEW: Disable Next.js Data Cache (fix 2MB error)
      const res = await fetch(VATSIM_URL, { cache: 'no-store' });
      
      if (!res.ok) throw new Error('Failed to fetch VATSIM data');
      
      const rawData = await res.json();
      
      // Filter for Australia
      const ausTraffic = rawData.pilots.filter((pilot: any) => 
        pilot.latitude >= AUS_BOUNDS.latMin &&
        pilot.latitude <= AUS_BOUNDS.latMax &&
        pilot.longitude >= AUS_BOUNDS.lonMin &&
        pilot.longitude <= AUS_BOUNDS.lonMax
      );

      cache = {
        data: ausTraffic,
        lastFetched: now,
      };
    } catch (error) {
      console.error('VATSIM Fetch Error:', error);
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
  }

  return NextResponse.json({ 
    pilots: cache.data, 
    serverTime: cache.lastFetched 
  });
}