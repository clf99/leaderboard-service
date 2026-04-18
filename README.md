# Leaderboard Service

Shared leaderboard backend for token demo games like Pong and future games.

## Stage 1 goal

Create one standalone service that any game can call for shared scores.

This repo is intentionally separate from any one game repo.

## Intended flow

- each game uses its own `gameId`
- game clients submit scores to this service
- clients fetch a shared leaderboard for that `gameId`
- later we swap manual player names for Nostr `npub`
- later we can publish leaderboard snapshots to Nostr periodically

## API draft

### Get leaderboard for a game

`GET /api/leaderboards/:gameId`

Response:

```json
{
  "gameId": "pong",
  "scores": [
    {
      "playerId": "ALICE",
      "displayName": "ALICE",
      "score": 42,
      "recordedAt": "2026-04-18T17:00:00.000Z"
    }
  ]
}
```

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

For now `playerId` and `displayName` can both be a typed-in name.
Later `playerId` will become the player's `npub` and `displayName` can be hydrated from profile data.

## Storage approach

This scaffold uses one Durable Object namespace and one object per game id.
That gives us one shared leaderboard per game.

## Current status

- repo separated from Pong and from cliffellaweb
- generic API shape defined
- worker scaffold created
- not deployed yet
- not wired into Pong yet
