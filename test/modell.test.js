import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefe, ladeeinheiten, stapeln, rechenkraftDaN } from '../src/modell.js';

// Zurrpunkte hier sehr fest, damit die Formeln ohne Begrenzung durch den Zurrpunkt geprüft werden
const flaeche = { laenge: 13.6, breite: 2.48, zurrpunkt: { art: 'en12640', lc: 10000 } };
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

test('RHM unter der Palette hebt μ dieser Fuge auf 0,6', () => {
  const objekte = [rhm('m', 0), palette('p', 0), { ...kiste('k', 0), b: 0.8 }];
  const { einheiten, lage } = ladeeinheiten(objekte);
  assert.equal(lage.get('p').y, 0.008); // Palette liegt auf der 8 mm dicken RHM
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
  // Geometrie: Schlinge auf 0,5 m Höhe, Ecken bei z = ±0,5, Anker 1 m davor am Rahmen (z = ±1,305)
  const horizontal = Math.hypot(1, 0.805), a = Math.atan2(0.5, horizontal), b = Math.atan2(0.805, 1);
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

const direkt = (id, ziel, ecke, mehr = {}) => ({ id, art: 'direkt', variante: 'diagonal', ziel, ecke, abstand: 1.0, anschlag: 0.5, lc: 2500, stf: 500, ...mehr });
const diagonal = (ziel, mehr) => ['vl', 'vr', 'hl', 'hr'].map((e) => direkt(`d${e}`, ziel, e, mehr));

test('Diagonalzurren: 4 Gurte halten längs und quer (nachgerechnet)', () => {
  const k = kiste('k', 0, 0, { b: 1.0 });
  const r = pruefe({ objekte: [k], flaeche, gurte: diagonal('k') });
  const e = r.ergebnisse[0];
  assert.equal(e.ok, true);
  // hinterer Gurt: von (−0,6 | 0,5 | −0,5) nach (−1,6 | 0 | −1,305) am Rahmen
  const n = Math.hypot(1, 0.5, 0.805);
  const proGurtLaengs = 25000 * (1 / n + 0.45 * 0.75 * (0.5 / n));
  assert.ok(Math.abs(e.richtungen.vorwaerts.hat - 2 * proGurtLaengs) < 0.01);
  assert.equal(e.richtungen.vorwaerts.methode, 'direkt');
  // Bedarf vorwärts: (0,8 − 0,45 · 0,75) · 1200 · 9,81
  assert.ok(Math.abs(e.richtungen.vorwaerts.brauch - 0.4625 * 1200 * 9.81) < 0.01);
  const proGurtQuer = 25000 * (0.805 / n + 0.3375 * (0.5 / n));
  assert.ok(Math.abs(e.richtungen.seitlich.hat - 2 * proGurtQuer) < 0.01);
  assert.equal(r.gurte[0].art, 'direkt');
  assert.ok(r.gurte[0].winkel > 0 && r.gurte[0].beta > 0);
});

test('Schrägzurren quer hält seitlich, aber nicht längs', () => {
  const k = kiste('k', 0, 0, { b: 1.0 });
  const r = pruefe({ objekte: [k], flaeche, gurte: diagonal('k', { abstand: 0, variante: 'schraeg' }) });
  const e = r.ergebnisse[0];
  assert.equal(e.richtungen.seitlich.ok, true);
  assert.equal(e.richtungen.seitlich.methode, 'direkt');
  assert.equal(e.richtungen.vorwaerts.ok, false);
  assert.equal(e.richtungen.vorwaerts.hat, 0);
});

test('Nur Gurte auf einer Seite halten seitlich nicht (schwächere Seite zählt)', () => {
  const k = kiste('k', 0, 0, { b: 1.0 });
  const r = pruefe({ objekte: [k], flaeche, gurte: [direkt('a', 'k', 'vl'), direkt('b', 'k', 'hl')] });
  assert.equal(r.ergebnisse[0].richtungen.seitlich.ok, false);
});

test('Direktzurren hält hohe schmale Ladung gegen Kippen', () => {
  const turm = { ...kiste('t', 0), b: 0.6, l: 0.6, h: 2.0, masse: 500 };
  assert.equal(pruefe({ objekte: [turm], flaeche, gurte: [] }).ergebnisse[0].kippen.seitlich.ok, false);
  const r = pruefe({ objekte: [turm], flaeche, gurte: diagonal('t', { anschlag: 1.8 }) });
  assert.equal(r.ergebnisse[0].kippen.seitlich.ok, true);
  assert.equal(r.ergebnisse[0].kippen.laengs.ok, true);
});

test('Direktzurren an bündig am Rand stehender Ladung: Zurrpunkt außen am Rahmen gibt kleinen Winkel', () => {
  const k = kiste('k', 0, -0.74, { b: 1.0 }); // linke Kante bei −1,24 = Rand der Ladefläche
  const r = pruefe({ objekte: [k], flaeche, gurte: diagonal('k', { abstand: 0, variante: 'schraeg' }) });
  const links = r.gurte.find((g) => g.id === 'dhl');
  assert.ok(Math.abs(links.a.z - -1.305) < 1e-9);
  assert.ok(links.d.z < 0 && links.d.z > -0.2); // fast senkrecht
});

test('Ladereihen: nebeneinander eine Reihe, hintereinander nummeriert von vorne', async () => {
  const { ladereihen } = await import('../src/modell.js');
  const { FAHRZEUGE, beispiel } = await import('../src/daten.js');
  const sattel = FAHRZEUGE.find((f) => f.id === 'sattel');
  const r = pruefe({ ...beispiel('sattel'), flaeche: sattel });
  const reihen = ladereihen(r.ergebnisse.map((e) => e.einheit));
  assert.equal(reihen.length, 5); // 4 Reihen Mauersteine + Papierrolle
  assert.deepEqual(reihen.map((x) => x.ids.length), [2, 2, 2, 2, 1]);
  assert.ok(reihen[0].x1 > reihen[1].x1);
  assert.ok(Math.abs(reihen[0].x1 - 6.8) < 1e-9);
  // leicht versetzt nebeneinander zählt noch als eine Reihe
  const versetzt = ladereihen([{ id: 'a', f: { x0: 0, x1: 1.2 } }, { id: 'b', f: { x0: 0.3, x1: 1.5 } }]);
  assert.equal(versetzt.length, 1);
});

test('Gurt, der durch eine Palette läuft, ist mangelhaft und zählt nicht', () => {
  const k = kiste('k', 0, 0, { b: 1.0 });
  const p = palette('p', -1.1, -0.9); // liegt zwischen hinterer linker Ecke und Zurrpunkt
  const r = pruefe({ objekte: [k, p], flaeche, gurte: diagonal('k') });
  const hl = r.gurte.find((g) => g.id === 'dhl');
  assert.match(hl.mangel, /läuft durch/);
  assert.ok(r.hinweise.some((h) => h.art === 'gurt-mangel' && h.id === 'dhl'));
  assert.equal(r.ok, false);
  const ohne = pruefe({ objekte: [k], flaeche, gurte: diagonal('k') });
  const kiste1 = (x) => x.ergebnisse.find((e) => e.id === 'k').richtungen.vorwaerts.hat;
  assert.ok(kiste1(r) < kiste1(ohne)); // der mangelhafte Gurt fehlt in der Rechnung
});

test('Leere Palette ist Ladung und muss gesichert werden', () => {
  const r = pruefe({ objekte: [palette('p', 0)], flaeche, gurte: [] });
  assert.equal(r.ergebnisse.length, 1);
  assert.equal(r.ergebnisse[0].ok, false);
  const mitGurt = pruefe({ objekte: [palette('p', 0)], flaeche, gurte: [gurt('g', 0, 250)] });
  assert.equal(mitGurt.ergebnisse[0].richtungen.seitlich.ok, true);
});

test('Lose hochkant stehende Palette wird gemeldet, als Füllmittel nicht', () => {
  const lose = pruefe({ objekte: [hochkant('p', 0)], flaeche, gurte: [] });
  assert.ok(lose.hinweise.some((h) => h.art === 'lose' && h.id === 'p'));
  assert.equal(lose.ok, false);
  const fueller = pruefe({ objekte: [hochkant('p', 6.8 - 0.072)], flaeche, gurte: [] });
  assert.ok(!fueller.hinweise.some((h) => h.art === 'lose'));
});

test('Frei gespannter Gurt: fester Zurrpunkt, auch auf der anderen Seite', async () => {
  const { zurrpunkte, naechsterZurrpunkt } = await import('../src/modell.js');
  assert.equal(zurrpunkte(13.6)[0], 6.55);
  assert.equal(zurrpunkte(13.6).length, 27);
  assert.equal(naechsterZurrpunkt(13.6, -1.3), -1.45);
  const k = kiste('k', 0, 0, { b: 1.0 });
  const g = { id: 'f', art: 'direkt', variante: 'frei', ziel: 'k', ecke: 'hl', ankerX: -1.45, ankerSeite: 'r', anschlag: 0.5, lc: 2500 };
  const r = pruefe({ objekte: [k], flaeche, gurte: [g] });
  const info = r.gurte[0];
  assert.equal(info.a.x, -1.45);
  assert.ok(Math.abs(info.a.z - 1.305) < 1e-9); // rechter Rahmen, obwohl die Ecke links ist
  assert.ok(info.d.z > 0 && info.d.x < 0);
  // zieht nach hinten-rechts: hält gegen Rutschen nach vorne und nach links
  assert.ok(r.ergebnisse[0].richtungen.vorwaerts.hat > 0);
});

const rohr = (id, x, z = 0, mehr = {}) => ({ id, typ: 'ladung', art: 'rohr', name: 'Stahlrohr', form: 'rohr', material: 'stahl', masse: 1200, l: 6, b: 0.5, h: 0.5, x, z, drehung: 0, ...mehr });
const bucht = (id, ziel, seite, x, mehr = {}) => ({ id, art: 'bucht', ziel, seite, x, lc: 2500, stf: 500, ...mehr });

test('Liegendes Rohr rollt seitlich: ohne Reibung, Niederzurren hält nicht', () => {
  const r = pruefe({ objekte: [rohr('r', 0)], flaeche, gurte: [gurt('g1', -1.5, 500), gurt('g2', 1.5, 500)] });
  const s = r.ergebnisse[0].richtungen.seitlich;
  assert.equal(s.rollt, true);
  assert.equal(s.ok, false);
  assert.ok(Math.abs(s.brauch - 0.5 * 1200 * 9.81 * 1.1) < 1e-6); // μ = 0
  assert.equal(r.ergebnisse[0].richtungen.rueckwaerts.rollt, false); // längs rutscht es normal
  // auf Kanthölzern mit Keilen: rutscht nur noch, 4 Gurte (flacher Winkel, daher mehr als 2)
  const mitKeilen = pruefe({ objekte: [rohr('r', 0, 0, { keile: true, h: 0.6 })], flaeche, gurte: [-2, -1, 1, 2].map((x, i) => gurt('k' + i, x, 500)) });
  assert.equal(mitKeilen.ergebnisse[0].richtungen.seitlich.rollt, false);
  assert.equal(mitKeilen.ergebnisse[0].richtungen.seitlich.ok, true);
});

test('Buchtlashing: ein Paar hält das Rohr seitlich, eine Schlinge allein nicht', () => {
  const paar = pruefe({ objekte: [rohr('r', 0)], flaeche, gurte: [bucht('a', 'r', 'l', -1.5), bucht('b', 'r', 'r', -1.3)] });
  const s = paar.ergebnisse[0].richtungen.seitlich;
  assert.equal(s.ok, true);
  assert.equal(s.methode, 'bucht');
  // oberer Schenkel von (0,425 | −0,25) zum Zurrpunkt (0 | −1,305), unterer von (0,02 | 0)
  const n1 = Math.hypot(1.055, 0.425), n2 = Math.hypot(1.305, 0.02);
  const proSchlinge = 25000 * (1.055 / n1 + 0 * 0.425 / n1) + 25000 * (1.305 / n2); // μ = 0 beim Rollen
  assert.ok(s.hat >= proSchlinge * 0.99);
  const allein = pruefe({ objekte: [rohr('r', 0)], flaeche, gurte: [bucht('a', 'r', 'l', -1.5)] });
  assert.equal(allein.ergebnisse[0].richtungen.seitlich.ok, false);
  const daneben = pruefe({ objekte: [rohr('r', 0)], flaeche, gurte: [bucht('a', 'r', 'l', 5)] });
  assert.match(daneben.gurte[0].mangel, /neben der Ladung/);
});

test('Niederzurrgurt liegt straff an den Kanten: niedrigere Ladung daneben wird nicht berührt', () => {
  const hoch = kiste('hoch', 0, 0.3, { b: 1.0, h: 2.0 });
  const niedrig = kiste('niedrig', 0, -0.6, { b: 0.7, h: 0.4 }); // liegt unter dem schrägen Schenkel
  const r = pruefe({ objekte: [hoch, niedrig], flaeche, gurte: [gurt('g', 0)] });
  const info = r.gurte[0];
  assert.deepEqual(info.getroffen, ['hoch']);
  // linker Schenkel geht vom Zurrpunkt (−1,24 | 0) direkt zur Oberkante der hohen Kiste (−0,2 | 2,0)
  assert.deepEqual(info.weg[0], [-1.24, 0]);
  assert.deepEqual(info.weg[1], [-0.2, 2.0]);
  assert.equal(r.ergebnisse.find((e) => e.id === 'niedrig').gurte.length, 0);
  // gleich hohe Einheiten nebeneinander werden beide berührt
  const gleich = pruefe({ objekte: [kiste('a', 0, -0.62, { b: 1.2 }), kiste('b', 0, 0.62, { b: 1.2 })], flaeche, gurte: [gurt('g', 0)] });
  assert.equal(gleich.gurte[0].getroffen.length, 2);
});

test('Verbändern: Fuge Ladung/EPAL zählt nicht mehr, nur EPAL auf der Fläche', async () => {
  const { ladeeinheiten } = await import('../src/modell.js');
  const { bandPalette } = await import('../src/aktionen.js');
  const { stapeln: st } = await import('../src/modell.js');
  const pal = { id: 'p', typ: 'palette', art: 'europalette', material: 'holz', masse: 25, l: 1.2, b: 0.8, h: 0.144, x: 0, z: 0, drehung: 0 };
  const last = { id: 'k', typ: 'ladung', material: 'kunststoff', masse: 300, l: 1.2, b: 0.8, h: 1, x: 0, z: 0, drehung: 0 };
  const rhm = { id: 'm', typ: 'rhm', material: 'rhm', masse: 0, l: 1.2, b: 0.8, h: 0.008, x: 0, z: 0, drehung: 0 };
  assert.equal(ladeeinheiten([pal, last]).einheiten[0].mu, 0.2); // Kunststoff auf Holz
  const o = [rhm, { ...pal, verbaendert: true }, last];
  const e = ladeeinheiten(o).einheiten[0];
  assert.equal(e.mu, 0.6); // nur noch EPAL auf RHM
  assert.equal(e.verbaendert, true);
  assert.equal(bandPalette(o, st(o), last).id, 'p');
  assert.equal(bandPalette(o, st(o), o[1]).id, 'p');
});

test('Zurrpunkt begrenzt Direktzurren: LC 2500 am Punkt mit 2000 daN zählt 2000', async () => {
  const { pruefe: p } = await import('../src/modell.js');
  const k = { id: 'k', typ: 'ladung', name: 'Kiste', material: 'holz', masse: 2000, l: 1.2, b: 1.0, h: 1, x: 0, z: 0, drehung: 0 };
  const g = { id: 'd', art: 'direkt', variante: 'diagonal', ziel: 'k', ecke: 'vl', abstand: 1, anschlag: 0.5, lc: 2500, stf: 500 };
  const r = p({ objekte: [k], gurte: [g], flaeche: { laenge: 13.6, breite: 2.48 } });
  assert.equal(r.gurte[0].lcWirksam, 2000);
  // Anschlagpunkt mit Belastungswinkel: α ≈ 20° → θ ≈ 70° → 50 %
  const w = p({ objekte: [k], gurte: [g], flaeche: { laenge: 13.6, breite: 2.48, zurrpunkt: { art: 'winkel', lc: 19000 } } });
  assert.equal(w.gurte[0].punkt.faktor, 0.5);
  assert.equal(w.gurte[0].lcWirksam, 2500);
});

test('Höchstens 3 Gurte je Meter Rahmen und Seite', async () => {
  const { pruefe: p } = await import('../src/modell.js');
  const k = { id: 'k', typ: 'ladung', name: 'Kiste', material: 'holz', masse: 2000, l: 2.4, b: 1.0, h: 1, x: 0, z: 0, drehung: 0 };
  const gurt = (id, x) => ({ id, x, stf: 500, lc: 2500, zweiRatschen: false });
  const drei = p({ objekte: [k], gurte: [gurt('a', -0.75), gurt('b', -0.25), gurt('c', 0.25)], flaeche: { laenge: 13.6, breite: 2.48 } });
  assert.ok(!drei.hinweise.some((h) => h.art === 'zurrpunkt'));
  const vier = p({ objekte: [k], gurte: [gurt('a', -0.75), gurt('b', -0.25), gurt('c', 0.25), gurt('d', 0.3)], flaeche: { laenge: 13.6, breite: 2.48 } });
  assert.ok(vier.hinweise.some((h) => h.art === 'zurrpunkt'));
  assert.equal(vier.ok, false);
});

test('Zurrschiene: Gurte an beliebigen Stellen, höchstens 3 Positionen je Meter', async () => {
  const { pruefe: p } = await import('../src/modell.js');
  const k = { id: 'k', typ: 'ladung', name: 'Kiste', material: 'holz', masse: 2000, l: 2.4, b: 1.0, h: 1, x: 0, z: 0, drehung: 0 };
  const gurt = (id, x) => ({ id, x, stf: 500, lc: 2500, zweiRatschen: false });
  const f = { laenge: 13.6, breite: 2.48, zurrpunkt: { art: 'schiene', lc: 2000 } };
  assert.equal(p({ objekte: [k], gurte: [gurt('a', 0), gurt('b', 0.3), gurt('c', 0.6)], flaeche: f }).hinweise.filter((h) => h.art === 'zurrpunkt').length, 0);
  const vier = p({ objekte: [k], gurte: [gurt('a', 0), gurt('b', 0.3), gurt('c', 0.6), gurt('d', 0.9)], flaeche: f });
  assert.match(vier.hinweise.find((h) => h.art === 'zurrpunkt').text, /EN 12640/);
});

test('Kopfschlinge ohne Platz dahinter ist mangelhaft (auch bei runder Ladung)', async () => {
  const { pruefe: p } = await import('../src/modell.js');
  const kiste = { id: 'k', typ: 'ladung', name: 'Kiste', material: 'holz', masse: 500, l: 1.2, b: 0.8, h: 1, x: 0, z: 0, drehung: 0 };
  const rolle = (x) => ({ id: 'r', typ: 'ladung', name: 'Papierrolle', form: 'zylinder', material: 'papier', masse: 1500, l: 1.2, b: 1.2, h: 1.4, x, z: 0, drehung: 0 });
  const g = { id: 'g', art: 'kopf', ziel: 'k', seite: 'hinten', abstand: 1.0, lc: 2500, stf: 500 };
  assert.match(p({ objekte: [kiste, rolle(-1.2)], gurte: [g], flaeche }).gurte[0].mangel, /Papierrolle steht direkt dahinter/);
  assert.equal(p({ objekte: [kiste, rolle(-1.5)], gurte: [g], flaeche }).gurte[0].mangel, undefined);
});
