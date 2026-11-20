# Matchday Pro – Datenschutz und Monatsabo

Stand: 4. November 2026. **Entwurf zur Prüfung, nicht als veröffentlichte Richtlinie verwenden.**

## Vor der Veröffentlichung ergänzen

- Vollständiger rechtlicher Betreibername, ladungsfähige Anschrift und öffentlich verwendbare Kontaktadresse.
- Tatsächliche Hosting-/Redis-Regionen, Auftragsverarbeitungsverträge und gegebenenfalls Schutzmechanismen für Drittlandübermittlungen prüfen. Aus dem Code allein sind diese Angaben nicht feststellbar.
- Aufbewahrungsfristen für RevenueCat-Kundendaten, Hosting-Protokolle und Backups festlegen und mit den Anbieter-Einstellungen abgleichen. Eine Kündigung oder Deinstallation löscht diese Daten nicht automatisch.
- Datenschutzinformationen und Abo-Bedingungen prüfen, auf eigenen HTTPS-Seiten veröffentlichen und deren URLs in App und App Store Connect hinterlegen.
- App-Store-Datenschutzangaben einschließlich Kaufhistorie und zugehöriger pseudonymer Kennungen vervollständigen. Nicht „keine Daten erfasst“ angeben.
- Apple-Verträge, Bank-/Steuerangaben und App-Store-Produktstatus kontrollieren; TestFlight-Kauf, Abbruch, Wiederherstellung und Push auf einem iPhone testen.

Die folgenden Abschnitte sind die vorbereiteten Texte. Eckige Platzhalter müssen vor Verwendung ersetzt werden; Prüfhinweise gehören nicht in die öffentliche Fassung.

## Entwurf: Datenschutzinformationen

### Verantwortlicher und Kontakt

Verantwortlich für Matchday Pro ist **[rechtlicher Betreibername]**, **[vollständige Anschrift]**. Für Datenschutzanfragen: **[öffentliche Kontakt-E-Mail]**. **[Falls einschlägig: Kontakt des Datenschutzbeauftragten.]**

### Lokale App-Daten

Matchday Pro speichert Favoriten, Darstellungs- und Push-Einstellungen lokal auf deinem Gerät. Die App erzeugt außerdem eine zufällige Installationskennung. Deren abgeleitete pseudonyme Kennung wird für die Zuordnung und Prüfung des Abostatus verwendet. Sie ist kein Klarnamenkonto, kann aber mit Kaufdaten verknüpft werden. Favoriten werden derzeit nicht über ein eigenes Benutzerkonto zwischen Geräten synchronisiert.

Diese Daten dienen dem Betrieb der gewählten Funktionen. Als vorgesehene Rechtsgrundlage kommt Art. 6 Abs. 1 Buchst. b DSGVO in Betracht, soweit die Verarbeitung für die Bereitstellung der vereinbarten Leistung erforderlich ist. **[Betreiber: Rechtsgrundlagen und gegebenenfalls einschlägige Anforderungen an Gerätezugriffe abschließend prüfen.]** Lokale Daten verbleiben bis zu ihrer Änderung oder Entfernung im App-Speicher; sie können gegebenenfalls Bestandteil von Geräte-Backups sein.

### Monatsabo und Kaufprüfung

Kauf und Zahlung erfolgen über Apple. Die App erfasst keine Zahlungskartendaten oder Apple-Account-Passwörter. Für die Bereitstellung, Wiederherstellung und Prüfung des Pro-Zugangs nutzen wir RevenueCat. Verarbeitet werden die pseudonyme App-Nutzerkennung, Produkt- und Transaktionsdaten, der Kauf-/Abostatus einschließlich Ablauf oder Erstattung sowie technische App- und Geräteinformationen, die der Dienst für seine Funktion benötigt. Der Matchday-Server fragt den Abostatus bei RevenueCat ab, bevor er den Zugang bestätigt.

Vorgesehene Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. b DSGVO. Apple verarbeitet Daten für seine App-Store-Dienste nach eigenen Datenschutzinformationen. **[Aufbewahrungsdauer bzw. nachvollziehbare Löschkriterien für eigene und bei RevenueCat verarbeitete Daten ergänzen; gesetzliche Pflichten konkret prüfen.]**

