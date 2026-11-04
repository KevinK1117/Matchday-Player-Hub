# Matchday Pro cloud iOS builds

The owner has installed the first signed preview through TestFlight. Codemagic integration `matchday-apple` and bundle `com.kevinkohm.matchdaypro` already work; the Apple app ID is 6830088598.

Use branch `mobile/ios-android-subscriptions`. Workflow `ios-testflight-preview` builds with `VITE_APP_MODE=preview`, syncs Capacitor plugins, applies `scripts/configure-ios.mjs`, signs the IPA and uploads it to App Store Connect. It does not submit App Store review. The explicit developer preview button is not suitable for a paid release.

For subscription tests, first configure the RevenueCat product/offering and public SDK key plus real privacy/terms URLs in Codemagic, and the subscription-read key on the backend. For push, first configure a dedicated Apple APNs key on the backend. See README.md for exact names and sandbox rules. Never commit secrets or paste them in chat.

After service configuration and backend deployment, generate a new signed TestFlight build. Validate €9.99 localized Germany pricing, purchase/cancel/restore, refund/expiry/grace handling and native push on an iPhone. The current source changes alone do not update an installed TestFlight binary. Enable a paid production build and submit review only after this validation and required legal/store setup.
