import { NextRequest, NextResponse } from 'next/server';

const HOPPIE_URL = 'https://www.hoppie.nl/acars/system/connect.html';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, logon, from, to, type, packet } = body;

    if (!logon || !from) {
      return NextResponse.json({ error: 'Missing logon or callsign' }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.set('logon', logon);
    params.set('from', from);

    if (action === 'poll') {
      params.set('to', 'SERVER');
      params.set('type', 'poll');
      params.set('packet', '');
    } else if (action === 'ping') {
      // Ping specific callsigns to check if they're online
      if (!packet) {
        return NextResponse.json({ error: 'Missing packet for ping' }, { status: 400 });
      }
      params.set('to', 'SERVER');
      params.set('type', 'ping');
      params.set('packet', packet);
    } else if (action === 'send') {
      if (!to || !type || !packet) {
        return NextResponse.json({ error: 'Missing to, type, or packet' }, { status: 400 });
      }
      params.set('to', to);
      params.set('type', type);
      params.set('packet', packet);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const res = await fetch(`${HOPPIE_URL}?${params.toString()}`, {
      cache: 'no-store',
    });

    const text = await res.text();
    
    // Parse Hoppie response
    // Format: "ok {data}" or "error {reason}"
    const isOk = text.trimStart().startsWith('ok');
    
    if (action === 'poll' && isOk) {
      // Parse poll response - messages come as:
      // ok {FROM telex {message}} {FROM cpdlc {message}} ...
      const messages = parsePollResponse(text);
      return NextResponse.json({ ok: true, messages });
    }
    
    if (action === 'ping' && isOk) {
      // Parse ping response - format: "ok {callsign1 callsign2 ...}"
      const onlineList = parsePingResponse(text);
      return NextResponse.json({ ok: true, online: onlineList });
    }

    return NextResponse.json({ 
      ok: isOk, 
      raw: text.trim()
    });
  } catch (error: any) {
    console.error('Hoppie API Error:', error);
    return NextResponse.json({ error: error.message || 'Hoppie API error' }, { status: 500 });
  }
}

function parsePollResponse(raw: string): Array<{ from: string; type: string; packet: string }> {
  const messages: Array<{ from: string; type: string; packet: string }> = [];
  
  // Remove "ok" prefix and trim
  let content = raw.replace(/^ok\s*/, '').trim();
  if (!content) return messages;

  // Messages are in format: {FROM TYPE {PACKET}}
  const regex = /\{(\S+)\s+(\S+)\s+\{([^}]*)\}\}/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    messages.push({
      from: match[1],
      type: match[2],
      packet: match[3].trim()
    });
  }

  return messages;
}

function parsePingResponse(raw: string): string[] {
  // Format: "ok {callsign1 callsign2}" or "ok {}" 
  const match = raw.match(/ok\s*\{([^}]*)\}/);
  if (!match || !match[1].trim()) return [];
  return match[1].trim().split(/\s+/).filter(s => s.length > 0);
}
