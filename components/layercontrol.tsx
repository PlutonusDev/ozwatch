'use client';

interface LayerControlProps {
  state: {
    airports: boolean;
    waypoints: boolean;
    airways: boolean;
    sectors: boolean;
  };
  onToggle: (key: string) => void;
}

export default function LayerControl({ state, onToggle }: LayerControlProps) {
  return (
    <div className="absolute top-4 right-4 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg p-3 shadow-xl w-48">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
        Map Layers
      </h3>
      
      <div className="space-y-2">
        {Object.entries(state).map(([key, isActive]) => (
          <button
            key={key}
            onClick={() => onToggle(key)}
            disabled={key === 'sectors'}
            className={`
              w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-all
              ${isActive 
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50' 
                : 'bg-slate-800 text-slate-400 border border-transparent hover:bg-slate-700'}
              ${key === 'sectors' && 'pointer-events-none opacity-50'}
            `}
          >
            <span className="capitalize">{key}</span>
            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]' : 'bg-slate-600'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}