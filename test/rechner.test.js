import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sicherungskraft, diagonalzurren, kippen } from '../src/rechner.js';

const nah = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('Sicherungskraft: (c − μ)·m·g', () => {
  const r = sicherungskraft({ masse: 1000, mu: 0.3 });
  nah(r.vorwaerts.kraft, 0.5 * 1000 * 9.81 / 10);
  nah(r.seitlich.kraft, 0.2 * 1000 * 9.81 / 10);
  assert.equal(sicherungskraft({ masse: 1000, mu: 0.6 }).seitlich.kraft, 0);
});

test('Diagonalzurren: nötige LC je Gurt', () => {
  const r = diagonalzurren({ masse: 5000, mu: 0.3, alpha: 40, beta: 35, lc: 2500 });
  const muF = 0.3 * 0.75, a = 40 * Math.PI / 180, b = 35 * Math.PI / 180;
  nah(r.vorwaerts.lcNoetig, 5000 * 9.81 * (0.8 - muF) / 10 / (2 * (Math.cos(a) * Math.cos(b) + muF * Math.sin(a))));
  nah(r.seitlich.lcNoetig, 5000 * 9.81 * (0.5 - muF) / 10 / (2 * (Math.cos(a) * Math.sin(b) + muF * Math.sin(a))));
  assert.equal(r.massgebend, 'vorwaerts');
  assert.equal(r.ok, true);
  assert.equal(diagonalzurren({ masse: 20000, mu: 0.3, alpha: 40, beta: 35, lc: 2500 }).ok, false);
});

test('Kippen: schmale hohe Ladung kippt seitlich', () => {
  const r = kippen({ schwerpunktHoehe: 1.0, breite: 0.8, laenge: 1.2 });
  assert.equal(r.seitlich.kippsicher, false); // 0,6·1,0 > 0,4
  assert.equal(r.vorwaerts.kippsicher, false); // 0,8·1,0 > 0,6
  assert.equal(r.rueckwaerts.kippsicher, true); // 0,5·1,0 ≤ 0,6
});

test('Belastungswinkel wie auf dem Plakat: WLL 9,5 t als Zurrmittel', async () => {
  const { belastungswinkel } = await import('../src/rechner.js');
  assert.equal(belastungswinkel({ wll: 9.5, theta: 0 }).zulaessig, 19);
  nah(belastungswinkel({ wll: 9.5, theta: 45 }).zulaessig, 13.3, 0.01);
  nah(belastungswinkel({ wll: 9.5, theta: 90 }).zulaessig, 9.5, 0.01);
});
