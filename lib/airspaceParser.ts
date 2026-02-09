import { parseCoordinateString } from './coordinateParser';
import { type ProcedureLookup } from './procedures'; // Reuse or redefine types

export interface AirspaceData {
  airports: Record<string, [number, number]>;
  waypoints: Record<string, [number, number]>;
  airways: Record<string, { lat: number, lon: number, id: string }[]>;
  sids: ProcedureLookup;
  stars: ProcedureLookup;
}

export const parseAirspaceXml = (xmlString: string): AirspaceData => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "text/xml");

  const data: AirspaceData = {
    airports: {},
    waypoints: {},
    airways: {},
    sids: {},
    stars: {}
  };

  // --- 1. PARSE WAYPOINTS (Intersections + Navaids) ---
  const points = xml.getElementsByTagName("Point");
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const name = p.getAttribute("Name");
    const pos = p.textContent; // "-355604.200+1471333.300"
    
    if (name && pos) {
      const coords = parseCoordinateString(pos);
      if (coords) {
        data.waypoints[name] = coords;
      }
    }
  }

  // --- 2. PARSE AIRPORTS ---
  const airports = xml.getElementsByTagName("Airport");
  for (let i = 0; i < airports.length; i++) {
    const a = airports[i];
    const code = a.getAttribute("ICAO"); // e.g. "YAMB"
    const pos = a.getAttribute("Position");
    
    if (code && pos) {
      const coords = parseCoordinateString(pos);
      if (coords) {
        data.airports[code] = coords;
        // Also add airports to waypoint lookup (useful for routes like "BN VOR")
        data.waypoints[code] = coords; 
      }
    }
  }

  // --- 3. PARSE AIRWAYS ---
  const airwayNodes = xml.getElementsByTagName("Airway");
  for (let i = 0; i < airwayNodes.length; i++) {
    const aw = airwayNodes[i];
    const name = aw.getAttribute("Name");
    const content = aw.textContent || "";
    
    if (name) {
      // Clean up newlines and spaces
      const rawPoints = content.split('\n').map(s => s.trim().replace('/', '')).filter(s => s.length > 0);
      const polyline: { lat: number, lon: number, id: string }[] = [];

      for (const ptName of rawPoints) {
        // Try exact match first
        let coords = data.waypoints[ptName];
        
        // Try trimming suffix (e.g. "CS VOR" -> "CS")
        if (!coords && ptName.includes(' ')) {
           const shortName = ptName.split(' ')[0];
           coords = data.waypoints[shortName];
        }

        if (coords) {
          polyline.push({ lat: coords[0], lon: coords[1], id: ptName });
        }
      }

      if (polyline.length > 1) {
        data.airways[name] = polyline;
      }
    }
  }

  // --- 4. PARSE PROCEDURES (SIDs/STARs) ---
  // Helper to parse route strings which may contain NAMES or COORDINATES
  const parseRouteContent = (routeStr: string, airportPos?: [number, number]) => {
     const segments = routeStr.split('/').map(s => s.trim()).filter(s => s.length > 0);
     const procPoints: { lat: number, lon: number, name: string }[] = [];

     for (const seg of segments) {
        // Check if segment is a Coordinate string
        const directCoord = parseCoordinateString(seg);
        if (directCoord) {
           procPoints.push({ lat: directCoord[0], lon: directCoord[1], name: "WPT" });
        } else {
           // Look up name
           const coords = data.waypoints[seg];
           if (coords) {
              procPoints.push({ lat: coords[0], lon: coords[1], name: seg });
           } else if (seg === "BN VOR" && data.waypoints["BN"]) {
              // Handle explicit VOR naming common in your XML
              const c = data.waypoints["BN"];
              procPoints.push({ lat: c[0], lon: c[1], name: seg });
           }
        }
     }
     return procPoints;
  };

  const processProcedures = (tagName: string, targetLookup: any) => {
     const nodes = xml.getElementsByTagName(tagName);
     for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const airport = node.getAttribute("Airport");
        const name = node.getAttribute("Name");
        
        if (airport && name) {
           if (!targetLookup[airport]) targetLookup[airport] = {};
           if (!targetLookup[airport][name]) targetLookup[airport][name] = {};

           const routes = node.getElementsByTagName("Route");
           for (let j = 0; j < routes.length; j++) {
              const rNode = routes[j];
              const rwy = rNode.getAttribute("Runway");
              const content = rNode.textContent || "";
              
              if (rwy) {
                 const points = parseRouteContent(content);
                 if (points.length > 0) {
                    targetLookup[airport][name][rwy] = points;
                 }
              }
           }
        }
     }
  };

  processProcedures("SID", data.sids);
  processProcedures("STAR", data.stars);

  return data;
};