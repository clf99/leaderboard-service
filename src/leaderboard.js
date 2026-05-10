// leaderboard.js — Reusable client for leaderboard-service
// Handles npub detection, Nostr profile resolution, and attrition coloring.
//
// Usage:
//   import { submitScore, fetchLeaderboard } from './src/leaderboard.js';
//
//   // Anonymous player
//   await submitScore(BASE_URL, 'aipong', 'ALICE', 42);
//
//   // Nostr player (enter your npub instead of a name)
//   await submitScore(BASE_URL, 'aipong', 'npub1...', 21);
//
//   // Fetch with color data
//   const lb = await fetchLeaderboard(BASE_URL, 'aipong');

// --- Bech32 decoder (minimal, npub only) ---

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32ToHex(str) {
  const sep = str.lastIndexOf('1');
  if (sep < 1) throw new Error('invalid bech32: no separator');
  const hrp = str.slice(0, sep);
  const dataPart = str.slice(sep + 1);
  if (hrp !== 'npub') throw new Error('expected npub prefix');

  // convert chars to 5-bit values
  const values = [];
  for (const ch of dataPart) {
    const idx = BECH32_CHARSET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid bech32 char: ${ch}`);
    values.push(idx);
  }

  // skip last 6 checksum chars
  const raw = values.slice(0, -6);

  // convert 5-bit → 8-bit
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const v of raw) {
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  // first 32 bytes = pubkey
  const pubkeyBytes = bytes.slice(0, 32);
  if (pubkeyBytes.length !== 32) throw new Error('invalid npub: expected 32 bytes');

  return Array.from(pubkeyBytes, b => b.toString(16).padStart(2, '0')).join('');
}

// --- npub detection ---

export function isNpub(input) {
  return typeof input === 'string' && input.startsWith('npub1') && input.length >= 59 && input.length <= 63;
}

// --- Nostr profile resolution ---
// Queries multiple relays via WebSocket with fallback chain.
// No external API dependency — works as long as one relay responds.

const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://pyramid.fiatjaf.xyz',
];

function relayQueryName(hex, relay) {
  return new Promise((resolve) => {
    let cleaned = false;
    const cleanup = (name) => {
      if (cleaned) return;
      cleaned = true;
      ws.close();
      clearTimeout(timer);
      resolve(name);
    };

    const ws = new WebSocket(relay);
    const timer = setTimeout(() => cleanup(null), 6000);

    ws.onopen = () => {
      ws.send(JSON.stringify([
        'REQ', 'profile-' + hex.slice(0, 8),
        { kinds: [0], authors: [hex], limit: 1 }
      ]));
    };

    ws.onmessage = (event) => {
      try {
        const [type, subId, data] = JSON.parse(event.data);
        if (type === 'EVENT' && data?.kind === 0) {
          const content = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
          const name = content?.display_name || content?.name || content?.nip05?.split('@')[0] || null;
          if (name) cleanup(name);
        }
        if (type === 'EOSE') cleanup(null);
      } catch {}
    };

    ws.onerror = () => cleanup(null);
  });
}

export async function resolveNpub(npub) {
  let hex;
  try {
    hex = bech32ToHex(npub);
  } catch {
    return null;
  }

  // Try relays in sequence until one succeeds
  for (const relay of NOSTR_RELAYS) {
    const name = await relayQueryName(hex, relay);
    if (name) return name;
  }

  return null;
}

// --- Attrition color ---

const ATTRITION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Returns { color, opacity, dead } for a leaderboard entry.
 * Nostr entries stay full color forever.
 * Anonymous entries color-shift from green → yellow → red → dead over 7 days.
 */
export function computeAttrition(entry) {
  if (entry.source === 'nostr') {
    return { color: '#00ff88', opacity: 1, dead: false };
  }

  if (entry.dead || entry.ageMs >= ATTRITION_MS) {
    return { color: '#330000', opacity: 0.15, dead: true };
  }

  const t = entry.ageMs / ATTRITION_MS; // 0 → 1 over 7 days

  // Color: green (#00ff44) → yellow (#ffcc00) → red (#ff2200)
  let r, g, b;
  if (t < 0.5) {
    // green → yellow (t 0 → 0.5)
    const p = t / 0.5;
    r = Math.round(0 + p * 255);
    g = Math.round(255 - p * 170);
    b = Math.round(68 - p * 68);
  } else {
    // yellow → red (t 0.5 → 1)
    const p = (t - 0.5) / 0.5;
    r = 255;
    g = Math.round(204 - p * 204);
    b = Math.round(0);
  }

  // Opacity: full until day 4, then fade over last 3 days
  let opacity = 1;
  if (t > 4 / 7) {
    opacity = 1 - ((t - 4 / 7) / (3 / 7));
  }

  const color = `rgb(${r}, ${g}, ${b})`;
  return { color, opacity: Math.round(opacity * 100) / 100, dead: false };
}

// --- API calls ---

export async function submitScore(baseUrl, gameId, name, score, options = {}) {
  const sanitize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 _.\-@:]/g, '').trim().slice(0, 80);

  const rawName = String(name || '').trim().slice(0, 80);
  let playerId = sanitize(rawName);
  let displayName = sanitize(rawName);
  let nostrNpub = null;

  if (isNpub(rawName)) {
    // Resolve from Nostr
    const resolved = await resolveNpub(rawName);
    displayName = resolved ? sanitize(resolved) : 'NOSTR';
    nostrNpub = rawName;
  }

  if (!playerId) {
    playerId = 'ANON';
    displayName = 'ANON';
  }
  if (!displayName) displayName = playerId;

  const safeScore = Math.max(0, Math.floor(Number(score) || 0));

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/leaderboards/${encodeURIComponent(gameId)}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId,
      displayName,
      score: safeScore,
      ...(nostrNpub ? { nostrNpub } : {})
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`leaderboard submit failed: ${res.status} ${err.error || ''}`);
  }

  return res.json();
}

export async function fetchLeaderboard(baseUrl, gameId, { withColor = true } = {}) {
  const res = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/api/leaderboards/${encodeURIComponent(gameId)}`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`leaderboard fetch failed: ${res.status} ${err.error || ''}`);
  }

  const data = await res.json();

  if (withColor) {
    data.scores = data.scores.map(entry => ({
      ...entry,
      attrition: computeAttrition(entry)
    }));
  }

  return data;
}
