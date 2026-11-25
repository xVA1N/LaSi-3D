import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefe, stapeln } from '../src/modell.js';
import { MANOEVER, startzustand, schritt, auswertung } from '../src/fahrt.js';

const flaeche = { laenge: 13.6, breite: 2.48, hoehe: 1.2 };
const kiste = (id, x, z = 0, mehr = {}) => ({ id, typ: 'ladung', name: id, material: 'holz', masse: 1200, l: 1.2, b: 1.0, h: 1, x, z, drehung: 0, ...mehr });
const gurt = (id, x, stf = 500) => ({ id, x, stf, lc: 2500, zweiRatschen: false });

function fahre(objekte, gurte, manoever) {
  const r = pruefe({ objekte, gurte, flaeche });
  const z = startzustand(r, flaeche, stapeln(objekte));
  for (const p of MANOEVER[manoever].phasen) for (let t = 0; t < p.dauer; t += 0.02) schritt(z, p, 0.02, flaeche);
  return { z, aus: auswertung(z) };
}

test('Ungesicherte Kiste rutscht bei Vollbremsung bis zur Stirnwand', () => {
  const { z, aus } = fahre([kiste('k', 0)], [], 'bremsen');
  assert.ok(Math.abs(z[0].x - (6.8 - 0.6)) < 1e-9); // bis zur Wand
  assert.equal(z[0].angeschlagen, true);
  assert.match(aus[0].was.join(), /rutscht .* und schlägt an/);
});

test('Gesicherte Kiste bleibt liegen', () => {
  const gurte = [-0.45, -0.15, 0.15, 0.45].map((x, i) => gurt('g' + i, x));
  const { z, aus } = fahre([kiste('k', 0, 0, { b: 2.48 })], gurte, 'bremsen');
  assert.ok(Math.abs(z[0].x) < 1e-9);
  assert.deepEqual(aus[0].was, []);
});

test('Formschluss an der Stirnwand: nichts bewegt sich nach vorne', () => {
  const { z } = fahre([kiste('k', 6.2)], [], 'bremsen');
  assert.equal(z[0].x, 0);
});

test('In der Kurve fällt ungesicherte Ladung seitlich herunter', () => {
  const { aus } = fahre([kiste('k', 0)], [], 'kurve');
  assert.ok(aus[0].was.includes('fällt herunter'));
});

test('Andere Ladung bremst das Rutschen', () => {
  const { z } = fahre([kiste('vorn', 6.2), kiste('hinten', 3.0)], [], 'bremsen');
  const hinten = z.find((u) => u.id === 'hinten');
  assert.ok(Math.abs(hinten.x - (5.6 - 3.6)) < 1e-9); // schlägt an der vorderen Kiste an
});

test('Liegendes Rohr rollt in der Kurve', () => {
  const rohr = { id: 'r', typ: 'ladung', name: 'Rohr', form: 'rohr', material: 'stahl', masse: 1200, l: 6, b: 0.5, h: 0.5, x: 0, z: 0, drehung: 0 };
  const { z, aus } = fahre([rohr], [], 'kurve');
  assert.ok(Math.abs(z[0].roll) > 0.3);
  assert.ok(aus[0].was.length > 0);
});

test('Hohe schmale Ladung kippt in der Kurve', () => {
  const turm = kiste('t', 0, 0, { l: 0.6, b: 0.6, h: 2.0, masse: 300 });
  const rhm = { id: 'm', typ: 'rhm', name: 'RHM', material: 'rhm', masse: 0, l: 0.6, b: 0.6, h: 0.008, x: 0, z: 0, drehung: 0 };
  const { z } = fahre([rhm, turm], [], 'kurve');
  assert.ok(z[0].kipp > 0.5);
});

test('Kippt nach vorne nicht durch die Stirnwand, sondern lehnt sich an', () => {
  const turm = kiste('t', 6.8 - 0.3 - 0.5, 0, { l: 0.6, b: 0.6, h: 2.0, masse: 300 }); // 0,5 m vor der Wand
  const rhm = { id: 'm', typ: 'rhm', name: 'RHM', material: 'rhm', masse: 0, l: 0.6, b: 0.6, h: 0.008, x: turm.x, z: 0, drehung: 0 };
  const { z, aus } = fahre([rhm, turm], [], 'bremsen');
  const u = z[0];
  // rutscht an die Wand (RHM 0,6 < 0,8) und kann dort nicht mehr kippen
  assert.ok(Math.abs(u.x - 0.5) < 1e-9);
  assert.ok(u.kipp < 1e-9);
  assert.match(aus[0].was.join(), /schlägt an/);
});

test('Kippt gegen die Ladung davor, ohne zu rutschen', () => {
  // vorne festgehaltener Turm (Formschluss an der Wand), dahinter einer mit 0,3 m Lücke auf RHM, der kippt
  const vorn = kiste('v', 6.8 - 0.6, 0, { l: 1.2, b: 1.2, h: 2.0, masse: 2000 });
  const turm = kiste('t', 6.8 - 1.2 - 0.3 - 0.3, 0, { l: 0.6, b: 0.6, h: 2.0, masse: 300, mu: 0.9 });
  const { z, aus } = fahre([vorn, turm], [], 'bremsen');
  const u = z.find((x) => x.id === 't');
  assert.ok(u.kipp > 0.05 && Math.sin(u.kipp) * 2.0 <= 0.3 + 1e-6);
  assert.match(aus.find((a) => a.id === 't').was.join(), /lehnt sich an/);
});

test('Höher als die Stirnwand: lehnt sich an deren Oberkante an', () => {
  const turm = kiste('t', 6.8 - 0.3 - 0.4, 0, { l: 0.6, b: 0.8, h: 2.4, masse: 400, mu: 0.9 });
  const r = pruefe({ objekte: [turm], gurte: [], flaeche });
  const z = startzustand(r, { ...flaeche, wandHoehe: 1.6 }, stapeln([turm]));
  for (const p of MANOEVER.bremsen.phasen) for (let t = 0; t < p.dauer; t += 0.02) schritt(z, p, 0.02, flaeche);
  // Vorderfläche berührt die Wandoberkante (0,4 m vor, 1,6 m hoch): tan θ = 0,4 / 1,6
  assert.ok(Math.abs(z[0].kipp - Math.atan(0.4 / 1.6)) < 1e-6);
});
