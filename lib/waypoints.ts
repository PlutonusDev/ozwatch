// utils/waypointLoader.ts

export interface Waypoint {
  id: string;
  lat: number;
  lon: number;
}

// Bounding Box for Australia (Approximate)
// This captures mainland + most oceanic FIRs without expensive polygon math
const AUS_BOUNDS = {
  latMin: -45, latMax: -9,
  lonMin: 110, lonMax: 165
};

export const parseWaypoints = (text: string): Waypoint[] => {
  const lines = text.split('\n');
  const waypoints: Waypoint[] = [];

  for (const line of lines) {
    // 1. Skip comments and empty lines
    if (!line || line.startsWith(';') || line.trim().length === 0) continue;

    // 2. Split by whitespace (The file is column-based)
    // Format: ID (0), Unknown (1), Lat (2), Lon (3)
    const parts = line.trim().split(/\s+/);

    if (parts.length >= 4) {
      const lat = parseFloat(parts[2]);
      const lon = parseFloat(parts[3]);

      // 3. FAST FILTER: Check Bounding Box immediately
      // Discard invalid points or points outside Australia instantly
      if (
        !isNaN(lat) && !isNaN(lon) &&
        lat >= AUS_BOUNDS.latMin && lat <= AUS_BOUNDS.latMax &&
        lon >= AUS_BOUNDS.lonMin && lon <= AUS_BOUNDS.lonMax
      ) {
        waypoints.push({
          id: parts[0], // The Waypoint Name (e.g., "0000E")
          lat,
          lon
        });
      }
    }
  }

  return waypoints;
};