### Optionale Push-Mitteilungen

Erst wenn du Push aktivierst und iOS die Berechtigung erteilt, registriert die App dein Gerät. Unser Server speichert das Apple-Gerätetoken, die pseudonyme Installationszuordnung, ausgewählte Spiel-/Spielerfavoriten und Benachrichtigungseinstellungen. Damit werden passende Spielereignisse und bestätigte Aufstellungen über Apple Push Notification service zugestellt. Nachrichtentexte können je nach deinen iPhone-Einstellungen auf dem Sperrbildschirm sichtbar sein.

Vorgesehene Rechtsgrundlage ist deine Einwilligung nach Art. 6 Abs. 1 Buchst. a DSGVO. Du kannst Push in der App deaktivieren; nach erfolgreicher Serverbestätigung wird der dortige Gerätedatensatz entfernt. Du kannst Mitteilungen auch in den iPhone-Einstellungen sperren; dies verhindert die Anzeige, löscht aber nicht sofort den Serverdatensatz. Der native Gerätedatensatz läuft nach 90 Tagen ohne Aktualisierung ab. Die App erneuert ihn bei aktiver Nutzung. Bereits entstandene technische Zustellnachweise können noch bis zu 48 Stunden bestehen bleiben; ereignisbezogene Warteschlangendaten bis zu einer Stunde. Eine Deinstallation beendet kein Abo und sendet keine Löschanforderung an den Server.

### Serverbetrieb und externe Inhalte

Für Backend-Anfragen wird Vercel eingesetzt; Push-Einstellungen und Zustellzustände werden im eingerichteten Redis-Dienst gespeichert. Bei Internetverbindungen fallen insbesondere IP-Adresse, Zeitpunkt, angefragter Pfad und technische Verbindungsinformationen an. Für die Begrenzung nativer Push-Registrierungen verwendet die Anwendung einen aus der IP-Adresse abgeleiteten Hash mit einer Ablaufzeit von 60 Sekunden. Hosting-Protokolle können abweichende Fristen haben: **[tatsächliche Fristen und Redis-Anbieter ergänzen]**.

Technisch notwendige Verbindungen dienen dem App-Betrieb; die Absicherung gegen Missbrauch dient unserem Interesse an einem zuverlässigen Dienst. Dafür ist, soweit einschlägig, Art. 6 Abs. 1 Buchst. f DSGVO vorgesehen. **[Abwägung und konkrete Zuordnung durch Betreiber prüfen.]**

Spielerbilder und Teamlogos können von externen Sportdaten- und Medienanbietern geladen werden, insbesondere NHL und API-Sports. Beim direkten Abruf erhält der jeweilige Anbieter technische Verbindungsdaten wie die IP-Adresse. Das Öffnen externer Links führt zum jeweiligen Anbieter; dort gelten dessen Datenschutzinformationen.

### Empfänger und internationale Verarbeitung

Je nach genutzter Funktion sind insbesondere Apple, RevenueCat, Vercel, **[Redis-Anbieter]** und die Anbieter direkt geladener Medien beteiligt. Es kann zu einer Verarbeitung außerhalb des EWR kommen. **[Konkrete Empfänger, Rollen, Länder und tatsächlich vereinbarte Übermittlungsgrundlagen bzw. Garantien sowie deren Bezugsmöglichkeit ergänzen. Keine Zertifizierung oder EU-only-Speicherung ungeprüft behaupten.]**

### Deine Rechte

Unter den gesetzlichen Voraussetzungen hast du Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit. Du kannst eine Einwilligung mit Wirkung für die Zukunft widerrufen. Gegen Verarbeitungen auf Grundlage berechtigter Interessen kannst du aus Gründen deiner besonderen Situation Widerspruch einlegen. Du kannst dich bei einer Datenschutzaufsichtsbehörde beschweren. Wende dich für Anfragen an den oben genannten Kontakt. Wir klären bei Bedarf mit dir, wie die pseudonyme Installation sicher zugeordnet werden kann; sende niemals dein Installationsgeheimnis oder Apple-Passwort.

