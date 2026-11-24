import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lasten, pruefeAchslasten, lastverteilungsplan, schwerpunkt } from '../src/achslast.js';
import { FAHRZEUGE, beispiel } from '../src/daten.js';

const fz = (id) => FAHRZEUGE.find((f) => f.id === id);
const last = (o) => ({ id: 'a', typ: 'ladung', masse: o.m, x: o.x, z: 0, l: 1, b: 1, h: 1 });

test('Einzelfahrzeug: Hebelgesetz zwischen Vorder- und Hinterachse', () => {
  const k = fz('klein').achslast; // vorn x = 4,2; hinten x = −1,0; Radstand 5,2
  const [v, h] = lasten(k, 1000, 1.6); // genau in der Mitte
  assert.ok(Math.abs(v.last - (2400 + 500)) < 1e-9);
  assert.ok(Math.abs(h.last - (1800 + 500)) < 1e-9);
  const [v2] = lasten(k, 1000, -2.0); // hinter der Hinterachse entlastet die Vorderachse
  assert.ok(v2.last < 2400);
});

test('Sattelzug: Zapfenlast verteilt sich auf die Zugmaschine', () => {
  const s = fz('sattel').achslast;
  const [v, an, ag] = lasten(s, 9200, 6.3); // alles auf dem Königszapfen
  assert.ok(Math.abs(ag.last - 4500) < 1e-9);
  const zapfen = 2500 + 9200;
  assert.ok(Math.abs(v.last - (5500 + zapfen * 0.5 / 2.9)) < 1e-6);
  assert.ok(Math.abs(an.last - (2000 + zapfen * 2.4 / 2.9)) < 1e-6);
  const summe = (m, x) => lasten(s, m, x).reduce((t, a) => t + a.last, 0);
  assert.ok(Math.abs(summe(10000, 0) - (14500 + 10000)) < 1e-6); // Masse bleibt erhalten
});

test('Überladene Vorderachse und zu leichte Lenkachse werden gemeldet', () => {
  const klein = fz('klein');
  const vorne = pruefeAchslasten({ objekte: [last({ m: 3000, x: 2.9 })], fahrzeug: klein });
  assert.ok(vorne.meldungen.some((m) => m.text.startsWith('Vorderachse überladen')));
  const hinten = pruefeAchslasten({ objekte: [last({ m: 3000, x: -3.0 })], fahrzeug: klein });
  assert.ok(hinten.meldungen.some((m) => m.art === 'lenkachse'));
});

test('Lastverteilungsplan: Höchstmasse je Schwerpunktlage, nie über der Nutzlast', () => {
  const klein = fz('klein');
  const plan = lastverteilungsplan(klein, 3300);
  assert.ok(plan.every((p) => p.masse <= 3300 + 1e-9 && p.masse >= 0));
  const ganzVorne = plan[0].masse, mitte = plan[Math.floor(plan.length * 0.4)].masse;
  assert.ok(ganzVorne < mitte); // ganz vorne begrenzt die Vorderachse
  // jeder Punkt des Plans erfüllt alle Achslasten
  for (const p of plan) for (const a of lasten(klein.achslast, p.masse, p.x)) assert.ok(a.last <= a.max + 1e-6);
});

test('Mitgelieferte Beispiele halten die Achslasten ein', () => {
  for (const f of FAHRZEUGE) {
    const r = pruefeAchslasten({ objekte: beispiel(f.id).objekte, fahrzeug: f });
    assert.deepEqual({ f: f.id, m: r.meldungen }, { f: f.id, m: [] });
  }
  assert.equal(schwerpunkt([]).masse, 0);
});
