import { LeaderboardRoom } from './durable-objects/LeaderboardRoom.js';

export { LeaderboardRoom };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (pathname === '/') {
      return json({
        service: 'leaderboard-service',
        routes: [
          'GET /api/leaderboards/:gameId',
          'POST /api/leaderboards/:gameId/scores'
        ]
      });
    }

    const match = pathname.match(/^\/api\/leaderboards\/([^/]+?)(?:\/scores)?$/);
    if (!match) {
      return json({ error: 'not found' }, 404);
    }

    const gameId = decodeURIComponent(match[1]).trim().toLowerCase();
    if (!gameId) {
      return json({ error: 'missing game id' }, 400);
    }

    const wantsScoresRoute = pathname.endsWith('/scores');
    if (request.method === 'POST' && !wantsScoresRoute) {
      return json({ error: 'post scores to /scores' }, 400);
    }
    if (request.method === 'GET' && wantsScoresRoute) {
      return json({ error: 'use GET /api/leaderboards/:gameId' }, 400);
    }

    const id = env.LEADERBOARD_ROOM.idFromName(gameId);
    const stub = env.LEADERBOARD_ROOM.get(id);

    const targetUrl = new URL(request.url);
    targetUrl.pathname = `/room/${gameId}`;
    const proxied = new Request(targetUrl.toString(), request);
    return stub.fetch(proxied);
  }
};
