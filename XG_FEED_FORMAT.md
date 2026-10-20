# Optional licensed xG feed

Set `XG_FEED_URL` (HTTPS) and optionally `XG_FEED_TOKEN` in Vercel.
The URL must respond to `?date=YYYY-MM-DD` with:
`{"players":[{"fixtureId":12345,"playerId":45678,"xG":0.72,"minutes":90}]}`.

Player and fixture IDs must match API-Sports. Map the provider IDs upstream if different.
Without licensed xG feed all xG fields stay unavailable. xG/90 computed only when minutes > 0.
`/fixtures/lineups` yields confirmed starter status only after lineups are published.
