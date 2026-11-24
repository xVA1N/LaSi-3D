# LaSi 3D

Ladungssicherung am Lkw in 3D: Beispiele durchgehen, Zurrarten vergleichen und die Berechnungen nachvollziehen. Läuft komplett im Browser.

## Stand

- **Fahrzeuge:** Sattelzug mit Auflieger (13,6 m), Motorwagen (7,3 m), kleiner Lkw bis 7,5 t (6,2 m), jeweils mit Stirnwand, Außenrahmen mit Zurrpunkten, Längsträgern, Achsen mit Reifen und Felgen (Zwillingsreifen an Antriebs- bzw. Hinterachse), Unterfahrschutz, Leuchten und Fahrerhaus; beim Auflieger Stützwinden und Königszapfen
- **Zwei Ansichten:** Draufsicht zum Platzieren (Stirnwand oben, Meter am Rand, Übersicht der ganzen Fläche, ein Finger verschiebt, zwei zoomen) und 3D zum Anschauen
- **Ladegut aus dem Katalog:** Holzkiste, Gitterbox, IBC, Fass, Papierrolle, Kunststoffkisten, Mauersteine; neues Ladegut kommt an die nächste freie Stelle
- **Leiste am ausgewählten Teil:** Pfeile (5 cm), „An Wand“ (bis Stirnwand oder Ladung davor), Drehen, Gurt +, Bearbeiten, Kopieren, Löschen; Status und Abstand nach vorne direkt sichtbar. Ziehen verschiebt, rastet an Stirnwand, Bordwand und Nachbarn ein
- **Fenster zum Bearbeiten:** Masse und Maße mit Plus/Minus, „Steht auf“ Ladefläche, Palette, RHM oder beides (legt die Unterlage automatisch darunter), unter „Mehr“ Material und Reibbeiwert
- **Kopfschlinge (Direktzurren):** über „Gurt +“ hinten oder vorne um die Ladung; auf Wunsch wird eine Palette hochkant als Lastverteiler dazugestellt. Einstellbar: LC und Abstand der Zurrpunkte. Gerechnet je Schenkel mit LC · (cos α · cos β + 0,75 · μ · sin α); Niederzurren und Kopfschlinge werden nicht addiert, es zählt das günstigere
- **Diagonal- und Schrägzurren (Direktzurren):** über „Gurt +“ je 4 Gurte von den Ecken der Ladung zu Zurrpunkten außen am Rahmen; diagonal schräg nach außen (hält längs und quer), schräg quer zur Seite (hält seitlich). Einstellbar: LC, Abstand des Zurrpunkts in Längsrichtung, Höhe des Zurrpunkts an der Ladung, wahlweise für alle 4 Gurte. Je Gurt LC · (cos α · cos β + 0,75 · μ · sin α), seitlich zählt die schwächere Seite; Kippen über die Momente der Gurte. Kopfschlinge und Diagonal-/Schrägzurren werden addiert
- **Stahlrohr und Buchtlashing:** liegendes Rohr (Länge, Durchmesser einstellbar), rollt ohne Keile quer zu seiner Achse (keine Reibung, Niederzurren hält nicht); wahlweise auf Kanthölzern mit Keilen. Buchtlashing über „Gurt +“: Schlingen paarweise links und rechts (bei langer Ladung zwei Paare), je Schenkel wie Direktzurren gerechnet
- **Einzelgurt frei spannen:** über „Gurt +“ ein Gurt von einer wählbaren Ecke der Ladung zu einem beliebigen Zurrpunkt am linken oder rechten Rahmen (alle 50 cm); Pfeile und Ziehen springen von Zurrpunkt zu Zurrpunkt
- **Paletten hochkant:** im Fenster „Lage“ liegend oder hochkant (1,2 oder 0,8 m breit); hochkant zwischen Ladung und Stirnwand zählt sie als Füllmittel für den Formschluss
- **Zurrgurte (Niederzurren):** frei setzen und verschieben; im Fenster Vorspannkraft S_TF (Plus/Minus oder Schieberegler), Gurttyp, LC, Abstand zur Stirnwand und Ratsche auf einer oder beiden Seiten (k = 1,5 / 2)
- **Ladereihen:** Einheiten, die sich in Längsrichtung überdecken, bilden eine Reihe; nummeriert von der Stirnwand nach hinten, im Wechsel blau/grün auf der Fläche und den Außenrahmen markiert, mit Schild „LR1“, „LR2“ …; die Ladereihe steht auch in der Prüfung und in der Leiste
- **Mangelhafte Zurrmittel:** Gurte, die durch andere Ladung oder Paletten laufen, auf keiner Ladung liegen oder fast senkrecht stehen, zählen nicht; sie blinken rot (auch durch die Ladung sichtbar), oben links steht „Zurrmittel mangelhaft“
- **Lose Teile:** leere liegende Paletten sind Ladung und müssen gesichert werden; hochkant stehende Paletten gelten nur als Füllmittel vor der Stirnwand oder als Lastverteiler einer Kopfschlinge als gehalten
- **Achslasten:** Last je Achse bzw. Achsgruppe über das Hebelgesetz (Sattelzug: Königszapfen und Achsaggregat, Zapfenlast auf Vorder- und Antriebsachse), Anteil der Lenkachse (Richtwert mind. 20 %), Lastverteilungsplan als Diagramm, Schwerpunkt der Ladung auf der Fläche, überladene Achsen rot markiert; Kästchen oben links mit Last je Achse (Zugmaschine VA/HA, Königszapfen ⊙, Aufliegerachsen 1–3), Nummern an den Rädern. Leergewichte und zulässige Achslasten sind Beispielwerte
- **Übermaß:** Gewicht gegen die Nutzlast (im Bedienfeld änderbar), Breite (max. 2,55 m), Höhe (max. 4 m), Länge samt Ladung (max. 20,75 m) und Überstand hinten (ab 1 m Kennzeichnung, max. 1,5 m, bei Fahrten bis 100 km 3 m). Ladung darf hinten bis 4 m und seitlich bis 0,5 m überstehen; Markierungen: rote Fahne und Maß am Überstand, rote Grenzflächen bzw. Grenzlinien bei zu breit oder zu hoch, Warnung wenn der Schwerpunkt neben der Fläche liegt. Grenzwerte nach § 22 StVO und § 32 StVZO, Nutzlasten sind Beispielwerte
- **Prüfung je Ladeeinheit:** vorwärts, rückwärts, seitlich (Auslastung in %), Formschluss an der Stirnwand (auch über davorstehende Ladung) mit Last auf die Stirnwand, Kippen quer und längs; Hinweise bei Überschneidung, Überstand, Gurt ohne Ladung und S_TF über 0,5 · LC. Gesicherte Ladung hat einen grünen, ungesicherte einen roten Umriss
- **Beispiele** je Fahrzeug; die Beladung bleibt im Browser gespeichert

