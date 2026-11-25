// Startseite: Simulator „Ladungssicherung 3D“ oder einzelne Rechner. Adressen: #3d, #rechner/<id>
import { niederzurren, zurrwinkel, K_FAKTOR } from './berechnung.js';
import { sicherungskraft, diagonalzurren, kippen, belastungswinkel } from './rechner.js';
import { REIBWERTE, MU_RHM } from './modell.js';
import { MATERIALIEN } from './daten.js';

const $ = (id) => document.getElementById(id);
const zahl = (v, nk = 0) => (Number.isFinite(v) ? v.toLocaleString('de-DE', { minimumFractionDigits: nk, maximumFractionDigits: nk }) : '–');
const RICHTUNG = { vorwaerts: 'nach vorne', rueckwaerts: 'nach hinten', seitlich: 'zur Seite' };

// Reibpaarungen zur Auswahl (Richtwerte), dazu eigener Wert
const PAARUNGEN = [
  ...Object.entries(REIBWERTE).map(([k, w]) => [String(w.boden), `${MATERIALIEN[k]} auf Ladefläche (μ ${zahl(w.boden, 2)})`]),
  [String(MU_RHM), `Mit RHM (μ ${zahl(MU_RHM, 2)})`],
  ['eigen', 'Eigener Wert …'],
];


// Skizze für den Kipp-Rechner: welche Maße gemeint sind
const KIPP_BILD = `<figure class="skizze">
<svg viewBox="0 0 345 190" role="img" aria-label="Beispiel: Schwerpunkthöhe, Breite und Länge der Ladung">
  <defs><marker id="pf" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>
  <g class="t"><text x="85" y="14" text-anchor="middle">Von der Seite</text><text x="255" y="14" text-anchor="middle">Von hinten</text></g>
  <!-- Seitenansicht: Länge -->
  <line class="boden" x1="10" y1="150" x2="165" y2="150"/>
  <rect class="last" x="40" y="40" width="90" height="110"/>
  <path class="fahrt" d="M120 28 h35" marker-end="url(#pf)"/><text class="k" x="138" y="24" text-anchor="middle">Fahrt</text>
  <circle class="sp" cx="85" cy="95" r="6"/><path class="sp-k" d="M85 89v12M79 95h12"/>
  <line class="mass" x1="22" y1="150" x2="22" y2="95" marker-start="url(#pf)" marker-end="url(#pf)"/>
  <line class="hilfs" x1="22" y1="95" x2="79" y2="95"/>
  <text class="m" x="17" y="127" text-anchor="end">h<tspan class="klein" dy="3">S</tspan></text>
  <line class="mass" x1="40" y1="170" x2="130" y2="170" marker-start="url(#pf)" marker-end="url(#pf)"/>
  <text class="m" x="85" y="184" text-anchor="middle">Länge</text>
  <circle class="kante" cx="130" cy="150" r="3.5"/>
  <!-- Rückansicht: Breite -->
  <line class="boden" x1="185" y1="150" x2="330" y2="150"/>
  <rect class="last" x="225" y="40" width="60" height="110"/>
  <circle class="sp" cx="255" cy="95" r="6"/><path class="sp-k" d="M255 89v12M249 95h12"/>
  <line class="mass" x1="225" y1="170" x2="285" y2="170" marker-start="url(#pf)" marker-end="url(#pf)"/>
  <text class="m" x="255" y="184" text-anchor="middle">Breite</text>
  <line class="mass" x1="255" y1="124" x2="285" y2="124" marker-start="url(#pf)" marker-end="url(#pf)"/>
  <text class="m klein" x="270" y="119" text-anchor="middle">b/2</text>
  <line class="hilfs" x1="255" y1="101" x2="255" y2="150"/>
  <circle class="kante" cx="285" cy="150" r="3.5"/><circle class="kante" cx="225" cy="150" r="3.5"/>
  <text class="k" x="290" y="143">Kippkante</text>
</svg>
<figcaption>Beispiel Gitterbox: Länge 1,24 m, Breite 0,835 m, Höhe 0,97 m. Schwerpunkt bei gleichmäßiger Füllung in halber Höhe, also h<sub>S</sub> ≈ 0,49 m (bei Palette darunter: Palettenhöhe dazurechnen). Gekippt wird um die Unterkante (<b class="schlecht">●</b>); maßgebend ist der Abstand Schwerpunkt bis Kippkante, bei mittigem Schwerpunkt halbe Breite bzw. halbe Länge.</figcaption>
</figure>`;

