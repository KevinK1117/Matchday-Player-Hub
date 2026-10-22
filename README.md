# Matchday

Deutschsprachiges Fußball-Matchcenter für GitHub und Vercel. Eigenständige Oberfläche mit Ergebnissen, Ligafiltern, Datumsauswahl, lokalen Favoriten, Tabellen, H2H, letzten Spielen, Ereignissen, Aufstellungen und Spielerprofilen. Der frühere Spieler-Hub bleibt unter `/players.html` verfügbar.

## Torschützen-Kombi

6–10 Spieler im Markt **trifft jederzeit**. Keine 1X2-Auswahlen. Maximal ein Spieler pro Begegnung; alle Quoten stammen vom selben Buchmacher. Nur zukünftige, noch nicht gestartete Spiele; Quoten höchstens sechs Stunden alt und mit eindeutigem Spielerabgleich. Mindestbasis: 270 Saisonminuten, 45 Minuten pro Einsatz, mindestens ein Tor und verfügbare Schüsse aufs Tor. Bekannte Nichtstarter werden ausgeschlossen; optional ausschließlich bestätigte Startelf. Keine Auffüllung bei zu wenigen geeigneten Spielern.

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

Syntaxprüfung für Browsermodul und neue Servermodule bestanden. Automatisierte Tests decken 6–10 Auswahlen, korrekte Quotenprodukte, doppelte Begegnungen, Buchmachertrennung, veraltete Quoten, laufende Spiele, falsche Märkte, Spielerabgleich, Mindestdaten, Startelfoption sowie Eingabevalidierung ab. Browserprüfung in der Erstellungsumgebung war mangels Preview-Supervisor nicht möglich. Echtdatenprüfung setzt einen autorisierten Vercel-Projektzugang und passenden API-Tarif voraus.
