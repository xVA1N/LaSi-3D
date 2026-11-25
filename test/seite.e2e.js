// Prüft die gebaute Seite im Browser: Draufsicht und 3D, Leiste am Ladegut, Fenster zum Bearbeiten,
// Katalog, Ziehen, Pfeile, „An Wand“, Unterlage, Vorspannkraft, Fahrzeugwechsel, Speichern.
// Aufruf: npm run build && (npm run preview -- --port 4173 &) && npm run e2e [-- bildordner]
// Playwright ist in der Cloud-Umgebung global installiert, daher über require geladen.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.env.LASI_URL ?? 'http://localhost:4173/';
const bilder = process.argv[2];
const browser = await chromium.launch();
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); console.log(bedingung ? '✓' : '✗', text); };

async function neueSeite(optionen) {
  const seite = await (await browser.newContext(optionen)).newPage();
  seite.on('pageerror', (e) => fehler.push(e.message));
  seite.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
  await seite.goto(url);
  await seite.waitForSelector('#status');
  await seite.waitForTimeout(200);
  return seite;
}

const seite = await neueSeite({ viewport: { width: 1280, height: 800 } });
const status = () => seite.textContent('#status');
const kurz = () => seite.waitForTimeout(150);
const lage = () => seite.evaluate(() => window.lasi.zustand());
const objektById = async (id) => (await lage()).objekte.find((o) => o.id === id);

pruefe(await seite.evaluate(() => window.lasi.ansicht()) === 'oben', 'Startet in der Draufsicht');
// Draufsicht: nur vor/zurück und zoomen; quer bleibt fest
await seite.click('#leeren').catch(() => {});
const sicht0 = await seite.evaluate(() => window.lasi.obenSicht());
await seite.mouse.move(150, 400); await seite.mouse.down();
for (let i = 1; i <= 10; i++) await seite.mouse.move(150 + i * 25, 400 + i * 20);
await seite.mouse.up(); await seite.waitForTimeout(400);
const sicht1 = await seite.evaluate(() => window.lasi.obenSicht());
pruefe(Math.abs(sicht1.z - sicht0.z) < 1e-6, 'Draufsicht lässt sich nicht zur Seite schieben');
pruefe(Math.abs(sicht1.x - sicht0.x) > 0.3, 'Draufsicht lässt sich vor und zurück schieben');
await seite.mouse.move(400, 400);
for (let i = 0; i < 30; i++) await seite.mouse.wheel(0, 400);
await seite.waitForTimeout(400);
const sicht2 = await seite.evaluate(() => window.lasi.obenSicht());
pruefe(sicht2.zoom >= sicht2.minZoom - 1e-9 && Math.abs(sicht2.z - sicht0.z) < 1e-6, 'Herauszoomen höchstens bis zur ganzen Fläche, quer weiter fest');
await seite.click('#beispiel'); await kurz();
pruefe((await status()).includes('✓'), 'Beispiel Sattelauflieger ist gesichert');
const reihenText = await seite.textContent('#marken');
pruefe(['LR1', 'LR2', 'LR5'].every((r) => reihenText.includes(r)) && !reihenText.includes('LR6'), 'Ladereihen 1 bis 5 werden markiert');
pruefe((await seite.textContent('#ergebnis')).includes('LR1'), 'Prüfung nennt die Reihe');
await seite.click('[data-anzeige="reihen"]'); await kurz();
pruefe(!(await seite.textContent('#marken')).includes('LR1'), 'Ladereihen lassen sich ausblenden');
await seite.click('[data-anzeige="reihen"]'); await kurz();
await seite.click('[data-anzeige="achsen"]'); await kurz();
pruefe((await seite.textContent('#achsbox')) === '' && !(await seite.textContent('#marken')).includes('⊙'), 'Achslasten lassen sich ausblenden');
await seite.click('[data-anzeige="achsen"]'); await kurz();
pruefe((await seite.textContent('#achsbox')).includes('Achslasten') && (await seite.textContent('#marken')).includes('LR1'), 'und beides wieder einblenden');

// Ladegut über den Katalog
await seite.click('#ladegut-neu');
pruefe(await seite.isVisible('.katalog'), 'Katalog öffnet sich als Fenster');
await seite.click('[data-ladegut="holzkiste"]'); await kurz();
const kiste = await seite.evaluate(() => window.lasi.auswahl().id);
pruefe(await seite.isHidden('#blatt'), 'Katalog schließt nach der Wahl');
pruefe(await seite.isVisible('#leiste'), 'Leiste erscheint für das neue Ladegut');
pruefe((await seite.textContent('#leiste-status')).includes('ungesichert'), 'Leiste zeigt: ungesichert');
pruefe((await seite.textContent('#marken')).includes('bis'), 'Abstand nach vorne wird angezeigt');

