'use client';

import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import LayerControl from './layercontrol';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const TrafficController = dynamic(() => import('./traffic-controller'), { ssr: false });
const AirspaceLayer = dynamic(() => import('./airspace'), { ssr: false });
const AirportLayer = dynamic(() => import('./airports'), { ssr: false });
const WaypointLayer = dynamic(() => import('./waypoints'), { ssr: false });
const AirwayLayer = dynamic(() => import('./airways'), { ssr: false });

const VatsimMap = () => {
  const [layers, setLayers] = useState({
    airports: false,   // Default OFF
    waypoints: false, // Default OFF (Cluttered)
    airways: false,   // Default OFF
    sectors: true     // Default ON
  });

  const toggleLayer = (key: string) => {
    setLayers(prev => ({ ...prev, [key as keyof typeof layers]: !prev[key as keyof typeof layers] }));
  };

  return (
    <div className="relative w-full h-screen bg-slate-950">
      
      {/* 1. The Floating Control Panel */}
      <LayerControl state={layers} onToggle={toggleLayer} />

      <MapContainer center={[-25, 133]} zoom={5} className="w-full h-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        <AirportLayer visible={layers.airports} />
        <WaypointLayer visible={layers.waypoints} />
        <AirwayLayer visible={layers.airways} />

        {/* Traffic is usually always on, or add a toggle for it too */}
        <TrafficController layers={layers} />

      </MapContainer>
    </div>
  );
};

export default VatsimMap;