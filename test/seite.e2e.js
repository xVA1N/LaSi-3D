// Prüft die gebaute Seite im Browser: Beispiel, Hinzufügen, Gurt, Vorspannkraft, Ziehen, Fahrzeugwechsel.
// Aufruf: npm run build && (npm run preview -- --port 4173 &) && npm run e2e [-- bildordner]
// Playwright ist in der Cloud-Umgebung global installiert, daher über require geladen.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.env.LASI_URL ?? 'http://localhost:4173/';
const bilder = process.argv[2];
const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); console.log(bedingung ? '✓' : '✗', text); };
seite.on('pageerror', (e) => fehler.push(e.message));
seite.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
const status = () => seite.textContent('#status');
const kurz = () => seite.waitForTimeout(150);

await seite.goto(url);
await seite.waitForSelector('#status');
await seite.click('#beispiel'); await kurz();
pruefe((await status()).includes('✓'), 'Beispiel Sattelauflieger ist gesichert');
if (bilder) await seite.screenshot({ path: `${bilder}/sattel.png` });

await seite.selectOption('#ladegut', 'holzkiste');
await seite.click('#ladegut-neu'); await kurz();
const kiste = await seite.evaluate(() => window.lasi.auswahl().id);
pruefe((await status()).includes('✗'), 'Neue Kiste ohne Gurt ist nicht gesichert');

await seite.click('[data-aktion="gurt-darueber"]'); await kurz();
pruefe((await status()).includes('✓'), 'Mit Gurt (S_TF 500 daN) gesichert');

await seite.fill('#auswahl input[type=number][data-feld="stf"]', '50'); await kurz();
pruefe((await status()).includes('✗'), 'Mit S_TF 50 daN nicht mehr gesichert');
pruefe(await seite.inputValue('#auswahl input[type=range]') === '50', 'Schieberegler folgt dem Zahlenfeld');

const vorher = await seite.evaluate((id) => window.lasi.zustand().objekte.find((o) => o.id === id).x, kiste);
const p = await seite.evaluate((id) => window.lasi.bildschirm(id, -0.4, 0.98), kiste); // neben dem Gurt anfassen
await seite.mouse.move(p.x, p.y + 3);
await seite.mouse.down();
for (let i = 1; i <= 10; i++) await seite.mouse.move(p.x - i * 12, p.y + 3 + i * 4);
await seite.mouse.up(); await kurz();
const nachher = await seite.evaluate((id) => window.lasi.zustand().objekte.find((o) => o.id === id).x, kiste);
pruefe(Math.abs(nachher - vorher) > 0.2, `Kiste lässt sich ziehen (x ${vorher.toFixed(2)} → ${nachher.toFixed(2)})`);
if (bilder) await seite.screenshot({ path: `${bilder}/bearbeitet.png` });

for (const f of ['motorwagen', 'klein']) {
  await seite.selectOption('#fahrzeug', f);
  await seite.click('#beispiel'); await kurz();
  pruefe((await status()).includes('✓'), `Beispiel ${f} ist gesichert`);
}
if (bilder) await seite.screenshot({ path: `${bilder}/klein.png` });

await seite.reload(); await seite.waitForSelector('#status');
pruefe(await seite.inputValue('#fahrzeug') === 'klein', 'Beladung bleibt nach Neuladen erhalten');

if (bilder) {
  await seite.setViewportSize({ width: 390, height: 844 });
  await kurz();
  await seite.screenshot({ path: `${bilder}/handy.png` });
}
await browser.close();
console.log(fehler.length ? `Seitentest fehlgeschlagen: ${fehler.join(' | ')}` : 'Seitentest ok');
process.exit(fehler.length ? 1 : 0);