// Pfeile und An Wand
const vorher = await objektById(kiste);
await seite.click('[data-schub="1,0"]'); await kurz();
pruefe(Math.abs((await objektById(kiste)).z - vorher.z) > 0.04, 'Pfeil verschiebt um 5 cm');
await seite.click('[data-schub="0,-1"]'); await seite.click('[data-schub="0,-1"]'); await kurz();
await seite.click('[data-aktion="anwand"]'); await kurz();
pruefe(Math.abs((await objektById(kiste)).x - vorher.x) < 1e-6, '„An Wand“ schiebt bis an die Ladung davor');

// Gurt + und Vorspannkraft im Fenster
await seite.click('[data-aktion="gurt"]'); await seite.click('[data-neu="nieder"]'); await kurz();
pruefe((await status()).includes('✓'), 'Mit „Gurt +“ → Niederzurren (S_TF 500 daN) gesichert');
await seite.click('[data-aktion="bearbeiten"]'); await kurz();
pruefe(await seite.isVisible('[data-feld="stf"]'), 'Fenster für den Gurt offen');
await seite.fill('[data-feld="stf"] input', '50'); await seite.waitForTimeout(250);
pruefe((await status()).includes('✗'), 'Mit S_TF 50 daN nicht mehr gesichert');
pruefe(await seite.inputValue('[data-range="stf"]') === '50', 'Schieberegler folgt dem Zahlenfeld');
await seite.click('[data-gurttyp="langhebel"]'); await kurz();
pruefe((await status()).includes('✓'), 'Gurttyp-Knopf setzt 500 daN zurück');
await seite.click('[data-blatt="fertig"]'); await kurz();
pruefe(await seite.isHidden('#blatt'), 'Fertig schließt das Fenster');

// Ziehen in der Draufsicht
const z0 = (await objektById(kiste)).x;
const p = await seite.evaluate((id) => window.lasi.bildschirm(id, -0.4, 1, 0.3), kiste);
// erst nicht ausgewählt: Ziehen bewegt nur die Ansicht
await seite.evaluate(() => document.querySelector('[data-blatt="fertig"]')?.click());
const unberuehrt = (await objektById(kiste)).x;
await seite.mouse.move(p.x, p.y); await seite.mouse.down();
for (let i = 1; i <= 8; i++) await seite.mouse.move(p.x, p.y + i * 15);
await seite.mouse.up(); await kurz();
pruefe((await objektById(kiste)).x === unberuehrt, 'Nicht ausgewähltes Teil bleibt beim Wischen liegen');
const p2 = await seite.evaluate((id) => window.lasi.bildschirm(id, -0.4, 1, 0.3), kiste);
await seite.mouse.click(p2.x, p2.y); await kurz();
pruefe(await seite.evaluate(() => window.lasi.auswahl()?.id) === kiste, 'Antippen wählt die Kiste aus');
await seite.mouse.move(p2.x, p2.y);
await seite.mouse.down();
for (let i = 1; i <= 8; i++) await seite.mouse.move(p2.x, p2.y + i * 15);
await seite.mouse.up(); await kurz();
pruefe((await objektById(kiste)).x < z0 - 0.5, 'Ziehen in der Draufsicht verschiebt nach hinten');
if (bilder) await seite.screenshot({ path: `${bilder}/oben-desktop.png` });

// Unterlage im Fenster
await seite.evaluate((id) => window.lasi.auswahl().id === id, kiste);
await seite.click('[data-aktion="bearbeiten"]'); await kurz();
await seite.click('[data-unterlage="palette-matte"]'); await kurz();
const z = await lage();
const unter = z.objekte.filter((o) => o.typ !== 'ladung' && Math.abs(o.x - (z.objekte.find((k) => k.id === kiste)).x) < 1e-6);
pruefe(unter.length === 2, 'Palette + RHM werden unter die Kiste gelegt');
pruefe(await seite.isVisible('[data-unterlage="palette-matte"].an'), 'Auswahl „Palette + RHM“ ist markiert');
await seite.click('[data-feld="masse"] [data-d="1"]'); await kurz();
pruefe((await objektById(kiste)).masse === 850, 'Plus-Knopf erhöht die Masse');
await seite.click('[data-blatt="fertig"]');
await seite.click('[data-aktion="gurt"]'); await seite.click('[data-neu="nieder"]'); await kurz(); // frischer Gurt über der Kiste
const gurteVorher = (await lage()).gurte.length;
await seite.evaluate((id) => document.querySelector('[data-waehle="' + id + '"]')?.click(), kiste); await kurz();
await seite.click('[data-aktion="loeschen"]'); await kurz();
pruefe((await lage()).objekte.length === z.objekte.length - 3, 'Löschen entfernt die Kiste mit ihrer Palette und Matte');
pruefe((await lage()).gurte.length === gurteVorher - 1, 'Löschen entfernt auch den Gurt, der nur über der Kiste lag');

