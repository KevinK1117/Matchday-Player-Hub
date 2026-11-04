# Favorite event notifications

Current policy (2026-11-04): only goals and game end for favorite football/NHL fixtures or the stored teams of favorite players. No lineup, kickoff, halftime, period, powerplay or live-tip notifications. The UI no longer offers live-tip push switches. Existing installed clients are constrained by the server policy even before their next binary update. DEL remains unsupported.

The policy is applied at event creation and again at delivery. Older queued disallowed event types are removed when scanned. Existing queued goal/end messages remain eligible. Manual broadcast test pushes are disabled. Lineup confirmation badges in the app remain independent of push notifications.

## Compact lock-screen messages and delivery latency (2026-11-04)

Titles now show the fixture. Bodies use one compact line with sport icon, match time, event, score and scorer. NHL goal events use their own official homeScore/awayScore and bracket the scoring side; if an event score is absent, the current score is explicitly labeled. The app cannot change the iOS system notification card or its relative receipt-time label.

The last observed GitHub runs were about 50–80 minutes apart despite the five-minute cron expression. This is scheduler latency; changing notification text or APNs priority does not fix it. The existing schedule remains a fallback. No sub-minute delivery guarantee is made.

Push scans now invoke the validated fixture handlers directly, avoiding an extra CDN stale-while-revalidate cache layer. Both sports are scanned concurrently; known lineups are not fetched repeatedly. The NHL event response supplies the current score when available, keeping the stored event baseline in step with play-by-play. Provider delays still apply.

A dedicated minutely scheduler can call GET https://matchday-player-hub.vercel.app/api/push-check with Authorization: Bearer <PUSH_SCHEDULER_SECRET>. The dedicated key is restricted to scans and status; it cannot invoke ?test=1. Do not give a third-party scheduler the general CRON_SECRET, Apple key, Redis token or any device token. A token-owned Redis scan lease (released on completion, maximum 120 seconds) prevents overlap between the new scheduler and GitHub fallback. GET ?status=1 with authorized credentials reads the last completed run without sending notifications. It reports scan time, duration and delivery counts, not device identifiers.

Prepared target configuration for cron-job.org: one job named Matchday Pro – Push, method GET, every minute, URL as above, Authorization custom header, no request body, notifications only for job failure if the owner chooses. Its official service describes free minute execution and custom HTTP headers: https://cron-job.org/en/ . No external account, secret or job has been created by this change. Creation of the service account and disclosure of a dedicated scheduler key require the owner's approval. Verify job execution history and server status after setup; then test a real favorite event on the owner's device.

Validation uses mocked providers and does not send production test notifications. Existing installed native apps receive the new server-formatted messages without a new TestFlight binary; a new browser service-worker version is not required for these body/title changes.
