// Rechenmodell für frei platzierte Ladung, Hilfsmittel und Gurte auf der Ladefläche.
// Ohne Browser, damit es mit `npm test` geprüft werden kann.
//
// Koordinaten auf der Ladefläche (Meter): x längs, +x = vorne (Stirnwand bei x = L/2),
// z quer (−B/2 … +B/2), y Höhe über dem Boden der Ladefläche.
//
// Vereinfachungen (in der Oberfläche als Hinweis sichtbar):
// - Ein Stapel (Palette mit Ladung, Ladung auf Ladung) wird als eine Ladeeinheit gerechnet,
//   mit dem kleinsten Reibbeiwert aller Fugen im Stapel.
// - Ein Gurt, der über mehrere Ladeeinheiten läuft, verteilt seine Wirkung gleichmäßig.
// - Rutschhemmendes Material (RHM) liegt direkt auf der Ladefläche.

import { G, BEIWERTE_STRASSE, SICHERHEIT_NIEDERZURREN, K_FAKTOR } from './berechnung.js';

export const RICHTUNGEN = ['vorwaerts', 'rueckwaerts', 'seitlich'];
export const STIRNWAND_KRAFT_N = 50000; // 5000 daN, Stirnwand nach EN 12642 Code L (Obergrenze)
const ABSTAND_FORMSCHLUSS = 0.03; // bis 3 cm Lücke gilt noch als formschlüssig

// Reibbeiwerte μ (Richtwerte) je Material der Ladung und Untergrund
export const REIBWERTE = {
  holz: { boden: 0.45, holz: 0.45 },
  stahl: { boden: 0.3, holz: 0.3 },
  kunststoff: { boden: 0.2, holz: 0.2 },
  papier: { boden: 0.3, holz: 0.3 },
  stein: { boden: 0.4, holz: 0.4 },
};
export const MU_RHM = 0.6;
export const MU_LADUNG_AUF_LADUNG = 0.3;

const RANG = { rhm: 0, palette: 1, ladung: 2 };

/** Maße in x- und z-Richtung je nach Drehung */
export function fussabdruck(o) {
  const quer = o.drehung === 90;
  const lx = quer ? o.b : o.l;
  const lz = quer ? o.l : o.b;
  return { x0: o.x - lx / 2, x1: o.x + lx / 2, z0: o.z - lz / 2, z1: o.z + lz / 2, lx, lz };
}

const enthaelt = (f, x, z) => x > f.x0 + 1e-9 && x < f.x1 - 1e-9 && z > f.z0 + 1e-9 && z < f.z1 - 1e-9;
const ueberlappt = (a, b, eps = 1e-6) => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;

/**
 * Stapelt die Objekte: jedes steht auf dem höchsten Objekt unter seiner Mitte.
 * Reihenfolge: RHM, dann Paletten, dann Ladung (in der Reihenfolge der Liste).
 * @returns {Map<string, {y:number, traeger:object|null}>}
 */
export function stapeln(objekte) {
  const lage = new Map();
  const reihenfolge = objekte.map((o, i) => [o, i]).sort((a, b) => RANG[a[0].typ] - RANG[b[0].typ] || a[1] - b[1]);
  const platziert = [];
  for (const [o] of reihenfolge) {
    let y = 0, traeger = null;
    if (o.typ !== 'rhm') {
      for (const s of platziert) {
        const top = lage.get(s.id).y + s.h;
        if (!s.hochkant && enthaelt(fussabdruck(s), o.x, o.z) && top > y - 1e-9) { y = top; traeger = s; }
      }
    }
    lage.set(o.id, { y, traeger });
    platziert.push(o);
  }
  return lage;
}

/** Reibbeiwert der Fuge unter einem Objekt */
export function fugenReibung(o, traeger) {
  if (o.mu > 0) return o.mu; // von Hand festgelegt
  if (traeger?.typ === 'rhm') return MU_RHM;
  if (traeger?.typ === 'ladung') return MU_LADUNG_AUF_LADUNG;
  const werte = REIBWERTE[o.material] ?? REIBWERTE.holz;
  return traeger?.typ === 'palette' ? werte.holz : werte.boden;
}