// Kopfschlinge mit hochkant gestellter Palette
await seite.click('#ladegut-neu'); await seite.click('[data-ladegut="ibc"]'); await kurz();
const ibc = await seite.evaluate(() => window.lasi.auswahl().id);
pruefe((await seite.textContent('#leiste-status')).includes('rückwärts'), 'IBC allein ist nach hinten ungesichert');
const anzahl = (await lage()).objekte.length;
await seite.click('[data-aktion="gurt"]'); await seite.click('[data-neu="kopf-hinten"]'); await kurz();
const nachKopf = await lage();
const stehend = nachKopf.objekte.filter((o) => o.hochkant);
pruefe(nachKopf.objekte.length === anzahl + 1 && stehend.length === 1, 'Kopfschlinge stellt eine Palette hochkant hinter die Ladung');
pruefe(nachKopf.gurte.some((g) => g.art === 'kopf' && g.ziel === ibc), 'Kopfschlinge hängt an der Ladung');
pruefe((await seite.textContent('#leiste-status')).includes('Lastverteiler'), 'Schlinge liegt um die Palette');
const kopfVorher = nachKopf.gurte.filter((g) => g.art === 'kopf').length;
await seite.click('[data-aktion="loeschen"]'); await kurz(); // Schlinge löschen
const palId = (await lage()).objekte.find((o) => o.hochkant).id;
const pp = await seite.evaluate((id) => window.lasi.bildschirm(id, 0, 0.5), palId);
await seite.mouse.click(pp.x, pp.y); await kurz();
pruefe(await seite.evaluate(() => window.lasi.auswahl()?.id) === palId, 'Hochkant-Palette lässt sich antippen');
await seite.click('[data-aktion="gurt"]');
pruefe(await seite.isEnabled('[data-neu="kopf-hinten"]') && await seite.isDisabled('[data-neu="kopf-vorne"]'), 'An der Palette wird die passende Kopfschlinge angeboten');
await seite.click('[data-neu="kopf-hinten"]'); await kurz();
pruefe((await lage()).gurte.filter((g) => g.art === 'kopf').length === kopfVorher, 'Kopfschlinge von der Palette aus angelegt');
pruefe((await lage()).objekte.filter((o) => o.hochkant).length === 1, 'dabei keine zweite Palette dazugestellt');
const karte = await seite.textContent(`[data-waehle="${ibc}"]`);
pruefe(karte.includes('Kopfschlinge'), 'Prüfung nennt die Kopfschlinge für rückwärts');
await seite.click('[data-aktion="bearbeiten"]');
await seite.click('[data-feld="zurrabstand"] [data-d="1"]'); await kurz();
pruefe((await lage()).gurte.find((g) => g.art === 'kopf').abstand === 1.05, 'Abstand der Zurrpunkte einstellbar');
await seite.click('[data-blatt="fertig"]');
// Palette im Fenster zwischen liegend und hochkant umschalten
await seite.click('#palette-neu'); await kurz();
await seite.click('[data-aktion="bearbeiten"]'); await seite.click('[data-lage="hochkant08"]'); await kurz();
const pal = (await lage()).objekte.at(-1); // die eben hinzugefügte Palette
pruefe(pal.hochkant && pal.b === 0.8 && pal.h === 1.2, 'Palette lässt sich hochkant stellen');
await seite.click('[data-lage="liegend"]'); await kurz();
pruefe(!(await lage()).objekte.at(-1).hochkant, 'und wieder hinlegen');
await seite.click('[data-blatt="fertig"]');
await seite.click('[data-aktion="hochkant"]'); await kurz();
pruefe((await lage()).objekte.at(-1).hochkant, 'Knopf „Hochkant“ in der Leiste stellt die Palette auf');
await seite.click('[data-aktion="hochkant"]'); await kurz();
pruefe(!(await lage()).objekte.at(-1).hochkant, 'Knopf „Hinlegen“ legt sie wieder hin');
pruefe(await seite.isEnabled('[data-aktion="gurt"]'), 'Auch an einer Palette gibt es „Gurt +“');
await seite.click('[data-aktion="loeschen"]'); await kurz();
if (bilder) {
  await seite.evaluate((id) => document.querySelector('[data-waehle="' + id + '"]')?.click(), ibc); await kurz();
  await seite.screenshot({ path: `${bilder}/kopf-oben.png` });
}

