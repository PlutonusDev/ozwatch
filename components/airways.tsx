'use client';

import { useEffect, useState } from 'react';
import { Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import useSWR from 'swr';
import { parseAirways, type AirwaySegment } from '../lib/airways';

// Save your text data to public/airways.txt
const AIRWAY_URL = '/airways.txt';
const fetcher = (url: string) => fetch(url).then((res) => res.text());

export default function AirwayLayer({ visible }: { visible: boolean }) {
  const { data: textData } = useSWR(AIRWAY_URL, fetcher, {
    revalidateOnFocus: false,
  });

  const [segments, setSegments] = useState<AirwaySegment[]>([]);
  const [shouldLoad, setShouldLoad] = useState(visible);

  useEffect(() => {
    setShouldLoad(visible);
  }, [visible]);

  // Parse once when data loads
  useEffect(() => {
    if (textData) {
      const parsed = parseAirways(textData);
      console.log(`Loaded ${parsed.length} Airway segments.`);
      setSegments(parsed);
    }
  }, [textData]);

  if (!shouldLoad) return null;

  return (
    <>
      {segments.map((seg, i) => (
        <Polyline
          key={`${seg.id}-${i}`}
          positions={seg.path}
          pathOptions={{
            color: '#94a3b8', // Slate-400 (Subtle Grey)
            weight: 1,        // Very thin
            opacity: 0.2,
            dashArray: '5, 5' // Optional: Dashed lines look "chart-like"
          }}
        />
      ))}
    </>
  );
}