/** Fasst Stapel zu Ladeeinheiten zusammen. Einheiten ohne Ladegut (leere Palette) entfallen. */
export function ladeeinheiten(objekte) {
  const lage = stapeln(objekte);
  const kinder = new Map(objekte.map((o) => [o.id, []]));
  for (const o of objekte) { const t = lage.get(o.id).traeger; if (t) kinder.get(t.id).push(o); }
  const wurzeln = objekte.filter((o) => o.typ !== 'rhm' && (!lage.get(o.id).traeger || lage.get(o.id).traeger.typ === 'rhm'));
  const einheiten = [];
  for (const w of wurzeln) {
    const mitglieder = [];
    const sammle = (o) => { mitglieder.push(o); for (const k of kinder.get(o.id)) sammle(k); };
    sammle(w);
    // leere liegende Paletten sind selbst Ladung (Leergut); hochkant stehende sind Lastverteiler/Füllmittel
    if (!mitglieder.some((o) => o.typ === 'ladung') && (w.typ !== 'palette' || w.hochkant)) continue;
    const masse = mitglieder.reduce((s, o) => s + o.masse, 0);
    const mu = Math.min(...mitglieder.map((o) => fugenReibung(o, lage.get(o.id).traeger)));
    const fs = mitglieder.map(fussabdruck);
    const f = { x0: Math.min(...fs.map((a) => a.x0)), x1: Math.max(...fs.map((a) => a.x1)), z0: Math.min(...fs.map((a) => a.z0)), z1: Math.max(...fs.map((a) => a.z1)) };
    const hoehe = Math.max(...mitglieder.map((o) => lage.get(o.id).y + o.h));
    const schwerpunkt = mitglieder.reduce((s, o) => s + o.masse * (lage.get(o.id).y + o.h / 2), 0) / masse;
    const basis = fussabdruck(w);
    // liegende Rohre ohne Keile rollen quer zu ihrer Achse
    const rund = mitglieder.filter((o) => o.form === 'rohr');
    const rollt = rund.length && !rund.every((o) => o.keile) ? (rund[0].drehung === 90 ? ['vorwaerts', 'rueckwaerts'] : ['seitlich']) : [];
    einheiten.push({ id: w.id, mitglieder, masse, mu, f, basis, hoehe, schwerpunkt, rhm: lage.get(w.id).traeger?.typ === 'rhm', rollt, rund: rund.length > 0 });
  }
  return { einheiten, lage };
}

/** Welche Einheiten ein Gurt bei x überspannt, mit dem wirksamen Zurrwinkel */
export function gurtLage(gurt, einheiten, flaecheBreite) {
  const getroffen = einheiten.filter((e) => gurt.x > e.f.x0 && gurt.x < e.f.x1);
  if (!getroffen.length) return { getroffen, sinAlpha: 0, winkel: 0 };
  const h = Math.max(...getroffen.map((e) => e.hoehe));
  const z0 = Math.min(...getroffen.map((e) => e.f.z0)), z1 = Math.max(...getroffen.map((e) => e.f.z1));
  const seite = (abstand) => (abstand <= 1e-6 ? 1 : Math.sin(Math.atan2(h, abstand)));
  const sinAlpha = (seite(z0 + flaecheBreite / 2) + seite(flaecheBreite / 2 - z1)) / 2;
  return { getroffen, sinAlpha, winkel: (Math.asin(Math.min(sinAlpha, 1)) * 180) / Math.PI, hoehe: h, z0, z1 };
}

// Direktzurren: Reibbeiwert wird mit f_μ = 0,75 abgemindert (EN 12195-1)
export const F_MU_DIREKT = 0.75;
// Zurrpunkte für Direktzurren sitzen außen am Rahmen, so weit neben der Ladefläche
export const ZURRPUNKT_AUSSEN = 0.065;
const istKopf = (g) => g.art === 'kopf';