// 3D-Ansicht: Ziehen
await seite.click('[data-ansicht="3d"]'); await seite.waitForTimeout(300);
await seite.click('#ladegut-neu'); await seite.click('[data-ladegut="gitterbox"]'); await kurz();
const box = await seite.evaluate(() => window.lasi.auswahl().id);
const x3 = (await objektById(box)).x;
const q = await seite.evaluate((id) => window.lasi.bildschirm(id, -0.45, 0.98, 0.2), box); // neben einem möglichen Gurt anfassen
await seite.mouse.move(q.x, q.y); await seite.mouse.down();
for (let i = 1; i <= 10; i++) await seite.mouse.move(q.x - i * 12, q.y + i * 4);
await seite.mouse.up(); await kurz();
pruefe(Math.abs((await objektById(box)).x - x3) > 0.2, 'Ziehen in 3D verschiebt');
// zweiter Finger während des Ziehens: Verschieben wird abgebrochen, Teil springt zurück
const x4 = (await objektById(box)).x;
const q2 = await seite.evaluate((id) => window.lasi.bildschirm(id, -0.45, 0.98, 0.2), box);
await seite.mouse.move(q2.x, q2.y); await seite.mouse.down();
for (let i = 1; i <= 6; i++) await seite.mouse.move(q2.x - i * 12, q2.y + i * 4);
await seite.waitForTimeout(100);
const zwischendurch = (await objektById(box)).x;
await seite.evaluate(({ x, y }) => {
  const c = document.querySelector('#szene canvas');
  c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, isPrimary: false, pointerType: 'touch', clientX: x + 80, clientY: y, bubbles: true }));
  c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, isPrimary: false, pointerType: 'touch', clientX: x + 80, clientY: y, bubbles: true }));
}, q2);
await seite.mouse.up(); await kurz();
// der künstliche Finger hat keine echte Zeiger-ID; die Kamerasteuerung meldet das, auf echten Geräten nicht
for (let i = fehler.length - 1; i >= 0; i--) if (fehler[i].includes('setPointerCapture')) fehler.splice(i, 1);
pruefe(Math.abs(zwischendurch - x4) > 0.1 && Math.abs((await objektById(box)).x - x4) < 1e-9, 'Zweiter Finger bricht das Verschieben ab');

// lose Palette auf der Fläche
await seite.selectOption('#fahrzeug', 'sattel'); await seite.click('#beispiel'); await kurz();
await seite.mouse.click(5, 300); await kurz();
await seite.click('#palette-neu'); await kurz();
pruefe((await status()).includes('nicht gesichert') && (await seite.textContent('#ergebnis')).includes('EPAL, leer'), 'Leere Palette gilt als ungesicherte Ladung');
await seite.click('[data-aktion="hochkant"]'); await kurz();
pruefe((await status()).includes('lose Teile') && (await seite.textContent('#leiste-status')).includes('ungesichert'), 'Lose Hochkant-Palette wird gemeldet');
await seite.click('[data-aktion="loeschen"]'); await kurz();

// RHM: mit ausgewähltem Ladegut kommt es darunter, sonst an die nächste freie Stelle
await seite.selectOption('#fahrzeug', 'sattel'); await seite.click('#beispiel'); await kurz();
await seite.click('#ladegut-neu'); await seite.click('[data-ladegut="holzkiste"]'); await kurz();
const rk = await seite.evaluate(() => window.lasi.auswahl().id);
const vorRhm = (await lage()).objekte.length;
await seite.click('#rhm-neu'); await kurz();
let lz = await lage();
const kisteR = lz.objekte.find((o) => o.id === rk), rhmNeu = lz.objekte.at(-1);
pruefe(lz.objekte.length === vorRhm + 1 && rhmNeu.typ === 'rhm' && rhmNeu.x === kisteR.x && rhmNeu.z === kisteR.z, '+ RHM legt das RHM unter das ausgewählte Ladegut');
pruefe((await seite.textContent(`[data-waehle="${rk}"]`)).includes('RHM darunter'), 'Prüfung zeigt „RHM darunter“');
await seite.click('#rhm-neu'); await kurz();
pruefe((await lage()).objekte.length === vorRhm + 1, 'Zweites + RHM legt kein doppeltes RHM darunter');
await seite.click('[data-aktion="loeschen"]'); await kurz();
await seite.mouse.click(5, 300); await kurz(); // Auswahl aufheben
await seite.click('#rhm-neu'); await kurz();
lz = await lage();
const frei = lz.objekte.at(-1);
pruefe(frei.typ === 'rhm' && frei.name === 'RHM' && !lz.objekte.some((o) => o !== frei && o.typ === 'rhm' && o.x === frei.x && o.z === frei.z), 'Ohne Auswahl kommt das RHM an eine freie Stelle');
pruefe((await seite.textContent('#rhm-neu')).includes('+ RHM'), 'Knopf heißt „+ RHM“');