// ---------- Formeln schön darstellen ----------
const v = (x, i) => `<i>${x}</i>${i ? `<sub>${i}</sub>` : ''}`;
const br = (o, u) => `<span class="bruch"><span>${o}</span><span>${u}</span></span>`;
const BEIWERT = { vorwaerts: [0.8, 1.25], rueckwaerts: [0.5, 1.1], seitlich: [0.5, 1.1] };
const pfeil = (x1, x2, y, klasse, text, unten = false) => `<line class="${klasse}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-end="url(#pf-${klasse})"/><text class="${klasse}" x="${(x1 + x2) / 2}" y="${unten ? y + 16 : y - 7}" text-anchor="middle">${text}</text>`;
const marker = (k) => `<marker id="pf-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="${k}-spitze"/></marker>`;
const MARKER = `<defs>${['traeg', 'reib', 'sich', 'gurt', 'dunkel'].map(marker).join('')}</defs>`;

// Kräfte an der Ladung (Seitenansicht): Trägheit nach vorne, Reibung dagegen, Rest muss gesichert werden
function kraftBild(traeg, reib, rest) {
  const max = Math.max(traeg, 1), skala = (f) => 10 + (f / max) * 110;
  return `<svg class="bild" viewBox="0 0 340 165" role="img" aria-label="Kräfte an der Ladung">${MARKER}
    <line class="boden" x1="20" y1="120" x2="320" y2="120"/>
    <rect class="last" x="120" y="50" width="100" height="70" rx="3"/>
    <text class="in" x="170" y="90" text-anchor="middle">m</text>
    <text class="k" x="300" y="20" text-anchor="end">Fahrtrichtung →</text>
    ${pfeil(170, 170 + skala(traeg), 40, 'traeg', `Trägheit ${zahl(traeg, 0)} daN`)}
    ${pfeil(200, 200 - skala(reib), 138, 'reib', `Reibung ${zahl(reib, 0)} daN`, true)}
    ${rest > 0 ? pfeil(220 + 30 + skala(rest), 222, 85, 'sich', `sichern ${zahl(rest, 0)}`) : '<text class="gut-t" x="285" y="88" text-anchor="middle">Reibung reicht</text>'}
  </svg>`;
}
// Niederzurren (von hinten): Gurt über die Ladung, Winkel α, Vorspannkraft F_T
function niederBild(winkel) {
  const a = (Math.min(Math.max(winkel, 15), 89) * Math.PI) / 180;
  const top = 45, boden = 125, dx = (boden - top) / Math.tan(a);
  const xl = 120, xr = 220;
  return `<svg class="bild" viewBox="0 0 340 150" role="img" aria-label="Niederzurren von hinten">${MARKER}
    <line class="boden" x1="20" y1="${boden}" x2="320" y2="${boden}"/>
    <rect class="last" x="${xl}" y="${top}" width="${xr - xl}" height="${boden - top}" rx="3"/>
    <polyline class="gurt" points="${xl - dx},${boden} ${xl},${top} ${xr},${top} ${xr + dx},${boden}"/>
    <path class="winkel" d="M${xr + dx - 26} ${boden} A26 26 0 0 0 ${xr + dx - 26 * Math.cos(a)} ${boden - 26 * Math.sin(a)}"/>
    <text class="m" x="${xr + dx - 34}" y="${boden - 8}" text-anchor="end">α</text>
    <line class="gurt-pf" x1="${xr + dx * 0.35}" y1="${top + (boden - top) * 0.35}" x2="${xr + dx * 0.75}" y2="${top + (boden - top) * 0.75}" marker-end="url(#pf-gurt)"/>
    <text class="gurt-t" x="${xr + dx * 0.55 + 10}" y="${top + (boden - top) * 0.55}">F<tspan dy="3" font-size="9">T</tspan></text>
    <text class="in" x="170" y="${top + 45}" text-anchor="middle">m</text>
    <text class="k" x="170" y="20" text-anchor="middle">Ansicht von hinten · Gurt drückt die Ladung an</text>
  </svg>`;
}
// Diagonalzurren: von der Seite α, von oben β
function diagonalBild(alpha, beta) {
  const a = (alpha * Math.PI) / 180, b = (beta * Math.PI) / 180;
  const ax = 30, ay = 120, lx = ax + 60 * Math.cos(a), ly = ay - 60 * Math.sin(a);
  const ox = 215, oy = 120, ex = ox + 70 * Math.cos(b), ey = oy - 70 * Math.sin(b);
  return `<svg class="bild" viewBox="0 0 340 150" role="img" aria-label="Winkel beim Diagonalzurren">
    <text class="t" x="70" y="18" text-anchor="middle">Von der Seite</text><text class="t" x="255" y="18" text-anchor="middle">Von oben</text>
    <line class="boden" x1="15" y1="${ay}" x2="150" y2="${ay}"/>
    <rect class="last" x="${lx}" y="${ly - 25}" width="45" height="${ay - ly + 25}" rx="3"/>
    <line class="gurt" x1="${ax}" y1="${ay}" x2="${lx}" y2="${ly}"/><circle class="anker" cx="${ax}" cy="${ay}" r="4"/>
    <path class="winkel" d="M${ax + 28} ${ay} A28 28 0 0 0 ${ax + 28 * Math.cos(a)} ${ay - 28 * Math.sin(a)}"/>
    <text class="m" x="${ax + 34}" y="${ay - 6}">α</text>
    <line class="achse" x1="${ox - 10}" y1="${oy}" x2="${ox + 115}" y2="${oy}"/><text class="k" x="${ox + 115}" y="${oy + 14}" text-anchor="end">Längsachse</text>
    <rect class="last" x="${ex}" y="${ey - 45}" width="45" height="45" rx="3"/>
    <line class="gurt" x1="${ox}" y1="${oy}" x2="${ex}" y2="${ey}"/><circle class="anker" cx="${ox}" cy="${oy}" r="4"/>
    <path class="winkel" d="M${ox + 30} ${oy} A30 30 0 0 0 ${ox + 30 * Math.cos(b)} ${oy - 30 * Math.sin(b)}"/>
    <text class="m" x="${ox + 36}" y="${oy - 6}">β</text>
  </svg>`;
}

