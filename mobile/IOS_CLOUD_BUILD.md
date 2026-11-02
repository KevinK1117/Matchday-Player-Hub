# iPhone-only owner: iOS cloud build

Prepared on branch `mobile/ios-android-subscriptions`. The repository root contains `codemagic.yaml`. No cloud account, signing certificate, iPhone-installable IPA or TestFlight upload has been created by this change.

1. Confirm the Apple Developer Program membership is ACTIVE (creating a free Apple developer login is not sufficient for App Store distribution).
2. Open https://codemagic.io/ and create your own account using GitHub. Grant access to KevinK1117/Matchday-Player-Hub only, then select this branch and YAML configuration. Review Codemagic's plan/billing before starting builds.
3. The unsigned workflow validates a simulator build. Its artifact cannot be installed on an iPhone.
4. In Apple Developer register the provisional bundle identifier `com.matchdaypro.app` if available. Create the matching iOS App Store Connect app record with the owner's real identity and app name. A conflict requires changing both mobile/capacitor.config.json and codemagic.yaml.
5. Add your App Store Connect integration directly in Codemagic under the exact name `matchday-apple`. Upload Apple API keys and signing credentials only in the trusted provider interface, never in chat or GitHub source. Follow Codemagic automatic signing to provision an App Store distribution certificate/profile for the bundle identifier.
6. Run `ios-testflight-preview` manually. It produces a signed IPA artifact after signing succeeds. Publishing to TestFlight is deliberately not automatic yet; configure upload after checking signing, app record, export-compliance details and preview behavior.
7. Install TestFlight on the iPhone. A successful TestFlight upload and tester invitation are still needed to install the build. An App Store distribution IPA cannot simply be opened on an iPhone.

Both workflows set `VITE_APP_MODE=preview`. The subscription screen has a developer-only preview button; purchases remain disabled. The native Push UI and subscription server authorization are not finished. This is not the €9.99/month production release.

Production blockers remain in README.md: store subscription products, privacy/terms, native APNs/FCM, authenticated backend entitlement checks, data rights, device testing and store review.

Official signing setup: https://docs.codemagic.io/yaml-code-signing/signing-ios/
