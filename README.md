# Matchday

Deutschsprachiges Fußball- und NHL-Matchcenter für GitHub und Vercel. Eigenständige Oberfläche mit Ergebnissen, Ligafiltern, Datumsauswahl, lokalen Favoriten, Tabellen, H2H, letzten Spielen, Ereignissen, Aufstellungen und Spielerprofilen. Der frühere Spieler-Hub bleibt unter `/players.html` verfügbar.

## Torschützen-Kombi

6–10 Spieler im Markt **trifft jederzeit**. Keine 1X2-Auswahlen. Maximal vier Spieler pro Begegnung; alle Quoten stammen vom selben Buchmacher. Nur zukünftige, noch nicht gestartete Spiele; Quoten höchstens sechs Stunden alt und mit eindeutigem Spielerabgleich. Mindestbasis: 270 Saisonminuten, 45 Minuten pro Einsatz, mindestens ein Tor und verfügbare Schüsse aufs Tor. Bekannte Nichtstarter werden ausgeschlossen; optional ausschließlich bestätigte Startelf. Keine Auffüllung bei zu wenigen geeigneten Spielern.

Das Ranking nutzt Tore/90, Schüsse aufs Tor pro Einsatz und Spielzeit; bei vorhandenem Feed zusätzlich xG/90. Es ist keine kalibrierte Trefferwahrscheinlichkeit. Die Kandidatenquelle ist der bestehende Liga-Topscorer-Endpunkt und daher kein vollständiger Kader. Keine automatische Wettabgabe.

Profile priorisieren Tore, Tore/90, Tore ohne Elfmeter, Elfmeter, Schüsse, Schüsse aufs Tor, Abschlussquote, Einsatzzeit und Startelfstatus. Die letzten fünf abgeschlossenen Teamspiele zeigen individuelle Minuten, Tore und Schüsse, sofern verfügbar. Fehlende Daten bleiben leer; kein Einsatz wird als Null-Tore-Spiel erfunden. Der Basis-Profilfeed liefert kein xG; dieser Wert wird ausdrücklich als nicht verfügbar gezeigt.

## Betrieb

Node.js 20 oder neuer. Keine Paketabhängigkeiten. `npm start` startet lokal auf Port 4173, `npm test` prüft Auswahlregeln und API-Verhalten. Vercel nutzt `vercel.json` und die Serverless-Endpunkte unter `api/`.

In Vercel als geheime Umgebungsvariable setzen:

- `API_SPORTS_KEY`: API-Sports Fußball; Abdeckung von Saison, Statistiken und Torschützenquoten hängt vom Tarif ab.
- Optional `ODDS_FEED_URL` und `ODDS_FEED_TOKEN`: lizenzierter normalisierter Quotenfeed, bestehendes Format siehe `api/odds.js` (Markt `anytime_goalscorer`, Spieler-ID oder eindeutiger Name, Fixture-ID, Buchmacher, Dezimalquote und `updatedAt`; bei Ja/Nein-Märkten `outcome: "yes"`).
- Optional `XG_FEED_URL` und `XG_FEED_TOKEN`: bestehende fixturebezogene xG-Ergänzung im Spieler-Hub, siehe `XG_FEED_FORMAT.md`.

Schlüssel gehören ausschließlich in serverseitige Umgebungsvariablen. Keine Zugangsdaten im Browser oder Repository. API-Fehler und fehlende Konfiguration werden sichtbar gemeldet. Demo muss ausdrücklich aktiviert werden und enthält ausschließlich gekennzeichnete Beispieldaten. Live-Scores werden bei sichtbarer Ergebnisseite alle 60 Sekunden abgerufen; der API-Cache beträgt 30 Sekunden. Ein Provider-Limit kann die Aktualisierung einschränken.

## Prüfstand

Syntaxprüfung für Browsermodul und neue Servermodule bestanden. Automatisierte Tests decken 6–10 Auswahlen, korrekte Quotenprodukte, höchstens vier Spieler je Begegnung und doppelte Spieler, Buchmachertrennung, veraltete Quoten, laufende Spiele, falsche Märkte, Spielerabgleich, Mindestdaten, Startelfoption sowie Eingabevalidierung ab. Browserprüfung in der Erstellungsumgebung war mangels Preview-Supervisor nicht möglich. Echtdatenprüfung setzt einen autorisierten Vercel-Projektzugang und passenden API-Tarif voraus.