// Fächer für den Belastungswinkel: 0° grün 100 %, bis 45° gelb 70 %, bis 90° orange 50 %
function winkelBild(theta, wll) {
  const cx = 170, cy = 40, r = 105, pkt = (g) => [cx - r * Math.sin((g * Math.PI) / 180), cy + r * Math.cos((g * Math.PI) / 180)];
  const sektor = (a, b, klasse) => { const [x1, y1] = pkt(a), [x2, y2] = pkt(b); return `<path class="${klasse}" d="M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}Z"/>`; };
  const [px, py] = pkt(Math.min(Math.max(theta, 0), 90));
  return `<svg class="bild" viewBox="0 0 340 160" role="img" aria-label="Belastungswinkel">${MARKER}
    ${sektor(45, 90, 'f50')}${sektor(5, 45, 'f70')}${sektor(0, 5, 'f100')}
    <circle cx="${cx}" cy="${cy}" r="9" class="oese"/>
    <line class="zug" x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" marker-end="url(#pf-dunkel)"/>
    <text class="m" x="${cx + 6}" y="${cy + r + 14}">0° · 100 %</text>
    <text class="m" x="${pkt(45)[0] - 4}" y="${pkt(45)[1] + 14}" text-anchor="end">45° · 70 %</text>
    <text class="m" x="${pkt(90)[0]}" y="${cy - 8}">90° · 50 %</text>
    <text class="k" x="330" y="20" text-anchor="end">Achse des Schäkels nach unten</text>
  </svg>`;
}
const weg = (bild, formel, schritte, hinweis = '') => `<section class="rechenweg"><h2>So wird gerechnet</h2>${bild}
  <div class="formel">${formel}</div>
  <h3>Mit deinen Werten</h3>${schritte.map((x) => `<div class="formel klein">${x}</div>`).join('')}
  ${hinweis ? `<p class="hinweis">${hinweis}</p>` : ''}</section>`;