/**
 * Kopfschlinge um die Stirnfläche einer Ladeeinheit (Direktzurren in Längsrichtung).
 * Hochkant stehende Paletten direkt an der Fläche dienen als Lastverteiler; die Schlinge liegt dann um sie.
 * Die beiden Schenkel laufen zu Zurrpunkten am Außenrahmen im Abstand `abstand` von der Fläche.
 */
export function kopfLage(g, einheit, verteiler, flaeche) {
  const L = flaeche.laenge / 2, B = flaeche.breite / 2 + ZURRPUNKT_AUSSEN;
  const hinten = g.seite !== 'vorne';
  let x = hinten ? einheit.f.x0 : einheit.f.x1;
  let z0 = einheit.f.z0, z1 = einheit.f.z1, hoeheFlaeche = einheit.hoehe;
  let lastverteiler = null;
  for (const v of verteiler) {
    const fv = fussabdruck(v);
    const anliegend = hinten ? Math.abs(fv.x1 - x) <= 0.03 : Math.abs(fv.x0 - x) <= 0.03;
    if (anliegend && fv.z0 < z1 && z0 < fv.z1) {
      lastverteiler = v;
      x = hinten ? fv.x0 : fv.x1;
      z0 = Math.min(z0, fv.z0); z1 = Math.max(z1, fv.z1);
      hoeheFlaeche = Math.min(hoeheFlaeche, v.h);
      break;
    }
  }
  const y = hoeheFlaeche / 2; // Schlinge etwa auf halber Höhe der Fläche
  const ankerX = Math.min(Math.max(hinten ? x + g.abstand : x - g.abstand, -L), L);
  const dx = Math.max(Math.abs(ankerX - x), 0.01);
  const schenkel = [[z0, -B], [z1, B]].map(([zEcke, zAnker]) => {
    const dz = Math.abs(zAnker - zEcke);
    const horizontal = Math.hypot(dx, dz);
    return { alpha: Math.atan2(y, horizontal), beta: Math.atan2(dz, dx) };
  });
  // Wirkung je Schenkel in Längsrichtung: LC · (cos α · cos β + μ_D · sin α)
  const faktor = (mu) => schenkel.reduce((s, k) => s + Math.cos(k.alpha) * Math.cos(k.beta) + mu * F_MU_DIREKT * Math.sin(k.alpha), 0);
  const grad = (r) => (r * 180) / Math.PI;
  return {
    x, y, z0, z1, ankerX, lastverteiler, faktor,
    richtung: hinten ? 'rueckwaerts' : 'vorwaerts',
    winkel: grad((schenkel[0].alpha + schenkel[1].alpha) / 2),
    beta: grad((schenkel[0].beta + schenkel[1].beta) / 2),
  };
}

/**
 * Diagonal- oder Schrägzurren: ein Gurt von einer Ecke der Ladeeinheit (Zurrpunkt an der Ladung,
 * Höhe `anschlag`) zum Zurrpunkt am Außenrahmen derselben Seite, `abstand` m nach vorne (vordere Ecke)
 * bzw. nach hinten (hintere Ecke). abstand 0 = Schrägzurren quer.
 * ecke: 'vl' | 'vr' | 'hl' | 'hr' (vorne/hinten, links/rechts)
 */
export function direktLage(g, einheit, flaeche) {
  const L = flaeche.laenge / 2, B = flaeche.breite / 2 + ZURRPUNKT_AUSSEN;
  const vorne = g.ecke[0] === 'v', links = g.ecke[1] === 'l';
  const f = einheit.f;
  const p = { x: vorne ? f.x1 : f.x0, y: Math.min(g.anschlag ?? 0.3, einheit.hoehe), z: links ? f.z0 : f.z1 };
  // frei gespannt: fester Zurrpunkt am Rahmen (ankerX, ankerSeite); sonst `abstand` von der Ecke auf derselben Seite
  const a = g.ankerX != null
    ? { x: Math.min(Math.max(g.ankerX, -L), L), y: 0, z: (g.ankerSeite ?? g.ecke[1]) === 'l' ? -B : B }
    : { x: Math.min(Math.max(p.x + (vorne ? 1 : -1) * g.abstand, -L), L), y: 0, z: links ? -B : B };
  const v = { x: a.x - p.x, y: a.y - p.y, z: a.z - p.z };
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  const d = { x: v.x / n, y: v.y / n, z: v.z / n };
  const grad = (r) => (r * 180) / Math.PI;
  return { p, a, d, laenge: n, winkel: grad(Math.asin(Math.min(1, -d.y))), beta: grad(Math.atan2(Math.abs(d.z), Math.abs(d.x))) };
}

