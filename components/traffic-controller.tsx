'use client';

import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import useSWR from 'swr';
import {
  calculateRates,
  predictPosition,
  getPilotStatus,
  getShortestTurn,
  predictPositionOnRoute,
  type PilotStatus
} from '../lib/estimator';
import AirspaceLayer from './airspace';
import { parseSimpleRoute, parseSmartRoute, splitRouteAtPlane } from '../lib/routeParser';
import { type ProcedureLookup } from '../lib/procedures';
import { parseAirspaceXml } from '../lib/airspaceParser';

const fetcher = (url: string) => fetch(url).then((res) => res.json());
const textFetcher = (url: string) => fetch(url).then((res) => res.text());

// --- 1. HTML GENERATORS (Updated with IDs) ---

const createPlaneIconHTML = (heading: number, color: string, showPulse: boolean, alertText: string | null, isSelected: boolean) => {
  // 1. Conditional Pulse
  const selectionRing = isSelected ?
    `<div style="position: absolute; width: 24px; height: 24px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(255,255,255,0.5);"></div>` : '';

  const pulseHTML = showPulse
    ? `<div class="pulse-ring -translate-x-[14px] -translate-y-[14px]" style="border-color: ${color};"></div>`
    : '';

  // 2. Conditional Alert Text
  const alertHTML = alertText
    ? `<div class="event-label -translate-x-[14px] -translate-y-[14px]" style="color: ${color === '#22c55e' ? '#4ade80' : '#f87171'}">${alertText}</div>`
    : '';

  // 3. Wrapper Class for Flash Animation
  // If alertText exists, we assume a flash event is happening
  const wrapperClass = alertText ? 'plane-wrapper flash-alert' : 'plane-wrapper';

  return `
    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      ${pulseHTML}
      ${selectionRing}
      ${alertHTML}
      <div class="${wrapperClass}" style="transform: rotate(${heading}deg); will-change: transform;">
        <svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" 
          style="width: 16px; height: 16px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
          <path d="M12 2L2 22L12 18L22 22L12 2Z" />
        </svg>
      </div>
    </div>
  `;
};

const createTooltipHTML = (pilot: any, status: PilotStatus, deviation?: number) => {
  let statusText = '';
  let statusClass = '';
  const sectorName = status.activeSector || 'Australian FIR';

  if (deviation && deviation > 5) {
    statusText = `OFF COURSE (${deviation.toFixed(1)}nm) ${sectorName !== "Australian FIR" ? `IN ${sectorName}` : "OUTSIDE MONITORED AIRSPACE"}`;
    statusClass = 'text-red-400 font-bold';
  } else if (status.state === 'transition') {
     statusText = `Transiting ${status.activeSector} -> ${status.secondarySector} in ${status.minutesUntilEvent} mins`;
     statusClass = 'text-yellow-400 font-bold';
  } else {
    switch (status.state) {
      case 'inside':
        statusText = `Tracked Inside ${sectorName}`;
        statusClass = 'text-green-400';
        break;
      case 'outside':
        statusText = 'Tracked Outside Monitored Airspace';
        statusClass = 'text-blue-400';
        break;
      case 'entering':
        statusText = `Entering ${sectorName} in ${status.minutesUntilEvent} min`;
        statusClass = 'text-yellow-400';
        break;
      case 'leaving':
        statusText = `Leaving ${sectorName} in ${status.minutesUntilEvent} min`;
        statusClass = 'text-yellow-400';
        break;
    }
  }

  // NOTE: We add unique IDs like id="alt-${pilot.cid}" to the spans
  return `
    <div class="min-w-[200px] px-1 bg-slate-900 font-sans text-left">
      <div class="flex justify-between items-center border-b border-slate-600 py-1">
        <span class="font-semibold text-white tracking-wider">${pilot.callsign}</span>
        <span class="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">OZWATCH</span>
      </div>
      
      <div class="space-y-1 text-xs text-slate-400 py-1 font-mono">
        <div class="flex justify-between">
          <span>ALTITUDE</span>
          <span class="text-white"><span id="alt-${pilot.cid}">${pilot.altitude.toLocaleString()}</span> ft</span>
        </div>
        <div class="flex justify-between">
          <span>GS / HDG</span>
          <span class="text-white">
            <span id="spd-${pilot.cid}">${pilot.groundspeed}</span>kts / 
            <span id="hdg-${pilot.cid}">${pilot.heading}</span>°
          </span>
        </div>
      </div>

      <div class="px-2 py-1 text-center border-t border-slate-600 text-xs font-bold uppercase tracking-tight ${statusClass}">
        ${statusText}
      </div>
    </div>
  `;
};