const RECHNER = [
  {
    id: 'niederzurren', titel: 'Niederzurren', symbol: '⇵', kurz: 'Wie viele Gurte über die Ladung?',
    felder: [
      ['masse', 'Masse der Ladung', 1000, 'kg', 50],
      ['paarung', 'Reibpaarung', String(REIBWERTE.holz.boden), PAARUNGEN],
      ['mu', 'Eigener Reibbeiwert μ', 0.4, '', 0.05, (w) => w.paarung === 'eigen'],
      ['winkelArt', 'Zurrwinkel α', 'wert', [['wert', 'Winkel eingeben'], ['mass', 'Aus Maßen berechnen']]],
      ['winkel', 'Zurrwinkel α', 80, '°', 1, (w) => w.winkelArt === 'wert'],
      ['hoehe', 'Höhe der Ladung', 1.0, 'm', 0.05, (w) => w.winkelArt === 'mass'],
      ['breite', 'Breite der Ladung', 1.2, 'm', 0.05, (w) => w.winkelArt === 'mass'],
      ['flaeche', 'Abstand der Zurrpunkte (Ladeflächenbreite)', 2.48, 'm', 0.01, (w) => w.winkelArt === 'mass'],
      ['stf', 'Vorspannkraft S_TF je Gurt (Etikett)', 500, 'daN', 50],
      ['k', 'Ratschen', String(K_FAKTOR.einSpannelement), [[String(K_FAKTOR.einSpannelement), 'Eine Ratsche (k = 1,5)'], [String(K_FAKTOR.zweiSpannelemente), 'Zwei Ratschen (k = 2)']]],
    ],
    rechne(w) {
      const mu = w.paarung === 'eigen' ? w.mu : Number(w.paarung);
      const winkel = w.winkelArt === 'mass' ? zurrwinkel(w.hoehe, w.breite, w.flaeche) : w.winkel;
      const r = niederzurren({ masse: w.masse, mu, winkel, stf: w.stf, k: Number(w.k) });
      const zeilen = ['vorwaerts', 'rueckwaerts', 'seitlich'].map((x) => [RICHTUNG[x], r[x].anzahl === Infinity ? 'nicht möglich' : `${r[x].anzahl} ${r[x].anzahl === 1 ? 'Gurt' : 'Gurte'}`, x === r.massgebend]);
      return {
        haupt: r.anzahl === Infinity ? 'Niederzurren nicht möglich (μ = 0)' : `${r.anzahl} ${r.anzahl === 1 ? 'Gurt' : 'Gurte'} nötig`,
        ok: Number.isFinite(r.anzahl), zeilen,
        weg: (() => {
          const m = r.massgebend, [c, fs] = BEIWERT[m], mg = (w.masse * 9.81) / 10;
          const roh = Number.isFinite(r.anzahl) ? ((c - mu) * mg) / (Number(w.k) * mu * Math.sin((winkel * Math.PI) / 180) * w.stf) * fs : Infinity;
          return weg(niederBild(winkel),
            `${v('n')} ≥ ${br(`(${v('c')} − ${v('μ')}·${v('c', 'z')}) · ${v('m')} · ${v('g')}`, `${v('k')} · ${v('μ')} · sin ${v('α')} · ${v('F', 'T')}`)} · ${v('f', 's')}`,
            [`${v('m')} · ${v('g')} = ${zahl(w.masse, 0)} kg · 9,81 m/s² = <b>${zahl(mg, 0)} daN</b>`,
              `${v('n')} ≥ ${br(`(${zahl(c, 1)} − ${zahl(mu, 2)}) · ${zahl(mg, 0)} daN`, `${zahl(Number(w.k), 1)} · ${zahl(mu, 2)} · sin ${zahl(winkel, 0)}° · ${zahl(w.stf, 0)} daN`)} · ${zahl(fs, 2)}<br>= ${zahl(roh, 2)} → aufgerundet <b>${Number.isFinite(r.anzahl) ? `${r.anzahl} ${r.anzahl === 1 ? 'Gurt' : 'Gurte'}` : '–'}</b>`],
            `Gerechnet ${RICHTUNG[m]} (maßgebend). ${v('c')}: Beschleunigungsbeiwert, ${v('c', 'z')} = 1, ${v('k')}: 1,5 bei einer Ratsche, 2 bei zwei. ${v('f', 's')} = 1,25 nach vorne, sonst 1,1.`);
        })(),
      };
    },
  },
  {
    id: 'direktzurren', titel: 'Diagonalzurren', symbol: '⤡', kurz: 'Reicht die Zurrkraft LC von 4 Gurten?',
    felder: [
      ['masse', 'Masse der Ladung', 5000, 'kg', 100],
      ['paarung', 'Reibpaarung', String(REIBWERTE.holz.boden), PAARUNGEN],
      ['mu', 'Eigener Reibbeiwert μ', 0.4, '', 0.05, (w) => w.paarung === 'eigen'],
      ['alpha', 'Winkel α zur Ladefläche', 40, '°', 1],
      ['beta', 'Winkel β zur Längsachse (Draufsicht)', 35, '°', 1],
      ['lc', 'Zurrkraft LC je Gurt', 2500, 'daN', 100],
    ],
    rechne(w) {
      const mu = w.paarung === 'eigen' ? w.mu : Number(w.paarung);
      const r = diagonalzurren({ masse: w.masse, mu, alpha: w.alpha, beta: w.beta, lc: w.lc });
      return {
        haupt: r.ok ? `Gesichert: mindestens LC ${zahl(r.lcNoetig, 0)} daN nötig` : `Nicht gesichert: LC ${zahl(r.lcNoetig, 0)} daN je Gurt nötig`,
        ok: r.ok,
        zeilen: ['vorwaerts', 'rueckwaerts', 'seitlich'].map((x) => [RICHTUNG[x], `LC ≥ ${zahl(r[x].lcNoetig, 0)} daN`, x === r.massgebend]),
        weg: (() => {
          const m = r.massgebend, c = BEIWERT[m][0], mg = (w.masse * 9.81) / 10, seit = m === 'seitlich';
          return weg(diagonalBild(w.alpha, w.beta),
            `${v('LC')} ≥ ${br(`${v('m')} · ${v('g')} · (${v('c')} − ${v('μ')}·${v('f', 'μ')}·${v('c', 'z')})`, `2 · (cos ${v('α')} · ${seit ? 'sin' : 'cos'} ${v('β')} + ${v('μ')}·${v('f', 'μ')}·sin ${v('α')})`)}`,
            [`${v('m')} · ${v('g')} = ${zahl(w.masse, 0)} kg · 9,81 m/s² = <b>${zahl(mg, 0)} daN</b>`,
              `${v('LC')} ≥ ${br(`${zahl(mg, 0)} daN · (${zahl(c, 1)} − ${zahl(mu, 2)}·0,75)`, `2 · (cos ${zahl(w.alpha, 0)}° · ${seit ? 'sin' : 'cos'} ${zahl(w.beta, 0)}° + ${zahl(mu, 2)}·0,75·sin ${zahl(w.alpha, 0)}°)`)}<br>= <b>${zahl(r.lcNoetig, 0)} daN</b>`,
              `Vorhanden: ${zahl(w.lc, 0)} daN je Gurt → <b class="${r.ok ? 'gut' : 'schlecht'}">${r.ok ? 'reicht' : 'reicht nicht'}</b>`],
            `Gerechnet ${RICHTUNG[m]} (maßgebend). Je Richtung wirken 2 der 4 Gurte. ${v('f', 'μ')} = 0,75. Zur Seite zählt sin ${v('β')} statt cos ${v('β')}.`);
        })(),
      };
    },
  },
  {
    id: 'kraft', titel: 'Sicherungskraft', symbol: '→', kurz: 'Welche Kraft muss gesichert werden?',
    felder: [
      ['masse', 'Masse der Ladung', 1000, 'kg', 50],
      ['paarung', 'Reibpaarung', String(REIBWERTE.holz.boden), PAARUNGEN],
      ['mu', 'Eigener Reibbeiwert μ', 0.4, '', 0.05, (w) => w.paarung === 'eigen'],
    ],
    rechne(w) {
      const mu = w.paarung === 'eigen' ? w.mu : Number(w.paarung);
      const r = sicherungskraft({ masse: w.masse, mu });
      return {
        haupt: `${zahl(r.vorwaerts.kraft, 0)} daN nach vorne sichern`,
        ok: true,
        zeilen: ['vorwaerts', 'rueckwaerts', 'seitlich'].map((x) => [`${RICHTUNG[x]} (c = ${zahl(r[x].c, 1)})`, `${zahl(r[x].kraft, 0)} daN`, false]),
        weg: weg(kraftBild(r.vorwaerts.traegheit, r.vorwaerts.reibung, r.vorwaerts.kraft),
          `${v('F')} = (${v('c')} − ${v('μ')} · ${v('c', 'z')}) · ${v('m')} · ${v('g')}`,
          [`${v('m')} · ${v('g')} = ${zahl(w.masse, 0)} kg · 9,81 m/s² = <b>${zahl((w.masse * 9.81) / 10, 0)} daN</b>`,
            ...['vorwaerts', 'rueckwaerts', 'seitlich'].map((x) => `${RICHTUNG[x]}: (${zahl(r[x].c, 1)} − ${zahl(mu, 2)}) · ${zahl((w.masse * 9.81) / 10, 0)} daN = <b>${r[x].kraft > 0 ? `${zahl(r[x].kraft, 0)} daN` : '0 (Reibung reicht)'}</b>`)],
          `Trägheit ${v('c')}·${v('m')}·${v('g')} schiebt die Ladung, Reibung ${v('μ')}·${v('m')}·${v('g')} hält dagegen, ${v('c', 'z')} = 1. Nach vorne kann die Stirnwand helfen (EN 12642 Code L: bis 5000 daN).`),
      };
    },
  },
  {
    id: 'kippen', titel: 'Kippen', symbol: '⟲', kurz: 'Kippt die Ladung bei Bremsen oder Kurve?', bild: KIPP_BILD, beispiel: { schwerpunktHoehe: 0.49, breite: 0.835, laenge: 1.24 },
    felder: [
      ['schwerpunktHoehe', 'Höhe des Schwerpunkts', 0.8, 'm', 0.05],
      ['breite', 'Breite der Ladung (quer)', 0.8, 'm', 0.05],
      ['laenge', 'Länge der Ladung (in Fahrtrichtung)', 1.2, 'm', 0.05],
    ],
    rechne(w) {
      const r = kippen(w);
      const alle = Object.values(r).every((x) => x.kippsicher);
      return {
        haupt: alle ? 'Kippsicher in alle Richtungen' : 'Kippgefahr: zusätzlich gegen Kippen sichern',
        ok: alle,
        zeilen: ['vorwaerts', 'rueckwaerts', 'seitlich'].map((x) => [`${RICHTUNG[x]} (c = ${zahl(r[x].c, 1)})`, r[x].kippsicher ? 'kippt nicht' : 'kippt', !r[x].kippsicher]),
        weg: weg('', `${v('c')} · ${v('h', 'S')} ≤ ${v('c', 'z')} · ${v('b')}`,
          ['vorwaerts', 'rueckwaerts', 'seitlich'].map((x) => {
            const b = x === 'seitlich' ? w.breite / 2 : w.laenge / 2, l = r[x].c * w.schwerpunktHoehe;
            return `${RICHTUNG[x]}: ${zahl(r[x].c, 1)} · ${zahl(w.schwerpunktHoehe, 2)} m = ${zahl(l, 2)} m ${r[x].kippsicher ? '≤' : '>'} ${zahl(b, 2)} m → <b class="${r[x].kippsicher ? 'gut' : 'schlecht'}">${r[x].kippsicher ? 'kippt nicht' : 'kippt'}</b>`;
          }),
          `${v('b')}: Abstand Schwerpunkt bis Kippkante (halbe Breite bzw. halbe Länge), ${v('c', 'z')} = 1. Zur Seite gilt ${v('c')} = 0,6.`),
      };
    },
  },
  {
    id: 'winkel', titel: 'Belastungswinkel', symbol: '∠', kurz: 'Was hält ein Schäkel oder Anschlagpunkt schräg belastet?',
    felder: [
      ['wll', 'Tragfähigkeit WLL (Prägung)', 9.5, 't', 0.5],
      ['verwendung', 'Verwendung', 'zurr', [['zurr', 'Als Zurrmittel (LC = 2 × WLL)'], ['anschlag', 'Als Anschlagmittel (WLL)']]],
      ['theta', 'Belastungswinkel θ (Abweichung von der Achse)', 30, '°', 5],
    ],
    rechne(w) {
      const r = belastungswinkel({ wll: w.wll, zurr: w.verwendung === 'zurr', theta: w.theta });
      return {
        haupt: `${zahl(r.zulaessig, 1)} t zulässig (${Math.round(r.faktor * 100)} %)`,
        ok: true,
        zeilen: [['0° (in Achsrichtung)', `${zahl(r.grund, 1)} t · 100 %`, r.faktor === 1], ['bis 45°', `${zahl(r.grund * 0.7, 1)} t · 70 %`, r.faktor === 0.7], ['bis 90°', `${zahl(r.grund * 0.5, 1)} t · 50 %`, r.faktor === 0.5]],
        weg: weg(winkelBild(w.theta, w.wll),
          `${v('F', 'zul')} = ${w.verwendung === 'zurr' ? `2 · ${v('WLL')}` : v('WLL')} · ${v('f', 'θ')}`,
          [`${w.verwendung === 'zurr' ? `2 · ${zahl(w.wll, 1)} t = <b>${zahl(r.grund, 1)} t</b> (Zurrmittel)` : `${v('WLL')} = <b>${zahl(r.grund, 1)} t</b>`}`,
            `θ = ${zahl(w.theta, 0)}° → ${v('f', 'θ')} = ${zahl(r.faktor, 1)} → ${zahl(r.grund, 1)} t · ${zahl(r.faktor, 1)} = <b>${zahl(r.zulaessig, 1)} t</b>`],
          'Als Zurrmittel darf die doppelte WLL angesetzt werden (LC = 2 × WLL). Weicht die Zugrichtung von der Achse ab, sinkt die zulässige Last: bis 45° auf 70 %, bis 90° auf 50 %. Herstellerangaben haben Vorrang.'),
      };
    },
  },
];

