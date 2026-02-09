const AUS_BOUNDS = {
  latMin: -50, latMax: -5,
  lonMin: 100, lonMax: 170
};

export interface Airport {
  id: string;      // "YSSY"
  name: string;    // "SYDNEY_INTL"
  lat: number;
  lon: number;
}

// Existing lookup parser (Keep this for Flight Plan logic)
export const parseAirports = (text: string): Record<string, [number, number]> => {
  const lines = text.split('\n');
  const lookup: Record<string, [number, number]> = {};

  for (const line of lines) {
    if (!line || line.trim().length === 0) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5) {
      const lat = parseFloat(parts[3]);
      const lon = parseFloat(parts[4]);
      if (!isNaN(lat) && !isNaN(lon)) {
        lookup[parts[0]] = [lat, lon];
      }
    }
  }
  return lookup;
};

// NEW: Parser for Visual Layer
export const parseAirportsToList = (text: string): Airport[] => {
  const lines = text.split('\n');
  const airports: Airport[] = [];

  for (const line of lines) {
    if (!line || line.trim().length === 0) continue;

    // Format: YSSY  SYDNEY_INTL  21  -33.946  151.177 ...
    const parts = line.trim().split(/\s+/);

    if (parts.length >= 5) {
      const id = parts[0];
      const name = parts[1].replace(/_/g, ' '); // "SYDNEY_INTL" -> "SYDNEY INTL"
      const lat = parseFloat(parts[3]);
      const lon = parseFloat(parts[4]);

      // Filter: Is it inside Australia?
      if (!isNaN(lat) && !isNaN(lon)) {
        if (
          lat >= AUS_BOUNDS.latMin && lat <= AUS_BOUNDS.latMax &&
          lon >= AUS_BOUNDS.lonMin && lon <= AUS_BOUNDS.lonMax
        ) {
          airports.push({ id, name, lat, lon });
        }
      }
    }
  }
  return airports;
};