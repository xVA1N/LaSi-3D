# LaSi 3D

Ladungssicherung am Lkw in 3D: Beispiele durchgehen, Zurrarten vergleichen und die Berechnungen nachvollziehen. Läuft komplett im Browser.

## Stand

- 3D-Ansicht einer Sattelauflieger-Pritsche (13,6 × 2,48 m) mit Stirnwand, drehen und zoomen mit Maus oder zwei Fingern
- Beispiel **Niederzurren**: Ladung, Reibpaarung und Zurrgurt wählen; die Seite berechnet die nötige Anzahl Gurte je Richtung (vorwärts, rückwärts, seitlich), den Zurrwinkel aus der Geometrie, prüft das Kippen und zeigt den Rechenweg
- Die Gurte erscheinen in der berechneten Anzahl auf der Ladung

Gerechnet wird nach dem Verfahren der EN 12195-1:2010 (Beschleunigungsbeiwerte Straße: vorwärts 0,8, rückwärts und seitlich 0,5, Kippen seitlich 0,6; Sicherheitsbeiwert Niederzurren 1,25 vorwärts, sonst 1,1; k = 1,5 oder 2). Die Reibbeiwerte in `src/daten.js` sind Richtwerte. Die Seite ist eine Lernhilfe, keine geprüfte Software für den Einsatz.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `src/berechnung.js` | Formeln (reine Funktionen, ohne Browser testbar) |
| `src/daten.js` | Reibpaarungen, Zurrmittel, Beispielladungen, Maße der Ladefläche |
| `src/main.js` | 3D-Szene (three.js) und Bedienung |
| `test/berechnung.test.js` | Rechentests mit von Hand nachgerechneten Beispielen |
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

- Direktzurren (Diagonal- und Schrägzurren) mit LC und Zurrwinkeln α/β
- Formschluss an der Stirnwand, Kombination mit Niederzurren
- Kippen mit Niederzurren absichern, mehrere Ladungsstücke
- Weitere Ladungsgüter (Coils, Rollen, Fässer, Fahrzeuge) und Fahrzeugarten
