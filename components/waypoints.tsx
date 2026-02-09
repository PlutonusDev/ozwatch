'use client';

import { useEffect, useState } from 'react';
import { CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import useSWR from 'swr';
import { parseWaypoints, type Waypoint } from '../lib/waypoints';

// Assuming you place your file at public/waypoints.txt
const WAYPOINT_URL = '/waypoints.txt';
const fetcher = (url: string) => fetch(url).then((res) => res.text());

interface WaypointLayerProps {
  visible: boolean; // <--- Controlled by Parent now
}

export default function WaypointLayer({ visible }: WaypointLayerProps) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [points, setPoints] = useState<any[]>([]);

  // 1. Load Data Logic:
  // If the user toggles it ON, we trigger the load.
  // We never "unload" data, we just hide the layer.
  useEffect(() => {
    setShouldLoad(visible);
  }, [visible]);

  const { data: textData } = useSWR(WAYPOINT_URL, fetcher);

  useEffect(() => {
    if (textData) {
      setTimeout(() => {
        const parsed = parseWaypoints(textData).map(wp => ({
          ...wp, type: 'waypoint' as const
        }));
        setPoints(parsed);
      }, 0);
    }
  }, [textData]);

  if (!shouldLoad) return null;

  return (
    <>
      {points.map((wp, i) => (
        // Key note: Using index as key is okay here since the list is static
        <CircleMarker 
          key={i} 
          center={[wp.lat, wp.lon]}
          radius={3} // Very small dot
          pathOptions={{ 
            color: '#64748b', // Slate-500 (Subtle grey)
            fillColor: '#64748b',
            fillOpacity: 0.3,
            weight: 0 // No border
          }}
        />
      ))}
    </>
  );
}