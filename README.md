# LaSi 3D

Ladungssicherung am Lkw in 3D: Beispiele durchgehen, Zurrarten vergleichen und die Berechnungen nachvollziehen. Läuft komplett im Browser.

## Stand

- **Fahrzeuge:** Sattelauflieger (13,6 m), Motorwagen (7,3 m), kleiner Lkw bis 7,5 t (6,2 m), jeweils mit Stirnwand, Außenrahmen mit Zurrpunkten und Rungen
- **Ladegut selbst platzieren:** Holzkiste, Gitterbox, IBC, Fass, Papierrolle, Kunststoffkisten, Mauersteine. Antippen wählt aus, Ziehen verschiebt (rastet an Stirnwand, Bordwand und Nachbarn ein), Drehen 90°, Kopieren, Löschen; Masse, Maße, Material und μ einstellbar
- **Hilfsmittel:** Europalette und Antirutschmatte (RHM) platzieren; Ladung, die auf eine Palette oder Matte gezogen wird, steht darauf und wird mit ihr bewegt
- **Zurrgurte (Niederzurren):** frei setzen und verschieben; Vorspannkraft S_TF und LC je Gurt selbst festlegen, Ratsche auf einer oder beiden Seiten (k = 1,5 / 2)
- **Prüfung je Ladeeinheit:** vorwärts, rückwärts, seitlich (Auslastung in %), Formschluss an der Stirnwand (auch über davorstehende Ladung) mit Last auf die Stirnwand, Kippen quer und längs; Hinweise bei Überschneidung, Überstand, Gurt ohne Ladung und S_TF über 0,5 · LC. Gesicherte Ladung hat einen grünen, ungesicherte einen roten Umriss
- **Beispiele** je Fahrzeug; die Beladung bleibt im Browser gespeichert

Gerechnet wird nach dem Verfahren der EN 12195-1:2010 (Beschleunigungsbeiwerte Straße: vorwärts 0,8, rückwärts und seitlich 0,5, Kippen seitlich 0,6; Sicherheitsbeiwert Niederzurren 1,25 vorwärts, sonst 1,1). Vereinfachungen: Ein Stapel (z. B. Palette mit Ladung) wird als eine Einheit mit dem kleinsten Reibbeiwert aller Fugen gerechnet; ein Gurt über mehrere Einheiten teilt seine Wirkung gleichmäßig; Rundes wird für Überschneidungen als Quadrat gerechnet; die Stirnwand trägt höchstens 5000 daN. Die Reibbeiwerte in `src/modell.js` sind Richtwerte. Die Seite ist eine Lernhilfe, keine geprüfte Software für den Einsatz.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `src/modell.js` | Stapeln, Ladeeinheiten, Gurte, Prüfung der ganzen Beladung |
| `src/berechnung.js` | Grundformeln und Beiwerte nach EN 12195-1 |
| `src/daten.js` | Fahrzeuge, Ladegut, Hilfsmittel, Gurttypen, Beispiele |
| `src/main.js` | 3D-Szene (three.js), Ziehen und Bedienfeld |
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

- Direktzurren (Diagonal-, Schräg- und Kopfschlingen) mit LC und Zurrwinkeln α/β, Gurte frei zwischen Zurrpunkten spannen
- Formschluss nach hinten und zur Seite (Rungen, Bordwände, Füllmittel wie Luftkissen oder Leerpaletten)
- Liegende Rollen mit Keilen, Coils, Fahrzeuge
- Gurtschoner/Kantenschutz, Zwischenwandverschluss, Sperrbalken
