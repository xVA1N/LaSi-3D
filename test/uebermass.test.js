import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stapeln } from '../src/modell.js';
import { pruefeUebermass } from '../src/uebermass.js';
import { FAHRZEUGE } from '../src/daten.js';

const sattel = FAHRZEUGE.find((f) => f.id === 'sattel');
const kiste = (id, x, mehr = {}) => ({ id, typ: 'ladung', name: 'Kiste', material: 'holz', masse: 800, l: 1.2, b: 1.0, h: 1.0, x, z: 0, drehung: 0, ...mehr });
const pruefe = (objekte, nutzlast) => pruefeUebermass({ objekte, lage: stapeln(objekte), fahrzeug: sattel, nutzlast });
const arten = (r) => r.meldungen.map((m) => `${m.art}:${m.stufe}`);

test('Normale Beladung: alles im Rahmen', () => {
  const r = pruefe([kiste('a', 0)]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.meldungen, []);
  assert.equal(r.breite, 2.55);
  assert.equal(r.hoehe, 2.2);
  assert.equal(r.fahne, null);
});

test('Zu schwer gegen Nutzlast, auch mit eigener Nutzlast', () => {
  assert.deepEqual(arten(pruefe([kiste('a', 0, { masse: 25000 })])), ['gewicht:fehler']);
  assert.equal(pruefe([kiste('a', 0)], 500).ok, false);
});

test('Zu breit und zu hoch', () => {
  const r = pruefe([kiste('a', 0, { b: 2.8, h: 3.0 })]);
  assert.ok(arten(r).includes('breite:fehler'));
  assert.ok(arten(r).includes('hoehe:fehler'));
  assert.ok(Math.abs(r.breite - 2.8) < 1e-9);
  assert.equal(r.zuBreit && r.zuHoch, true);
});

test('Überstand hinten: bis 1 m frei, ab 1 m Fahne, über 1,5 m zu viel, über 3 m verboten', () => {
  // 3 m langes Ladegut, damit der Schwerpunkt noch auf der Fläche liegt
  const hinten = (u) => pruefe([kiste('a', -6.8 + 1.5 - u, { l: 3.0 })]);
  assert.deepEqual(arten(hinten(0.5)), []);
  const r12 = hinten(1.2);
  assert.deepEqual(arten(r12), ['kennzeichnung:pflicht']);
  assert.ok(Math.abs(r12.ueberHinten - 1.2) < 1e-9);
  assert.ok(Math.abs(r12.fahne.x - (-8.0)) < 1e-9);
  assert.ok(arten(hinten(2)).includes('hinten:fehler'));
  assert.ok(!arten(hinten(2)).includes('laenge:fehler')); // 16,5 m Zug + 2 m liegt unter 20,75 m
  assert.ok(arten(pruefeUebermass({ objekte: [kiste('a', -6.2 - 1.2)], lage: stapeln([kiste('a', -6.2 - 1.2)]), fahrzeug: { ...sattel, gesamtlaenge: 20 } })).includes('laenge:fehler'));
  assert.ok(hinten(3.2).meldungen.some((m) => m.art === 'hinten' && m.text.includes('höchstens')));
});

test('Schwerpunkt hinter der Kante: kippt', () => {
  const r = pruefe([kiste('a', -7.0)]);
  assert.ok(arten(r).includes('auflage:fehler'));
});

test('Seitlicher Überstand über 40 cm verlangt Leuchten', () => {
  const r = pruefe([kiste('a', 0, { z: 1.0, b: 1.4 })]);
  assert.ok(arten(r).includes('seitlich:pflicht'));
  assert.ok(arten(r).includes('breite:fehler'));
});

test('Mitgelieferte Beispiele liegen in Gewicht und Maßen im Rahmen', async () => {
  const { beispiel } = await import('../src/daten.js');
  for (const f of FAHRZEUGE) {
    const { objekte } = beispiel(f.id);
    const r = pruefeUebermass({ objekte, lage: stapeln(objekte), fahrzeug: f });
    assert.deepEqual({ f: f.id, m: r.meldungen }, { f: f.id, m: [] });
  }
});
