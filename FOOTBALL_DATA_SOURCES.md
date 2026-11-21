# Football data strategy (November 2026)

**Primary provider: API-Sports.** Fixtures, player profiles, scorer analysis, lineups, H2H and available odds remain on their existing API-Sports integrations. Do not mix API-Sports player/team/fixture IDs with other providers.

**Free supplementary historical evidence: OpenLigaDB** (active without credentials). It supplies completed results for supported German competitions and can contribute to form and opponent defence calculations, not individual player shots, minutes, or bookmaker odds.

**Optional free-tier provider: football-data.org.** Set `FOOTBALL_DATA_TOKEN` in Vercel to enable completed-match evidence for the competitions available under that account's tier. It is not a player statistics or scorer odds replacement. Without the token, OpenLigaDB and API-Sports continue working.

**Sportmonks disabled in the live analysis path.** Its paid player supplementation and completed-match evidence calls were removed. Unused Sportmonks helper modules remain in the repository for reference but are not called by the active football API routes. Remove `SPORTMONKS_API_TOKEN` from Vercel if no longer needed; this does not cancel a Sportmonks subscription.

Other possible historical sources, such as StatsBomb Open Data or football-data.co.uk CSVs, require licensing, competition coverage and import validation before being used in production. Understat has no approved integration.

Missing data is not invented. The UI may show an unavailable probability or quote if the underlying verified player minutes, goals or bookmaker feed are missing.