const createWaypointIcon = (name: string) => L.divIcon({
  className: 'waypoint-marker',
  html: `
    <div class="flex flex-col items-center">
      <div class="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-sky-300"></div>
      <span class="text-[10px] font-mono text-sky-200 bg-slate-900/80 px-1 rounded mt-0.5 whitespace-nowrap">${name}</span>
    </div>
  `,
  iconSize: [40, 20],
  iconAnchor: [20, 0] // Tip of triangle at the coordinate
});

const createAirwayLabelIcon = (text: string, bearing: number) => {
  // Convert bearing (0 is North) to CSS rotation (0 is Horizontal Right)
  // Standard text is horizontal.
  // Bearing 90 (East) -> Line is Horizontal -> Rotation 0.
  // Bearing 180 (South) -> Line is Vertical -> Rotation 90.
  let rotation = bearing - 90;

  // Keep text upright (read left-to-right or bottom-up)
  if (rotation > 90) rotation -= 180;
  if (rotation < -90) rotation += 180;

  return L.divIcon({
    className: 'airway-label-container',
    html: `
      <div style="
        transform: rotate(${rotation}deg);
        background-color: #1e293b;
        color: #94a3b8;
        font-family: monospace;
        font-size: 10px;
        padding: 1px 4px;
        border-radius: 3px;
        border: 1px solid #475569;
        white-space: nowrap;
        text-align: center;
        box-shadow: 0 1px 2px rgba(0,0,0,0.5);
      ">
        ${text}
      </div>
    `,
    iconSize: [40, 20],
    iconAnchor: [20, 10] // Center
  });
};

interface TrafficControllerProps {
  layers: Record<string, boolean>;
}

