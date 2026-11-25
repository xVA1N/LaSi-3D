// Einzelne Rechner nach EN 12195-1 (ohne Browser, mit `npm test` geprüft).
import { G, BEIWERTE_STRASSE } from './berechnung.js';
import { F_MU_DIREKT } from './modell.js';

const RICHTUNGEN = ['vorwaerts', 'rueckwaerts', 'seitlich'];
const rad = (grad) => (grad * Math.PI) / 180;

/** Kraft, die je Richtung zusätzlich zur Reibung gesichert werden muss: (c − μ·c_z)·m·g, in daN */
export function sicherungskraft({ masse, mu }) {
  const e = {};
  for (const r of RICHTUNGEN) {
    const { c, cz } = BEIWERTE_STRASSE[r];
    e[r] = { c, traegheit: (c * masse * G) / 10, reibung: (mu * cz * masse * G) / 10, kraft: (Math.max(0, c - mu * cz) * masse * G) / 10 };
  }
  return e;
}

/**
 * Diagonalzurren mit 4 Gurten: je Richtung wirken 2 Gurte.
 * LC ≥ m·g·(c − μ·f_μ·c_z) / (2·(cos α·cos β + μ·f_μ·sin α)); seitlich mit sin β statt cos β.
 * α: Winkel zur Ladefläche, β: Winkel zur Längsachse (in der Draufsicht), Grad. LC in daN.
 */
export function diagonalzurren({ masse, mu, alpha, beta, lc }) {
  const a = rad(alpha), b = rad(beta), muF = mu * F_MU_DIREKT;
  const e = {};
  for (const r of RICHTUNGEN) {
    const { c, cz } = BEIWERTE_STRASSE[r];
    const horiz = Math.cos(a) * (r === 'seitlich' ? Math.sin(b) : Math.cos(b));
    const wirkung = horiz + muF * Math.sin(a);
    const brauch = Math.max(0, (c - muF * cz) * masse * G) / 10;
    const lcNoetig = wirkung > 0 ? brauch / (2 * wirkung) : Infinity;
    e[r] = { lcNoetig, ok: lcNoetig <= lc + 1e-9, kraft: brauch };
  }
  const lcNoetig = Math.max(...RICHTUNGEN.map((r) => e[r].lcNoetig));
  return { ...e, lcNoetig, ok: lcNoetig <= lc + 1e-9, massgebend: RICHTUNGEN.find((r) => e[r].lcNoetig === lcNoetig) };
}

/**
 * Kippen: kippsicher, wenn c·h_S ≤ c_z·b (b = Abstand Schwerpunkt bis Kippkante).
 * Gibt je Richtung das Verhältnis b/h_S und den nötigen Wert c zurück.
 */
export function kippen({ schwerpunktHoehe, breite, laenge }) {
  const e = {};
  for (const [r, c, b] of [['vorwaerts', BEIWERTE_STRASSE.vorwaerts.c, laenge / 2], ['rueckwaerts', BEIWERTE_STRASSE.rueckwaerts.c, laenge / 2], ['seitlich', BEIWERTE_STRASSE.seitlichKippen.c, breite / 2]]) {
    e[r] = { c, verhaeltnis: b / schwerpunktHoehe, kippsicher: c * schwerpunktHoehe <= b + 1e-9 };
  }
  return e;
}

/**
 * Belastungswinkel an Schäkel/Anschlagpunkt: Grundwert WLL (als Zurrmittel 2 × WLL),
 * abgemindert nach Abweichung θ von der Achse: bis 5° 100 %, bis 45° 70 %, bis 90° 50 %.
 */
export function belastungswinkel({ wll, zurr = true, theta }) {
  const grund = zurr ? 2 * wll : wll;
  const faktor = theta <= 5 ? 1 : theta <= 45 ? 0.7 : 0.5;
  return { grund, faktor, zulaessig: grund * faktor };
}
