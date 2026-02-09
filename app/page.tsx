// app/page.tsx
'use client';

import dynamic from 'next/dynamic';

// Dynamically import the map with SSR disabled
const VatsimMap = dynamic(() => import('../components/map'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full flex items-center justify-center bg-slate-900 text-white">
      <p>Loading Australian Airspace...</p>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="h-screen w-full relative">
      {/*<div className="absolute top-4 left-4 z-[1000] bg-slate-900/40 py-1 px-2 text-white backdrop-blur-sm border border-slate-800/40">
        <h1 className="text-sm font-bold">OZWATCH Tracking</h1>
        <p className="text-xs text-slate-400">Updated every 15 seconds</p>
      </div>*/}
      <VatsimMap />
    </main>
  );
}