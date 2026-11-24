// Berechnungen zur Ladungssicherung nach dem Vorgehen der EN 12195-1:2010.
// Reine Funktionen ohne Browser, damit sie mit `npm test` geprüft werden können.

export const G = 9.81; // Erdbeschleunigung in m/s²

// Beschleunigungsbeiwerte für den Straßenverkehr (EN 12195-1, Tabelle 2)
export const BEIWERTE_STRASSE = {
  vorwaerts: { c: 0.8, cz: 1.0 },
  rueckwaerts: { c: 0.5, cz: 1.0 },
  seitlich: { c: 0.5, cz: 1.0 },
  seitlichKippen: { c: 0.6, cz: 1.0 },
};

// Sicherheitsbeiwert f_s beim Niederzurren
export const SICHERHEIT_NIEDERZURREN = { vorwaerts: 1.25, rueckwaerts: 1.1, seitlich: 1.1 };

// Faktor k: 2 bei Spannelement auf beiden Seiten bzw. Messung auf beiden Seiten, sonst 1,5
export const K_FAKTOR = { einSpannelement: 1.5, zweiSpannelemente: 2.0 };

const RICHTUNGEN = ['vorwaerts', 'rueckwaerts', 'seitlich'];

/**
 * Zurrwinkel α zwischen Gurt und Ladefläche beim Niederzurren quer über die Ladung.
 * @param {number} ladungHoehe Höhe der Ladung in m
 * @param {number} ladungBreite Breite der Ladung in m
 * @param {number} flaecheBreite Breite der Ladefläche (Abstand der Zurrpunkte) in m
 * @returns {number} Winkel in Grad (90° = senkrecht)
 */
export function zurrwinkel(ladungHoehe, ladungBreite, flaecheBreite) {
  const seitlicherAbstand = Math.max((flaecheBreite - ladungBreite) / 2, 0);
  if (seitlicherAbstand === 0) return 90;
  return (Math.atan2(ladungHoehe, seitlicherAbstand) * 180) / Math.PI;
}

/**
 * Niederzurren (Reibungszurren): Anzahl der nötigen Gurte je Richtung.
 * n ≥ (c − μ·c_z) · m · g / (k · μ · sin α · F_T) · f_s
 * @param {object} p
 * @param {number} p.masse Masse der Ladung in kg
 * @param {number} p.mu Gleitreibbeiwert μ der Paarung Ladung/Ladefläche
 * @param {number} p.winkel Zurrwinkel α in Grad
 * @param {number} p.stf Vorspannkraft S_TF eines Gurts in daN (Etikett)
 * @param {number} [p.k] Faktor k (1,5 oder 2)
 */
export function niederzurren({ masse, mu, winkel, stf, k = K_FAKTOR.einSpannelement }) {
  pruefePositiv({ masse, winkel, stf, k });
  if (!(mu >= 0)) throw new RangeError('mu muss ≥ 0 sein');
  const fT = stf * 10; // daN → N
  const sinA = Math.sin((winkel * Math.PI) / 180);
  const ergebnis = {};
  for (const r of RICHTUNGEN) {
    const { c, cz } = BEIWERTE_STRASSE[r];
    const restkraft = (c - mu * cz) * masse * G; // nicht durch Reibung gehaltene Kraft in N
    const proGurt = k * mu * sinA * fT; // zusätzliche Reibkraft je Gurt in N
    let n;
    if (restkraft <= 0) n = 0;
    else if (proGurt <= 0) n = Infinity; // ohne Reibung kann Niederzurren nicht sichern
    else n = Math.ceil(((restkraft / proGurt) * SICHERHEIT_NIEDERZURREN[r]) - 1e-9);
    ergebnis[r] = { anzahl: n, restkraft, proGurt };
  }
  const anzahl = Math.max(...RICHTUNGEN.map((r) => ergebnis[r].anzahl));
  const massgebend = RICHTUNGEN.find((r) => ergebnis[r].anzahl === anzahl);
  return { ...ergebnis, anzahl, massgebend };
}

/**
 * Kippen: Ladung ist standsicher, wenn c · h_S ≤ c_z · b_S
 * (h_S Höhe des Schwerpunkts, b_S Abstand Schwerpunkt bis Kippkante).
 * @returns {{ seitlich: boolean, vorwaerts: boolean, rueckwaerts: boolean }} true = kippt nicht
 */
export function kippsicher({ hoehe, breite, laenge, schwerpunktHoehe = hoehe / 2 }) {
  pruefePositiv({ hoehe, breite, laenge, schwerpunktHoehe });
  const steht = (c, abstand) => c * schwerpunktHoehe <= 1.0 * abstand;
  return {
    seitlich: steht(BEIWERTE_STRASSE.seitlichKippen.c, breite / 2),
    vorwaerts: steht(BEIWERTE_STRASSE.vorwaerts.c, laenge / 2),
    rueckwaerts: steht(BEIWERTE_STRASSE.rueckwaerts.c, laenge / 2),
  };
}

function pruefePositiv(werte) {
  for (const [name, wert] of Object.entries(werte)) {
    if (!(wert > 0) || !Number.isFinite(wert)) throw new RangeError(`${name} muss eine positive Zahl sein`);
  }
}