// Diagonal- und Schrägzurren
await seite.selectOption('#fahrzeug', 'sattel'); await seite.click('#beispiel'); await kurz();
await seite.click('#ladegut-neu'); await seite.click('[data-ladegut="gitterbox"]'); await kurz();
const box2 = await seite.evaluate(() => window.lasi.auswahl().id);
await seite.evaluate((id) => window.lasi.setze(id, { z: 0, x: 1.0 }), box2); await kurz(); // mittig und frei, damit die Gurte nirgends durchlaufen
await seite.click('[data-aktion="gurt"]'); await seite.click('[data-neu="diagonal"]'); await kurz();
let dg = (await lage()).gurte.filter((g) => g.art === 'direkt');
pruefe(dg.length === 4 && dg.every((g) => g.ziel === box2), 'Diagonalzurren legt 4 Gurte an die Ladung');
pruefe((await status()).includes('✓'), 'Mit Diagonalzurren gesichert');
// direkt hinter die Mauersteine: die vorderen Gurte laufen durch die Paletten davor
await seite.evaluate((id) => window.lasi.setze(id, { x: 2.98 }), box2); await kurz();
pruefe((await status()).includes('Zurrmittel mangelhaft') && (await seite.textContent('#ergebnis')).includes('läuft durch'), 'Gurt durch andere Ladung: „Zurrmittel mangelhaft“');
await seite.evaluate((id) => window.lasi.setze(id, { x: 1.0 }), box2); await kurz();
pruefe((await status()).includes('✓'), 'Freier Platz: wieder gesichert');
pruefe((await seite.textContent(`[data-waehle="${box2}"]`)).includes('Direktzurren'), 'Prüfung nennt Direktzurren');
await seite.click('[data-aktion="bearbeiten"]');
await seite.click('[data-feld="dabstand"] [data-d="1"]'); await kurz();
dg = (await lage()).gurte.filter((g) => g.art === 'direkt');
pruefe(dg.every((g) => g.abstand === 1.05), 'Abstand gilt für alle 4 Gurte');
await seite.click('[data-blatt="alle-loeschen"]'); await kurz();
pruefe(!(await lage()).gurte.some((g) => g.art === 'direkt'), '„Alle löschen“ entfernt die ganze Zurrung');
await seite.evaluate((id) => document.querySelector('[data-waehle="' + id + '"]')?.click(), box2); await kurz();
await seite.click('[data-aktion="gurt"]'); await seite.click('[data-neu="schraeg"]'); await kurz();
dg = (await lage()).gurte.filter((g) => g.art === 'direkt');
pruefe(dg.length === 4 && dg.every((g) => g.abstand === 0 && g.variante === 'schraeg'), 'Schrägzurren: 4 Gurte quer zur Seite');
const kartenText = await seite.textContent(`[data-waehle="${box2}"]`);
pruefe(/seitlich.*Direktzurren/.test(kartenText) && /vorwärts\s*Formschluss|vorwärts\s*ungesichert|vorwärts\s*\d/.test(kartenText), 'Schrägzurren hält seitlich');
await seite.evaluate((id) => document.querySelector('[data-waehle="' + id + '"]')?.click(), box2); await kurz();
await seite.click('[data-aktion="loeschen"]'); await kurz();
pruefe(!(await lage()).gurte.some((g) => g.art === 'direkt'), 'Mit der Ladung gehen auch ihre Direktzurrungen');

// Rohr: rollt ohne Keile, Buchtlashing paarweise
await seite.selectOption('#fahrzeug', 'sattel'); await seite.click('#beispiel'); await kurz();
await seite.mouse.click(5, 300); await kurz();
await seite.click('#ladegut-neu'); await seite.click('[data-ladegut="rohr"]'); await kurz();
const rohrId = await seite.evaluate(() => window.lasi.auswahl().id);
await seite.evaluate((id) => window.lasi.setze(id, { x: -1.5, z: 0 }), rohrId); await kurz();
await seite.evaluate(() => { const z = window.lasi.zustand(); const rolle = z.objekte.find((o) => o.art === 'papierrolle'); window.lasi.setze(rolle.id, { x: 6.5, z: 0 }); }); await kurz();
await seite.evaluate((id) => document.querySelector('[data-waehle="' + id + '"]')?.click(), rohrId); await kurz();
pruefe((await seite.textContent(`[data-waehle="${rohrId}"]`)).includes('rollt'), 'Rohr ohne Keile rollt seitlich');
await seite.click('[data-aktion="gurt"]'); await seite.click('[data-neu="bucht"]'); await kurz();
const schlingen = (await lage()).gurte.filter((g) => g.art === 'bucht' && g.ziel === rohrId);
pruefe(schlingen.length === 4 && schlingen.filter((g) => g.seite === 'l').length === 2, 'Buchtlashing: zwei Paare (links/rechts) für ein 6-m-Rohr');
pruefe(/seitlich\s*Buchtlashing/.test(await seite.textContent(`[data-waehle="${rohrId}"]`)), 'Buchtlashing hält das Rohr seitlich');
await seite.evaluate((id) => document.querySelector('[data-waehle="' + id + '"]')?.click(), rohrId); await kurz();
await seite.click('[data-aktion="bearbeiten"]'); await seite.click('[data-keile]'); await kurz();
const rohrNeu = (await lage()).objekte.find((o) => o.id === rohrId);
pruefe(rohrNeu.keile && Math.abs(rohrNeu.h - 0.6) < 1e-9, 'Kanthölzer mit Keilen lassen sich einschalten');
await seite.click('[data-blatt="fertig"]');
if (bilder) {
  await seite.click('[data-ansicht="3d"]'); await seite.waitForTimeout(300);
  await seite.evaluate(() => window.lasi.nah(-1.5, 0, 3.2)); await seite.mouse.click(5, 300); await seite.waitForTimeout(300);
  await seite.screenshot({ path: `${bilder}/rohr.png` });
}