// ---------- Startseite ----------
$('rechnerliste').innerHTML = RECHNER.map((r) => `<a class="karte" href="#rechner/${r.id}"><i>${r.symbol}</i><span><b>${r.titel}</b><small>${r.kurz}</small></span></a>`).join('');

// ---------- Rechner ----------
const speicherName = (id) => `lasi3d-rechner-${id}`;
function werte(r) {
  const w = Object.fromEntries(r.felder.map(([k, , std]) => [k, std]));
  try { Object.assign(w, JSON.parse(localStorage.getItem(speicherName(r.id)) || '{}')); } catch { /* egal */ }
  return w;
}
function zeigeRechner(r) {
  const w = werte(r);
  const feld = ([k, text, , art, schritt]) => (Array.isArray(art)
    ? `<label data-feld="${k}">${text}<select name="${k}">${art.map(([v, t]) => `<option value="${v}" ${String(w[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
    : `<label data-feld="${k}">${text}<span class="mit-einheit"><input name="${k}" type="number" inputmode="decimal" step="${schritt}" min="0" value="${w[k]}"><em>${art}</em></span></label>`);
  $('rechner-inhalt').innerHTML = `<h1><span class="sym">${r.symbol}</span> ${r.titel}</h1><p class="unter">${r.kurz}</p>${r.bild ?? ''}${r.beispiel ? '<button type="button" id="beispiel-nehmen" class="leise beispiel-knopf">Beispiel übernehmen</button>' : ''}
    <form id="rechner-form" class="rechner-form">${r.felder.map(feld).join('')}</form><div id="rechner-ergebnis"></div>`;
  const form = $('rechner-form');
  const aktualisiere = () => {
    for (const [k, , , art] of r.felder) {
      const el = form.elements[k];
      w[k] = Array.isArray(art) ? el.value : Number(el.value.replace(',', '.'));
    }
    for (const f of r.felder) form.querySelector(`[data-feld="${f[0]}"]`).hidden = f[5] ? !f[5](w) : false;
    try { localStorage.setItem(speicherName(r.id), JSON.stringify(w)); } catch { /* egal */ }
    const zahlen = r.felder.filter((f) => !Array.isArray(f[3]) && (!f[5] || f[5](w)));
    if (zahlen.some(([k]) => !(w[k] > 0) && !((k === 'mu' || k === 'theta') && w[k] === 0))) { $('rechner-ergebnis').innerHTML = '<p class="werte">Bitte alle Werte größer als 0 eingeben.</p>'; return; }
    const e = r.rechne(w);
    $('rechner-ergebnis').innerHTML = `<div class="einheit ${e.ok ? '' : 'nein'}"><b class="${e.ok ? 'gut' : 'schlecht'}">${e.haupt}</b>
      <table>${e.zeilen.map(([a, b, fett]) => `<tr${fett ? ' class="fett"' : ''}><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div>
      ${e.weg}`;
  };
  form.addEventListener('input', aktualisiere);
  $('beispiel-nehmen')?.addEventListener('click', () => {
    for (const [k, v] of Object.entries(r.beispiel)) form.elements[k].value = v;
    aktualisiere();
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
  aktualisiere();
}

// ---------- Navigation ----------
let simulatorGeladen = false;
function zeige() {
  const h = location.hash.replace(/^#/, '');
  const rechner = h.startsWith('rechner/') && RECHNER.find((r) => r.id === h.slice(8));
  const sim = h === '3d';
  $('start').hidden = sim || !!rechner;
  $('rechner').hidden = !rechner;
  document.querySelector('.layout').hidden = !sim;
  document.body.classList.toggle('sim', sim);
  if (rechner) zeigeRechner(rechner);
  if (sim && !simulatorGeladen) { simulatorGeladen = true; import('./main.js'); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', zeige);
zeige();
