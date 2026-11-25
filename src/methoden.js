// Prüft vor dem Anlegen, welche Sicherungsmethoden bei einer Ladeeinheit überhaupt gehen.
// Jede Methode wird probeweise angelegt und mit derselben Prüfung wie im Simulator gerechnet.
import { pruefe, ladeeinheiten, naechsterZurrpunkt, freiraum, LUFT_KOPF, PLATZ_VERTEILER } from './modell.js';
export { freiraum, LUFT_KOPF, PLATZ_VERTEILER };
import { freierGurtX } from './aktionen.js';

/** Gurte, wie sie beim Anlegen der Methode entstehen (gleiche Werte wie im Simulator) */
export function entwurf(art, einheit, zielId, gurte, flaeche) {
  const f = einheit.f, id = (n) => `_probe${n}`;
  const anschlag = Math.round(Math.min(0.5, einheit.hoehe / 2) * 100) / 100;
  if (art === 'nieder') return [{ id: id(0), x: freierGurtX(gurte, f), stf: 500, lc: 2500, zweiRatschen: false }];
  if (art === 'kopf-vorne' || art === 'kopf-hinten') return [{ id: id(0), art: 'kopf', ziel: zielId, seite: art.slice(5), abstand: 1.0, lc: 2500, stf: 500 }];
  if (art === 'diagonal' || art === 'schraeg') {
    return ['vl', 'vr', 'hl', 'hr'].map((ecke, i) => ({ id: id(i), art: 'direkt', variante: art, gruppe: '_probe', ziel: zielId, ecke, abstand: art === 'diagonal' ? 1.0 : 0, anschlag, lc: 2500, stf: 500 }));
  }
  if (art === 'frei') return [{ id: id(0), art: 'direkt', variante: 'frei', ziel: zielId, ecke: 'hl', ankerSeite: 'l', ankerX: naechsterZurrpunkt(flaeche.laenge, f.x0 - 1.0), anschlag, lc: 2500, stf: 500, abstand: 0 }];
  if (art === 'bucht') {
    const lang = f.x1 - f.x0;
    const stellen = lang >= 3 ? [f.x1 - lang * 0.25, f.x0 + lang * 0.25] : [(f.x0 + f.x1) / 2];
    return stellen.flatMap((x, j) => [['l', x + 0.1], ['r', x - 0.1]].map(([seite, xs], i) => ({ id: id(j * 2 + i), art: 'bucht', gruppe: '_probe', ziel: zielId, seite, x: Math.round(xs * 100) / 100, lc: 2500, stf: 500 })));
  }
  return [];
}

const SEITE = { vorne: 'davor', hinten: 'dahinter' };

/**
 * Welche Methoden für die Einheit mit dem Teil `zielId` gehen.
 * @returns {Record<string, { ok:boolean, grund?:string }> & { verteiler: { ok:boolean, grund?:string } }}
 */
export function methoden({ objekte, gurte }, flaeche, zielId) {
  const { einheiten, lage } = ladeeinheiten(objekte);
  const einheit = einheiten.find((e) => e.mitglieder.some((m) => m.id === zielId));
  const arten = ['nieder', 'kopf-hinten', 'kopf-vorne', 'diagonal', 'schraeg', 'frei', 'bucht'];
  if (!einheit) return { ...Object.fromEntries(arten.map((a) => [a, { ok: a === 'nieder' }])), verteiler: { ok: false } };
  const raum = { vorne: freiraum(objekte, lage, einheit, flaeche, 'vorne'), hinten: freiraum(objekte, lage, einheit, flaeche, 'hinten') };
  const zuEng = (seite) => {
    const r = raum[seite];
    if (r.abstand >= LUFT_KOPF) return null;
    return r.stirnwand ? 'steht an der Stirnwand (Formschluss)' : `${r.hindernis.name} steht direkt ${SEITE[seite]}`;
  };
  const ergebnis = {};
  for (const art of arten) {
    const kopf = art.startsWith('kopf-') ? art.slice(5) : null;
    const eng = kopf && zuEng(kopf);
    if (eng) { ergebnis[art] = { ok: false, grund: eng }; continue; }
    // probeweise anlegen und rechnen
    const neu = entwurf(art, einheit, zielId, gurte, flaeche);
    const r = pruefe({ objekte, gurte: [...gurte, ...neu], flaeche });
    const ids = new Set(neu.map((g) => g.id));
    const mangel = r.hinweise.find((h) => h.art === 'gurt-mangel' && ids.has(h.id));
    if (mangel) { ergebnis[art] = { ok: false, grund: mangel.text }; continue; }
    if (art === 'nieder') {
      const info = r.gurte.find((g) => g.id === neu[0].id);
      if (!info?.getroffen?.includes(einheit.id)) { ergebnis[art] = { ok: false, grund: 'Gurt liegt nicht auf dieser Ladung (Nachbar ist höher)' }; continue; }
    }
    ergebnis[art] = { ok: true };
  }
  // EPAL als Lastverteiler: braucht Platz vor oder hinter der Ladung (oder steht schon da)
  const platz = (s) => raum[s].verteiler || raum[s].abstand >= PLATZ_VERTEILER;
  ergebnis.verteiler = platz('vorne') || platz('hinten') ? { ok: true, vorne: platz('vorne'), hinten: platz('hinten') }
    : { ok: false, grund: 'kein Platz vor oder hinter der Ladung' };
  return ergebnis;
}