/**
 * Buchtlashing: Schlinge vom Zurrpunkt am Rahmen (Seite `seite`, Stelle x) über die Ladung, um die
 * ferne Seite herum und unter der Ladung zurück zum selben Zurrpunkt. Sie zieht die Ladung mit
 * zwei Schenkeln zu dieser Seite: oben von der nahen Oberkante, unten von unter der Mitte.
 */
export function buchtLage(g, einheit, flaeche) {
  const B = flaeche.breite / 2 + ZURRPUNKT_AUSSEN, links = g.seite === 'l';
  const f = einheit.f, zc = (f.z0 + f.z1) / 2;
  const a = { x: g.x, y: 0, z: links ? -B : B };
  const oben = { x: g.x, y: einheit.hoehe * 0.85, z: links ? f.z0 : f.z1 };
  const unten = { x: g.x, y: 0.02, z: zc };
  const richtung = (p) => { const v = { x: a.x - p.x, y: a.y - p.y, z: a.z - p.z }; const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };
  const dOben = richtung(oben), dUnten = richtung(unten);
  return { a, oben, unten, dOben, dUnten, z0: f.z0, z1: f.z1, hoehe: einheit.hoehe, winkel: (Math.asin(Math.min(1, -dOben.y)) * 180) / Math.PI };
}

/** Haltekraft eines Direktzurrgurts je Rutschrichtung: LC · (cos α · cos β + μ_D · sin α), nur wenn er dabei gespannt wird */
export function direktWirkung(d, lcN, mu) {
  const muD = mu * F_MU_DIREKT, unten = Math.max(0, -d.y);
  const zug = (h) => (h > 1e-9 ? lcN * (h + muD * unten) : 0);
  return { vorwaerts: zug(-d.x), rueckwaerts: zug(d.x), rechts: zug(-d.z), links: zug(d.z) };
}

/** Aufrichtendes Moment eines Gurts gegen Kippen um die jeweilige Unterkante (nur ziehend, nie drückend) */
export function direktKippmomente(p, d, lcN, f) {
  const F = { x: d.x * lcN, y: d.y * lcN, z: d.z * lcN };
  const m = (r, fy, fh) => Math.max(0, r * fy - p.y * fh);
  return {
    rechts: m(p.z - f.z1, F.y, F.z), links: m(f.z0 - p.z, F.y, -F.z),
    vorwaerts: m(p.x - f.x1, F.y, F.x), rueckwaerts: m(f.x0 - p.x, F.y, -F.x),
  };
}

/** Schneidet die Strecke a→b den Quader q? (Slab-Verfahren) */
export function streckeTrifftQuader(a, b, q) {
  let t0 = 0, t1 = 1;
  for (const k of ['x', 'y', 'z']) {
    const d = b[k] - a[k], lo = q[`${k}0`], hi = q[`${k}1`];
    if (Math.abs(d) < 1e-12) { if (a[k] <= lo || a[k] >= hi) return false; continue; }
    let u = (lo - a[k]) / d, v = (hi - a[k]) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 >= t1) return false;
  }
  return true;
}

