# Leaderboard Service

Shared leaderboard backend for any game, with Nostr identity and attrition.

## API

### Get leaderboard for a game

`GET /api/leaderboards/:gameId`

Response:
```json
{
  "gameId": "aipong",
  "scores": [
    {
      "playerId": "ALICE",
      "displayName": "ALICE",
      "score": 42,
      "recordedAt": "2026-05-01T12:00:00.000Z",
      "source": "anonymous",
      "nostrNpub": null,
      "ageMs": 777600000,
      "dead": true
    },
    {
      "playerId": "npub1...",
      "displayName": "BOB",
      "score": 30,
      "recordedAt": "2026-05-10T12:00:00.000Z",
      "source": "nostr",
      "nostrNpub": "npub1...",
      "ageMs": 0,
      "dead": false
    }
  ]
}
```

- `source`: `"nostr"` or `"anonymous"`
- `nostrNpub`: the player's npub if sourced from Nostr, `null` otherwise
- `ageMs`: milliseconds since the score was recorded
- `dead`: `true` for anonymous entries older than 7 days (Nostr entries never die)

### Submit a score

`POST /api/leaderboards/:gameId/scores`

Request body:
```json
{
  "playerId": "ALICE",
  "displayName": "ALICE",
  "score": 42
}
```

For Nostr players, include `nostrNpub`:
```json
{
  "playerId": "npub1...",
  "displayName": "BOB",
  "score": 30,
  "nostrNpub": "npub1..."
}
```

## Attrition

- **Nostr entries**: live forever, shown with a green tint and full opacity
- **Anonymous entries**: color-shift green → yellow → red over 7 days, then marked `dead`
- Use the client module's `computeAttrition()` to get `{ color, opacity, dead }`

## Client Module

```js
import { submitScore, fetchLeaderboard } from './src/leaderboard.js';

// Anonymous player
await submitScore(BASE_URL, 'aipong', 'ALICE', 42);

// Nostr player — pass npub, it resolves the name automatically
await submitScore(BASE_URL, 'aipong', 'npub1...', 21);

// Fetch with attrition colors baked in
const lb = await fetchLeaderboard(BASE_URL, 'aipong');
// lb.scores[n].attrition = { color: '#00ff88', opacity: 1, dead: false }
```

### Functions

| Function | Description |
|---|---|
| `isNpub(input)` | Returns `true` if input looks like an npub |
| `resolveNpub(npub)` | Fetches display name from Nostr profile |
| `submitScore(baseUrl, gameId, name, score)` | Auto-detects npub, resolves name, submits |
| `fetchLeaderboard(baseUrl, gameId)` | Fetches scores with attrition colors |
| `computeAttrition(entry)` | Returns `{ color, opacity, dead }` from raw entry |

## Deployment

```bash
npx wrangler deploy
```

## Storage

One Durable Object per `gameId`. Top 50 scores by score descending.