Die App benötigt kein eigenes Klarnamenkonto. Ohne die für Kaufprüfung oder Push jeweils erforderlichen Daten kann die betreffende Funktion nicht bereitgestellt werden. Die Sportprognosen bewerten Spieler und Spiele; die App entscheidet damit nicht automatisiert über deine rechtlichen Ansprüche oder vergleichbar erheblichen persönlichen Belange.

## Entwurf: Abo- und Nutzungshinweise

**Anbieter:** [rechtlicher Betreibername, Anschrift und öffentliche Kontaktadresse].

Matchday Pro stellt Fußball- und Eishockeydaten, Spielerprofile, statistische Analysen und Favoritenfunktionen bereit. Verfügbarkeit und Aktualität hängen auch von externen Datenquellen ab. Prognosen sind unkalibrierte statistische Modellwerte, keine Zusage eines Ergebnisses und keine Gewinngarantie. Ein Einsatz gilt nur dann als bestätigt, wenn dies ausdrücklich anhand der verfügbaren Aufstellungsdaten gekennzeichnet ist.

Das Produkt **Matchday Pro Monatsabo** (`matchday_pro_monthly`) hat eine Laufzeit von einem Monat. Für Deutschland ist ein Preis von **9,99 € pro Monat** vorgesehen; maßgeblich ist der lokalisierte Gesamtpreis, den Apple vor der Kaufbestätigung anzeigt. Die Abrechnung erfolgt über deinen Apple Account. Das Abo verlängert sich automatisch, bis du es über die Apple-Abonnementverwaltung kündigst. Zeitpunkt und Wirkung einer Kündigung sowie Abrechnung und Erstattungen richten sich nach den für den Kauf geltenden Apple-Bedingungen und zwingendem Recht. Eine Deinstallation kündigt das Abo nicht.

Bereits erworbene Käufe können über „Käufe wiederherstellen“ mit dem zugehörigen Apple Account wiederhergestellt werden. Eine Wiederherstellung betrifft den Kaufzugang; lokal gespeicherte Favoriten werden dadurch nicht automatisch auf andere Geräte übertragen. Abonnements verwalten: https://apps.apple.com/account/subscriptions

Optionale Push-Mitteilungen müssen gesondert aktiviert werden. Sie werden regelmäßig anhand der verfügbaren Daten geprüft; Zustellung und Aktualität sind nicht in Echtzeit garantiert.

Der Kaufdialog muss die Datenschutzinformationen und die geltenden Nutzungsbedingungen verlinken. **[Festlegen, ob Apples Standard-EULA verwendet wird oder ergänzende eigene Bedingungen erforderlich sind; keinen ungeprüften Haftungsausschluss oder Verzicht auf Verbraucherrechte einsetzen.]** Gesetzliche Verbraucherrechte bleiben unberührt. Support: **[öffentliche Kontaktadresse]**.

## Technische Grundlage und Quellen für die Prüfung

- `mobile/src/identity.js`: zufälliges Installationsgeheimnis in Capacitor Preferences; SHA-256-basierte App-Nutzerkennung.
- `mobile/src/native.js`, `lib/native-subscription.js`: RevenueCat, Apple-Produkt, Angebot und serverseitige Zugangsprüfung.
- `mobile/src/push.js`, `lib/native-push-handler.js`, `lib/favorite-push.js`, `api/push-check.js`: optionale APNs-Registrierung, Favoritenübermittlung und Ablaufzeiten.
- `index.html`: lokale Einstellungen und externe Spielerbilder.
- DSGVO, insbesondere Art. 13: https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=de
- Apple, Abo-Kaufbildschirm und Verlinkungen: https://developer.apple.com/app-store/subscriptions/
- Apple, App-Datenschutzangaben: https://developer.apple.com/app-store/app-privacy-details/
- RevenueCat, Apple App Privacy: https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy
- Vercel, Auftragsverarbeitung: https://vercel.com/legal/dpa

Dieser Entwurf ist aus dem aktuellen Code abgeleitet. Er bestätigt keine abgeschlossenen Anbieter-Verträge, unbekannten Kontoeinstellungen oder vollständige rechtliche Prüfung. Bis zur Fertigstellung bleiben die Kaufvoraussetzungen unverändert gesperrt.
