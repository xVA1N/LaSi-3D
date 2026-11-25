// Bearbeitungsschritte für die Bedienung: Gruppen verschieben, an die Wand schieben,
// Unterlage (Palette/RHM) wechseln, Abstände und Platz für neue Gurte.
// Ohne Browser, damit sie mit `npm test` geprüft werden können.

import { fussabdruck } from './modell.js';
import { HILFSMITTEL } from './daten.js';

const traeger = (lage, o) => lage.get(o.id)?.traeger ?? null;
const istHilfsmittel = (o) => o && o.typ !== 'ladung';

/**
 * Was beim Verschieben mitgeht: Steht die Ladung auf Palette/RHM, die ganze Einheit
 * ab der untersten Unterlage; steht sie auf anderer Ladung, nur sie selbst und was darauf steht.
 */
export function bewegGruppe(objekte, lage, o) {
  let wurzel = o;
  for (let t = traeger(lage, wurzel); t && istHilfsmittel(t); t = traeger(lage, wurzel)) wurzel = t;
  const ids = new Set([wurzel.id]);
  let neu = true;
  while (neu) {
    neu = false;
    for (const a of objekte) {
      const t = traeger(lage, a);
      if (t && ids.has(t.id) && !ids.has(a.id)) { ids.add(a.id); neu = true; }
    }
  }
  return { wurzel, gruppe: objekte.filter((a) => ids.has(a.id)) };
}

export function vereinigung(gruppe) {
  const fs = gruppe.map(fussabdruck);
  return { x0: Math.min(...fs.map((f) => f.x0)), x1: Math.max(...fs.map((f) => f.x1)), z0: Math.min(...fs.map((f) => f.z0)), z1: Math.max(...fs.map((f) => f.z1)) };
}

const verschiebeAlle = (gruppe, dx, dz) => { for (const a of gruppe) { a.x = runde(a.x + dx); a.z = runde(a.z + dz); } };
const runde = (v) => Math.round(v * 1000) / 1000;

/** Hindernisse vor einer Gruppe (gleiche Querlage, weiter vorne), RHM zählt nicht */
function vorDerGruppe(objekte, gruppe, u) {
  const ids = new Set(gruppe.map((a) => a.id));
  return objekte
    .filter((a) => !ids.has(a.id) && a.typ !== 'rhm')
    .map((a) => ({ a, f: fussabdruck(a) }))
    .filter(({ f }) => f.z0 < u.z1 - 1e-6 && u.z0 < f.z1 - 1e-6 && f.x0 >= u.x1 - 1e-6);
}

/** Abstand nach vorne: zur nächsten Ladung davor und zur Stirnwand (in m) */
export function abstandVorne(objekte, lage, o, flaeche) {
  const { gruppe } = bewegGruppe(objekte, lage, o);
  const u = vereinigung(gruppe);
  const stirnwand = flaeche.laenge / 2 - u.x1;
  const davor = vorDerGruppe(objekte, gruppe, u).sort((p, q) => p.f.x0 - q.f.x0)[0];
  return davor ? { abstand: davor.f.x0 - u.x1, bis: davor.a, stirnwand } : { abstand: stirnwand, bis: null, stirnwand };
}

/** Abstand der Gruppe zur linken und rechten Bordkante (negativ = Überstand) */
export function abstandSeiten(objekte, lage, o, flaeche) {
  const u = vereinigung(bewegGruppe(objekte, lage, o).gruppe);
  return { links: u.z0 + flaeche.breite / 2, rechts: flaeche.breite / 2 - u.z1, u };
}

/** Schiebt die Gruppe quer in die Mitte der Ladefläche */
export function zentriere(objekte, lage, o) {
  const { gruppe } = bewegGruppe(objekte, lage, o);
  const u = vereinigung(gruppe);
  const dz = -(u.z0 + u.z1) / 2;
  verschiebeAlle(gruppe, 0, dz);
  return dz;
}

/** Schiebt die Gruppe nach vorne bis an die Stirnwand oder an die Ladung davor */
export function anWand(objekte, lage, o, flaeche) {
  const { gruppe } = bewegGruppe(objekte, lage, o);
  const u = vereinigung(gruppe);
  const ziel = Math.min(flaeche.laenge / 2, ...vorDerGruppe(objekte, gruppe, u).map(({ f }) => f.x0));
  verschiebeAlle(gruppe, ziel - u.x1, 0);
  return ziel - u.x1;
}

// Wie weit Ladung über die Ladefläche hinausgeschoben werden kann (vorne ist die Stirnwand)
export const UEBERSTAND_MAX = { hinten: 4, seitlich: 0.5 };

/** Verschiebt die Gruppe; hinten und seitlich darf sie überstehen, vorne nicht durch die Stirnwand */
export function verschiebe(objekte, lage, o, dx, dz, flaeche) {
  const { gruppe } = bewegGruppe(objekte, lage, o);
  const u = vereinigung(gruppe);
  const L = flaeche.laenge / 2, B = flaeche.breite / 2 + UEBERSTAND_MAX.seitlich;
  const kx = Math.min(Math.max(dx, -L - UEBERSTAND_MAX.hinten - u.x0), L - u.x1);
  const kz = Math.min(Math.max(dz, Math.min(0, -B - u.z0)), Math.max(0, B - u.z1));
  verschiebeAlle(gruppe, kx, kz);
}

