'use client';

import { useState } from 'react';

export interface AircraftEntry {
  callsign: string;
  cid: number;
  state: 'inside' | 'entering' | 'leaving' | 'transition';
  sectorName: string;
  secondarySector: string | null;
  minutesUntilEvent: number | null;
  distanceNm: number | null;
  altitude: number;
  groundspeed: number;
  acarsOnline: boolean;
}

interface AircraftListProps {
  aircraft: AircraftEntry[];
  onSendTelex: (callsign: string) => void;
  onAircraftClick: (cid: number) => void;
}

export default function AircraftList({ aircraft, onSendTelex, onAircraftClick }: AircraftListProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const inside = aircraft.filter(a => a.state === 'inside' && a.altitude > 24500);
  const transition = aircraft.filter(a => a.state === 'transition' && a.altitude > 24500);
  const entering = aircraft.filter(a => a.state === 'entering' && a.altitude > 24500);
  const leaving = aircraft.filter(a => a.state === 'leaving' && a.altitude > 24500);

  const total = aircraft.length;

  if (isCollapsed) {
    return (
      <button
        data-testid="aircraft-list-expand-btn"
        onClick={() => setIsCollapsed(false)}
        className="absolute top-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-2"
      >
        <span className="text-emerald-400">TRAFFIC</span>
        <span className="text-slate-500">{total}</span>
      </button>
    );
  }

  const formatDist = (nm: number | null) => {
    if (nm === null || nm === undefined) return '--';
    return `${Math.round(nm)}nm`;
  };

  const formatTime = (mins: number | null) => {
    if (mins === null || mins === undefined) return '--';
    if (mins < 1) return '<1m';
    return `${mins}m`;
  };

  const renderSection = (title: string, entries: AircraftEntry[], colorClass: string, borderClass: string, testId: string) => {
    if (entries.length === 0) return null;
    return (
      <div className="mb-3" data-testid={testId}>
        <div className={`px-3 py-1.5 border-b ${borderClass} flex items-center justify-between`}>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${colorClass}`}>{title}</span>
          <span className="py-1 px-2 bg-slate-800 rounded text-slate-400 text-[10px]">{entries.length}</span>
        </div>
        <div className="max-h-[110px] overflow-y-auto no-scrollbar">
          {entries.map((ac) => (
            <div
              key={ac.cid}
              data-testid={`aircraft-entry-${ac.callsign}`}
              onClick={() => onAircraftClick(ac.cid)}
              className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/30 hover:bg-slate-800/40 cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-[72px] text-white font-mono tracking-widest text-[11px] truncate">{ac.callsign}{ac.acarsOnline && <span className="text-emerald-500 font-bold"> A</span>}</span>
                {/*ac.acarsOnline && (
                  <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded shrink-0">
                    ACARS
                  </span>
                )*/}
                {/*ac.acarsOnline && (
                  <button
                    data-testid={`send-telex-${ac.callsign}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendTelex(ac.callsign);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 hover:bg-amber-500/30 transition-all"
                  >
                    TLX
                  </button>
                )*/}
                {ac.state === 'entering' && (
                  <span className="text-[9px] bg-sky-500/20 text-sky-400 px-1 py-0.5 rounded shrink-0">{"-> "}{ac.sectorName}</span>
                )}
                {ac.state === 'transition' && (
                  <span className="text-[9px] bg-sky-500/20 text-sky-400 px-1 py-0.5 rounded shrink-0">{ac.sectorName}{" -> "}{ac.secondarySector}</span>
                )}
                {ac.state === 'leaving' && (
                  <span className="text-[9px] bg-sky-500/20 text-sky-400 px-1 py-0.5 rounded shrink-0">{ac.sectorName}{" ->"}</span>
                )}
                {ac.state === 'inside' && (
                  <span className="text-[9px] bg-sky-500/20 text-sky-400 px-1 py-0.5 rounded shrink-0">{ac.sectorName}</span>
                )}
              </div>
              <div className="text-center flex items-center gap-1 shrink-0">
                <span className="text-slate-500 text-[10px] w-[30px]">
                  FL{Math.round(ac.altitude / 100).toString().padStart(3, '0')}
                </span>
                {ac.state !== 'inside' && (
                  <>
                    <span className="w-[30px] text-slate-500 text-[10px] tabular-nums">
                      {formatDist(ac.distanceNm)}
                    </span>
                    <span className={`w-[20px] text-[10px] ${colorClass} tabular-nums`}>
                      {formatTime(ac.minutesUntilEvent)}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="aircraft-list-panel"
      className="absolute top-4 left-4 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-xl w-72 max-h-[calc(100vh-32px)] flex flex-col font-mono text-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 font-bold tracking-wider text-[11px]">SECTOR TRAFFIC</span>
          <span className="text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{total}</span>
        </div>
        <button
          data-testid="aircraft-list-collapse-btn"
          onClick={() => setIsCollapsed(true)}
          className="text-slate-500 hover:text-slate-300 text-sm px-1"
        >
          _
        </button>
      </div>

      {total === 0 ? (
        <div className="p-4 text-center text-slate-600">
          Select a sector to see traffic
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {renderSection('ACTIVE', inside, 'text-emerald-400', 'border-emerald-500/20', 'aircraft-section-inside')}
          {renderSection('TRANSIT', transition, 'text-emerald-400', 'border-yellow-500/20', 'aircraft-section-transition')}
          {renderSection('INBOUND', entering, 'text-yellow-400', 'border-yellow-500/20', 'aircraft-section-entering')}
          {renderSection('OUTBOUND', leaving, 'text-orange-400', 'border-orange-500/20', 'aircraft-section-leaving')}
        </div>
      )}
    </div>
  );
}
