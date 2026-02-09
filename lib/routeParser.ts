// utils/routeParser.ts
import * as turf from '@turf/turf';
import { type ProcedureLookup } from './procedures';

export interface RouteWaypoint {
  lat: number;
  lon: number;
  name: string;
  type: 'airport' | 'sid' | 'star' | 'enroute' | 'airway';
}

export interface RouteLabel {
  lat: number;
  lon: number;
  text: string;
  bearing: number;
}

export interface RouteResult {
  path: [number, number][]; // Dense points for the curved line
  waypoints: RouteWaypoint[]; // Key points for markers
  labels: RouteLabel[];
}

const isValidPoint = (p: any): p is [number, number] => {
  return Array.isArray(p) && p.length === 2 && 
         typeof p[0] === 'number' && !isNaN(p[0]) && 
         typeof p[1] === 'number' && !isNaN(p[1]);
};

const interpolateGreatCircle = (p1: [number, number], p2: [number, number]) => {
  if (!isValidPoint(p1) || !isValidPoint(p2)) return [];
  try {
    const start = turf.point([p1[1], p1[0]]); // Lon, Lat
    const end = turf.point([p2[1], p2[0]]);
    const path = turf.greatCircle(start, end, { npoints: 20 });
    return path.geometry.coordinates.map(c => [c[1], c[0]] as [number, number]);
  } catch (e) { return []; }
};

const getDist = (p1: [number, number], p2: [number, number]) => {
  if (!isValidPoint(p1) || !isValidPoint(p2)) return Infinity;
  // Simple Euclidean for index finding (sufficient for short distances)
  return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
};

const addLabel = (p1: [number, number], p2: [number, number], text: string, list: RouteLabel[]) => {
  if (!isValidPoint(p1) || !isValidPoint(p2)) return;
  try {
    const startPt = turf.point([p1[1], p1[0]]); // Turf uses [Lon, Lat]
    const endPt = turf.point([p2[1], p2[0]]);
    
    // Calculate Great Circle Midpoint
    const mid = turf.midpoint(startPt, endPt);
    
    // Calculate Bearing at the midpoint to align text with the arc
    // (Start->End bearing changes along a Great Circle, so Mid->End is safer for labels)
    const bearing = turf.bearing(mid, endPt);
    
    list.push({
        lat: mid.geometry.coordinates[1],
        lon: mid.geometry.coordinates[0],
        text: text,
        bearing: bearing
    });
  } catch (e) { /* Ignore turf errors */ }
};

export const parseSimpleRoute = (
  routeString: string,
  start: [number, number],
  end: [number, number],
  waypointLookup: Record<string, [number, number]>,
  airwayLookup?: Record<string, any[]>
): any => {
    // Simple straight line fallback for math if needed, 
    // or you can reuse parseSmartRoute logic without densification for performance
    const points: [number, number][] = [start, end]; 
    return turf.lineString(points.map(p => [p[1], p[0]]));
};

// 2. CALCULATE DEVIATION (Returns Nautical Miles)
export const getRouteDeviation = (planeLat: number, planeLon: number, routeLine: any): number => {
  if(!routeLine) return 0;
  const pt = turf.point([planeLon, planeLat]);
  const distKm = turf.pointToLineDistance(pt, routeLine, { units: 'kilometers' });
  return distKm * 0.539957;
};