## NHL-Erweiterung

Sportwechsel zwischen Fußball und Eishockey (NHL), mit eigener Spieltagsliste, aktueller NHL-Gesamttabelle, Skaterauswahl, Spielbericht, Saison-H2H, letzten Spielen und Torschützenprofilen. Profile priorisieren Tore/Spiel, Schüsse/Spiel, Schussquote, Powerplay-Tore und Eiszeit. Keine unbelegten xG- oder Reihenangaben. NHL-Tabellen, Kaderstatistiken und Profile zeigen den aktuellen Anbieterstand; H2H umfasst die jeweilige Saison.

NHL-Tage werden anhand der Anstoßzeit in Europe/Berlin bestimmt, inklusive Spielen des nordamerikanischen Vortags. Für echte NHL-Torschützenquoten wird `THE_ODDS_API_KEY` oder der konfigurierte lizenzierte Quotenfeed benötigt. Mindestens fünf Spiele, ein Saisontor und verfügbare Schüsse sind Voraussetzung für das NHL-Ranking. Die Auswahl hält Fußball- und NHL-Statistikmaßstäbe getrennt.

Bei mehreren Spielern aus derselben Begegnung wird keine tatsächliche Gesamtquote behauptet. Die Märkte sind abhängig; der Buchmacher muss die Kombinierbarkeit und seine Kombiquote bestätigen. Einzelquoten werden weiter angezeigt. Maximal vier verschiedene Spieler pro Spiel, 6–10 insgesamt, alle Quoten desselben Buchmachers.

## Blau-Weiß und Wettbewerbsauswahl

Die Hauptoberfläche nutzt wieder einen hellen blau-weißen Stil. Fußball-Spieltag und Torschützenkandidaten sind auf nationale Männer-Erstligen weltweit begrenzt; Zweitligen, Pokale, internationale Klubwettbewerbe sowie Jugend- und Frauenligen werden ausgeschlossen. NHL bleibt separat verfügbar. Die Klassifikation in `public/competitions.js` gleicht Land und exakte Wettbewerbsnamen beziehungsweise bekannte Anbieter-Aliasse ab. Unbekannte Wettbewerbe werden nicht automatisch als Erstliga eingestuft. Die tatsächliche Länder-, Saison- und Statistikabdeckung hängt vom Sportdatenanbieter ab. Weitere freigegebene Erstligen des geladenen Spieltags erscheinen automatisch in der Seitenleiste.

## Mobile Matchcenter (Oktober 2026)

Die Startseite öffnet das Matchcenter mit dunkelblauem Kopf, pinken Akzenten und iPhone-Navigation. Matchdetails enthalten Statistiken, Liveticker (NHL: Torereignisse), Liga-Topscorer, Spielerbilder, Aufstellungen/Spielbericht und Tabellen. NHL nutzt ergänzend die NHL-Datenquelle. Spieler-xG und Powerplay-Eiszeit sind ohne passenden Zusatzfeed weiterhin nicht verfügbar; es werden keine Werte erfunden.

Remis-/Außenseiteranalyse: 6–10 verschiedene Begegnungen, Tabellenstand, Formpunkte der letzten fünf abgeschlossenen Spiele, Heim-/Auswärtsform und H2H. Maximal 30 Spiele je Anfrage werden geprüft; fehlende Auswahlplätze werden nicht aufgefüllt. Außenseiterdefinition anhand der Tabelle, nicht anhand einer verifizierten Marktquote. Kein kalibriertes Wahrscheinlichkeitsmodell. API-Sports-Key in Vercel serverseitig setzen. Der vorherige Konfigurator bleibt unter `/public/goal-combo.html` erreichbar.

Deployment: Repository in Vercel importieren, `vercel.json` beibehalten, `API_SPORTS_KEY` als geheime Umgebungsvariable konfigurieren. Reale Daten und Bilder hängen von Anbietererreichbarkeit, Lizenz und Tarif ab.

## Abschlussprüfung

15 automatisierte Tests bestanden, einschließlich Topscorer-Abfragen ohne Spieler-ID und Erstliga-Katalog. Liga-Auswahl wird zusätzlich über `/api/matchcenter?action=leagues` geladen; die aktuelle Saison kommt aus dem Anbieter-Katalog. Die neue Topscorer-Hauptansicht funktioniert unabhängig von Begegnungen am Spieltag. Die lokale Route `/matchcenter` entspricht der Vercel-Route.
