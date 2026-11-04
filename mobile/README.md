# Matchday Pro mobile

## Status (2026-11-04)

The owner installed TestFlight 1.0 (1793738899) successfully. Apple app 6830088598 uses bundle `com.kevinkohm.matchdaypro`. The German monthly product `matchday_pro_monthly` is created at €9.99. This branch now implements purchase/restore UI, server verification, and native iOS APNs delivery, but the APNs key is configured on the production server and the Apple purchase key is created; RevenueCat configuration, deployment, a new signed build and real-device validation remain. The existing installed preview does not gain these features without an update.

## Abo setup

- In RevenueCat, create/select the owner project and iOS app; connect the correct App Store account. Map `matchday_pro_monthly` to entitlement `pro`, and to the current offering's MONTHLY package.
- Codemagic public build values: `VITE_REVENUECAT_IOS_PUBLIC_KEY`, `VITE_PRIVACY_URL`, `VITE_TERMS_URL`. Values prefixed VITE are bundled publicly. Never put private keys there.
- Vercel configuration: `REVENUECAT_IOS_PUBLIC_KEY`, using the existing iOS public SDK key to read Customer Info via REST API v1. No project-wide administrative secret is needed; `REVENUECAT_SECRET_KEY` remains a compatibility fallback. The backend reads current RevenueCat subscriber status rather than trusting a client boolean. Sandbox access requires explicit server `ALLOW_SANDBOX_SUBSCRIPTIONS=true` for TestFlight billing tests; turn off before public paid release.
- App installation generates a random 256-bit credential persisted through native Preferences. Its SHA-256 digest is the RevenueCat app user ID. The server derives this ID from the credential rather than accepting a caller-selected user ID. Restore uses StoreKit/RevenueCat for a reinstall or second device. There is no separate user-account login or cloud favorites sync.
- Public web APIs stay public. The native offer gates native access after both SDK and server verification; it does not turn existing public sports APIs into private subscription APIs.
- `VITE_APP_MODE=preview` keeps the explicitly labeled developer preview route. A paid build must set `VITE_APP_MODE=production`; preparation fails if public SDK key or legal URLs are absent. Purchases remain unavailable until the store product and RevenueCat setup actually respond.

## Native iOS push setup

- The owner approved creating the APNs credential. Key 9629N82FTH is production-only and topic-specific for com.kevinkohm.matchdaypro; its private key is stored as a sensitive Vercel production variable. Do not reuse App Store Connect credentials as an APNs key.
- Store only in Vercel secrets: `APNS_PRIVATE_KEY`, `APNS_KEY_ID`; config `APNS_TEAM_ID=2G3S3473A3`, `APNS_TOPIC=com.kevinkohm.matchdaypro`, `APNS_ENVIRONMENT=production` for TestFlight/App Store. A debug-device build with a development profile instead needs sandbox APNs and matching entitlements.
- Uses existing Redis configuration and the existing five-minute push worker. Native subscribers share the same favorite-event matching, confirmation events, retry outbox and delivery deduplication as web push.
- POST/DELETE `/api/push?channel=ios` authenticate the installation credential. The server only calls Apple's fixed APNs endpoints. Device records expire after 90 days without refresh; invalid device tokens are removed after APNs rejects them. Preferences sync on favorite edits, reconnection and foregrounding. The app asks iOS for notification permission only after the user taps enable.
- `node scripts/configure-ios.mjs` adds AppDelegate registration forwarding, production APNs entitlement, the Preferences required-reason manifest and standard-crypto export declaration to generated iOS templates. Existing Apple App ID push capability/profile must match.
- Native push currently targets iOS. Android FCM still needs its own Firebase configuration and sender implementation.

## Build and verification

`npm ci && npm run build`, then `test -d ios || npx cap add ios`, `npx cap sync ios`, `node scripts/configure-ios.mjs`. Cloud workflows apply the iOS patch after sync. Use Xcode/Codemagic for signing; a Linux bundle build is not a signed iPhone build.

Before release: real privacy/terms/support URLs, paid-app agreement/bank/tax completion, App Store disclosures, receipt/refund/grace/reinstall tests and real-device foreground/background/terminated push tests. Do not submit or claim production readiness before these pass. The owner must confirm any legally binding terms and credential access changes.

The native-only layout uses viewport-fit=cover and CSS safe-area insets. The developer preview banner is in normal header flow, below the status bar. Confirm on the next TestFlight build. Native backend handlers share api/push.js channels, keeping the Vercel Hobby deployment at 12 functions.

## Current GitHub integration (2026-11-04)

The mobile bundle now uses main through 8121fc7, including updated source/club context and the shot-based NHL model with centers. RevenueCat project 5a49f316 has the default offering matchday, MONTHLY package and matchday_pro_monthly linked to pro. The public iOS SDK key is supplied in codemagic.yaml. Server Customer Info retrieval with that key returned HTTP 200 for the existing QA installation. Actual subscription purchase/restore and device push delivery still require iPhone validation. Privacy and terms URLs remain required before enabling purchases; do not substitute vendor privacy policies.