/** Unterlagen direkt unter einem Objekt (Palette, RHM) und ob sie nur dieses tragen */
export function unterlage(objekte, lage, o) {
  const kette = [];
  let oben = o;
  for (let t = traeger(lage, o); t && istHilfsmittel(t); t = traeger(lage, t)) {
    const last = objekte.filter((a) => traeger(lage, a)?.id === t.id);
    if (last.length !== 1 || last[0].id !== oben.id) return { art: art(kette.concat(t)), kette, geteilt: true };
    kette.push(t);
    oben = t;
  }
  const t = traeger(lage, oben);
  return { art: t?.typ === 'ladung' ? 'ladung' : art(kette), kette, geteilt: false };
}
function art(kette) {
  const p = kette.some((a) => a.typ === 'palette'), m = kette.some((a) => a.typ === 'rhm');
  return p && m ? 'palette-matte' : p ? 'palette' : m ? 'matte' : 'flaeche';
}

/**
 * Ersetzt die Unterlage eines Objekts. art: 'flaeche' | 'palette' | 'matte' | 'palette-matte'
 * @returns {boolean} false, wenn die Unterlage mit anderer Ladung geteilt ist
 */
export function setzeUnterlage(objekte, lage, o, neueArt, neueId) {
  const jetzt = unterlage(objekte, lage, o);
  if (jetzt.geteilt || jetzt.art === 'ladung') return false;
  for (const a of jetzt.kette) objekte.splice(objekte.indexOf(a), 1);
  const vorlage = (a) => HILFSMITTEL.find((h) => h.art === a);
  let oben = o;
  if (neueArt.includes('palette') && o.typ === 'ladung') {
    oben = { ...vorlage('europalette'), id: neueId('o'), x: o.x, z: o.z, drehung: o.drehung, mu: 0 };
    objekte.push(oben);
  }
  if (neueArt.includes('matte')) {
    objekte.push({ ...vorlage('rhm'), id: neueId('o'), l: oben.l, b: oben.b, x: o.x, z: o.z, drehung: oben.drehung, mu: 0 });
  }
  return true;
}

/** Freie Stelle für einen weiteren Gurt über einer Gruppe */
export function freierGurtX(gurte, u) {
  const mitte = (u.x0 + u.x1) / 2;
  for (const d of [0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9, -1.2, 1.2]) {
    const x = runde(mitte + d);
    if (x <= u.x0 + 0.05 || x >= u.x1 - 0.05) continue;
    if (!gurte.some((g) => Math.abs(g.x - x) < 0.15)) return x;
  }
  return runde(mitte);
}

/**
 * EPAL-Stellplätze auf der Ladefläche, von der Stirnwand nach hinten.
 * längs: 1,2 m in Fahrtrichtung, 3 nebeneinander; quer: 0,8 m in Fahrtrichtung, 2 nebeneinander.
 */
export function stellplaetze(flaeche, muster) {
  const L = flaeche.laenge / 2, B = flaeche.breite;
  const [lx, lz, drehung] = muster === 'quer' ? [0.8, 1.2, 90] : [1.2, 0.8, 0];
  const nebeneinander = Math.floor((B + 1e-9) / lz);
  const plaetze = [];
  for (let x1 = L, reihe = 1; x1 - lx >= -L - 1e-9; x1 -= lx, reihe++) {
    for (let i = 0; i < nebeneinander; i++) {
      const z = (i - (nebeneinander - 1) / 2) * lz;
      plaetze.push({ nr: plaetze.length + 1, reihe, x: runde(x1 - lx / 2), z: runde(z), lx, lz, drehung });
    }
  }
  return plaetze;
}

/** Ist der Stellplatz frei (keine Ladung, EPAL o. Ä. überdeckt ihn)? RHM zählt nicht. */
export function platzFrei(platz, objekte) {
  const p = { x0: platz.x - platz.lx / 2, x1: platz.x + platz.lx / 2, z0: platz.z - platz.lz / 2, z1: platz.z + platz.lz / 2 };
  return !objekte.some((o) => {
    if (o.typ === 'rhm') return false;
    const f = fussabdruck(o);
    return f.x0 < p.x1 - 0.02 && p.x0 < f.x1 - 0.02 && f.z0 < p.z1 - 0.02 && p.z0 < f.z1 - 0.02;
  });
}

/**
 * Wenn alle Stellplätze belegt sind: erster Platz, auf dem oben eine liegende EPAL liegt und noch eine
 * weitere draufpasst (Oberkante höchstens maxHoehe über der Ladefläche). Gibt { platz, y } oder null zurück.
 */
export function stapelPlatz(plaetze, objekte, lage, maxHoehe) {
  for (const p of plaetze) {
    const drauf = objekte.filter((o) => {
      if (o.typ === 'rhm') return false;
      const f = fussabdruck(o);
      return p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z < f.z1;
    });
    if (!drauf.length) continue;
    const oben = drauf.reduce((a, b) => ((lage.get(b.id)?.y ?? 0) + b.h > (lage.get(a.id)?.y ?? 0) + a.h ? b : a));
    if (oben.art !== 'europalette' || oben.hochkant) continue;
    const y = (lage.get(oben.id)?.y ?? 0) + oben.h;
    if (y + oben.h <= maxHoehe + 1e-9) return { platz: { ...p, x: oben.x, z: oben.z, drehung: oben.drehung }, y };
  }
  return null;
}
