'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface AcarsMessage {
  id: string;
  from: string;
  type: string;
  packet: string;
  timestamp: number;
  read: boolean;
  direction: 'in' | 'out';
}

interface HoppiePanelProps {
  onMessagesUpdate: (messages: AcarsMessage[]) => void;
  onOnlineUpdate: (callsigns: string[]) => void;
  pilotCallsigns: string[];
  sendTelexTarget?: string | null;
  onSendTelexTargetClear?: () => void;
}

export default function HoppiePanel({ onMessagesUpdate, onOnlineUpdate, pilotCallsigns, sendTelexTarget, onSendTelexTargetClear }: HoppiePanelProps) {
  const [callsign, setCallsign] = useState('');
  const [logonCode, setLogonCode] = useState('');
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<AcarsMessage[]>([]);
  const [showSend, setShowSend] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendType, setSendType] = useState<'telex' | 'cpdlc'>('telex');
  const [sendPacket, setSendPacket] = useState('');
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectedRef = useRef(false);
  const callsignRef = useRef('');
  const logonRef = useRef('');

  // Keep refs in sync
  useEffect(() => {
    connectedRef.current = connected;
    callsignRef.current = callsign;
    logonRef.current = logonCode;
  }, [connected, callsign, logonCode]);

  const pollMessages = useCallback(async () => {
    if (!connectedRef.current) return;
    try {
      const res = await fetch('/api/hoppie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll', logon: logonRef.current, from: callsignRef.current })
      });
      const data = await res.json();
      if (data.ok && data.messages && data.messages.length > 0) {
        const newMsgs: AcarsMessage[] = data.messages.map((m: any, i: number) => ({
          id: `${Date.now()}-${i}`,
          from: m.from,
          type: m.type,
          packet: m.packet,
          timestamp: Date.now(),
          read: false,
          direction: 'in' as const
        }));
        setMessages(prev => {
          const updated = [...newMsgs, ...prev].slice(0, 100);
          return updated;
        });
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, []);

  const pingOnlineAircraft = useCallback(async () => {
    if (!connectedRef.current || pilotCallsigns.length === 0) return;
    try {
      // Ping in batches of 20
      const allOnline: string[] = [];
      for (let i = 0; i < pilotCallsigns.length; i += 20) {
        const batch = pilotCallsigns.slice(i, i + 20);
        const res = await fetch('/api/hoppie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ping',
            logon: logonRef.current,
            from: callsignRef.current,
            packet: batch.join(' ')
          })
        });
        const data = await res.json();
        if (data.ok && data.online) {
          allOnline.push(...data.online);
        }
      }
      onOnlineUpdate(allOnline);
    } catch (err) {
      console.error('Ping error:', err);
    }
  }, [pilotCallsigns, onOnlineUpdate]);

  // Propagate messages
  useEffect(() => {
    onMessagesUpdate(messages);
    setUnreadCount(messages.filter(m => !m.read && m.direction === 'in').length);
  }, [messages, onMessagesUpdate]);

  const handleConnect = () => {
    if (!callsign || !logonCode) return;
    setConnected(true);
    // Start polling immediately then every 60s
    setTimeout(pollMessages, 500);
    pollTimerRef.current = setInterval(pollMessages, 60000);
    // Ping every 2 minutes
    setTimeout(pingOnlineAircraft, 2000);
    pingTimerRef.current = setInterval(pingOnlineAircraft, 120000);
  };

  const handleDisconnect = () => {
    setConnected(false);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    onOnlineUpdate([]);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    };
  }, []);

  // Re-ping when pilotCallsigns change
  useEffect(() => {
    if (connected && pilotCallsigns.length > 0) {
      pingOnlineAircraft();
    }
  }, [pilotCallsigns, connected, pingOnlineAircraft]);

  // Handle send telex target from aircraft list
  useEffect(() => {
    if (sendTelexTarget && connected) {
      setSendTo(sendTelexTarget);
      setShowSend(true);
      setIsMinimized(false);
      onSendTelexTargetClear?.();
    }
  }, [sendTelexTarget, connected, onSendTelexTargetClear]);

  const handleSend = async () => {
    if (!sendTo || !sendPacket) return;
    setSendStatus('Sending...');
    try {
      const res = await fetch('/api/hoppie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          logon: logonCode,
          from: callsign,
          to: sendTo.toUpperCase(),
          type: sendType,
          packet: sendPacket
        })
      });
      const data = await res.json();
      if (data.ok) {
        const sentMsg: AcarsMessage = {
          id: `sent-${Date.now()}`,
          from: callsign,
          type: sendType,
          packet: sendPacket,
          timestamp: Date.now(),
          read: true,
          direction: 'out'
        };
        setMessages(prev => [sentMsg, ...prev]);
        setSendPacket('');
        setSendStatus('Sent');
        setTimeout(() => setSendStatus(null), 2000);
      } else {
        setSendStatus(`Error: ${data.raw || 'Failed'}`);
        setTimeout(() => setSendStatus(null), 4000);
      }
    } catch (err) {
      setSendStatus('Network error');
      setTimeout(() => setSendStatus(null), 4000);
    }
  };

  const openSendTo = (target: string) => {
    setSendTo(target);
    setShowSend(true);
  };

  const markAllRead = () => {
    setMessages(prev => prev.map(m => ({ ...m, read: true })));
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toUTCString().slice(17, 22) + 'Z';
  };

  if (isMinimized) {
    return (
      <button
        data-testid="acars-expand-btn"
        onClick={() => setIsMinimized(false)}
        className="absolute bottom-4 right-4 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-2"
      >
        <span className="text-amber-400">ACARS</span>
        {unreadCount > 0 && (
          <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      data-testid="acars-panel"
      className="absolute bottom-4 right-4 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-xl w-80 max-h-[500px] flex flex-col font-mono text-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold tracking-wider text-[11px]">ACARS</span>
          {connected && (
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
          )}
        </div>
        <button
          data-testid="acars-minimize-btn"
          onClick={() => setIsMinimized(true)}
          className="text-slate-500 hover:text-slate-300 text-sm px-1"
        >
          _
        </button>
      </div>

      {/* Login or Connected View */}
      {!connected ? (
        <div className="p-3 space-y-2">
          <div>
            <label className="text-slate-500 text-[10px] uppercase tracking-wider">ATC Callsign</label>
            <input
              data-testid="acars-callsign-input"
              type="text"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value.toUpperCase())}
              placeholder="e.g. YMMM_CTR"
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-slate-200 placeholder-slate-600 mt-0.5 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-slate-500 text-[10px] uppercase tracking-wider">Logon Code</label>
            <input
              data-testid="acars-logon-input"
              type="password"
              value={logonCode}
              onChange={(e) => setLogonCode(e.target.value)}
              placeholder="Your Hoppie code"
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-slate-200 placeholder-slate-600 mt-0.5 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <button
            data-testid="acars-connect-btn"
            onClick={handleConnect}
            disabled={!callsign || !logonCode}
            className="w-full bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded py-1.5 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            CONNECT
          </button>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Connection Info */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-slate-800/40">
            <span className="text-slate-400">
              Logged as <span className="text-amber-400">{callsign}</span>
            </span>
            <button
              data-testid="acars-disconnect-btn"
              onClick={handleDisconnect}
              className="text-red-400/70 hover:text-red-400 text-[10px]"
            >
              DISCONNECT
            </button>
          </div>

          {/* Actions Row */}
          <div className="flex gap-1 px-3 py-1.5 border-b border-slate-800">
            <button
              data-testid="acars-new-msg-btn"
              onClick={() => setShowSend(!showSend)}
              className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${
                showSend 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              NEW MSG
            </button>
            <button
              data-testid="acars-mark-read-btn"
              onClick={markAllRead}
              className="flex-1 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 text-[10px] font-bold transition-colors"
            >
              MARK READ {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>

          {/* Send Form */}
          {showSend && (
            <div className="p-2 border-b border-slate-800 space-y-1.5 bg-slate-800/30">
              <div className="flex gap-1">
                <input
                  data-testid="acars-send-to-input"
                  type="text"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value.toUpperCase())}
                  placeholder="TO"
                  className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                />
                <select
                  data-testid="acars-send-type-select"
                  value={sendType}
                  onChange={(e) => setSendType(e.target.value as 'telex' | 'cpdlc')}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none"
                >
                  <option value="telex">TELEX</option>
                  <option value="cpdlc">CPDLC</option>
                </select>
              </div>
              <textarea
                data-testid="acars-send-packet-input"
                value={sendPacket}
                onChange={(e) => setSendPacket(e.target.value.toUpperCase())}
                placeholder="Message..."
                rows={2}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-amber-500/50"
              />
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[10px]">
                  {sendStatus || ''}
                </span>
                <button
                  data-testid="acars-send-btn"
                  onClick={handleSend}
                  disabled={!sendTo || !sendPacket}
                  className="bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded px-3 py-1 hover:bg-amber-500/30 transition-colors disabled:opacity-40"
                >
                  SEND
                </button>
              </div>
            </div>
          )}

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto min-h-0 max-h-[250px]" data-testid="acars-messages-list">
            {messages.length === 0 ? (
              <div className="p-4 text-center text-slate-600">
                No messages yet. Polling every 60s...
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  data-testid={`acars-message-${msg.id}`}
                  className={`px-3 py-2 border-b border-slate-800/50 ${
                    !msg.read && msg.direction === 'in' ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''
                  }`}
                  onClick={() => {
                    if (msg.direction === 'in') {
                      openSendTo(msg.from);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={msg.direction === 'in' ? 'text-cyan-400' : 'text-green-400'}>
                        {msg.direction === 'in' ? '>' : '<'}
                      </span>
                      <span className="text-white font-bold">
                        {msg.direction === 'in' ? msg.from : `TO: ${sendTo || msg.from}`}
                      </span>
                      <span className={`text-[9px] px-1 py-0.5 rounded ${
                        msg.type === 'cpdlc' 
                          ? 'bg-red-500/20 text-red-400' 
                          : 'bg-sky-500/20 text-sky-400'
                      }`}>
                        {msg.type.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-slate-600 text-[10px]">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className="text-slate-300 mt-0.5 leading-snug break-words">{msg.packet}</div>
                  {msg.direction === 'in' && (
                    <button
                      data-testid={`acars-reply-${msg.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openSendTo(msg.from);
                      }}
                      className="text-amber-500/60 hover:text-amber-400 text-[10px] mt-1"
                    >
                      REPLY
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