/** Erstes Objekt, durch das ein Gurtweg (Punktliste) läuft; RHM und ausgenommene Teile zählen nicht */
export function gurtKollision(punkte, objekte, lage, ausgenommen) {
  const rand = 0.02; // Berühren ist erlaubt
  for (const o of objekte) {
    if (o.typ === 'rhm' || ausgenommen.has(o.id)) continue;
    const f = fussabdruck(o), y = lage.get(o.id)?.y ?? 0;
    const q = { x0: f.x0 + rand, x1: f.x1 - rand, y0: y + rand, y1: y + o.h - rand, z0: f.z0 + rand, z1: f.z1 - rand };
    if (q.y1 <= q.y0) continue;
    for (let i = 0; i < punkte.length - 1; i++) if (streckeTrifftQuader(punkte[i], punkte[i + 1], q)) return o;
  }
  return null;
}

/** Vorspannkraft, mit der gerechnet wird: höchstens 0,5 · LC */
export const rechenkraftDaN = (gurt) => Math.min(gurt.stf, gurt.lc / 2);

/**
 * Prüft die ganze Beladung.
 * @param {{objekte:object[], gurte:object[], flaeche:{laenge:number, breite:number}}} beladung
 */
export function pruefe({ objekte, gurte, flaeche }) {
  const { einheiten, lage } = ladeeinheiten(objekte);
  const B = flaeche.breite, L = flaeche.laenge;
  const hinweise = [];

  // hochkant stehende Paletten: Lastverteiler für Kopfschlingen und Füllmittel für den Formschluss
  const verteiler = objekte.filter((o) => o.typ === 'palette' && o.hochkant);

  // Beitrag jedes Gurts zu jeder Einheit
  const leer = () => ({ vorwaerts: 0, rueckwaerts: 0, rechts: 0, links: 0 });
  const beitrag = new Map(einheiten.map((e) => [e.id, { reib: 0, kipp: 0, gurte: [], kopf: { vorwaerts: 0, rueckwaerts: 0 }, direkt: leer(), moment: leer(), quellen: { vorwaerts: new Set(), rueckwaerts: new Set(), seitlich: new Set() } }]));
  // Mangelhafte Gurte (laufen durch andere Teile, liegen auf nichts, fast senkrecht) zählen nicht
  const mangel = (g, info, text) => {
    hinweise.push({ art: 'gurt-mangel', id: g.id, text });
    return { ...info, mangel: text };
  };
  const durch = (punkte, ausgenommen) => gurtKollision(punkte, objekte, lage, ausgenommen);
  const mitgliedIds = (e, ...mehr) => new Set([...e.mitglieder.map((m) => m.id), ...mehr.filter(Boolean)]);
  const gurtInfo = gurte.map((g) => {
    if (istKopf(g)) {
      const e = einheiten.find((x) => x.mitglieder.some((m) => m.id === g.ziel));
      if (!e) return mangel(g, { id: g.id, art: 'kopf', getroffen: [], winkel: 0 }, 'Kopfschlinge ohne Ladung.');
      const k = kopfLage(g, e, verteiler, flaeche);
      const info = { id: g.id, art: 'kopf', getroffen: [e.id], ...k, faktor: undefined };
      const Bz = flaeche.breite / 2 + ZURRPUNKT_AUSSEN;
      const weg = [{ x: k.ankerX, y: 0, z: -Bz }, { x: k.x, y: k.y, z: k.z0 }, { x: k.x, y: k.y, z: k.z1 }, { x: k.ankerX, y: 0, z: Bz }];
      const hindernis = durch(weg, mitgliedIds(e, k.lastverteiler?.id));
      if (hindernis) return mangel(g, info, `Kopfschlinge läuft durch ${hindernis.name}.`);
      const b = beitrag.get(e.id);
      const kraft = g.lc * 10 * k.faktor(e.mu);
      b.kopf[k.richtung] += kraft;
      b.direkt[k.richtung] += kraft;
      b.quellen[k.richtung].add('kopf');
      b.gurte.push(g.id);
      return info;
    }
    if (g.art === 'bucht') {
      const e = einheiten.find((x) => x.mitglieder.some((m) => m.id === g.ziel));
      if (!e) return mangel(g, { id: g.id, art: 'bucht', getroffen: [], winkel: 0 }, 'Buchtlashing ohne Ladung.');
      const k = buchtLage(g, e, flaeche);
      const info = { id: g.id, art: 'bucht', getroffen: [e.id], ...k };
      const hindernis = durch([k.oben, k.a], mitgliedIds(e)) || durch([k.unten, k.a], mitgliedIds(e));
      if (hindernis) return mangel(g, info, `Schlinge läuft durch ${hindernis.name}.`);
      if (g.x <= e.f.x0 || g.x >= e.f.x1) return mangel(g, info, 'Schlinge liegt neben der Ladung.');
      const b = beitrag.get(e.id);
      for (const d of [k.dOben, k.dUnten]) {
        const w = direktWirkung(d, g.lc * 10, e.mu);
        const mo = direktKippmomente(d === k.dOben ? k.oben : k.unten, d, g.lc * 10, e.basis);
        for (const r of Object.keys(w)) { b.direkt[r] += w[r]; b.moment[r] += mo[r]; }
      }
      b.quellen.seitlich.add('bucht');
      b.gurte.push(g.id);
      return info;
    }
    if (g.art === 'direkt') {
      const e = einheiten.find((x) => x.mitglieder.some((m) => m.id === g.ziel));
      if (!e) return mangel(g, { id: g.id, art: 'direkt', getroffen: [], winkel: 0 }, 'Direktzurrung ohne Ladung.');
      const k = direktLage(g, e, flaeche);
      const info = { id: g.id, art: 'direkt', getroffen: [e.id], ...k };
      const hindernis = durch([k.p, k.a], mitgliedIds(e));
      if (hindernis) return mangel(g, info, `Gurt läuft durch ${hindernis.name}.`);
      if (Math.hypot(k.d.x, k.d.z) < 0.25) return mangel(g, info, 'Gurt fast senkrecht, hält so kaum. Ladung vom Rand abrücken oder Zurrpunkt weiter weg wählen.');
      const b = beitrag.get(e.id);
      const w = direktWirkung(k.d, g.lc * 10, e.mu);
      const mo = direktKippmomente(k.p, k.d, g.lc * 10, e.basis);
      for (const r of Object.keys(w)) { b.direkt[r] += w[r]; b.moment[r] += mo[r]; }
      for (const r of ['vorwaerts', 'rueckwaerts']) if (w[r] > 0) b.quellen[r].add(g.variante);
      if (w.rechts > 0 || w.links > 0) b.quellen.seitlich.add(g.variante);
      b.gurte.push(g.id);
      return info;
    }
    const gl = gurtLage(g, einheiten, B);
    const info = { id: g.id, winkel: gl.winkel, getroffen: gl.getroffen.map((e) => e.id), hoehe: gl.hoehe ?? 0, z0: gl.z0, z1: gl.z1 };
    if (!gl.getroffen.length) return mangel(g, info, 'Gurt liegt auf keiner Ladung.');
    const weg = [{ x: g.x, y: 0, z: -B / 2 }, { x: g.x, y: gl.hoehe, z: gl.z0 }, { x: g.x, y: gl.hoehe, z: gl.z1 }, { x: g.x, y: 0, z: B / 2 }];
    const hindernis = durch(weg, new Set(gl.getroffen.flatMap((e) => e.mitglieder.map((m) => m.id))));
    if (hindernis) return mangel(g, info, `Gurt läuft durch ${hindernis.name}.`);
    if (g.stf > g.lc / 2) hinweise.push({ art: 'gurt', id: g.id, text: `S_TF ${g.stf} daN ist mehr als 0,5 · LC; gerechnet wird mit ${g.lc / 2} daN.` });
    const ft = rechenkraftDaN(g) * 10; // N
    const k = g.zweiRatschen ? K_FAKTOR.zweiSpannelemente : K_FAKTOR.einSpannelement;
    for (const e of gl.getroffen) {
      const b = beitrag.get(e.id);
      const anteil = 1 / gl.getroffen.length;
      b.reib += k * e.mu * gl.sinAlpha * ft * anteil;
      b.kipp += ft * (e.basis.lz) * gl.sinAlpha * anteil;
      b.gurte.push(g.id);
    }
    return info;
  });

  // Formschluss nach vorne: an der Stirnwand oder an etwas, das selbst formschlüssig steht
  // (andere Einheit oder hochkant stehende Palette als Füllmittel)
  const vorne = new Set();
  const glieder = [...einheiten.map((e) => ({ id: e.id, f: e.f })), ...verteiler.map((v) => ({ id: v.id, f: fussabdruck(v) }))];
  let geaendert = true;
  while (geaendert) {
    geaendert = false;
    for (const e of glieder) {
      if (vorne.has(e.id)) continue;
      const anWand = L / 2 - e.f.x1 <= ABSTAND_FORMSCHLUSS;
      const anNachbar = glieder.some((n) => vorne.has(n.id) && n.f.x0 - e.f.x1 >= -0.01 && n.f.x0 - e.f.x1 <= ABSTAND_FORMSCHLUSS && e.f.z0 < n.f.z1 && n.f.z0 < e.f.z1);
      if (anWand || anNachbar) { vorne.add(e.id); geaendert = true; }
    }
  }

  let stirnwandLast = 0;
  const ergebnisse = einheiten.map((e) => {
    const b = beitrag.get(e.id);
    const richtungen = {};
    for (const r of RICHTUNGEN) {
      const { c, cz } = BEIWERTE_STRASSE[r];
      // Rollen: keine Reibung, Niederzurren hält nicht
      const rollt = e.rollt.includes(r);
      const mu = rollt ? 0 : e.mu, reib = rollt ? 0 : b.reib;
      const brauch = Math.max(0, (c - mu * cz) * e.masse * G * SICHERHEIT_NIEDERZURREN[r]);
      const formschluss = r === 'vorwaerts' && vorne.has(e.id);
      if (formschluss) stirnwandLast += Math.max(0, (c - mu * cz) * e.masse * G);
      const d = { brauch, hat: reib, formschluss, rollt, methode: 'nieder', ok: formschluss || brauch <= reib + 1e-6, auslastung: brauch === 0 ? 0 : reib > 0 ? brauch / reib : Infinity };
      // Direktzurren (Kopfschlinge, Diagonal-, Schrägzurren): μ mit f_μ abgemindert, gerechnet mit LC.
      // Direktzurrungen werden addiert, mit Niederzurren nicht; es zählt das günstigere Verfahren.
      // Seitlich zählt die schwächere der beiden Seiten.
      const direkt = r === 'seitlich' ? Math.min(b.direkt.rechts, b.direkt.links) : b.direkt[r];
      if (direkt > 0 && !formschluss && brauch > 0) {
        const brauchDirekt = Math.max(0, (c - mu * F_MU_DIREKT * cz) * e.masse * G);
        const k = brauchDirekt / direkt;
        const quellen = b.quellen[r];
        const methode = quellen.size === 1 && quellen.has('kopf') ? 'kopf' : quellen.size === 1 && quellen.has('bucht') ? 'bucht' : 'direkt';
        if (k < d.auslastung) Object.assign(d, { methode, brauch: brauchDirekt, hat: direkt, auslastung: k, ok: d.ok || k <= 1 });
      }
      richtungen[r] = d;
    }
    // Kippen quer: Gurte halten über die Breite; längs halten Quergurte nicht
    const w = e.basis.lz, l = e.basis.lx;
    const kippBrauch = e.masse * G * (BEIWERTE_STRASSE.seitlichKippen.c * e.schwerpunkt - w / 2);
    // nach vorne hält der Formschluss auch gegen Kippen
    // Direktzurrungen halten über ihre Momente um die Kippkante; seitlich zählt die schwächere Seite
    const kippHat = Math.max(b.kipp, Math.min(b.moment.rechts, b.moment.links));
    const kippLaengs = (c) => e.masse * G * (c * e.schwerpunkt - l / 2);
    const vorKipp = kippLaengs(BEIWERTE_STRASSE.vorwaerts.c), rueckKipp = kippLaengs(BEIWERTE_STRASSE.rueckwaerts.c);
    const kippen = {
      seitlich: { ok: kippBrauch <= kippHat + 1e-6, brauch: Math.max(0, kippBrauch), hat: kippHat },
      laengs: {
        ok: (vorne.has(e.id) || b.kopf.vorwaerts > 0 || vorKipp <= b.moment.vorwaerts + 1e-6)
          && (b.kopf.rueckwaerts > 0 || rueckKipp <= b.moment.rueckwaerts + 1e-6),
      },
    };
    // liegende Rohre kippen nicht, sie rollen (oben bei den Richtungen gerechnet)
    if (e.rund) { kippen.seitlich.ok = true; kippen.seitlich.brauch = 0; kippen.laengs.ok = true; }
    const ok = RICHTUNGEN.every((r) => richtungen[r].ok) && kippen.seitlich.ok && kippen.laengs.ok;
    return { id: e.id, einheit: e, richtungen, kippen, gurte: b.gurte, ok };
  });

  // Hochkant-Paletten sind nur gehalten als Füllmittel (Formschluss) oder als Lastverteiler einer Kopfschlinge
  for (const v of verteiler) {
    const gehalten = vorne.has(v.id) || gurtInfo.some((i) => !i.mangel && i.lastverteiler?.id === v.id);
    if (!gehalten) hinweise.push({ art: 'lose', id: v.id, text: 'Hochkant stehende Palette ist nicht gesichert: als Füllmittel vor die Ladung oder als Lastverteiler in eine Kopfschlinge stellen.' });
  }

  if (stirnwandLast > STIRNWAND_KRAFT_N) hinweise.push({ art: 'stirnwand', text: `Last auf die Stirnwand ${Math.round(stirnwandLast / 10)} daN, zulässig sind höchstens 5000 daN.` });
  for (let i = 0; i < einheiten.length; i++) {
    for (let j = i + 1; j < einheiten.length; j++) {
      if (ueberlappt(einheiten[i].basis, einheiten[j].basis)) hinweise.push({ art: 'kollision', ids: [einheiten[i].id, einheiten[j].id], text: 'Zwei Ladeeinheiten überschneiden sich.' });
    }
  }

  return { ergebnisse, gurte: gurtInfo, lage, stirnwandLast, hinweise, ok: ergebnisse.every((e) => e.ok) && !hinweise.some((h) => h.art !== 'gurt') };
}

