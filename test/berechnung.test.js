import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niederzurren, zurrwinkel, kippsicher } from '../src/berechnung.js';

test('Niederzurren: 1200 kg Holzkiste auf Sperrholz, 90°, S_TF 250 daN', () => {
  const r = niederzurren({ masse: 1200, mu: 0.45, winkel: 90, stf: 250 });
  // vorwärts: (0,8 − 0,45) · 1200 · 9,81 / (1,5 · 0,45 · 1 · 2500) · 1,25 = 3,05 → 4
  assert.equal(r.vorwaerts.anzahl, 4);
  assert.equal(r.rueckwaerts.anzahl, 1);
  assert.equal(r.seitlich.anzahl, 1);
  assert.equal(r.anzahl, 4);
  assert.equal(r.massgebend, 'vorwaerts');
});

test('Niederzurren: Antirutschmatte hält seitlich und rückwärts allein', () => {
  const r = niederzurren({ masse: 1200, mu: 0.6, winkel: 90, stf: 250 });
  assert.equal(r.seitlich.anzahl, 0);
  assert.equal(r.rueckwaerts.anzahl, 0);
  assert.equal(r.vorwaerts.anzahl, 2); // 1,046 · 1,25 = 1,31 → 2
});

test('Niederzurren: k = 2 und flacher Winkel', () => {
  const steil = niederzurren({ masse: 1200, mu: 0.45, winkel: 90, stf: 250, k: 2 });
  assert.equal(steil.vorwaerts.anzahl, 3); // 4120,2 / 2250 · 1,25 = 2,29 → 3
  const flach = niederzurren({ masse: 1200, mu: 0.45, winkel: 30, stf: 250, k: 2 });
  assert.equal(flach.vorwaerts.anzahl, 5); // halbe Wirkung je Gurt: 4,58 → 5
});

test('Niederzurren ohne Reibung ist unmöglich', () => {
  assert.equal(niederzurren({ masse: 500, mu: 0, winkel: 90, stf: 500 }).anzahl, Infinity);
});

test('Ungültige Eingaben werden abgelehnt', () => {
  assert.throws(() => niederzurren({ masse: -1, mu: 0.4, winkel: 90, stf: 250 }), RangeError);
  assert.throws(() => niederzurren({ masse: 100, mu: 0.4, winkel: 90, stf: NaN }), RangeError);
});

test('Zurrwinkel aus Geometrie', () => {
  assert.equal(zurrwinkel(1, 2.48, 2.48), 90);
  assert.ok(Math.abs(zurrwinkel(1, 0.48, 2.48) - 45) < 1e-9);
});

test('Kippen: hohe schmale Ladung kippt seitlich', () => {
  assert.deepEqual(kippsicher({ hoehe: 1, breite: 1, laenge: 1.2 }), { seitlich: true, vorwaerts: true, rueckwaerts: true });
  assert.equal(kippsicher({ hoehe: 2, breite: 0.6, laenge: 1.2 }).seitlich, false);
});
