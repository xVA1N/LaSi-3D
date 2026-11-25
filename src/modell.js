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

const RANG = { rhm: 0, fuell: 1, palette: 1, ladung: 2 };

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
    if (o.typ !== 'rhm' && o.typ !== 'fuell') {
      for (const s of platziert) {
        const top = lage.get(s.id).y + s.h;
        if (!s.hochkant && s.typ !== 'fuell' && enthaelt(fussabdruck(s), o.x, o.z) && top > y - 1e-9) { y = top; traeger = s; }
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
    // verbänderte EPAL: Ladung und Palette sind fest verbunden, die Fugen darüber zählen nicht
    const fest = (o) => { for (let t = lage.get(o.id).traeger; t; t = lage.get(t.id).traeger) if (t.typ === 'palette' && t.verbaendert && !t.hochkant) return true; return false; };
    const mu = Math.min(...mitglieder.filter((o) => !fest(o)).map((o) => fugenReibung(o, lage.get(o.id).traeger)));
    const verbaendert = mitglieder.some((o) => o.typ === 'palette' && o.verbaendert && !o.hochkant && mitglieder.some((m) => m.typ === 'ladung' && fest(m)));
    const fs = mitglieder.map(fussabdruck);
    const f = { x0: Math.min(...fs.map((a) => a.x0)), x1: Math.max(...fs.map((a) => a.x1)), z0: Math.min(...fs.map((a) => a.z0)), z1: Math.max(...fs.map((a) => a.z1)) };
    const hoehe = Math.max(...mitglieder.map((o) => lage.get(o.id).y + o.h));
    const schwerpunkt = mitglieder.reduce((s, o) => s + o.masse * (lage.get(o.id).y + o.h / 2), 0) / masse;
    const basis = fussabdruck(w);
    // liegende Rohre ohne Keile rollen quer zu ihrer Achse
    const rund = mitglieder.filter((o) => o.form === 'rohr');
    const rollt = rund.length && !rund.every((o) => o.keile) ? (rund[0].drehung === 90 ? ['vorwaerts', 'rueckwaerts'] : ['seitlich']) : [];
    einheiten.push({ id: w.id, mitglieder, masse, mu, f, basis, hoehe, schwerpunkt, rhm: lage.get(w.id).traeger?.typ === 'rhm', rollt, rund: rund.length > 0, verbaendert });
  }
  return { einheiten, lage };
}

/** Welche Einheiten ein Gurt bei x überspannt, mit dem wirksamen Zurrwinkel */
export function gurtLage(gurt, einheiten, flaecheBreite) {
  const B = flaecheBreite / 2;
  const unter = einheiten.filter((e) => gurt.x > e.f.x0 && gurt.x < e.f.x1);
  if (!unter.length) return { getroffen: [], sinAlpha: 0, winkel: 0, weg: [] };
  // Querschnitt bei x: Zurrpunkte und obere Kanten. Der gespannte Gurt liegt auf der oberen konvexen Hülle.
  // bei gleicher Querlage links aufsteigend, rechts absteigend sortieren, damit beide Zurrpunkte Endpunkte bleiben
  const punkte = [[-B, 0], [B, 0], ...unter.flatMap((e) => [[e.f.z0, e.hoehe], [e.f.z1, e.hoehe]])]
    .sort((a, b) => a[0] - b[0] || (a[0] < 0 ? a[1] - b[1] : b[1] - a[1]));
  const kreuz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const weg = [];
  for (const p of punkte) {
    while (weg.length >= 2 && kreuz(weg[weg.length - 2], weg[weg.length - 1], p) >= -1e-12) weg.pop();
    weg.push(p);
  }
  const hoeheBei = (z) => {
    for (let i = 0; i < weg.length - 1; i++) {
      const [z0, y0] = weg[i], [z1, y1] = weg[i + 1];
      if (z >= z0 - 1e-9 && z <= z1 + 1e-9) return z1 - z0 < 1e-9 ? Math.max(y0, y1) : y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    }
    return 0;
  };
  // Niedergehalten wird nur, was der Gurt auch berührt
  const getroffen = unter.filter((e) => [e.f.z0, e.f.z1].some((z) => hoeheBei(z) - e.hoehe < 0.01));
  const sinSchenkel = (a, b) => { const dz = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]); return dz <= 1e-6 ? 1 : dy / Math.hypot(dz, dy); };
  const sinAlpha = (sinSchenkel(weg[0], weg[1]) + sinSchenkel(weg[weg.length - 1], weg[weg.length - 2])) / 2;
  const h = Math.max(...getroffen.map((e) => e.hoehe));
  const z0 = Math.min(...getroffen.map((e) => e.f.z0)), z1 = Math.max(...getroffen.map((e) => e.f.z1));
  return { getroffen, sinAlpha, winkel: (Math.asin(Math.min(sinAlpha, 1)) * 180) / Math.PI, hoehe: h, z0, z1, weg };
}

