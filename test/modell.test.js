import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefe, ladeeinheiten, stapeln, rechenkraftDaN } from '../src/modell.js';

const flaeche = { laenge: 13.6, breite: 2.48 };
const kiste = (id, x, z = 0, mehr = {}) => ({ id, typ: 'ladung', name: id, material: 'holz', masse: 1200, l: 1.2, b: 2.48, h: 1, x, z, drehung: 0, ...mehr });
const palette = (id, x, z = 0) => ({ id, typ: 'palette', name: id, material: 'holz', masse: 25, l: 1.2, b: 0.8, h: 0.144, x, z, drehung: 0 });
const rhm = (id, x, z = 0) => ({ id, typ: 'rhm', name: id, material: 'rhm', masse: 0, l: 1.2, b: 0.8, h: 0.008, x, z, drehung: 0 });
const gurt = (id, x, stf = 250, mehr = {}) => ({ id, x, stf, lc: 2500, zweiRatschen: false, ...mehr });

test('Einzelne Kiste: 4 Gurte reichen nach vorne, 3 nicht (wie Beispielrechnung)', () => {
  const objekte = [kiste('k', 0)];
  const mit4 = pruefe({ objekte, flaeche, gurte: [-0.45, -0.15, 0.15, 0.45].map((x, i) => gurt('g' + i, x)) });
  assert.equal(mit4.ergebnisse[0].richtungen.vorwaerts.ok, true);
  assert.equal(mit4.gurte[0].winkel, 90);
  const mit3 = pruefe({ objekte, flaeche, gurte: [-0.3, 0, 0.3].map((x, i) => gurt('g' + i, x)) });
  assert.equal(mit3.ergebnisse[0].richtungen.vorwaerts.ok, false);
  assert.equal(mit3.ergebnisse[0].richtungen.rueckwaerts.ok, true);
});

test('Höhere Vorspannkraft ersetzt Gurte', () => {
  const r = pruefe({ objekte: [kiste('k', 0)], flaeche, gurte: [gurt('a', -0.3, 500), gurt('b', 0.3, 500)] });
  assert.equal(r.ergebnisse[0].richtungen.vorwaerts.ok, true); // 2 · 3375 N ≥ 5150 N
});

test('S_TF über 0,5 · LC wird gekappt und gemeldet', () => {
  assert.equal(rechenkraftDaN(gurt('g', 0, 1500)), 1250);
  const r = pruefe({ objekte: [kiste('k', 0)], flaeche, gurte: [gurt('g', 0, 1500)] });
  assert.ok(r.hinweise.some((h) => h.art === 'gurt' && h.id === 'g'));
});

test('Stapel: Ladung auf Palette wird eine Einheit mit kleinstem μ', () => {
  const objekte = [palette('p', 0), { ...kiste('k', 0), material: 'stahl', masse: 400, b: 0.8 }];
  const lage = stapeln(objekte);
  assert.equal(lage.get('k').y, 0.144);
  assert.equal(lage.get('k').traeger.id, 'p');
  const { einheiten } = ladeeinheiten(objekte);
  assert.equal(einheiten.length, 1);
  assert.equal(einheiten[0].masse, 425);
  assert.equal(einheiten[0].mu, 0.3);
});

test('Rutschhemmende Matte unter der Palette hebt μ dieser Fuge auf 0,6', () => {
  const objekte = [rhm('m', 0), palette('p', 0), { ...kiste('k', 0), b: 0.8 }];
  const { einheiten, lage } = ladeeinheiten(objekte);
  assert.equal(lage.get('p').y, 0.008); // Palette liegt auf der 8 mm dicken Matte
  assert.equal(einheiten[0].mu, 0.45); // die Fuge Kiste/Palette bleibt bei 0,45
  const nurMatte = ladeeinheiten([rhm('m', 0), { ...kiste('k', 0), b: 0.8 }]);
  assert.equal(nurMatte.einheiten[0].mu, 0.6);
});

test('Formschluss an der Stirnwand, auch über eine Kiste davor', () => {
  const vorne = kiste('a', 6.8 - 0.6);
  const dahinter = kiste('b', 6.8 - 1.2 - 0.6 - 0.02);
  const r = pruefe({ objekte: [vorne, dahinter], flaeche, gurte: [] });
  assert.equal(r.ergebnisse.find((e) => e.id === 'a').richtungen.vorwaerts.formschluss, true);
  assert.equal(r.ergebnisse.find((e) => e.id === 'b').richtungen.vorwaerts.formschluss, true);
  assert.ok(r.stirnwandLast > 0);
  const weit = pruefe({ objekte: [kiste('c', 0)], flaeche, gurte: [] });
  assert.equal(weit.ergebnisse[0].richtungen.vorwaerts.formschluss, false);
});

test('Gurt über zwei Einheiten nebeneinander teilt seine Wirkung', () => {
  const links = kiste('l', 0, -0.62, { b: 1.2 });
  const rechts = kiste('r', 0, 0.62, { b: 1.2 });
  const allein = pruefe({ objekte: [links], flaeche, gurte: [gurt('g', 0)] });
  const geteilt = pruefe({ objekte: [links, rechts], flaeche, gurte: [gurt('g', 0)] });
  assert.equal(geteilt.gurte[0].getroffen.length, 2);
  const hatGeteilt = geteilt.ergebnisse.find((e) => e.id === 'l').richtungen.seitlich.hat;
  assert.ok(Math.abs(hatGeteilt - allein.ergebnisse[0].richtungen.seitlich.hat / 2) < 1e-6 || hatGeteilt < allein.ergebnisse[0].richtungen.seitlich.hat);
});

test('Kollision und Überstand werden gemeldet', () => {
  const r = pruefe({ objekte: [kiste('a', 0), kiste('b', 0.65), kiste('c', 6.5)], flaeche, gurte: [] });
  assert.ok(r.hinweise.some((h) => h.art === 'kollision'));
  assert.ok(r.hinweise.some((h) => h.art === 'ueberstand' && h.id === 'c'));
  assert.equal(r.ok, false);
});

test('Hohe schmale Ladung braucht Gurte gegen Kippen', () => {
  const turm = { ...kiste('t', 0), b: 0.6, l: 1.2, h: 2.0, masse: 500 };
  const ohne = pruefe({ objekte: [turm], flaeche, gurte: [] });
  assert.equal(ohne.ergebnisse[0].kippen.seitlich.ok, false);
  const mit = pruefe({ objekte: [turm], flaeche, gurte: [gurt('a', -0.3, 500), gurt('b', 0.3, 500)] });
  assert.equal(mit.ergebnisse[0].kippen.seitlich.ok, true);
});

test('Mitgelieferte Beispiele sind korrekt gesichert', async () => {
  const { FAHRZEUGE, beispiel } = await import('../src/daten.js');
  for (const f of FAHRZEUGE) {
    const r = pruefe({ ...beispiel(f.id), flaeche: f });
    const fehler = r.ergebnisse.filter((e) => !e.ok).map((e) => ({ id: e.id, r: e.richtungen, k: e.kippen }));
    assert.deepEqual({ fahrzeug: f.id, fehler, hinweise: r.hinweise }, { fahrzeug: f.id, fehler: [], hinweise: [] });
  }
});