// Einzelgurt frei spannen
await seite.selectOption('#fahrzeug', 'sattel'); await seite.click('#beispiel'); await kurz();
await seite.click('#ladegut-neu'); await seite.click('[data-ladegut="gitterbox"]'); await kurz();
const box3 = await seite.evaluate(() => window.lasi.auswahl().id);
await seite.evaluate((id) => window.lasi.setze(id, { z: 0, x: 1.0 }), box3); await kurz();
await seite.click('[data-aktion="gurt"]'); await seite.click('[data-neu="frei"]'); await kurz();
let eg = (await lage()).gurte.find((g) => g.variante === 'frei');
pruefe(eg && eg.ziel === box3 && await seite.isVisible('[data-ecke="hl"].an'), 'Einzelgurt angelegt, Fenster zum Einstellen offen');
const anker0 = eg.ankerX;
await seite.click('[data-ecke="vr"]'); await kurz();
await seite.click('[data-ankerseite="r"]'); await kurz();
await seite.click('[data-feld="ankerab"] [data-d="-1"]'); await kurz(); // einen Zurrpunkt näher zur Stirnwand
eg = (await lage()).gurte.find((g) => g.variante === 'frei');
pruefe(eg.ecke === 'vr' && eg.ankerSeite === 'r' && Math.abs(eg.ankerX - (anker0 + 0.5)) < 1e-9, 'Ecke, Rahmenseite und Zurrpunkt lassen sich wählen');
await seite.click('[data-blatt="fertig"]');
await seite.click('[data-schub="0,1"]'); await kurz();
pruefe(Math.abs((await lage()).gurte.find((g) => g.variante === 'frei').ankerX - (anker0 + 1.0)) < 1e-9, 'Pfeil springt zum nächsten Zurrpunkt');
pruefe((await seite.textContent('#leiste-titel')).includes('Einzelgurt') && (await seite.textContent('#leiste-status')).includes('ab Stirnwand'), 'Leiste zeigt Einzelgurt und Zurrpunkt');
await seite.click('[data-aktion="loeschen"]'); await kurz();

// Übermaß: Nutzlast, Überstand hinten mit Fahne, zu breit
await seite.selectOption('#fahrzeug', 'sattel'); await seite.click('#beispiel'); await kurz();
await seite.fill('#nutzlast', '5000'); await seite.waitForTimeout(250);
pruefe((await status()).includes('Übermaß') && (await seite.textContent('#ergebnis')).includes('Zu schwer'), 'Zu schwer wird gemeldet');
await seite.fill('#nutzlast', '24000'); await seite.waitForTimeout(250);
pruefe((await status()).includes('✓'), 'Mit passender Nutzlast wieder in Ordnung');
await seite.click('#ladegut-neu'); await seite.click('[data-ladegut="holzkiste"]'); await kurz();
const lang = await seite.evaluate(() => window.lasi.auswahl().id);
await seite.evaluate((id) => window.lasi.setze(id, { l: 3.0, x: -6.8 + 1.5 - 1.2, z: 0 }), lang); await kurz();
const um = await seite.evaluate(() => window.lasi.uebermass());
pruefe(Math.abs(um.ueberHinten - 1.2) < 1e-6 && um.fahne, 'Überstand 1,2 m: Fahne wird gesetzt');
pruefe((await seite.textContent('#marken')).includes('Überstand 1,2 m'), 'Überstand wird in der Ansicht beschriftet');
pruefe((await seite.textContent('#ergebnis')).includes('Fahne oder Schild'), 'Kennzeichnungspflicht wird genannt');
await seite.evaluate((id) => window.lasi.setze(id, { x: -6.8 + 1.5 - 2.0 }), lang); await kurz();
pruefe((await seite.textContent('#ergebnis')).includes('100 km'), 'Über 1,5 m: Hinweis auf 100-km-Regel');
await seite.evaluate((id) => window.lasi.setze(id, { x: 2, b: 2.8, l: 1.2 }), lang); await kurz();
pruefe((await seite.textContent('#ergebnis')).includes('Zu breit') && (await seite.textContent('#marken')).includes('Breite 2,8'), 'Zu breit wird gemeldet und markiert');
await seite.evaluate((id) => window.lasi.setze(id, { x: -6.8 + 1.5 - 1.2, b: 1.0, l: 3.0 }), lang); await kurz();
await seite.click('[data-schub="0,-1"]'); await kurz();
pruefe((await seite.evaluate(() => window.lasi.uebermass())).ueberHinten > 1.2, 'Pfeil schiebt weiter über die Hinterkante');

