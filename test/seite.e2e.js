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
await seite.click('#beispiel'); await kurz();
pruefe((await status()).includes('✓'), 'Beispiel Sattelauflieger ist gesichert');

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
await seite.click('[data-aktion="gurt"]'); await kurz();
pruefe((await status()).includes('✓'), 'Mit „Gurt +“ (S_TF 500 daN) gesichert');
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
await seite.mouse.move(p.x, p.y);
await seite.mouse.down();
for (let i = 1; i <= 8; i++) await seite.mouse.move(p.x, p.y + i * 15);
await seite.mouse.up(); await kurz();
pruefe((await objektById(kiste)).x < z0 - 0.5, 'Ziehen in der Draufsicht verschiebt nach hinten');
if (bilder) await seite.screenshot({ path: `${bilder}/oben-desktop.png` });

// Unterlage im Fenster
await seite.evaluate((id) => window.lasi.auswahl().id === id, kiste);
await seite.click('[data-aktion="bearbeiten"]'); await kurz();
await seite.click('[data-unterlage="palette-matte"]'); await kurz();
const z = await lage();
const unter = z.objekte.filter((o) => o.typ !== 'ladung' && Math.abs(o.x - (z.objekte.find((k) => k.id === kiste)).x) < 1e-6);
pruefe(unter.length === 2, 'Palette + Matte werden unter die Kiste gelegt');
pruefe(await seite.isVisible('[data-unterlage="palette-matte"].an'), 'Auswahl „Palette + Matte“ ist markiert');
await seite.click('[data-feld="masse"] [data-d="1"]'); await kurz();
pruefe((await objektById(kiste)).masse === 850, 'Plus-Knopf erhöht die Masse');
await seite.click('[data-blatt="fertig"]');
await seite.click('[data-aktion="gurt"]'); await kurz(); // frischer Gurt über der Kiste
const gurteVorher = (await lage()).gurte.length;
await seite.evaluate((id) => document.querySelector('[data-waehle="' + id + '"]')?.click(), kiste); await kurz();
await seite.click('[data-aktion="loeschen"]'); await kurz();
pruefe((await lage()).objekte.length === z.objekte.length - 3, 'Löschen entfernt die Kiste mit ihrer Palette und Matte');
pruefe((await lage()).gurte.length === gurteVorher - 1, 'Löschen entfernt auch den Gurt, der nur über der Kiste lag');

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
  await handy.click('[data-ansicht="3d"]'); await handy.waitForTimeout(400);
  await handy.screenshot({ path: `${bilder}/handy-3d.png` });
}
await browser.close();
console.log(fehler.length ? `Seitentest fehlgeschlagen: ${fehler.join(' | ')}` : 'Seitentest ok');
process.exit(fehler.length ? 1 : 0);
