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

test('Kollision wird gemeldet', () => {
  const r = pruefe({ objekte: [kiste('a', 0), kiste('b', 0.65)], flaeche, gurte: [] });
  assert.ok(r.hinweise.some((h) => h.art === 'kollision'));
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

const hochkant = (id, x, z = 0, b = 1.2) => ({ id, typ: 'palette', art: 'europalette', name: id, material: 'holz', masse: 25, l: 0.144, b, h: b === 1.2 ? 0.8 : 1.2, x, z, drehung: 0, hochkant: true });
const kopf = (id, ziel, seite = 'hinten', mehr = {}) => ({ id, art: 'kopf', ziel, seite, abstand: 1.0, lc: 2500, stf: 500, ...mehr });

test('Kopfschlinge hinten sichert rückwärts (Direktzurren, μ · 0,75)', () => {
  const k = kiste('k', 0, 0, { b: 1.0 });
  const ohne = pruefe({ objekte: [k], flaeche, gurte: [] });
  assert.equal(ohne.ergebnisse[0].richtungen.rueckwaerts.ok, false);
  const r = pruefe({ objekte: [k], flaeche, gurte: [kopf('s', 'k')] });
  const d = r.ergebnisse[0].richtungen.rueckwaerts;
  assert.equal(d.ok, true);
  assert.equal(d.methode, 'kopf');
  // Bedarf: (0,5 − 0,45 · 0,75) · 1200 · 9,81 = 1912,95 N
  assert.ok(Math.abs(d.brauch - 1912.95) < 0.01);
  // Geometrie: Schlinge auf 0,5 m Höhe, Ecken bei z = ±0,5, Anker 1 m davor am Rand (z = ±1,24)
  const horizontal = Math.hypot(1, 0.74), a = Math.atan2(0.5, horizontal), b = Math.atan2(0.74, 1);
  const erwartet = 2 * 25000 * (Math.cos(a) * Math.cos(b) + 0.45 * 0.75 * Math.sin(a));
  assert.ok(Math.abs(d.hat - erwartet) < 0.01);
  assert.equal(r.ergebnisse[0].richtungen.vorwaerts.ok, false); // hinten hält nicht nach vorne
});

test('Kopfschlinge legt sich um eine hochkant davorstehende Palette', () => {
  const k = kiste('k', 0, 0, { b: 1.0 });
  const p = hochkant('p', -0.6 - 0.072);
  const r = pruefe({ objekte: [k, p], flaeche, gurte: [kopf('s', 'k')] });
  const info = r.gurte[0];
  assert.equal(info.lastverteiler.id, 'p');
  assert.ok(Math.abs(info.x - (-0.744)) < 1e-9);
  assert.ok(Math.abs(info.z1 - 0.6) < 1e-9); // Palette ist 1,2 m breit
  assert.equal(r.ergebnisse.length, 1); // Palette ist keine eigene Ladeeinheit
});

test('Hochkant-Palette zwischen Stirnwand und Ladung gilt als Füllmittel', () => {
  const p = hochkant('p', 6.8 - 0.072);
  const k = kiste('k', 6.8 - 0.144 - 0.6, 0, { b: 1.0 });
  const r = pruefe({ objekte: [p, k], flaeche, gurte: [] });
  assert.equal(r.ergebnisse[0].richtungen.vorwaerts.formschluss, true);
  // auf einer Hochkant-Palette kann nichts stehen
  const lage = stapeln([p, { ...k, x: p.x }]);
  assert.equal(lage.get('k').traeger, null);
});

test('Kopfschlinge ohne Ladung wird gemeldet', () => {
  const r = pruefe({ objekte: [], flaeche, gurte: [kopf('s', 'weg')] });
  assert.ok(r.hinweise.some((h) => h.id === 's'));
});
