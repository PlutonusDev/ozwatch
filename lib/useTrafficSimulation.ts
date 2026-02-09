// hooks/useTrafficSimulation.ts
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { calculateRates, predictPosition } from './estimator';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface PilotData {
  cid: number;
  callsign: string;
  latitude: number;
  longitude: number;
  altitude: number;
  groundspeed: number;
  heading: number;
  // ... other vatsim fields
}

interface SimulatedPilot extends PilotData {
  track: any; // History of positions for the polyline
}

export const useTrafficSimulation = () => {
  const { data: serverData } = useSWR('/api/traffic', fetcher, {
    refreshInterval: 15000,
    dedupingInterval: 15000,
  });

  // Stores the "Physics State" of every pilot
  const pilotRegistry = useRef<Record<number, {
    lastData: PilotData;
    lastUpdated: number;
    rates: { turnRate: number; climbRate: number; accelRate: number };
    history: any;
  }>>({});

  const [renderedTraffic, setRenderedTraffic] = useState<SimulatedPilot[]>([]);
  const requestRef = useRef<number>(null);

  // 1. SYNC: Update Registry when Server Data arrives
  useEffect(() => {
    if (!serverData?.pilots) return;
    
    const now = Date.now();
    const activeCids = new Set<number>();

    serverData.pilots.forEach((pilot: PilotData) => {
      activeCids.add(pilot.cid);
      const existing = pilotRegistry.current[pilot.cid];

      if (existing) {
        // Calculate physics rates based on change from last snapshot
        const timeDelta = (serverData.serverTime - existing.lastUpdated) / 1000;
        const rates = calculateRates(existing.lastData, pilot, timeDelta);

        // Update registry
        pilotRegistry.current[pilot.cid] = {
          lastData: pilot,
          lastUpdated: serverData.serverTime,
          rates,
          // Append new real position to history (keep last 20 points)
          history: [...existing.history, [pilot.latitude, pilot.longitude]].slice(-20),
        };
      } else {
        // New pilot found
        pilotRegistry.current[pilot.cid] = {
          lastData: pilot,
          lastUpdated: serverData.serverTime,
          rates: { turnRate: 0, climbRate: 0, accelRate: 0 },
          history: [[pilot.latitude, pilot.longitude]],
        };
      }
    });

    // Cleanup disconnected pilots
    Object.keys(pilotRegistry.current).forEach((key) => {
      if (!activeCids.has(Number(key))) {
        delete pilotRegistry.current[Number(key)];
      }
    });

  }, [serverData]);

  // 2. ANIMATION LOOP: Predict movement every frame (60fps)
  useEffect(() => {
    const animate = () => {
      const now = Date.now();

      const frameData = Object.values(pilotRegistry.current).map((entry) => {
        // Time since the LAST server update
        const timeSinceUpdate = (now - entry.lastUpdated) / 1000;

        // A. Predict Heading
        let currentHeading = entry.lastData.heading + (entry.rates.turnRate * timeSinceUpdate);
        currentHeading = ((currentHeading % 360) + 360) % 360; // Normalize 0-360

        // B. Predict Speed (clamp to 0 to prevent negative speed)
        const currentSpeed = Math.max(0, entry.lastData.groundspeed + (entry.rates.accelRate * timeSinceUpdate));

        // C. Predict Altitude
        const currentAlt = entry.lastData.altitude + (entry.rates.climbRate * timeSinceUpdate);

        // D. Predict Position (Lat/Lon)
        const { lat, lon } = predictPosition(
          entry.lastData.latitude,
          entry.lastData.longitude,
          currentHeading,
          currentSpeed,
          timeSinceUpdate
        );

        return {
          ...entry.lastData,
          latitude: lat,
          longitude: lon,
          heading: currentHeading,
          altitude: Math.round(currentAlt),
          groundspeed: Math.round(currentSpeed),
          // Attach history for the polyline, adding current projected point to the end
          track: [...entry.history, [lat, lon]], 
        };
      });

      setRenderedTraffic(frameData as SimulatedPilot[]);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  return renderedTraffic;
};