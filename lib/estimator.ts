// utils/flightMath.ts
import * as turf from '@turf/turf';

// --- TYPES ---
export interface PilotStatus {
  state: 'inside' | 'outside' | 'entering' | 'leaving' | 'transition';
  minutesUntilEvent: number | null;
  color: string;
  activeSector: string | null;
  secondarySector: string | null;
}

export interface PhysicsRates {
  turnRate: number;
  climbRate: number;
  accelRate: number;
}

// --- MATH HELPERS ---
const getMinutesToBoundary = (
  currentPt: any,
  pathLine: any,
  polygon: any,
  speedKts: number
): number | null => {
  // 1. Find all intersections between the flight vector and the sector boundary
  const intersects = turf.lineIntersect(pathLine, polygon);
  
  if (intersects.features.length === 0) return null;

  // 2. Find the closest intersection point (the boundary crossing)
  const closest = turf.nearestPoint(currentPt, intersects);
  
  // 3. Calculate distance in Kilometers
  const distKm = turf.distance(currentPt, closest);
  
  // 4. Convert Speed (Knots -> Km/min)
  // 1 Knot = 1.852 km/h = 0.0308667 km/min
  const speedKmMin = speedKts * 0.0308667;
  
  if (speedKmMin <= 0) return null;
  
  return Math.round(distKm / speedKmMin);
};

export const predictPosition = (lat: number, lon: number, heading: number, speedKts: number, timeSec: number) => {
  // 1. Distance = Speed * Time
  // Speed in m/s (1 knot = 0.514444 m/s)
  const speedMs = speedKts * 0.514444;
  const distanceM = speedMs * timeSec;

  // 2. Use Turf to calculate destination
  const pt = turf.point([lon, lat]);
  const dest = turf.destination(pt, distanceM, heading, { units: 'meters' });

  return {
    lat: dest.geometry.coordinates[1],
    lon: dest.geometry.coordinates[0]
  };
};

export const predictPositionOnRoute = (
  routeLine: any,         // Turf LineString
  startDistanceKm: number, // Distance along route at t=0
  offsetKm: number,        // Lateral offset to maintain
  speedKts: number,
  timeElapsedSec: number
) => {
  // 1. Calculate distance traveled
  const travelDistKm = speedKts * 0.000514444 * timeElapsedSec;
  
  // 2. New distance along centerline
  const newDistanceKm = startDistanceKm + travelDistKm;
  const lineLength = turf.length(routeLine, { units: 'kilometers' });

  if (newDistanceKm >= lineLength) {
     const end = turf.along(routeLine, lineLength, { units: 'kilometers' });
     return { lat: end.geometry.coordinates[1], lon: end.geometry.coordinates[0] };
  }

  // 3. Center point
  const centerPoint = turf.along(routeLine, newDistanceKm, { units: 'kilometers' });
  
  // 4. Apply Lateral Offset (LNAV)
  if (Math.abs(offsetKm) < 0.1) {
    return { lat: centerPoint.geometry.coordinates[1], lon: centerPoint.geometry.coordinates[0] };
  } else {
    // Determine bearing for perpendicular offset
    const sampleAhead = turf.along(routeLine, Math.min(newDistanceKm + 0.5, lineLength), { units: 'kilometers' });
    const bearing = turf.bearing(centerPoint, sampleAhead);
    
    // Offset is perpendicular (bearing + 90)
    // Note: This is a visual approximation.
    const offsetPoint = turf.destination(
      centerPoint, 
      Math.abs(offsetKm), 
      bearing + (offsetKm > 0 ? 90 : -90), 
      { units: 'kilometers' }
    );

    return { lat: offsetPoint.geometry.coordinates[1], lon: offsetPoint.geometry.coordinates[0] };
  }
};

export const calculateRates = (oldData: any, newData: any, timeDelta: number) => {
  if (timeDelta <= 0) return { turnRate: 0, climbRate: 0, accelRate: 0 };

  const turn = getShortestTurn(oldData.heading, newData.heading) / timeDelta;
  const climb = (newData.altitude - oldData.altitude) / timeDelta; // ft/sec
  const accel = (newData.groundspeed - oldData.groundspeed) / timeDelta;

  return { turnRate: turn, climbRate: climb, accelRate: accel };
};

