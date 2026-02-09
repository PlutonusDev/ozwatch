'use client';

import { useEffect, useState } from 'react';
import { CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import useSWR from 'swr';
import { parseAirportsToList, type Airport } from '../lib/airports';

const AIRPORT_URL = '/airports.txt';
const fetcher = (url: string) => fetch(url).then((res) => res.text());

export default function AirportLayer({ visible }: { visible: boolean }) {
  const { data: textData } = useSWR(AIRPORT_URL, fetcher, {
    revalidateOnFocus: false,
  });

  const [airports, setAirports] = useState<Airport[]>([]);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    setShouldLoad(visible);
  }, [visible]);

  // 1. Parse Data
  useEffect(() => {
    if (textData) {
      const parsed = parseAirportsToList(textData);
      setAirports(parsed);
    }
  }, [textData]);

  if (!shouldLoad) return null;

  return (
    <>
      {airports.map((apt) => (
        <CircleMarker 
          key={apt.id} 
          center={[apt.lat, apt.lon]}
          radius={4} 
          pathOptions={{ 
            color: '#0ea5e9', // Cyan Border
            weight: 1,
            fillColor: '#0f172a', // Dark Fill
            fillOpacity: 0.8,
          }}
        >
          {/* permanent={true}: Always shows the label
              direction="bottom": Puts it below the dot so it doesn't block planes
          */}
          <Tooltip 
            key={`${apt.id}`}
            permanent={true} 
            direction="bottom" 
            offset={[0, 1]} 
            opacity={0.9} 
            className={true ? "airport-tooltip-permanent -translate-y-1.5" : "airport-tooltip"}
          >
            <span className="font-bold text-cyan-400">{apt.id}</span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}