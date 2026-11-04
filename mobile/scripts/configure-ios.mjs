import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../ios/App/',import.meta.url);
const delegate=new URL('App/AppDelegate.swift',base);let swift=await readFile(delegate,'utf8');
if(!swift.includes('capacitorDidRegisterForRemoteNotifications')){
 const end=swift.lastIndexOf('}');if(end<0)throw Error('AppDelegate nicht gefunden');
 swift=swift.slice(0,end)+`    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`+swift.slice(end);await writeFile(delegate,swift);
}
const plist=new URL('App/Info.plist',base);let info=await readFile(plist,'utf8');
if(!info.includes('ITSAppUsesNonExemptEncryption')){info=info.replace('</dict>\n</plist>','<key>ITSAppUsesNonExemptEncryption</key><false/>\n</dict>\n</plist>');await writeFile(plist,info)}
await writeFile(new URL('App/App.entitlements',base),'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>aps-environment</key><string>production</string></dict></plist>\n');
await writeFile(new URL('App/PrivacyInfo.xcprivacy',base),'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>NSPrivacyTracking</key><false/><key>NSPrivacyAccessedAPITypes</key><array><dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array></dict></array></dict></plist>\n');
const project=new URL('App.xcodeproj/project.pbxproj',base);let pbx=await readFile(project,'utf8');
pbx=pbx.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,'PRODUCT_BUNDLE_IDENTIFIER = com.kevinkohm.matchdaypro;');
if(!pbx.includes('CODE_SIGN_ENTITLEMENTS ='))pbx=pbx.replace(/INFOPLIST_FILE = App\/Info.plist;/g,'INFOPLIST_FILE = App/Info.plist;\n                CODE_SIGN_ENTITLEMENTS = App/App.entitlements;');
if(!pbx.includes('PrivacyInfo.xcprivacy')){
 pbx=pbx.replace('/* Begin PBXBuildFile section */','/* Begin PBXBuildFile section */\n        A1D000000000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = A1D000000000000000000002; };');
 pbx=pbx.replace('/* Begin PBXFileReference section */','/* Begin PBXFileReference section */\n        A1D000000000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = App/PrivacyInfo.xcprivacy; sourceTree = SOURCE_ROOT; };');
 pbx=pbx.replace(/(isa = PBXResourcesBuildPhase;[\s\S]*?files = \()/,'$1\n                A1D000000000000000000001 /* PrivacyInfo.xcprivacy in Resources */,');
}
if(!pbx.includes('PrivacyInfo.xcprivacy in Resources')||!pbx.includes('CODE_SIGN_ENTITLEMENTS'))throw Error('iOS-Konfiguration unvollständig');
await writeFile(project,pbx);console.log('iOS push, privacy and export settings prepared');