export const parseSmartRoute = (
  routeString: string,
  startCoords: [number, number] | undefined,
  endCoords: [number, number] | undefined,
  waypointLookup: Record<string, [number, number]>,
  airwayLookup: Record<string, { lat: number, lon: number, id: string }[]>,
  sidLookup: ProcedureLookup = {},
  starLookup: ProcedureLookup = {},
  depAirportId: string = "",
  arrAirportId: string = ""
): RouteResult => {
  
  const keyPoints: [number, number][] = [];
  const markers: RouteWaypoint[] = [];
  const labels: RouteLabel[] = [];

  // 1. Start (Airport)
  if (startCoords && isValidPoint(startCoords)) {
    keyPoints.push(startCoords);
  }

  if (!routeString) {
    if (endCoords && isValidPoint(endCoords)) keyPoints.push(endCoords);
    return { path: keyPoints, waypoints: markers, labels: [] };
  }

  const parts = routeString.toUpperCase().split(/\s+/).filter(p => p !== 'DCT');

  // --- 2. SID HANDLING ---
  if (parts.length > 0) {
    const firstToken = parts[0];
    if (firstToken.includes('/')) {
      const [procName, rwy] = firstToken.split('/');
      const points = sidLookup[depAirportId]?.[procName]?.[rwy];

      if (points && points.length > 0) {
        if (keyPoints.length > 0) keyPoints.pop(); 
        
        points.forEach(p => {
           if (typeof p.lat === 'number' && typeof p.lon === 'number') {
             keyPoints.push([p.lat, p.lon]);
             markers.push({ lat: p.lat, lon: p.lon, name: p.name || procName, type: 'sid' });
           }
        });
        parts.shift();
      }
    }
  }

  // --- 3. STAR HANDLING ---
  let starPoints: {lat: number, lon: number, name: string}[] = [];
  if (parts.length > 0) {
    const lastToken = parts[parts.length - 1];
    if (lastToken.includes('/')) {
      const [procName, rwy] = lastToken.split('/');
      const points = starLookup[arrAirportId]?.[procName]?.[rwy];
      if (points && points.length > 0) {
        starPoints = points;
        parts.pop();
      }
    }
  }

  // --- 4. ENROUTE ---
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i];

    if (waypointLookup[token]) {
      const wp = waypointLookup[token];
      if (isValidPoint(wp)) {
        keyPoints.push(wp);
        markers.push({ lat: wp[0], lon: wp[1], name: token, type: 'enroute' });
      }
    } 
    else if (airwayLookup[token]) {
      const prevLoc = keyPoints.length > 0 ? keyPoints[keyPoints.length - 1] : null;
      let nextLoc: [number, number] | null = null;

      if (i < parts.length - 1) {
         const nextToken = parts[i+1];
         if (waypointLookup[nextToken]) nextLoc = waypointLookup[nextToken];
      } else {
         if (starPoints.length > 0) nextLoc = [starPoints[0].lat, starPoints[0].lon];
         else if (endCoords && isValidPoint(endCoords)) nextLoc = endCoords;
      }

      if (isValidPoint(prevLoc) && isValidPoint(nextLoc!)) {
        const airwayPoints = airwayLookup[token];
        let startIndex = -1, endIndex = -1;
        let minStart = Infinity, minEnd = Infinity;

        // Find entry and exit indices
        for (let j = 0; j < airwayPoints.length; j++) {
          const p = [airwayPoints[j].lat, airwayPoints[j].lon] as [number, number];
          const dS = getDist(p, prevLoc);
          const dE = getDist(p, nextLoc!);
          if (dS < minStart) { minStart = dS; startIndex = j; }
          if (dE < minEnd) { minEnd = dE; endIndex = j; }
        }

        if (startIndex !== -1 && endIndex !== -1 && startIndex !== endIndex) {
          const step = startIndex <= endIndex ? 1 : -1;
          let currentSegStart = prevLoc;

          // Iterate through intermediate points
          for (let k = startIndex + step; k !== endIndex; k += step) {
             const ap = airwayPoints[k];
             if (ap && typeof ap.lat === 'number' && typeof ap.lon === 'number') {
               const segEnd: [number, number] = [ap.lat, ap.lon];
               
               // LABEL PER LEG: Start -> Intermediate
               addLabel(currentSegStart, segEnd, token, labels);
               
               keyPoints.push(segEnd);
               if(ap.id) markers.push({ lat: ap.lat, lon: ap.lon, name: ap.id, type: 'airway' });
               
               currentSegStart = segEnd;
             }
          }
          
          // LABEL FINAL LEG: Last Intermediate -> Exit Point
          addLabel(currentSegStart, nextLoc!, token, labels);
        }
        else if (startIndex === endIndex) {
            // Case where Airway is just one hop (Start -> End directly, e.g. crossing a waypoint)
            // Or malformed data. Usually implies direct connection.
            addLabel(prevLoc, nextLoc!, token, labels);
        }
      }
    }
  }

  // --- 5. APPEND STAR ---
  if (starPoints.length > 0) {
    starPoints.forEach(p => {
       if (typeof p.lat === 'number' && typeof p.lon === 'number') {
         keyPoints.push([p.lat, p.lon]);
         markers.push({ lat: p.lat, lon: p.lon, name: p.name, type: 'star' });
       }
    });
  }
  
  if (endCoords && isValidPoint(endCoords)) {
     const lastK = keyPoints[keyPoints.length - 1];
     if (!lastK || lastK[0] !== endCoords[0] || lastK[1] !== endCoords[1]) {
       keyPoints.push(endCoords);
     }
  }

  // --- 6. DENSIFY ---
  const cleanKeyPoints = keyPoints.filter(isValidPoint);
  if (cleanKeyPoints.length < 2) return { path: cleanKeyPoints, waypoints: markers, labels: [] };

  const fullCurvedPath: [number, number][] = [];
  for (let i = 0; i < cleanKeyPoints.length - 1; i++) {
    const p1 = cleanKeyPoints[i];
    const p2 = cleanKeyPoints[i+1];
    if (p1[0] === p2[0] && p1[1] === p2[1]) continue;

    const segment = interpolateGreatCircle(p1, p2);
    if (fullCurvedPath.length === 0) fullCurvedPath.push(...segment);
    else fullCurvedPath.push(...segment.slice(1));
  }

  return { 
    path: fullCurvedPath.filter(isValidPoint), 
    waypoints: markers,
    labels: labels 
  };
};

// (Keep splitRouteAtPlane exactly the same as before)
export const splitRouteAtPlane = (path: [number, number][], planePos: [number, number]) => {
  if (!path || !Array.isArray(path) || path.length < 2) return { past: [], future: [] };
  if (!isValidPoint(planePos)) return { past: path, future: [] };

  try {
    const line = turf.lineString(path.map(p => [p[1], p[0]]));
    const pt = turf.point([planePos[1], planePos[0]]);
    const snapped = turf.nearestPointOnLine(line, pt);
    const splitIndex = snapped.properties?.index ?? 0;
    
    // Only snap if close, otherwise just split index
    const distKm = turf.distance(snapped.geometry.coordinates, pt);
    const distNm = distKm * 0.539957;

    const past = path.slice(0, splitIndex + 1);
    past.push(planePos);

    const futureSource = path.slice(splitIndex + 1);
    let future: [number, number][];

    if (distNm < 1.0) {
      const snapLat = snapped.geometry.coordinates[1];
      const snapLon = snapped.geometry.coordinates[0];
      const dLat = planePos[0] - snapLat;
      const dLon = planePos[1] - snapLon;
      future = futureSource.map(p => [p[0] + dLat, p[1] + dLon]);
      future.unshift(planePos);
    } else {
      future = [planePos, ...futureSource];
    }
    
    return { past: past.filter(isValidPoint), future: future.filter(isValidPoint) };
  } catch (err) {
    return { past: path, future: [] };
  }
};