Gerechnet wird nach dem Verfahren der EN 12195-1:2010 (Beschleunigungsbeiwerte Straße: vorwärts 0,8, rückwärts und seitlich 0,5, Kippen seitlich 0,6; Sicherheitsbeiwert Niederzurren 1,25 vorwärts, sonst 1,1). Vereinfachungen: Ein Stapel (z. B. Palette mit Ladung) wird als eine Einheit mit dem kleinsten Reibbeiwert aller Fugen gerechnet; ein Gurt über mehrere Einheiten teilt seine Wirkung gleichmäßig; Rundes wird für Überschneidungen als Quadrat gerechnet; die Stirnwand trägt höchstens 5000 daN. Die Reibbeiwerte in `src/modell.js` sind Richtwerte. Die Seite ist eine Lernhilfe, keine geprüfte Software für den Einsatz.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `src/modell.js` | Stapeln, Ladeeinheiten, Gurte, Prüfung der ganzen Beladung |
| `src/berechnung.js` | Grundformeln und Beiwerte nach EN 12195-1 |
| `src/daten.js` | Fahrzeuge, Ladegut, Hilfsmittel, Gurttypen, Beispiele |
| `src/achslast.js` | Achslasten, Schwerpunkt, Lastverteilungsplan |
| `src/uebermass.js` | Gewicht, Breite, Höhe, Länge und Überstand gegen StVO/StVZO |
| `src/aktionen.js` | Verschieben, „An Wand“, Unterlage wechseln, Abstände, Platz für Gurte |
| `src/main.js` | Ansichten (three.js), Leiste, Fenster, Ziehen und Bedienfeld |
| `test/*.test.js` | Rechentests mit von Hand nachgerechneten Beispielen |
| `test/seite.e2e.js` | Seitentest im Browser (Playwright) |

## Entwickeln

```bash
npm ci            # Abhängigkeiten installieren
npm run dev       # lokaler Server mit automatischem Neuladen
npm test          # Rechentests
npm run build && (npm run preview -- --port 4173 &) && npm run e2e   # Seitentest
```

## Veröffentlichen

`.github/workflows/pages.yml` testet, baut und veröffentlicht bei jeder Änderung auf `main` auf GitHub Pages. Einmalig nötig: im Repo unter *Settings → Pages → Source* „GitHub Actions“ wählen.

## Nächste Schritte

- Zurrpunkte am Fahrzeug mit eigener Belastbarkeit, Zurrpunkte an der Ladung frei wählen
- Formschluss nach hinten und zur Seite (Rungen, Bordwände, Füllmittel wie Luftkissen oder Leerpaletten)
- Liegende Rollen mit Keilen, Coils, Fahrzeuge
- Gurtschoner/Kantenschutz, Zwischenwandverschluss, Sperrbalken
