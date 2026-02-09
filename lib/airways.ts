// utils/airwayLoader.ts

// Australian Bounding Box (Mainland + Oceanic)
// We use this to filter out the US/European parts of the global dataset instantly.
const AUS_BOUNDS = {
  latMin: -50, latMax: -5,
  lonMin: 100, lonMax: 170
};

export interface AirwaySegment {
  id: string;
  path: [number, number][]; // Array of [Lat, Lon] for Polyline
}

interface AirwayPoint {
  id: string;
  seq: number;
  lat: number;
  lon: number;
}

// 1. FOR VISUAL MAP LAYER (Draws lines)
export const parseAirways = (text: string): AirwaySegment[] => {
  const lines = text.split('\n');
  const grouped: Record<string, AirwayPoint[]> = {};

  for (const line of lines) {
    if (!line || line.startsWith(';') || line.trim().length === 0) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5) {
      // Columns: ID(0) SEQ(1) NAME(2) LAT(3) LON(4)
      const id = parts[0];
      const seq = parseInt(parts[1], 10);
      const lat = parseFloat(parts[3]);
      const lon = parseFloat(parts[4]);

      if (!isNaN(lat) && !isNaN(lon)) {
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push({ id, seq, lat, lon });
      }
    }
  }

  const segments: AirwaySegment[] = [];

  Object.keys(grouped).forEach((airwayId) => {
    // Sort by sequence to connect dots in order
    const points = grouped[airwayId].sort((a, b) => a.seq - b.seq);
    
    let currentPath: [number, number][] = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      
      // Filter: Is this point in Australia?
      const isInside = 
        p.lat >= AUS_BOUNDS.latMin && p.lat <= AUS_BOUNDS.latMax &&
        p.lon >= AUS_BOUNDS.lonMin && p.lon <= AUS_BOUNDS.lonMax;

      if (isInside) {
        currentPath.push([p.lat, p.lon]);
      } else {
        // Gap detected (e.g. jump from US to AUS). 
        // Save current valid path and start fresh.
        if (currentPath.length > 1) {
          segments.push({ id: airwayId, path: currentPath });
        }
        currentPath = [];
      }
    }

    if (currentPath.length > 1) {
      segments.push({ id: airwayId, path: currentPath });
    }
  });

  return segments;
};

// 2. FOR FLIGHT PLAN LOGIC (Lookups)
export const parseAirwaysToDict = (text: string): Record<string, {lat: number, lon: number}[]> => {
  const lines = text.split('\n');
  const grouped: Record<string, any[]> = {};

  for (const line of lines) {
    if (!line || line.startsWith(';') || line.trim().length === 0) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5) {
      const id = parts[0];
      const seq = parseInt(parts[1], 10);
      const lat = parseFloat(parts[3]);
      const lon = parseFloat(parts[4]);

      if (!isNaN(lat) && !isNaN(lon)) {
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push({ seq, lat, lon });
      }
    }
  }

  // Sort by sequence so the route parser follows the line correctly
  Object.keys(grouped).forEach(k => {
    grouped[k].sort((a: any, b: any) => a.seq - b.seq);
  });

  return grouped;
};