// Achslasten: schwere Ladung ganz vorne auf dem kleinen Lkw überlädt die Vorderachse
await seite.selectOption('#fahrzeug', 'klein'); await seite.click('#beispiel'); await kurz();
pruefe((await seite.textContent('#ergebnis')).includes('Achslasten') && await seite.isVisible('svg.plan'), 'Achslasten und Lastverteilungsplan werden angezeigt');
pruefe((await seite.textContent('#marken')).includes('Schwerpunkt'), 'Schwerpunkt der Ladung wird markiert');
pruefe((await seite.textContent('#achsbox')).includes('Achslasten') && (await seite.textContent('#marken')).includes('1'), 'Achslast-Kästchen oben links und Achsnummern an den Rädern');
await seite.selectOption('#fahrzeug', 'sattel'); await seite.click('#beispiel'); await kurz();
const achsText = await seite.textContent('#achsbox');
pruefe(['Zugmaschine', 'Auflieger', 'Zapfen', '⊙'].every((t) => achsText.includes(t)), 'Sattelzug: Zugmaschine, Königszapfen und Aufliegerachsen 1–3');
await seite.click('#achsbox [data-sp]'); await kurz();
pruefe(!(await seite.textContent('#marken')).includes('Schwerpunkt'), 'Schwerpunkt lässt sich ausblenden');
await seite.click('#achsbox [data-sp]'); await kurz();
pruefe((await seite.textContent('#marken')).includes('Schwerpunkt'), 'und wieder einblenden');
await seite.click('#achsbox [data-lvp]'); await kurz();
pruefe(await seite.isVisible('#blatt svg.plan') && (await seite.textContent('#blatt-titel')) === 'Lastverteilungsplan', 'ⓘ öffnet den Lastverteilungsplan');
await seite.click('[data-blatt="fertig"]');
await seite.click('#achsbox'); await kurz();
pruefe(await seite.isHidden('#achsbox .inhalt'), 'Kästchen lässt sich einklappen');
await seite.click('#achsbox'); await kurz();
await seite.selectOption('#fahrzeug', 'klein'); await seite.click('#beispiel'); await kurz();
const fass = (await lage()).objekte.find((o) => o.art === 'fass');
await seite.evaluate((id) => window.lasi.setze(id, { masse: 1500 }), fass.id); await kurz();
const ach = await seite.evaluate(() => window.lasi.achslasten());
pruefe(ach.achsen.some((a) => !a.ok) && (await status()).includes('Achslast'), 'Überladene Achse wird gemeldet');
pruefe((await seite.textContent('#marken')).includes('Vorderachse'), 'Überladene Achse wird in der Ansicht markiert');

// EPAL-Stellplätze
await seite.selectOption('#fahrzeug', 'sattel');
seite.once('dialog', (d) => d.accept()); await seite.click('#leeren'); await kurz();
pruefe((await seite.textContent('#palette-neu')).includes('+ EPAL') && (await seite.textContent('#gurt-neu')).includes('+ ZM'), 'Knöpfe heißen „+ EPAL“ und „+ ZM“');
await seite.click('#plaetze-knopf'); await kurz();
pruefe(await seite.isVisible('#platzleiste') && (await seite.textContent('#platzleiste')).includes('33 frei'), 'Stellplätze längs: 33 frei');
await seite.click('#palette-neu'); await kurz();
let ep = (await lage()).objekte.filter((o) => o.art === 'europalette');
pruefe(ep.length === 1 && ep[0].x === 6.2 && ep[0].z === -0.8, '+ EPAL stellt auf den ersten freien Platz an der Stirnwand');
await seite.click('[data-muster="quer"]'); await kurz();
pruefe((await seite.textContent('#platzleiste')).match(/(\d+) frei/)[1] < 34, 'Quer: belegte Plätze zählen nicht als frei');
await seite.click('[data-muster="laengs"]'); await kurz();
await seite.click('[data-platz-aktion="fuellen"]'); await kurz();
ep = (await lage()).objekte.filter((o) => o.art === 'europalette');
pruefe(ep.length === 33 && (await seite.textContent('#platzleiste')).includes('0 frei'), '„Alle füllen“ stellt 33 EPAL');
await seite.click('#palette-neu'); await seite.click('#palette-neu'); await kurz();
const stapelLage = await seite.evaluate(() => { const z = window.lasi.zustand(); const e = window.lasi.ergebnis(); return z.objekte.slice(-2).map((o) => [o.x, o.z, Math.round(e.lage.get(o.id).y * 1000) / 1000]); });
pruefe(JSON.stringify(stapelLage) === JSON.stringify([[6.2, -0.8, 0.144], [6.2, -0.8, 0.288]]), 'Alle Plätze voll: neue EPAL stapeln sich am ersten Platz');
if (bilder) await seite.screenshot({ path: `${bilder}/plaetze.png` });
await seite.click('[data-platz-aktion="fertig"]'); await kurz();
pruefe(await seite.isHidden('#platzleiste'), '„Fertig“ blendet die Stellplätze aus');
await seite.click('#beispiel'); await kurz();

