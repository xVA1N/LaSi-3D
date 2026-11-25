import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stapeln } from '../src/modell.js';
import { bewegGruppe, anWand, verschiebe, abstandVorne, unterlage, setzeUnterlage, freierGurtX, vereinigung } from '../src/aktionen.js';

const flaeche = { laenge: 13.6, breite: 2.48 };
let n = 0;
const id = (p) => `${p}${++n}`;
const kiste = (i, x, z = 0, mehr = {}) => ({ id: i, typ: 'ladung', name: 'Kiste', material: 'holz', masse: 500, l: 1.2, b: 1.0, h: 1, x, z, drehung: 0, ...mehr });
const palette = (i, x, z = 0) => ({ id: i, typ: 'palette', art: 'europalette', name: 'Europalette', material: 'holz', masse: 25, l: 1.2, b: 0.8, h: 0.144, x, z, drehung: 0 });
const matte = (i, x, z = 0) => ({ id: i, typ: 'rhm', art: 'rhm', name: 'RHM', material: 'rhm', masse: 0, l: 1.2, b: 0.8, h: 0.008, x, z, drehung: 0 });

test('Ladung auf Palette und RHM bewegt die ganze Einheit, Ladung auf Ladung nur sich', () => {
  const o = [matte('m', 0), palette('p', 0), kiste('k', 0), kiste('oben', 0)];
  const lage = stapeln(o);
  assert.deepEqual(bewegGruppe(o, lage, o[2]).gruppe.map((a) => a.id).sort(), ['k', 'm', 'oben', 'p']);
  assert.deepEqual(bewegGruppe(o, lage, o[3]).gruppe.map((a) => a.id), ['oben']);
});

test('An Wand: bis zur Stirnwand, sonst bis an die Ladung davor', () => {
  const o = [kiste('a', 0)];
  anWand(o, stapeln(o), o[0], flaeche);
  assert.equal(o[0].x, 6.2);
  const zwei = [kiste('vorne', 6.2), kiste('hinten', 0)];
  anWand(zwei, stapeln(zwei), zwei[1], flaeche);
  assert.equal(zwei[1].x, 5.0);
  const daneben = [kiste('vorne', 6.2, -0.7), kiste('hinten', 0, 0.7)];
  anWand(daneben, stapeln(daneben), daneben[1], flaeche);
  assert.equal(daneben[1].x, 6.2); // andere Seite, also bis an die Wand
});

test('Abstand nach vorne', () => {
  const o = [kiste('vorne', 6.2), kiste('hinten', 4.0)];
  const a = abstandVorne(o, stapeln(o), o[1], flaeche);
  assert.ok(Math.abs(a.abstand - 1.0) < 1e-9); // vorne beginnt bei 5,6, hinten endet bei 4,6
  assert.equal(a.bis.id, 'vorne');
  assert.ok(Math.abs(a.stirnwand - 2.2) < 1e-9);
});

test('Verschieben: seitlich bis 0,5 m, hinten bis 4 m Überstand, vorne bis zur Stirnwand', () => {
  const o = [palette('p', 0), kiste('k', 0)];
  verschiebe(o, stapeln(o), o[1], 0, 5, flaeche);
  assert.equal(vereinigung(o).z1, 1.74);
  assert.equal(o[0].z, o[1].z);
  verschiebe(o, stapeln(o), o[1], -20, 0, flaeche);
  assert.ok(Math.abs(vereinigung(o).x0 - -10.8) < 1e-9);
  verschiebe(o, stapeln(o), o[1], 30, 0, flaeche);
  assert.equal(vereinigung(o).x1, 6.8);
});

test('Unterlage wechseln: Palette, RHM, beides, zurück auf die Fläche', () => {
  const o = [kiste('k', 2)];
  assert.equal(unterlage(o, stapeln(o), o[0]).art, 'flaeche');
  assert.equal(setzeUnterlage(o, stapeln(o), o[0], 'palette-matte', id), true);
  let lage = stapeln(o);
  assert.equal(unterlage(o, lage, o[0]).art, 'palette-matte');
  assert.equal(lage.get('k').y, 0.152);
  setzeUnterlage(o, lage, o[0], 'matte', id);
  lage = stapeln(o);
  assert.equal(unterlage(o, lage, o[0]).art, 'matte');
  assert.equal(o.length, 2);
  setzeUnterlage(o, lage, o[0], 'flaeche', id);
  assert.equal(o.length, 1);
});

test('Geteilte Palette wird nicht verändert', () => {
  const o = [palette('p', 0), kiste('a', -0.3, 0, { l: 0.6 }), kiste('b', 0.3, 0, { l: 0.6 })];
  const lage = stapeln(o);
  assert.equal(unterlage(o, lage, o[1]).geteilt, true);
  assert.equal(setzeUnterlage(o, lage, o[1], 'flaeche', id), false);
  assert.equal(o.length, 3);
});

test('Neuer Gurt sucht eine freie Stelle', () => {
  const u = { x0: -0.6, x1: 0.6 };
  assert.equal(freierGurtX([], u), 0);
  assert.equal(freierGurtX([{ x: 0 }], u), -0.3);
  assert.equal(freierGurtX([{ x: 0 }, { x: -0.3 }], u), 0.3);
});

test('EPAL-Stellplätze: Sattel 33 längs, 34 quer; kleiner Lkw 15 / 14', async () => {
  const { stellplaetze, platzFrei } = await import('../src/aktionen.js');
  const sattel = { laenge: 13.6, breite: 2.48 }, klein = { laenge: 6.2, breite: 2.4 };
  assert.equal(stellplaetze(sattel, 'laengs').length, 33);
  assert.equal(stellplaetze(sattel, 'quer').length, 34);
  assert.equal(stellplaetze(klein, 'laengs').length, 15);
  assert.equal(stellplaetze(klein, 'quer').length, 14);
  const erster = stellplaetze(sattel, 'laengs')[0];
  assert.deepEqual([erster.x, erster.z, erster.drehung], [6.2, -0.8, 0]); // an der Stirnwand, links
  const belegt = [palette('p', 6.2, -0.8)];
  assert.equal(platzFrei(erster, belegt), false);
  assert.equal(platzFrei(stellplaetze(sattel, 'laengs')[1], belegt), true);
});