export default function TrafficController({ layers }: TrafficControllerProps) {
  const map = useMap();

  // 1. Data References
  const dataRef = useRef<{ pilots: any[]; fetchTime: number } | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const tracksRef = useRef<Record<number, L.Polyline>>({});
  const pilotRegistry = useRef<Record<number, any>>({});
  const requestRef = useRef<number>(0);

  // 2. Flight Plan Visuals (Global Lines)
  const [selectedCid, setSelectedCid] = useState<number | null>(null); // Clicked pilot
  const selectedCidRef = useRef<number | null>(null);
  const hoveredCidRef = useRef<number | null>(null);
  
  const activeRoutePathRef = useRef<[number, number][]>([]);
  const routeLayerGroup = useRef<L.LayerGroup>(new L.LayerGroup()).current;
  const pastLineRef = useRef<L.Polyline | null>(null);
  const futureLineRef = useRef<L.Polyline | null>(null);

  // 3. Selection State
  const [selectedSectorIds, setSelectedSectorIds] = useState<Set<string>>(new Set());
  const sectorFeatureMap = useRef<Record<string, any>>({});
  const [isMapReady, setIsMapReady] = useState(false);

  // --- DATA LOADING ---

  const { data: trafficData } = useSWR('/api/traffic', fetcher, {
    refreshInterval: 15000,
    dedupingInterval: 15000,
    onSuccess: (data) => {
      dataRef.current = { pilots: data.pilots, fetchTime: Date.now() };
    }
  });

  useEffect(() => {
    routeLayerGroup.addTo(map);
    return () => { routeLayerGroup.remove(); };
  }, [map]);

  // Staggered Load (Wait 3s for map to settle)
  useEffect(() => {
    const timer = setTimeout(() => setIsMapReady(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const { data: airspaceText } = useSWR('/airspace.xml', textFetcher, {
    revalidateOnFocus: false
  });
  const { data: geoJsonData } = useSWR('https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson', fetcher);

  // Static Lookups
  const airportLookup = useRef<Record<string, [number, number]>>({});
  const waypointLookup = useRef<Record<string, [number, number]>>({});
  const airwayLookup = useRef<Record<string, any[]>>({});
  const sidLookup = useRef<ProcedureLookup>({});
  const starLookup = useRef<ProcedureLookup>({});

  useEffect(() => {
    if (airspaceText && Object.keys(airportLookup.current).length === 0) {
      console.log("🚀 Parsing Airspace XML...");
      const start = performance.now();

      const data = parseAirspaceXml(airspaceText);

      airportLookup.current = data.airports;
      waypointLookup.current = data.waypoints;
      airwayLookup.current = data.airways;
      sidLookup.current = data.sids;
      starLookup.current = data.stars;

      console.log(`✅ Parsed in ${(performance.now() - start).toFixed(0)}ms:`);
      console.log(`   - ${Object.keys(data.airports).length} Airports`);
      console.log(`   - ${Object.keys(data.waypoints).length} Waypoints`);
      console.log(`   - ${Object.keys(data.airways).length} Airways`);
      console.log(`   - ${Object.keys(data.sids).length} SIDs`);
      console.log(`   - ${Object.keys(data.stars).length} STARs`);
    }
    if (geoJsonData) {
       const lookup: Record<string, any> = {};
       geoJsonData.features.forEach((f: any) => {
         const id = f.properties?.id || f.properties?.label;
         if (id && id.startsWith('Y')) lookup[id] = f;
       });
       sectorFeatureMap.current = lookup;
    }
  }, [airspaceText, geoJsonData]);

  const drawRouteForPilot = (cid: number) => {
    const entry = pilotRegistry.current[cid];
    if (!entry || !entry.lastData.flight_plan) return;

    const plan = entry.lastData.flight_plan;
    const dep = airportLookup.current[plan.departure];
    const arr = airportLookup.current[plan.arrival];

    routeLayerGroup.clearLayers();
    activeRoutePathRef.current = [];
    pastLineRef.current = null;
    futureLineRef.current = null;

    if (plan.route || (dep && arr)) {
      const sids = sidLookup.current || {};
      const stars = starLookup.current || {};
      
      // 1. Parse Route
      const result = parseSmartRoute(
        plan.route, dep, arr, waypointLookup.current, airwayLookup.current,
        sids, stars, plan.departure, plan.arrival
      );
      
      activeRoutePathRef.current = result.path;

      // 2. Lines
      if (result.path.length > 0) {
        pastLineRef.current = L.polyline([], { color: '#64748b', weight: 2, opacity: 0.6 }).addTo(routeLayerGroup);
        futureLineRef.current = L.polyline([], { color: '#d946ef', weight: 2, opacity: 0.9, dashArray: '6, 8' }).addTo(routeLayerGroup);
      }

      // 3. Waypoint Markers
      result.waypoints.forEach(wp => {
        if (!wp.name || wp.name === "WPT") return;
        L.marker([wp.lat, wp.lon], { 
          icon: createWaypointIcon(wp.name), 
          interactive: false 
        }).addTo(routeLayerGroup);
      });

      // 4. Airway Labels (NEW)
      result.labels.forEach(lbl => {
         L.marker([lbl.lat, lbl.lon], {
           icon: createAirwayLabelIcon(lbl.text, lbl.bearing),
           interactive: false,
           zIndexOffset: -100 // Keep labels below planes/waypoints
         }).addTo(routeLayerGroup);
      });
    }
  };


  // --- SYNC LOOP (Runs when data arrives) ---
  useEffect(() => {
    if (!dataRef.current) return;
    const { pilots, fetchTime } = dataRef.current;
    const activeCids = new Set<number>();
    const serverTime = trafficData?.serverTime || fetchTime;
    const activeFeatures = Array.from(selectedSectorIds).map(id => sectorFeatureMap.current[id]).filter(f => !!f);

    pilots.forEach((pilot: any) => {
      activeCids.add(pilot.cid);
      const cid = pilot.cid;
      const existing = pilotRegistry.current[cid]; // <--- Grab previous state

      // 1. PREPARE LNAV DATA (If available from previous frame)
      let lnavRoute = null;
      let lnavDist = 0;
      let lnavOffset = 0;

      if (existing && existing.lnav && existing.lnav.active && existing.simpleRoute) {
          lnavRoute = existing.simpleRoute;
          
          // Estimate current distance based on how much time passed since last update
          // This keeps the sector logic closely aligned with the visual plane position
          const timeSinceLast = (serverTime - existing.lastUpdated) / 1000;
          const distTravelled = existing.lastData.groundspeed * 0.000514444 * timeSinceLast;
          
          lnavDist = existing.lnav.startDist + distTravelled;
          lnavOffset = existing.lnav.offset;
      }

      // 2. SECTOR LOGIC
      let status: any = { state: 'outside', minutesUntilEvent: null, color: '#3b82f6', activeSector: null };
      
      let insideSec = null;
      let leavingSec = null;
      let enteringSec = null;

      if (activeFeatures.length > 0) {
        for (const feature of activeFeatures) {
          // PASS LNAV DATA HERE
          const s = getPilotStatus(pilot, feature, lnavRoute, lnavDist, lnavOffset);
          
          const secId = feature.properties.id || feature.properties.label;

          if (s.state === 'inside') insideSec = { ...s, id: secId };
          if (s.state === 'leaving') leavingSec = { ...s, id: secId };
          if (s.state === 'entering') enteringSec = { ...s, id: secId };
        }

        // Determine Final Status Priority
        
        // CASE A: TRANSITION (Leaving A -> Entering B)
        if (leavingSec && enteringSec) {
            status = {
               state: 'transition',
               activeSector: leavingSec.id,    // Leaving this one
               secondarySector: enteringSec.id, // Going to this one
               minutesUntilEvent: leavingSec.minutesUntilEvent, // Time until border cross
               color: '#eab308' // Yellow
            };
        }
        // CASE B: Just Inside
        else if (insideSec) {
            status = { ...insideSec, activeSector: insideSec.id, color: '#22c55e' };
        }
        // CASE C: Just Leaving (Exiting to unmonitored)
        else if (leavingSec) {
            status = { ...leavingSec, activeSector: leavingSec.id, color: '#eab308' };
        }
        // CASE D: Just Entering (Coming from unmonitored)
        else if (enteringSec) {
            status = { ...enteringSec, activeSector: enteringSec.id, color: '#eab308' };
        }
      }

      // --- 2. OFF COURSE DETECTION ---
      // (This logic needs to check if we are 'inside' OR 'transitioning' out of a sector)
      let alertEvent: string | null = null;
      let isOffCourse = false;
      let deviationNm = 0;
      let cachedRoute = existing?.simpleRoute;

      if (pilot.flight_plan && pilot.flight_rules === 'I') {
         const dep = airportLookup.current[pilot.flight_plan.departure];
         const arr = airportLookup.current[pilot.flight_plan.arrival];
         
         if (dep && arr && Object.keys(waypointLookup.current).length > 0) {
            const routeStr = pilot.flight_plan.route;
            if (!cachedRoute || existing?.lastData.flight_plan.route !== routeStr) {
               cachedRoute = parseSimpleRoute(routeStr, dep, arr, waypointLookup.current, airwayLookup.current);
            }
            const pt = turf.point([pilot.longitude, pilot.latitude]);
            try {
              const snapped = turf.nearestPointOnLine(cachedRoute, pt, { units: 'kilometers' });
              deviationNm = (snapped.properties?.dist || 0) * 0.539957;
            } catch (e) { deviationNm = 0; }
         }
      }

      // Physics
      let rates = { turnRate: 0, climbRate: 0, accelRate: 0 };
      let offsets = { lat: 0, lon: 0, hdg: 0 };
      let smoothingActive = false;
      let dataTimestamp = fetchTime;

      if (existing) {
        const timeDelta = (serverTime - existing.lastUpdated) / 1000;
        const actualElapsed = (fetchTime - existing.dataTimestamp) / 1000;
        let visualHeading = existing.lastData.heading + (existing.rates.turnRate * actualElapsed);
        visualHeading = ((visualHeading % 360) + 360) % 360;

        let visualPos = predictPosition(existing.lastData.latitude, existing.lastData.longitude, visualHeading, existing.lastData.groundspeed, actualElapsed);
        
        // Preserve LNAV state if selected
        if (existing.lnav && existing.lnav.active && existing.simpleRoute) {
             visualPos = predictPositionOnRoute(existing.simpleRoute, existing.lnav.startDist, existing.lnav.offset, existing.lastData.groundspeed, actualElapsed);
        }

        const lagSeconds = Math.max(0, actualElapsed - 15);
        dataTimestamp = fetchTime - (lagSeconds * 1000);
        const projectedNewPos = predictPosition(pilot.latitude, pilot.longitude, pilot.heading, pilot.groundspeed, lagSeconds);
        offsets = { lat: visualPos.lat - projectedNewPos.lat, lon: visualPos.lon - projectedNewPos.lon, hdg: getShortestTurn(pilot.heading, visualHeading) };
        rates = calculateRates(existing.lastData, pilot, timeDelta);
        smoothingActive = true;
      }

      // Update Registry
      pilotRegistry.current[cid] = {
        lastData: pilot,
        lastUpdated: serverTime,
        dataTimestamp: dataTimestamp,
        rates,
        history: existing ? [...existing.history, [pilot.latitude, pilot.longitude]].slice(-20) : [[pilot.latitude, pilot.longitude]],
        status: status,
        simpleRoute: cachedRoute,
        lnav: existing?.lnav,
        smoothing: { active: smoothingActive, startTime: Date.now(), duration: 3500, offsets: offsets }
      };

      // Marker Creation / Updates
      let marker = markersRef.current[cid];
      let polyline = tracksRef.current[cid];
      const isSelected = selectedCid === cid;

      if (!marker) {
        const icon = L.divIcon({
          className: 'plane-icon-container',
          html: createPlaneIconHTML(pilot.heading, status.color, false, null, isSelected),
          iconSize: [32, 32], iconAnchor: [16, 16],
        });
        
        marker = L.marker([pilot.latitude, pilot.longitude], { icon }).addTo(map);
        marker.bindTooltip(createTooltipHTML(pilot, status, deviationNm), { direction: 'top', offset: [0, -15], opacity: 1, className: 'custom-leaflet-tooltip' });
        polyline = L.polyline([], { color: status.color, weight: 2, opacity: 0.5, dashArray: '4, 4' }).addTo(map);
        
        markersRef.current[cid] = marker;
        tracksRef.current[cid] = polyline;

        // --- EVENTS ---
        marker.on('click', () => {
          // Check Ref to see if we are toggling OFF
          if (selectedCidRef.current === cid) {
             selectedCidRef.current = null;
             setSelectedCid(null);
             routeLayerGroup.clearLayers();
          } else {
             // New Selection
             selectedCidRef.current = cid;
             setSelectedCid(cid);
             drawRouteForPilot(cid);
          }
        });

        marker.on('mouseover', () => {
           hoveredCidRef.current = cid;
           // Only draw preview if nothing is locked
           if (selectedCidRef.current === null) {
              drawRouteForPilot(cid);
           }
        });

        marker.on('mouseout', () => {
           hoveredCidRef.current = null;
           // Only clear if nothing is locked
           if (selectedCidRef.current === null) {
              routeLayerGroup.clearLayers();
              activeRoutePathRef.current = [];
           }
        });
      } else {
        // Update Marker State
        const html = createPlaneIconHTML(pilot.heading, status.color, false, null, isSelected);
        const currentIcon = marker.options.icon as L.DivIcon;
        if (currentIcon.options.html !== html) {
             marker.setIcon(L.divIcon({ className: 'plane-icon-container', html, iconSize: [32, 32], iconAnchor: [16, 16] }));
        }
        if (marker.getTooltip()) {
             marker.setTooltipContent(createTooltipHTML(pilot, status, deviationNm));
        }
        // Force color update on polyline
        if (polyline) polyline.setStyle({ color: status.color });
      }
    });

    // Cleanup
    Object.keys(markersRef.current).forEach((key: any) => {
      const cid = Number(key);
      if (!activeCids.has(cid)) {
        markersRef.current[cid].remove();
        tracksRef.current[cid].remove();
        delete markersRef.current[cid];
        delete tracksRef.current[cid];
        delete pilotRegistry.current[cid];
        
        if (selectedCid === cid) {
           setSelectedCid(null);
           selectedCidRef.current = null;
           routeLayerGroup.clearLayers();
        }
      }
    });
    
  }, [trafficData, selectedSectorIds, selectedCid]);

  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      Object.entries(pilotRegistry.current).forEach(([cidKey, entry]: [string, any]) => {
        const cid = Number(cidKey);
        const marker = markersRef.current[cid];
        const polyline = tracksRef.current[cid];
        if (!marker) return;

        // Physics
        const timeSinceUpdate = (now - entry.dataTimestamp) / 1000;
        let currentHeading = entry.lastData.heading + (entry.rates.turnRate * timeSinceUpdate);
        currentHeading = ((currentHeading % 360) + 360) % 360;
        
        // Use LNAV if available
        let lat, lon;
        if (entry.lnav && entry.lnav.active && entry.simpleRoute) {
            const pos = predictPositionOnRoute(entry.simpleRoute, entry.lnav.startDist, entry.lnav.offset, entry.lastData.groundspeed, timeSinceUpdate);
            lat = pos.lat; lon = pos.lon;
        } else {
            const pred = predictPosition(entry.lastData.latitude, entry.lastData.longitude, currentHeading, entry.lastData.groundspeed, timeSinceUpdate);
            lat = pred.lat; lon = pred.lon;
        }
        
        // Smoothing
        if (entry.smoothing.active) {
          const elapsed = now - entry.smoothing.startTime;
          if (elapsed < entry.smoothing.duration) {
            const t = elapsed / entry.smoothing.duration;
            const ease = 1 - Math.pow(1 - t, 3);
            const decayFactor = 1 - ease;
            lat += entry.smoothing.offsets.lat * decayFactor;
            lon += entry.smoothing.offsets.lon * decayFactor;
            currentHeading += entry.smoothing.offsets.hdg * decayFactor;
          } else {
            entry.smoothing.active = false;
          }
        }

        // Validate
        if (isNaN(lat) || isNaN(lon)) return;

        // Draw
        marker.setLatLng([lat, lon]);
        const iconElement = marker.getElement();
        if (iconElement) {
           const wrapper = iconElement.querySelector('.plane-wrapper') as HTMLElement;
           if (wrapper) wrapper.style.transform = `rotate(${currentHeading}deg)`;
        }
        if (polyline) polyline.setLatLngs([...entry.history, [lat, lon]] as L.LatLngExpression[]);

        // Update Text
        const altEl = document.getElementById(`alt-${cid}`);
        if (altEl) altEl.innerText = (Math.round((entry.lastData.altitude + (entry.rates.climbRate * timeSinceUpdate)) / 25) * 25).toLocaleString();
        const spdEl = document.getElementById(`spd-${cid}`);
        if (spdEl) spdEl.innerText = Math.round(entry.lastData.groundspeed).toString();
        const hdgEl = document.getElementById(`hdg-${cid}`);
        if (hdgEl) hdgEl.innerText = Math.round(currentHeading).toString().padStart(3, '0');

        // Sticky Route Lines (Selected OR Hovered)
        if ((cid === selectedCidRef.current || cid === hoveredCidRef.current) && activeRoutePathRef.current.length > 0) {
           const { past, future } = splitRouteAtPlane(activeRoutePathRef.current, [lat, lon]);
           if (pastLineRef.current && past.length) pastLineRef.current.setLatLngs(past);
           if (futureLineRef.current && future.length) futureLineRef.current.setLatLngs(future);
        }
      });
      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  const handleSectorToggle = (id: string) => {
    const next = new Set(selectedSectorIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSectorIds(next);
  };

  return (
    <AirspaceLayer
      selectedSectors={selectedSectorIds}
      onSectorToggle={handleSectorToggle}
      visible={layers.sectors}
    />
  );
}