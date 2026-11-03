# Matchday Pro — iOS / Android preparation

Status: native project preparation, not a production-ready paid app. No real payments are enabled. The current website is unchanged. The intended German storefront price is EUR 9.99 per month, auto-renewing; it must be configured in both stores. Actual localized price must come from the store product, never a hardcoded checkout price.

## Local build

1. `npm ci`
2. `npm run build`
3. `npm run setup:native` generates the iOS and Android platform templates reproducibly
4. `npx cap sync`
5. `npm run open:ios` (Mac and Xcode) or `npm run open:android` (Android Studio).

Bundle ID `com.kevinkohm.matchdaypro` is registered with Apple under the Matchday Pro developer team. The existing interface is bundled locally; no production `server.url` wrapper is used. Native HTTP reaches the existing Vercel API. The shell currently blocks paid access and shows the intended subscription offer. It is a starting point, not secure production monetization.

## Required user-owned accounts

- Apple Developer Program: https://developer.apple.com/programs/enroll/
- Google Play Console: https://play.google.com/console/signup
- RevenueCat project: https://app.revenuecat.com/

Account registration, identity verification, paid agreements, tax details and bank/payout information must be completed by the owner. No store account or paid subscription was purchased by this task.

## Subscription configuration

Create `matchday_pro_monthly` in each store; on Google create a monthly auto-renewing base plan. Set Germany/EUR price to 9.99 and review other territories separately. RevenueCat entitlement `pro` must map to both products and the current offering's monthly package. Put only public platform SDK keys in `.env` (see `.env.example`). Secret store credentials and service keys belong in the backend/RevenueCat dashboard, never in this repository.

The purchase and restore adapter exists, but buttons intentionally remain disabled. Before enabling, display the store's localized price, wire cancellation/account management, test purchase/restore/refund/grace-period/revocation, and connect an authenticated user identity to server-side subscription authorization. A local boolean or client SDK check must not protect paid APIs. Public existing website APIs are not yet subscription-protected.

## Release blockers

- Real developer accounts, signed paid-app agreements, bank/tax setup and store products.
- Authentication, cross-device identity, backend entitlement checks and subscription event handling.
- Native APNs/FCM token storage and event delivery; existing service-worker Web Push does not cover native apps. Existing web push controls must be replaced in native UI before release.
- Actual privacy policy, terms, support contact, account deletion where applicable, age rating and store data disclosures.
- Confirm commercial redistribution rights for all football/NHL data, images and logos. Review store policy treatment of betting-related tips and external betting links; approval is not guaranteed.
- Native icons/splash, deep links, network/error/offline handling, accessibility and device testing.
- Signed Android AAB and signed iOS archive, sandbox billing, TestFlight/Play internal tests and store review.

This environment cannot sign or submit iOS builds without the owner's Apple account and Apple build tooling. The web bundle built successfully and both native platform templates were generated and synchronized here. Generated platform folders are intentionally ignored and can be recreated with `npm run setup:native`; no compiled/signed IPA/AAB or store publication is claimed.