/**
 * Ladereihen: Einheiten, die sich in Längsrichtung überwiegend überdecken, bilden eine Reihe.
 * Nummeriert von der Stirnwand nach hinten. Gibt [{ nr, x0, x1, ids }] zurück.
 */
export function ladereihen(einheiten) {
  const sortiert = [...einheiten].sort((a, b) => b.f.x1 - a.f.x1);
  const reihen = [];
  for (const e of sortiert) {
    const lang = e.f.x1 - e.f.x0;
    const reihe = reihen.find((r) => {
      const ueber = Math.min(r.x1, e.f.x1) - Math.max(r.x0, e.f.x0);
      return ueber > 0.5 * Math.min(lang, r.x1 - r.x0);
    });
    if (reihe) { reihe.x0 = Math.min(reihe.x0, e.f.x0); reihe.x1 = Math.max(reihe.x1, e.f.x1); reihe.ids.push(e.id); }
    else reihen.push({ x0: e.f.x0, x1: e.f.x1, ids: [e.id] });
  }
  return reihen.sort((a, b) => b.x1 - a.x1).map((r, i) => ({ nr: i + 1, ...r }));
}

/** Zurrpunkte am Außenrahmen: alle 0,5 m, der erste 0,25 m hinter der Stirnwand */
export function zurrpunkte(laenge) {
  const punkte = [];
  for (let x = laenge / 2 - 0.25; x > -laenge / 2; x -= 0.5) punkte.push(Math.round(x * 1000) / 1000);
  return punkte;
}
/** Nächster Zurrpunkt zu x */
export const naechsterZurrpunkt = (laenge, x) => zurrpunkte(laenge).reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
