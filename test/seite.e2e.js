// Prüft die gebaute Seite im Browser: lädt ohne Fehler, rechnet, reagiert auf Eingaben.
// Aufruf: npm run build && npm run preview -- --port 4173 & node test/seite.e2e.js [bild.png]
// Playwright ist in der Cloud-Umgebung global installiert, daher über require geladen
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.env.LASI_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const fehler = [];
seite.on('pageerror', (e) => fehler.push(e.message));
seite.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
await seite.goto(url);
await seite.waitForSelector('#ergebnis .gross');
const start = await seite.textContent('#ergebnis .gross');
await seite.selectOption('#reibung', 'rhm');
const mitMatte = await seite.textContent('#ergebnis .gross');
await seite.selectOption('#reibung', 'holz-sperrholz');
if (process.argv[2]) await seite.screenshot({ path: process.argv[2] });
await browser.close();
console.log({ start, mitMatte, fehler });
const ok = start === '4 Gurte' && mitMatte === '2 Gurte' && fehler.length === 0;
if (!ok) { console.error('Seitentest fehlgeschlagen'); process.exit(1); }
console.log('Seitentest ok');
