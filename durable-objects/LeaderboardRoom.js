export class LeaderboardRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (method === 'GET') {
      const scores = (await this.state.storage.get('scores')) || [];
      const gameId = url.pathname.split('/').filter(Boolean).at(-1) || 'unknown';
      return new Response(JSON.stringify({ gameId, scores }), { status: 200, headers });
    }

    if (method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers });
      }

      const playerId = String(body?.playerId || '').trim().slice(0, 80);
      const displayName = String(body?.displayName || playerId || '').trim().slice(0, 80);
      const score = Number(body?.score);

      if (!playerId || !displayName || !Number.isFinite(score) || score < 0) {
        return new Response(JSON.stringify({ error: 'invalid payload' }), { status: 400, headers });
      }

      const scores = (await this.state.storage.get('scores')) || [];
      scores.push({
        playerId,
        displayName,
        score: Math.floor(score),
        recordedAt: new Date().toISOString()
      });
      scores.sort((a, b) => b.score - a.score);
      const trimmed = scores.slice(0, 50);
      await this.state.storage.put('scores', trimmed);

      return new Response(JSON.stringify({ ok: true, scores: trimmed }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers });
  }
}
