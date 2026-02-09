'use client';

import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import LayerControl from './layercontrol';
import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const TrafficController = dynamic(() => import('./traffic-controller'), { ssr: false });
import type { AcarsMessage } from './hoppie-panel';
import type { AircraftEntry } from './aircraft-list';
const AirportLayer = dynamic(() => import('./airports'), { ssr: false });
const WaypointLayer = dynamic(() => import('./waypoints'), { ssr: false });
const AirwayLayer = dynamic(() => import('./airways'), { ssr: false });
const HoppiePanel = dynamic(() => import('./hoppie-panel'), { ssr: false });
const AircraftList = dynamic(() => import('./aircraft-list'), { ssr: false });

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

  const [acarsMessages, setAcarsMessages] = useState<AcarsMessage[]>([]);
  const [acarsOnline, setAcarsOnline] = useState<string[]>([]);
  const [pilotCallsigns, setPilotCallsigns] = useState<string[]>([]);
  const [sectorTraffic, setSectorTraffic] = useState<AircraftEntry[]>([]);

  // Ref for send telex target (opened from aircraft list)
  const sendTelexTargetRef = useRef<string | null>(null);
  const [sendTelexTarget, setSendTelexTarget] = useState<string | null>(null);

  const [focusCid, setFocusCid] = useState<number | null>(null);

  const handleMessagesUpdate = useCallback((msgs: AcarsMessage[]) => {
    setAcarsMessages(msgs);
  }, []);

  const handleOnlineUpdate = useCallback((callsigns: string[]) => {
    setAcarsOnline(callsigns);
  }, []);

  const handlePilotCallsignsUpdate = useCallback((callsigns: string[]) => {
    setPilotCallsigns(callsigns);
  }, []);

  const handleSectorTrafficUpdate = useCallback((traffic: AircraftEntry[]) => {
    setSectorTraffic(traffic);
  }, []);

  const handleSendTelex = useCallback((callsign: string) => {
    setSendTelexTarget(callsign);
  }, []);

  const handleAircraftClick = useCallback((cid: number) => {
    setFocusCid(cid);
    // Reset after a tick so it can be re-triggered
    setTimeout(() => setFocusCid(null), 100);
  }, []);

  return (
    <div className="relative w-full h-screen bg-slate-950">
      
      {/* 1. The Floating Control Panel */}
      <LayerControl state={layers} onToggle={toggleLayer} />

      <AircraftList
        aircraft={sectorTraffic}
        onSendTelex={handleSendTelex}
        onAircraftClick={handleAircraftClick}
      />

      <MapContainer center={[-25, 133]} zoom={5} zoomControl={false} className="w-full h-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        <AirportLayer visible={layers.airports} />
        <WaypointLayer visible={layers.waypoints} />
        <AirwayLayer visible={layers.airways} />

        <TrafficController
          layers={layers}
          acarsOnline={acarsOnline}
          acarsMessages={acarsMessages}
          onPilotCallsignsUpdate={handlePilotCallsignsUpdate}
          onSectorTrafficUpdate={handleSectorTrafficUpdate}
          focusCid={focusCid}
        />

      </MapContainer>

      <HoppiePanel
        onMessagesUpdate={handleMessagesUpdate}
        onOnlineUpdate={handleOnlineUpdate}
        pilotCallsigns={pilotCallsigns}
        sendTelexTarget={sendTelexTarget}
        onSendTelexTargetClear={() => setSendTelexTarget(null)}
      />
    </div>
  );
};

export default VatsimMap;