export const getShortestTurn = (start: number, end: number) => {
  let diff = (end - start + 180) % 360 - 180;
  return diff < -180 ? diff + 360 : diff;
};

// --- GEOSPATIAL ANALYSIS ---

const checkInsideAny = (point: any, polygonCollection: any) => {
  if (polygonCollection.type === 'FeatureCollection') {
    for (const feature of polygonCollection.features) {
      if (turf.booleanPointInPolygon(point, feature)) return true;
    }
    return false;
  }
  // Single Polygon/MultiPolygon fallback
  return turf.booleanPointInPolygon(point, polygonCollection);
};

export const getPilotStatus = (
  pilot: any,
  firPolygon: any, // Turf Feature
  // NEW OPTIONAL PARAMS
  routeLine?: any,
  distAlongRoute?: number,
  offset?: number
): PilotStatus => {
  // Default Result
  const result: PilotStatus = { 
    state: 'outside', 
    minutesUntilEvent: null, 
    color: '#3b82f6', 
    activeSector: null, 
    secondarySector: null 
  };
  
  if (!firPolygon || !pilot.groundspeed || pilot.groundspeed < 50) return result;

  const currentPt = turf.point([pilot.longitude, pilot.latitude]);
  
  // 1. CHECK STATE: NOW vs FUTURE (30 mins / 1800 secs)
  const isInsideNow = checkInsideAny(currentPt, firPolygon);
  
  let futurePos;

  // USE LNAV PREDICTION IF AVAILABLE
  if (routeLine && typeof distAlongRoute === 'number' && typeof offset === 'number') {
     // Predict 30 mins ahead (1800 seconds) along the curve
     futurePos = predictPositionOnRoute(
        routeLine, 
        distAlongRoute, 
        offset, 
        pilot.groundspeed, 
        1800
     );
  } else {
     // Fallback to linear
     futurePos = predictPosition(pilot.latitude, pilot.longitude, pilot.heading, pilot.groundspeed, 1800);
  }

  const futurePt = turf.point([futurePos.lon, futurePos.lat]);
  const isInsideFuture = checkInsideAny(futurePt, firPolygon);

  // 2. DEFINE PATH LINE (Linear approximation of the segment for intersection check)
  // Note: Even with LNAV, we draw a straight line from Now -> Future to find the sector boundary intersection.
  // This is a safe approximation for timing unless the sector boundary is extremely complex.
  const pathLine = turf.lineString([
    [pilot.longitude, pilot.latitude],
    [futurePos.lon, futurePos.lat]
  ]);

  // 3. DETERMINE STATUS
  if (isInsideNow && !isInsideFuture) {
    result.state = 'leaving';
    result.color = '#eab308'; // Yellow
    result.minutesUntilEvent = getMinutesToBoundary(currentPt, pathLine, firPolygon, pilot.groundspeed);
    return result;
  } 
  
  if (!isInsideNow && isInsideFuture) {
    result.state = 'entering';
    result.color = '#eab308'; // Yellow
    result.minutesUntilEvent = getMinutesToBoundary(currentPt, pathLine, firPolygon, pilot.groundspeed);
    return result;
  }

  if (isInsideNow) {
    result.state = 'inside';
    result.color = '#22c55e'; // Green
  } else {
    result.state = 'outside';
    result.color = '#3b82f6'; // Blue
  }

  return result;
};

export const getGreatCircleRoute = (
  start: [number, number], 
  end: [number, number]
): any => {
  const startPt = turf.point([start[1], start[0]]); // Turf uses [Lon, Lat]
  const endPt = turf.point([end[1], end[0]]);
  
  // Calculate curved path
  const path = turf.greatCircle(startPt, endPt, { npoints: 100 });
  
  // Convert back to Leaflet [Lat, Lon] format
  return path.geometry.coordinates.map(c => [c[1], c[0]]);
};