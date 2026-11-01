# Favorite event notifications

Enable Push in Favorites (or the existing Live Tips button). On iOS use the installed Home Screen web app. The same device subscription covers favorite events; live tips are optional. Star changes automatically update server preferences. Player favorites follow the stored team; re-save a player after a transfer. DEL event coverage is explicitly not enabled.

The existing GitHub Actions schedule checks approximately every five minutes; GitHub scheduling and provider updates may delay delivery. MATCHDAY_CRON_SECRET is already used by the workflow; the endpoint requires the matching Vercel CRON_SECRET. VAPID and Redis configuration are unchanged. No extra Vercel function or paid service is added.

Football: kickoff, goals with available scorer names, halftime and full time. NHL: game start, goals with available scorer names, period starts/ends, unequal-skater powerplays with both goalies present, and game end. Data gaps remain data gaps; a score-change notification can precede scorer attribution. Whole periods or short powerplays missed by provider event history cannot be reconstructed from a five-minute status snapshot.

First observation establishes the event baseline without replaying historical events. State expires after three days. Per-device event delivery is deduplicated. Favorite events enter a one-hour Redis outbox and retry transient push failures on subsequent checks; expired subscriptions are removed. Unfavoriting excludes queued events. The GitHub workflow serializes runs.

No real push is sent by unit tests. Coverage includes favorite targeting, sport separation, scorer names, phase transitions, duplicate suppression, and rejecting empty-net strength as a powerplay. Device delivery still requires browser permission and a valid push subscription.
