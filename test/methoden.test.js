import { test } from 'node:test';
import assert from 'node:assert/strict';
import { methoden } from '../src/methoden.js';

const flaeche = { laenge: 13.6, breite: 2.48 };
const kiste = (id, x, z = 0, mehr = {}) => ({ id, typ: 'ladung', name: 'Kiste', material: 'holz', masse: 500, l: 1.2, b: 2.0, h: 1, x, z, drehung: 0, ...mehr });

test('Frei stehende Ladung: alle Methoden gehen', () => {
  const m = methoden({ objekte: [kiste('a', 0, 0, { b: 1.0 })], gurte: [] }, flaeche, 'a');
  for (const art of ['nieder', 'kopf-vorne', 'kopf-hinten', 'diagonal', 'schraeg', 'frei', 'bucht']) assert.equal(m[art].ok, true, art);
  assert.equal(m.verteiler.ok, true);
});

test('Ladung direkt davor: keine Kopfschlinge vorne, kein Diagonalzurren nach vorne', () => {
  const objekte = [kiste('hinten', 0), kiste('vorne', 1.2, 0, { b: 2.48 })];
  const m = methoden({ objekte, gurte: [] }, flaeche, 'hinten');
  assert.equal(m['kopf-vorne'].ok, false);
  assert.match(m['kopf-vorne'].grund, /direkt davor/);
  assert.equal(m['kopf-hinten'].ok, true);
  assert.equal(m.diagonal.ok, false); // vordere Gurte laufen durch die Kiste davor
  assert.equal(m.nieder.ok, true);
});

test('An der Stirnwand und hinten eingeklemmt: Kopfschlingen und Lastverteiler gehen nicht', () => {
  const objekte = [kiste('a', 6.2), kiste('b', 5.0)];
  const m = methoden({ objekte, gurte: [] }, flaeche, 'a');
  assert.match(m['kopf-vorne'].grund, /Stirnwand/);
  assert.equal(m['kopf-hinten'].ok, false);
  assert.equal(m.verteiler.ok, false);
});

test('Niederzurren über niedrige Ladung neben hoher geht nicht', () => {
  const objekte = [kiste('klein', 0, 0, { b: 0.8, h: 0.5 }), kiste('l', 0, -0.82, { b: 0.8, h: 2 }), kiste('r', 0, 0.82, { b: 0.8, h: 2 })];
  const m = methoden({ objekte, gurte: [] }, flaeche, 'klein');
  assert.equal(m.nieder.ok, false);
});