// Fahrt-Simulation: ungesicherte Kiste rutscht bei Vollbremsung, gesicherte Ladung bleibt
await seite.selectOption('#fahrzeug', 'sattel'); await seite.click('#beispiel'); await kurz();
await seite.mouse.click(5, 300);
await seite.click('#ladegut-neu'); await seite.click('[data-ladegut="holzkiste"]'); await kurz();
const lose = await seite.evaluate(() => window.lasi.auswahl().id);
await seite.evaluate((id) => window.lasi.setze(id, { x: 0, z: 0 }), lose); await kurz();
const vorFahrt = JSON.stringify((await lage()).objekte);
await seite.click('#fahrt-knopf'); await seite.click('[data-fahrt="bremsen"]');
await seite.waitForFunction(() => window.lasi.fahrt()?.fertig, null, { timeout: 15000 });
const fz = await seite.evaluate(() => window.lasi.fahrt());
const kisteUnit = fz.z.find((u) => u.x > 1);
pruefe(!!kisteUnit && fz.z.filter((u) => Math.abs(u.x) > 0.01).length === 1, 'Vollbremsung: nur die ungesicherte Kiste rutscht nach vorne');
pruefe((await seite.textContent('#fahrtband')).includes('hält nicht') && (await seite.textContent('#fahrtband')).includes('rutscht'), 'Ergebnis nennt, was nicht hält');
if (bilder) await seite.screenshot({ path: `${bilder}/fahrt-bremsen.png` });
await seite.click('[data-fahrt-aktion="ende"]'); await kurz();
pruefe(JSON.stringify((await lage()).objekte) === vorFahrt && await seite.isHidden('#fahrtband'), 'Nach der Fahrt ist die Beladung unverändert');
await seite.click('#fahrt-knopf'); await seite.click('[data-fahrt="kurve"]');
await seite.waitForFunction(() => window.lasi.fahrt()?.fertig, null, { timeout: 15000 });
pruefe((await seite.evaluate(() => window.lasi.fahrt())).z.some((u) => u.faellt), 'Kurve: ungesicherte Kiste fällt herunter');
if (bilder) await seite.screenshot({ path: `${bilder}/fahrt-kurve.png` });
await seite.click('[data-fahrt-aktion="ende"]'); await kurz();
await seite.evaluate((id) => document.querySelector('[data-waehle="' + id + '"]')?.click(), lose); await kurz();
await seite.click('[data-aktion="loeschen"]'); await kurz();
await seite.click('#fahrt-knopf'); await seite.click('[data-fahrt="ausweichen"]');
await seite.waitForFunction(() => window.lasi.fahrt()?.fertig, null, { timeout: 15000 });
pruefe((await seite.textContent('#fahrtband')).includes('Alles hat gehalten'), 'Gesichertes Beispiel hält beim Ausweichen');
await seite.click('[data-fahrt-aktion="ende"]'); await kurz();

for (const f of ['motorwagen', 'klein']) {
  await seite.selectOption('#fahrzeug', f);
  await seite.click('#beispiel'); await kurz();
  pruefe((await status()).includes('✓'), `Beispiel ${f} ist gesichert`);
}
await seite.reload(); await seite.waitForSelector('#status'); await seite.waitForTimeout(200);
pruefe(await seite.inputValue('#fahrzeug') === 'klein', 'Beladung bleibt nach Neuladen erhalten');
pruefe(await seite.evaluate(() => window.lasi.ansicht()) === '3d', 'Gewählte Ansicht bleibt erhalten');

// Bilder in Handygröße
if (bilder) {
  const handy = await neueSeite({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await handy.click('#beispiel'); await handy.waitForTimeout(200);
  await handy.click('#ladegut-neu'); await handy.screenshot({ path: `${bilder}/handy-katalog.png` });
  await handy.click('[data-ladegut="holzkiste"]'); await handy.waitForTimeout(300);
  await handy.screenshot({ path: `${bilder}/handy-oben.png` });
  await handy.click('[data-aktion="bearbeiten"]'); await handy.waitForTimeout(200);
  await handy.screenshot({ path: `${bilder}/handy-blatt.png` });
  await handy.click('[data-blatt="fertig"]');
  await handy.click('[data-aktion="gurt"]'); await handy.screenshot({ path: `${bilder}/handy-gurtwahl.png` });
  await handy.click('[data-neu="kopf-hinten"]'); await handy.waitForTimeout(300);
  await handy.click('[data-ansicht="3d"]'); await handy.waitForTimeout(400);
  await handy.screenshot({ path: `${bilder}/handy-3d.png` });
}
await browser.close();
console.log(fehler.length ? `Seitentest fehlgeschlagen: ${fehler.join(' | ')}` : 'Seitentest ok');
process.exit(fehler.length ? 1 : 0);
