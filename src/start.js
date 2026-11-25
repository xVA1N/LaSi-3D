// Startseite: Simulator „Ladungssicherung 3D“ oder einzelne Rechner. Adressen: #3d, #rechner/<id>
import { niederzurren, zurrwinkel, K_FAKTOR } from './berechnung.js';
import { sicherungskraft, diagonalzurren, kippen } from './rechner.js';
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
        info: `α = ${zahl(winkel, 0)}°, μ = ${zahl(mu, 2)}. Formel: n ≥ (c − μ·c_z)·m·g / (k·μ·sin α·F_T) · f_s, mit f_s = 1,25 nach vorne, sonst 1,1.`,
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
        info: `Je Richtung wirken 2 der 4 Gurte. Formel: LC ≥ m·g·(c − μ·f_μ·c_z) / (2·(cos α·cos β + μ·f_μ·sin α)), f_μ = 0,75; seitlich mit sin β.`,
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
        info: `Trägheitskraft c·m·g minus Reibung μ·c_z·m·g (μ = ${zahl(mu, 2)}). Nach vorne kann die Stirnwand helfen (EN 12642 Code L: bis 5000 daN).`,
      };
    },
  },
  {
    id: 'kippen', titel: 'Kippen', symbol: '⟲', kurz: 'Kippt die Ladung bei Bremsen oder Kurve?',
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
        info: 'Kippsicher, wenn c · Schwerpunkthöhe ≤ Abstand Schwerpunkt bis Kippkante (Schwerpunkt in der Mitte angenommen). Seitlich gilt c = 0,6.',
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
  $('rechner-inhalt').innerHTML = `<h1><span class="sym">${r.symbol}</span> ${r.titel}</h1><p class="unter">${r.kurz}</p>
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
    if (zahlen.some(([k]) => !(w[k] > 0) && !(k === 'mu' && w[k] === 0))) { $('rechner-ergebnis').innerHTML = '<p class="werte">Bitte alle Werte größer als 0 eingeben.</p>'; return; }
    const e = r.rechne(w);
    $('rechner-ergebnis').innerHTML = `<div class="einheit ${e.ok ? '' : 'nein'}"><b class="${e.ok ? 'gut' : 'schlecht'}">${e.haupt}</b>
      <table>${e.zeilen.map(([a, b, fett]) => `<tr${fett ? ' class="fett"' : ''}><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div>
      <p class="hinweis">${e.info}</p>`;
  };
  form.addEventListener('input', aktualisiere);
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