// Direktzurren: Reibbeiwert wird mit f_μ = 0,75 abgemindert (EN 12195-1)
export const F_MU_DIREKT = 0.75;
// Zurrpunkte für Direktzurren sitzen außen am Rahmen, so weit neben der Ladefläche
export const ZURRPUNKT_AUSSEN = 0.065;
// Zurrpunkte am Außenrahmen: zulässige Zugkraft LC nach EN 12640 (Fahrzeug über 12 t: 2000 daN).
// EN 12640: Mehrpunktsysteme (Zurrschienen) müssen die Kräfte an drei Positionen je Meter in derselben Richtung
// aufnehmen – mehr als 3 belegte Positionen je Meter und Seite sind daher nicht abgedeckt.
export const ZURRPUNKT_STANDARD = { art: 'en12640', lc: 2000 };
export const ZURRPUNKTE_JE_METER = 3;
/**
 * Abminderung durch den Belastungswinkel θ (Abweichung der Zugrichtung von der Achse des Zurrpunkts, die senkrecht
 * nach oben zeigt): 0° → 100 %, bis 45° → 70 %, bis 90° → 50 %. Gilt für Anschlagpunkte/Schäkel; Zurrpunkte nach
 * EN 12640 sind für alle Zugrichtungen geprüft (Faktor 1).
 */
export function winkelFaktor(zp, alphaGrad) {
  if (zp.art !== 'winkel') return 1;
  const theta = 90 - alphaGrad;
  return theta <= 5 ? 1 : theta <= 45 ? 0.7 : 0.5;
}
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

export const LUFT_KOPF = 0.03; // so viel Platz braucht die Schlinge vor bzw. hinter der Ladung
export const PLATZ_VERTEILER = 0.144 + LUFT_KOPF; // hochkant gestellte EPAL plus Schlinge

/**
 * Freier Raum vor (seite 'vorne') bzw. hinter der Einheit bis zum nächsten Teil oder zur Stirnwand.
 * Eine anliegende, hochkant stehende EPAL zählt als Lastverteiler zur Einheit.
 * @returns {{ abstand:number, hindernis:object|null, verteiler:object|null, stirnwand:boolean }}
 */
export function freiraum(objekte, lage, einheit, flaeche, seite) {
  const vorne = seite === 'vorne';
  const ids = new Set(einheit.mitglieder.map((m) => m.id));
  let kante = vorne ? einheit.f.x1 : einheit.f.x0, verteiler = null;
  const { z0, z1 } = einheit.f, y1 = einheit.hoehe;
  const davor = () => objekte
    .filter((o) => o.typ !== 'rhm' && !ids.has(o.id) && o !== verteiler)
    .map((o) => ({ o, f: fussabdruck(o), y: lage.get(o.id)?.y ?? 0 }))
    .filter(({ f, y }) => Math.min(f.z1, z1) - Math.max(f.z0, z0) > 0.02 && y < y1 - 0.02
      && (vorne ? f.x0 >= kante - 0.02 : f.x1 <= kante + 0.02))
    .map((a) => ({ ...a, abstand: vorne ? a.f.x0 - kante : kante - a.f.x1 }))
    .sort((a, b) => a.abstand - b.abstand)[0];
  let n = davor();
  if (n && n.o.typ === 'palette' && n.o.hochkant && n.abstand <= 0.03) {
    verteiler = n.o;
    kante = vorne ? n.f.x1 : n.f.x0;
    n = davor();
  }
  const wand = vorne ? flaeche.laenge / 2 - kante : Infinity;
  if (!n || wand < n.abstand) return { abstand: wand, hindernis: null, verteiler, stirnwand: vorne };
  return { abstand: n.abstand, hindernis: n.o, verteiler, stirnwand: false };
}

