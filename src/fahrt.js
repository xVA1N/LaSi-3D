// Fahrt-Simulation: zeigt, was mit nicht ausreichend gesicherter Ladung bei typischen Manövern passiert.
// Grundlage ist das Prüfergebnis aus modell.js: Was dort hält, bleibt liegen; was nicht hält, rutscht,
// rollt oder kippt mit dem nicht gehaltenen Anteil der Kraft, bis es anschlägt oder herunterfällt.
// Vereinfachung für die Anschauung: Hindernisse sind die anderen Einheiten an ihrem Startplatz.

import { G, BEIWERTE_STRASSE } from './berechnung.js';

export const MANOEVER = {
  bremsen: { name: 'Vollbremsung', text: '0,8 g nach vorne', phasen: [{ r: 'vorwaerts', dx: 1, dz: 0, dauer: 2.0 }] },
  kurve: { name: 'Kurve', text: '0,5 g zur Seite', phasen: [{ r: 'seitlich', dx: 0, dz: -1, dauer: 2.4 }] },
  ausweichen: { name: 'Ausweichen', text: '0,5 g links, dann rechts', phasen: [{ r: 'seitlich', dx: 0, dz: -1, dauer: 1.2 }, { r: 'seitlich', dx: 0, dz: 1, dauer: 1.4 }] },
  anfahren: { name: 'Anfahren', text: '0,5 g nach hinten', phasen: [{ r: 'rueckwaerts', dx: -1, dz: 0, dauer: 2.0 }] },
};

const ueberlapptZ = (a, b) => a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
const ueberlapptX = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6;

/** Ausgangszustand je Ladeeinheit mit den freien Wegen bis zum nächsten Hindernis */
export function startzustand(ergebnis, flaeche, lage) {
  const L = flaeche.laenge / 2;
  const einheiten = ergebnis.ergebnisse.map((e) => e.einheit);
  return ergebnis.ergebnisse.map((e) => {
    const f = e.einheit.f, andere = einheiten.filter((x) => x.id !== e.id).map((x) => x.f);
    const vor = andere.filter((o) => ueberlapptZ(o, f) && o.x0 >= f.x1 - 0.01).map((o) => o.x0 - f.x1);
    const hinter = andere.filter((o) => ueberlapptZ(o, f) && o.x1 <= f.x0 + 0.01).map((o) => f.x0 - o.x1);
    const links = andere.filter((o) => ueberlapptX(o, f) && o.z1 <= f.z0 + 0.01).map((o) => f.z0 - o.z1);
    const rechts = andere.filter((o) => ueberlapptX(o, f) && o.z0 >= f.z1 - 0.01).map((o) => o.z0 - f.z1);
    const wurzel = e.einheit.mitglieder[0];
    return {
      id: e.id, f, mu: e.einheit.mu, hoehe: e.einheit.hoehe, basisY: lage?.get(wurzel.id)?.y ?? 0,
      richtungen: e.richtungen, kippen: e.kippen, rollt: e.einheit.rollt ?? [],
      radius: e.einheit.rund ? (f.z1 - f.z0) / 2 : 0,
      frei: {
        vor: Math.max(0, Math.min(L - f.x1, ...vor)),
        hinter: hinter.length ? Math.max(0, Math.min(...hinter)) : Infinity,
        links: links.length ? Math.max(0, Math.min(...links)) : Infinity,
        rechts: rechts.length ? Math.max(0, Math.min(...rechts)) : Infinity,
      },
      x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, kipp: 0, kippV: 0, kippRichtung: null, roll: 0,
      faellt: false, angeschlagen: false,
    };
  });
}

/** Ein Zeitschritt dt (s) der Phase für alle Einheiten */
export function schritt(zustand, phase, dt, flaeche) {
  const L = flaeche.laenge / 2, B = flaeche.breite / 2, H = flaeche.hoehe ?? 1;
  const { c } = BEIWERTE_STRASSE[phase.r];
  for (const u of zustand) {
    const d = u.richtungen[phase.r];
    const haelt = d.ok || d.formschluss;
    if (!haelt && !u.faellt) {
      const mu = d.rollt ? 0 : u.mu;
      // nur der nicht gehaltene Anteil beschleunigt: bei Auslastung k bleibt 1 − 1/k übrig
      const anteil = Number.isFinite(d.auslastung) && d.auslastung > 1 ? 1 - 1 / d.auslastung : 1;
      const a = Math.max(0, c - mu) * G * anteil;
      u.vx += phase.dx * a * dt;
      u.vz += phase.dz * a * dt;
    } else if (!u.faellt) {
      const daempf = Math.exp(-6 * dt);
      u.vx *= daempf; u.vz *= daempf;
    }
    u.x += u.vx * dt; u.z += u.vz * dt;
    // Anschlag an Stirnwand oder anderer Ladung
    if (!u.faellt) {
      if (u.x > u.frei.vor) { u.x = u.frei.vor; u.vx = 0; u.angeschlagen = true; }
      if (u.x < -u.frei.hinter) { u.x = -u.frei.hinter; u.vx = 0; u.angeschlagen = true; }
      if (u.z < -u.frei.links) { u.z = -u.frei.links; u.vz = 0; u.angeschlagen = true; }
      if (u.z > u.frei.rechts) { u.z = u.frei.rechts; u.vz = 0; u.angeschlagen = true; }
    }
    // Rollen um die eigene Achse
    if (u.radius > 0 && d.rollt) u.roll += ((phase.dz ? u.vz : u.vx) * dt) / u.radius;
    // Schwerpunkt neben der Fläche: fällt herunter
    const mx = (u.f.x0 + u.f.x1) / 2 + u.x, mz = (u.f.z0 + u.f.z1) / 2 + u.z;
    if (!u.faellt && (mx < -L || Math.abs(mz) > B)) { u.faellt = true; u.kippRichtung ??= mz > B ? 'rechts' : mz < -B ? 'links' : 'hinten'; }
    if (u.faellt) {
      u.vy -= G * dt;
      u.y = Math.max(u.y + u.vy * dt, -(H + u.basisY) + 0.02);
      u.kippV += 6 * dt;
    }
    // Kippen um die Unterkante in Richtung der Kraft
    const kippt = phase.r === 'seitlich' ? !u.kippen.seitlich.ok : !u.kippen.laengs.ok && !d.formschluss;
    if (kippt && !u.faellt) {
      u.kippRichtung ??= phase.dz < 0 ? 'links' : phase.dz > 0 ? 'rechts' : phase.dx > 0 ? 'vorne' : 'hinten';
      u.kippV += 5 * dt;
    }
    if (u.kippRichtung) u.kipp = Math.min(Math.PI / 2, u.kipp + u.kippV * dt);
  }
}

/** Was ist passiert? Je Einheit eine kurze Beschreibung, leer wenn sie gehalten hat */
export function auswertung(zustand) {
  return zustand.map((u) => {
    const weg = Math.hypot(u.x, u.z);
    const was = [];
    if (u.faellt) was.push('fällt herunter');
    else if (u.kipp > 0.5) was.push('kippt um');
    if (!u.faellt && weg > 0.05) was.push(`${u.radius > 0 && Math.abs(u.roll) > 0.3 ? 'rollt' : 'rutscht'} ${weg.toLocaleString('de-DE', { maximumFractionDigits: 1 })} m${u.angeschlagen ? ' und schlägt an' : ''}`);
    return { id: u.id, was };
  });
}
