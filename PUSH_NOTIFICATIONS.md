# Favorite event notifications

Enable Push in Favorites (or the existing Live Tips button). On iOS use the installed Home Screen web app. The same device subscription covers favorite events; live tips are optional. Star changes automatically update server preferences. Player favorites follow the stored team; re-save a player after a transfer. DEL event coverage is explicitly not enabled.

The existing GitHub Actions schedule checks approximately every five minutes; GitHub scheduling and provider updates may delay delivery. MATCHDAY_CRON_SECRET is already used by the workflow; the endpoint requires the matching Vercel CRON_SECRET. VAPID and Redis configuration are unchanged. No extra Vercel function or paid service is added.

Football: kickoff, goals with available scorer names, halftime and full time. NHL: game start, goals with available scorer names, period starts/ends, unequal-skater powerplays with both goalies present, and game end. Data gaps remain data gaps; a score-change notification can precede scorer attribution. Whole periods or short powerplays missed by provider event history cannot be reconstructed from a five-minute status snapshot.

First observation establishes the event baseline without replaying historical events. State expires after three days. Per-device event delivery is deduplicated. Favorite events enter a one-hour Redis outbox and retry transient push failures on subsequent checks; expired subscriptions are removed. Unfavoriting excludes queued events. The GitHub workflow serializes runs.

No real push is sent by unit tests. Coverage includes favorite targeting, sport separation, scorer names, phase transitions, duplicate suppression, and rejecting empty-net strength as a powerplay. Device delivery still requires browser permission and a valid push subscription.


## Compact lock-screen messages and delivery latency (2026-11-04)

Titles now show the fixture. Bodies use one compact line with sport icon, match time, event, score and scorer. NHL goal events use their own official homeScore/awayScore and bracket the scoring side; if an event score is absent, the current score is explicitly labeled. The app cannot change the iOS system notification card or its relative receipt-time label.

The last observed GitHub runs were about 50–80 minutes apart despite the five-minute cron expression. This is scheduler latency; changing notification text or APNs priority does not fix it. The existing schedule remains a fallback. No sub-minute delivery guarantee is made.

Push scans now invoke the validated fixture handlers directly, avoiding an extra CDN stale-while-revalidate cache layer. Both sports are scanned concurrently; known lineups are not fetched repeatedly. The NHL event response supplies the current score when available, keeping the stored event baseline in step with play-by-play. Provider delays still apply.

A dedicated minutely scheduler can call GET https://matchday-player-hub.vercel.app/api/push-check with Authorization: Bearer <PUSH_SCHEDULER_SECRET>. The dedicated key is restricted to scans and status; it cannot invoke ?test=1. Do not give a third-party scheduler the general CRON_SECRET, Apple key, Redis token or any device token. A token-owned Redis scan lease (released on completion, maximum 120 seconds) prevents overlap between the new scheduler and GitHub fallback. GET ?status=1 with authorized credentials reads the last completed run without sending notifications. It reports scan time, duration and delivery counts, not device identifiers.

Prepared target configuration for cron-job.org: one job named Matchday Pro – Push, method GET, every minute, URL as above, Authorization custom header, no request body, notifications only for job failure if the owner chooses. Its official service describes free minute execution and custom HTTP headers: https://cron-job.org/en/ . No external account, secret or job has been created by this change. Creation of the service account and disclosure of a dedicated scheduler key require the owner's approval. Verify job execution history and server status after setup; then test a real favorite event on the owner's device.

Validation uses mocked providers and does not send production test notifications. Existing installed native apps receive the new server-formatted messages without a new TestFlight binary; a new browser service-worker version is not required for these body/title changes.
