'use client';

import { GeoJSON } from 'react-leaflet';
import useSWR from 'swr';
import L from 'leaflet';
import { useEffect, useState } from 'react';

const GEOJSON_URL = 'https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson';
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface AirspaceLayerProps {
  onSectorToggle: (sectorId: string) => void;
  selectedSectors: Set<string>;
  visible: boolean;
}

export default function AirspaceLayer({ onSectorToggle, selectedSectors, visible }: AirspaceLayerProps) {
  const [shouldLoad, setShouldLoad] = useState(visible);
  const { data } = useSWR(GEOJSON_URL, fetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    setShouldLoad(visible);
  }, [visible]);

  if (!data) return null;

  // Filter for Australia
  const australianFirData = {
    ...data,
    features: data.features.filter((f: any) => {
      const id = f.properties?.id || f.properties?.label || '';
      return id.startsWith('Y'); 
    }),
  };

  // Define styles based on selection state
  const style = (feature: any) => {
    const id = feature.properties?.id || feature.properties?.label;
    const isSelected = selectedSectors?.has(id);

    return {
      color: isSelected ? '#10b981' : '#475569', // Green-500 if active, Slate-600 if idle
      weight: isSelected ? 2 : 1,
      opacity: isSelected ? 0.8 : 0.3,
      fillColor: isSelected ? '#10b981' : 'transparent',
      fillOpacity: isSelected ? 0.1 : 0,
      dashArray: isSelected ? '' : '5, 5' // Solid line if active
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const id = feature.properties?.id || feature.properties?.label;

    // 2. Click Handler
    layer.on('click', () => {
      if (id) onSectorToggle(id);
    });
  };

  if (!shouldLoad) return null;

  return (
    <GeoJSON 
      data={australianFirData} 
      style={style} 
      onEachFeature={onEachFeature}
      // Critical: Re-render when selection changes to update colors
      key={`geo-${Array.from(selectedSectors || []).join(',')}`} 
    />
  );
}