/** Erstes Objekt, durch das ein Gurtweg (Punktliste) läuft; RHM und ausgenommene Teile zählen nicht */
export function gurtKollision(punkte, objekte, lage, ausgenommen) {
  const rand = 0.02; // Berühren ist erlaubt
  for (const o of objekte) {
    if (o.typ === 'rhm' || o.art === 'sperrbalken' || ausgenommen.has(o.id)) continue;
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
  // Zurrpunkte: jede Belegung mit Last (daN) und zulässiger Last nach Winkel
  const zp = flaeche.zurrpunkt ?? ZURRPUNKT_STANDARD;
  const anker = [];
  const punktLast = (g, x, z, last, alpha) => {
    const faktor = winkelFaktor(zp, alpha), zul = zp.lc * faktor;
    anker.push({ gurt: g.id, x, seite: z < 0 ? 'l' : 'r', last, zul });
    return { last, zul, faktor, theta: 90 - alpha };
  };
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
      // Die Schlinge braucht Platz vor bzw. hinter der Fläche
      const raum = freiraum(objekte, lage, e, flaeche, g.seite === 'vorne' ? 'vorne' : 'hinten');
      if (raum.abstand < LUFT_KOPF) return mangel(g, info, raum.stirnwand ? 'Kopfschlinge an der Stirnwand geht nicht (dort Formschluss).' : `Kein Platz für die Schlinge: ${raum.hindernis.name} steht direkt ${g.seite === 'vorne' ? 'davor' : 'dahinter'}.`);
      const zulKopf = zp.lc * winkelFaktor(zp, k.winkel), lcKopf = Math.min(g.lc, zulKopf);
      info.punkt = punktLast(g, k.ankerX, -1, lcKopf, k.winkel);
      punktLast(g, k.ankerX, 1, lcKopf, k.winkel);
      info.lcWirksam = lcKopf;
      const b = beitrag.get(e.id);
      const kraft = lcKopf * 10 * k.faktor(e.mu);
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
      const lcBucht = Math.min(g.lc, (zp.lc * winkelFaktor(zp, k.winkel)) / 2);
      info.punkt = punktLast(g, k.a.x, k.a.z, 2 * lcBucht, k.winkel);
      info.lcWirksam = lcBucht;
      const b = beitrag.get(e.id);
      for (const d of [k.dOben, k.dUnten]) {
        const w = direktWirkung(d, lcBucht * 10, e.mu);
        const mo = direktKippmomente(d === k.dOben ? k.oben : k.unten, d, lcBucht * 10, e.basis);
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
      const lcDirekt = Math.min(g.lc, zp.lc * winkelFaktor(zp, k.winkel));
      info.punkt = punktLast(g, k.a.x, k.a.z, lcDirekt, k.winkel);
      info.lcWirksam = lcDirekt;
      const b = beitrag.get(e.id);
      const w = direktWirkung(k.d, lcDirekt * 10, e.mu);
      const mo = direktKippmomente(k.p, k.d, lcDirekt * 10, e.basis);
      for (const r of Object.keys(w)) { b.direkt[r] += w[r]; b.moment[r] += mo[r]; }
      for (const r of ['vorwaerts', 'rueckwaerts']) if (w[r] > 0) b.quellen[r].add(g.variante);
      if (w.rechts > 0 || w.links > 0) b.quellen.seitlich.add(g.variante);
      b.gurte.push(g.id);
      return info;
    }
    const gl = gurtLage(g, einheiten, B);
    const info = { id: g.id, winkel: gl.winkel, getroffen: gl.getroffen.map((e) => e.id), hoehe: gl.hoehe ?? 0, z0: gl.z0, z1: gl.z1, weg: gl.weg };
    if (!gl.getroffen.length) return mangel(g, info, 'Gurt liegt auf keiner Ladung.');
    const weg = gl.weg.map(([z, y]) => ({ x: g.x, y, z }));
    const hindernis = durch(weg, new Set(gl.getroffen.flatMap((e) => e.mitglieder.map((m) => m.id))));
    if (hindernis) return mangel(g, info, `Gurt läuft durch ${hindernis.name}.`);
    if (g.stf > g.lc / 2) hinweise.push({ art: 'gurt', id: g.id, text: `S_TF ${g.stf} daN ist mehr als 0,5 · LC; gerechnet wird mit ${g.lc / 2} daN.` });
    // Die Vorspannkraft wirkt an beiden Zurrpunkten; sie darf die zulässige Zugkraft des Zurrpunkts nicht übersteigen
    const sinL = (a, b) => { const dz = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]); return dz <= 1e-6 ? 1 : dy / Math.hypot(dz, dy); };
    const grad = (x) => (Math.asin(Math.min(1, x)) * 180) / Math.PI;
    info.punkt = punktLast(g, g.x, -1, rechenkraftDaN(g), grad(sinL(gl.weg[0], gl.weg[1])));
    const rechts = punktLast(g, g.x, 1, rechenkraftDaN(g), grad(sinL(gl.weg.at(-1), gl.weg.at(-2))));
    if (rechts.zul < info.punkt.zul) info.punkt = rechts;
    if (rechenkraftDaN(g) > info.punkt.zul + 1e-9) return mangel(g, info, `Vorspannkraft ${rechenkraftDaN(g)} daN ist mehr, als der Zurrpunkt hält (${Math.round(info.punkt.zul)} daN).`);
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

  // Zurrpunkte: mehrere Gurte am selben Punkt teilen sich die Zugkraft; höchstens 3 Belegungen je Meter und Seite
  const ab = (x) => (Math.round((L / 2 - x) * 100) / 100).toLocaleString('de-DE');
  const seiteName = { l: 'links', r: 'rechts' };
  // Einzelne Zurrpunkte liegen im Raster; an einer Zurrschiene kann jede Stelle belegt werden
  const stelle = (x) => (zp.art === 'schiene' ? Math.round(x * 20) / 20 : naechsterZurrpunkt(L, x));
  const punkte = new Map();
  for (const a of anker) {
    const x = stelle(a.x), key = `${a.seite}${x}`;
    if (!punkte.has(key)) punkte.set(key, { x, seite: a.seite, auslastung: 0, gurte: new Set() });
    const p = punkte.get(key);
    p.auslastung += a.last / a.zul;
    p.gurte.add(a.gurt);
  }
  const zurrpunktInfo = [...punkte.values()];
  for (const p of zurrpunktInfo) {
    if (p.auslastung > 1 + 1e-9) hinweise.push({ art: 'zurrpunkt', ids: [...p.gurte], text: `${zp.art === 'schiene' ? 'Schienenposition' : 'Zurrpunkt'} ${seiteName[p.seite]} bei ${ab(p.x)} m ab Stirnwand überlastet (${Math.round(p.auslastung * 100)} %): mehrere Gurte an einem Punkt.` });
  }
  for (const seite of ['l', 'r']) {
    const xs = anker.filter((a) => a.seite === seite).map((a) => ({ x: stelle(a.x), gurt: a.gurt })).sort((p, q) => q.x - p.x);
    for (let i = 0; i < xs.length; i++) {
      const im = xs.filter((a) => a.x <= xs[i].x + 1e-6 && a.x >= xs[i].x - 1 - 1e-6);
      if (im.length > ZURRPUNKTE_JE_METER) {
        hinweise.push({ art: 'zurrpunkt', ids: [...new Set(im.map((a) => a.gurt))], text: `${im.length} Gurte auf einem Meter Rahmen (${seiteName[seite]}, ${ab(xs[i].x)}–${ab(xs[i].x - 1)} m ab Stirnwand); nach EN 12640 sind nur ${ZURRPUNKTE_JE_METER} Positionen je Meter abgedeckt.` });
        break;
      }
    }
  }

  // betroffene Gurte als mangelhaft markieren (blinken im Bild)
  for (const h of hinweise) if (h.art === 'zurrpunkt') for (const id of h.ids) { const i = gurtInfo.find((x) => x.id === id); if (i && !i.mangel) i.mangel = h.text; }

  // Formschluss: nach vorne an der Stirnwand, in beide Richtungen an einem Sperrbalken, oder an etwas,
  // das selbst formschlüssig steht (andere Einheit, hochkant stehende EPAL oder Staupolster als Füllmittel).
  // Jedes Glied merkt sich, an welchem Anschlag (Stirnwand oder Sperrbalken) es am Ende hängt.
  const staupolster = objekte.filter((o) => o.art === 'staupolster');
  const sperrbalken = objekte.filter((o) => o.art === 'sperrbalken');
  const glieder = [...einheiten.map((e) => ({ id: e.id, f: e.f })), ...verteiler.map((v) => ({ id: v.id, f: fussabdruck(v) })), ...staupolster.map((v) => ({ id: v.id, f: fussabdruck(v) }))];
  const luecke = (d) => d >= -0.01 && d <= ABSTAND_FORMSCHLUSS;
  const quer = (a, b) => a.z0 < b.z1 && b.z0 < a.z1;
  const kette = (nachVorne) => {
    const anschlag = new Map();
    let weiter = true;
    while (weiter) {
      weiter = false;
      for (const e of glieder) {
        if (anschlag.has(e.id)) continue;
        let a = null;
        if (nachVorne && luecke(L / 2 - e.f.x1)) a = 'stirnwand';
        const balken = sperrbalken.find((b) => { const fb = fussabdruck(b); return quer(e.f, fb) && luecke(nachVorne ? fb.x0 - e.f.x1 : e.f.x0 - fb.x1); });
        if (!a && balken) a = balken.id;
        const n = !a && glieder.find((n) => anschlag.has(n.id) && quer(e.f, n.f) && luecke(nachVorne ? n.f.x0 - e.f.x1 : e.f.x0 - n.f.x1));
        if (n) a = anschlag.get(n.id);
        if (a) { anschlag.set(e.id, a); weiter = true; }
      }
    }
    return anschlag;
  };
  const vorne = kette(true), hinten = kette(false);
  const balkenLast = new Map();

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
      const anschlag = r === 'vorwaerts' ? vorne.get(e.id) : r === 'rueckwaerts' ? hinten.get(e.id) : null;
      const formschluss = !!anschlag;
      const last = Math.max(0, (c - mu * cz) * e.masse * G);
      if (anschlag === 'stirnwand') stirnwandLast += last;
      else if (anschlag) balkenLast.set(anschlag, (balkenLast.get(anschlag) ?? 0) + last);
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
          && (hinten.has(e.id) || b.kopf.rueckwaerts > 0 || rueckKipp <= b.moment.rueckwaerts + 1e-6),
      },
    };
    // liegende Rohre kippen nicht, sie rollen (oben bei den Richtungen gerechnet)
    if (e.rund) { kippen.seitlich.ok = true; kippen.seitlich.brauch = 0; kippen.laengs.ok = true; }
    const ok = RICHTUNGEN.every((r) => richtungen[r].ok) && kippen.seitlich.ok && kippen.laengs.ok;
    return { id: e.id, einheit: e, richtungen, kippen, gurte: b.gurte, ok };
  });

  // Blockverband: Steht eine Einheit in Rutschrichtung direkt an anderen (auch über hochkant EPAL oder Staupolster),
  // schiebt sie diese an. Hält sie allein nicht, zählt die Sicherung aller Einheiten, die sie anschiebt,
  // die dann aber auch ihre eigene Last tragen müssen.
  const ergebnisVon = new Map(ergebnisse.map((e) => [e.id, e]));
  const vor = (a, b, r) => quer(a.f, b.f) && luecke(r === 'vorwaerts' ? b.f.x0 - a.f.x1 : a.f.x0 - b.f.x1);
  for (const r of ['vorwaerts', 'rueckwaerts']) {
    for (const e of ergebnisse) {
      const d = e.richtungen[r];
      if (d.ok) continue;
      const start = glieder.find((g) => g.id === e.id);
      const gesehen = new Set([e.id]), stapel = [start];
      while (stapel.length) {
        const a = stapel.pop();
        for (const n of glieder) if (!gesehen.has(n.id) && vor(a, n, r)) { gesehen.add(n.id); stapel.push(n); }
      }
      const block = [...gesehen].map((id) => ergebnisVon.get(id)).filter(Boolean);
      if (block.length < 2) continue;
      // erreicht der Block einen Anschlag (Formschluss), hält er
      if (block.some((x) => x.richtungen[r].formschluss)) { Object.assign(d, { block: { ids: block.map((x) => x.id), auslastung: 0, hat: 1, brauch: 0 }, ok: true }); continue; }
      const brauch = block.reduce((s2, x) => s2 + x.richtungen[r].brauch, 0);
      const hat = block.reduce((s2, x) => s2 + (x.richtungen[r].hat || 0), 0);
      const auslastung = brauch === 0 ? 0 : hat > 0 ? brauch / hat : Infinity;
      Object.assign(d, { block: { ids: block.map((x) => x.id), auslastung, hat, brauch }, ok: auslastung <= 1 + 1e-9 });
    }
  }
  for (const e of ergebnisse) e.ok = RICHTUNGEN.every((r) => e.richtungen[r].ok) && e.kippen.seitlich.ok && e.kippen.laengs.ok;

  // Hochkant-Paletten sind nur gehalten als Füllmittel (Formschluss) oder als Lastverteiler einer Kopfschlinge
  for (const v of verteiler) {
    const gehalten = vorne.has(v.id) || hinten.has(v.id) || gurtInfo.some((i) => !i.mangel && i.lastverteiler?.id === v.id);
    if (!gehalten) hinweise.push({ art: 'lose', id: v.id, text: 'Hochkant stehende Palette ist nicht gesichert: als Füllmittel vor die Ladung oder als Lastverteiler in eine Kopfschlinge stellen.' });
  }

  // Staupolster müssen zwischen zwei Teilen (oder Teil und Stirnwand/Sperrbalken) eingeklemmt sein
  for (const p of staupolster) {
    const f = fussabdruck(p);
    const andere = [...glieder.filter((g) => g.id !== p.id).map((g) => g.f), ...sperrbalken.map(fussabdruck)];
    const davor = luecke(L / 2 - f.x1) || andere.some((n) => quer(f, n) && luecke(n.x0 - f.x1));
    const dahinter = andere.some((n) => quer(f, n) && luecke(f.x0 - n.x1));
    if (!(davor && dahinter)) hinweise.push({ art: 'lose', id: p.id, text: 'Staupolster ist nicht eingeklemmt: in eine Lücke zwischen Ladung, Stirnwand oder Sperrbalken stellen.' });
  }
  // Sperrbalken halten nur bis zu ihrer zulässigen Kraft (LC)
  for (const b of sperrbalken) {
    const last = balkenLast.get(b.id) ?? 0;
    if (last > (b.lc ?? 800) * 10 + 1e-6) hinweise.push({ art: 'sperrbalken', id: b.id, text: `Sperrbalken überlastet: ${Math.round(last / 10)} daN, zulässig ${b.lc ?? 800} daN. Weiteren Sperrbalken setzen oder zusätzlich zurren.` });
  }
  if (stirnwandLast > STIRNWAND_KRAFT_N) hinweise.push({ art: 'stirnwand', text: `Last auf die Stirnwand ${Math.round(stirnwandLast / 10)} daN, zulässig sind höchstens 5000 daN.` });
  for (let i = 0; i < einheiten.length; i++) {
    for (let j = i + 1; j < einheiten.length; j++) {
      if (ueberlappt(einheiten[i].basis, einheiten[j].basis)) hinweise.push({ art: 'kollision', ids: [einheiten[i].id, einheiten[j].id], text: 'Zwei Ladeeinheiten überschneiden sich.' });
    }
  }

  return { ergebnisse, gurte: gurtInfo, zurrpunkte: zurrpunktInfo, lage, stirnwandLast, balkenLast, hinweise, ok: ergebnisse.every((e) => e.ok) && !hinweise.some((h) => h.art !== 'gurt') };
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
