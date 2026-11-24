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
// - Rutschhemmende Matten liegen direkt auf der Ladefläche.

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
 * Reihenfolge: Matten, dann Paletten, dann Ladung (in der Reihenfolge der Liste).
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
        if (enthaelt(fussabdruck(s), o.x, o.z) && top > y - 1e-9) { y = top; traeger = s; }
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
    if (!mitglieder.some((o) => o.typ === 'ladung')) continue;
    const masse = mitglieder.reduce((s, o) => s + o.masse, 0);
    const mu = Math.min(...mitglieder.map((o) => fugenReibung(o, lage.get(o.id).traeger)));
    const fs = mitglieder.map(fussabdruck);
    const f = { x0: Math.min(...fs.map((a) => a.x0)), x1: Math.max(...fs.map((a) => a.x1)), z0: Math.min(...fs.map((a) => a.z0)), z1: Math.max(...fs.map((a) => a.z1)) };
    const hoehe = Math.max(...mitglieder.map((o) => lage.get(o.id).y + o.h));
    const schwerpunkt = mitglieder.reduce((s, o) => s + o.masse * (lage.get(o.id).y + o.h / 2), 0) / masse;
    const basis = fussabdruck(w);
    einheiten.push({ id: w.id, mitglieder, masse, mu, f, basis, hoehe, schwerpunkt, rhm: lage.get(w.id).traeger?.typ === 'rhm' });
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

  // Beitrag jedes Gurts zu jeder Einheit
  const beitrag = new Map(einheiten.map((e) => [e.id, { reib: 0, kipp: 0, gurte: [] }]));
  const gurtInfo = gurte.map((g) => {
    const gl = gurtLage(g, einheiten, B);
    const ft = rechenkraftDaN(g) * 10; // N
    const k = g.zweiRatschen ? K_FAKTOR.zweiSpannelemente : K_FAKTOR.einSpannelement;
    for (const e of gl.getroffen) {
      const b = beitrag.get(e.id);
      const anteil = 1 / gl.getroffen.length;
      b.reib += k * e.mu * gl.sinAlpha * ft * anteil;
      b.kipp += ft * (e.basis.lz) * gl.sinAlpha * anteil;
      b.gurte.push(g.id);
    }
    if (!gl.getroffen.length) hinweise.push({ art: 'gurt', id: g.id, text: 'Gurt liegt auf keiner Ladung.' });
    if (g.stf > g.lc / 2) hinweise.push({ art: 'gurt', id: g.id, text: `S_TF ${g.stf} daN ist mehr als 0,5 · LC; gerechnet wird mit ${g.lc / 2} daN.` });
    return { id: g.id, winkel: gl.winkel, getroffen: gl.getroffen.map((e) => e.id), hoehe: gl.hoehe ?? 0, z0: gl.z0, z1: gl.z1 };
  });

  // Formschluss nach vorne: an der Stirnwand oder an einer Einheit, die selbst formschlüssig steht
  const vorne = new Set();
  let geaendert = true;
  while (geaendert) {
    geaendert = false;
    for (const e of einheiten) {
      if (vorne.has(e.id)) continue;
      const anWand = L / 2 - e.f.x1 <= ABSTAND_FORMSCHLUSS;
      const anNachbar = einheiten.some((n) => vorne.has(n.id) && n.f.x0 - e.f.x1 >= -0.01 && n.f.x0 - e.f.x1 <= ABSTAND_FORMSCHLUSS && e.f.z0 < n.f.z1 && n.f.z0 < e.f.z1);
      if (anWand || anNachbar) { vorne.add(e.id); geaendert = true; }
    }
  }

  let stirnwandLast = 0;
  const ergebnisse = einheiten.map((e) => {
    const b = beitrag.get(e.id);
    const richtungen = {};
    for (const r of RICHTUNGEN) {
      const { c, cz } = BEIWERTE_STRASSE[r];
      const brauch = Math.max(0, (c - e.mu * cz) * e.masse * G * SICHERHEIT_NIEDERZURREN[r]);
      const formschluss = r === 'vorwaerts' && vorne.has(e.id);
      if (formschluss) stirnwandLast += Math.max(0, (c - e.mu * cz) * e.masse * G);
      richtungen[r] = { brauch, hat: b.reib, formschluss, ok: formschluss || brauch <= b.reib + 1e-6, auslastung: brauch === 0 ? 0 : b.reib > 0 ? brauch / b.reib : Infinity };
    }
    // Kippen quer: Gurte halten über die Breite; längs halten Quergurte nicht
    const w = e.basis.lz, l = e.basis.lx;
    const kippBrauch = e.masse * G * (BEIWERTE_STRASSE.seitlichKippen.c * e.schwerpunkt - w / 2);
    // nach vorne hält der Formschluss auch gegen Kippen
    const kippen = {
      seitlich: { ok: kippBrauch <= b.kipp + 1e-6, brauch: Math.max(0, kippBrauch), hat: b.kipp },
      laengs: { ok: (vorne.has(e.id) || BEIWERTE_STRASSE.vorwaerts.c * e.schwerpunkt <= l / 2) && BEIWERTE_STRASSE.rueckwaerts.c * e.schwerpunkt <= l / 2 },
    };
    const ok = RICHTUNGEN.every((r) => richtungen[r].ok) && kippen.seitlich.ok && kippen.laengs.ok;
    return { id: e.id, einheit: e, richtungen, kippen, gurte: b.gurte, ok };
  });

  if (stirnwandLast > STIRNWAND_KRAFT_N) hinweise.push({ art: 'stirnwand', text: `Last auf die Stirnwand ${Math.round(stirnwandLast / 10)} daN, zulässig sind höchstens 5000 daN.` });
  for (let i = 0; i < einheiten.length; i++) {
    for (let j = i + 1; j < einheiten.length; j++) {
      if (ueberlappt(einheiten[i].basis, einheiten[j].basis)) hinweise.push({ art: 'kollision', ids: [einheiten[i].id, einheiten[j].id], text: 'Zwei Ladeeinheiten überschneiden sich.' });
    }
  }
  for (const o of objekte) {
    const f = fussabdruck(o);
    if (f.x0 < -L / 2 - 1e-6 || f.x1 > L / 2 + 1e-6 || f.z0 < -B / 2 - 1e-6 || f.z1 > B / 2 + 1e-6) hinweise.push({ art: 'ueberstand', id: o.id, text: `${o.name} steht über die Ladefläche hinaus.` });
  }

  return { ergebnisse, gurte: gurtInfo, lage, stirnwandLast, hinweise, ok: ergebnisse.every((e) => e.ok) && !hinweise.some((h) => h.art !== 'gurt') };
}
