import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pruefe, fussabdruck, fugenReibung, rechenkraftDaN, STIRNWAND_KRAFT_N } from './modell.js';
import { FAHRZEUGE, LADEGUT, HILFSMITTEL, GURTTYPEN, MATERIALIEN, beispiel } from './daten.js';

// ---------- Zustand ----------
const SPEICHER = 'lasi3d-beladung';
let zustand = lade() ?? { fahrzeugId: 'sattel', ...beispiel('sattel') };
let auswahl = null; // { art: 'objekt' | 'gurt', id }
let ergebnis = null;
let zaehler = 0;
const neueId = (p) => `${p}${Date.now().toString(36)}${++zaehler}`;
const fahrzeug = () => FAHRZEUGE.find((f) => f.id === zustand.fahrzeugId) ?? FAHRZEUGE[0];
const objekt = (id) => zustand.objekte.find((o) => o.id === id);
const gurt = (id) => zustand.gurte.find((g) => g.id === id);

function lade() {
  try {
    const z = JSON.parse(localStorage.getItem(SPEICHER));
    return z && Array.isArray(z.objekte) && Array.isArray(z.gurte) ? z : null;
  } catch { return null; }
}
function speichere() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(zustand)); } catch { /* privater Modus: nicht speichern */ }
}

// ---------- Szene ----------
// Achsen: x = Fahrtrichtung (vorne = +x, Stirnwand), y = oben, z = quer
const behaelter = document.getElementById('szene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
behaelter.prepend(renderer.domElement);

const szene = new THREE.Scene();
szene.background = new THREE.Color(0xdfe6ea);
const kamera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
const steuerung = new OrbitControls(kamera, renderer.domElement);
steuerung.enableDamping = true;
steuerung.maxPolarAngle = Math.PI / 2 - 0.05;

szene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f86, 1.6));
const sonne = new THREE.DirectionalLight(0xffffff, 2.2);
sonne.position.set(6, 18, 10);
sonne.castShadow = true;
sonne.shadow.mapSize.set(2048, 2048);
Object.assign(sonne.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
szene.add(sonne);
const boden = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x9da39a }));
boden.rotation.x = -Math.PI / 2;
boden.receiveShadow = true;
szene.add(boden);

const materialien = new Map();
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!materialien.has(key)) materialien.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }));
  return materialien.get(key);
}
const linienMat = new Map();
const linie = (color) => {
  if (!linienMat.has(color)) linienMat.set(color, new THREE.LineBasicMaterial({ color }));
  return linienMat.get(color);
};
function kasten(l, h, b, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, b), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function leere(gruppe) {
  gruppe.traverse((o) => o.geometry?.dispose());
  gruppe.clear();
}

// Fahrzeug
const lkw = new THREE.Group();
szene.add(lkw);
function baueFahrzeug() {
  leere(lkw);
  const f = fahrzeug();
  const { laenge: L, breite: B, hoehe: H } = f;
  lkw.add(kasten(L, 0.15, B, mat(0x6b4f35), 0, H - 0.075, 0)); // Boden
  lkw.add(kasten(L, 0.3, 1.0, mat(0x2b2f33), 0, H - 0.32, 0)); // Rahmen
  for (const s of [-1, 1]) {
    lkw.add(kasten(L, 0.18, 0.06, mat(0x30577a, { metalness: 0.3 }), 0, H - 0.09, s * (B / 2 + 0.03))); // Außenrahmen
    for (let x = -L / 2 + 0.25; x < L / 2; x += 0.5) lkw.add(kasten(0.05, 0.05, 0.03, mat(0x15191c), x, H - 0.09, s * (B / 2 + 0.065))); // Zurrpunkte
    for (let i = 0; i < f.rungen; i++) {
      const x = -L / 2 + 0.3 + (i * (L - 0.6)) / Math.max(f.rungen - 1, 1);
      lkw.add(kasten(0.08, 1.9, 0.06, mat(0x3b4148, { metalness: 0.4 }), x, H + 0.95, s * (B / 2 + 0.03)));
    }
  }
  lkw.add(kasten(0.08, f.haus ? 1.3 : 1.6, B, mat(0x56616b, { metalness: 0.4 }), L / 2 + 0.04, H + (f.haus ? 0.65 : 0.8), 0)); // Stirnwand
  const hausH = f.id === 'klein' ? 2.3 : 2.9;
  lkw.add(kasten(2.2, hausH, B, mat(0xc9d2d8, { metalness: 0.2 }), L / 2 + 1.35, 0.6 + hausH / 2, 0));
  lkw.add(kasten(0.05, 0.9, B - 0.3, mat(0x1c2a36, { roughness: 0.2 }), L / 2 + 2.46, 0.6 + hausH * 0.68, 0));
  const radGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 24).rotateX(Math.PI / 2);
  const achsen = [...f.achsen, L / 2 + 1.3];
  if (!f.haus) achsen.push(L / 2 - 0.9); // Antriebsachse der Zugmaschine
  for (const x of achsen) {
    for (const z of [-(B / 2 - 0.2), B / 2 - 0.2]) {
      const rad = new THREE.Mesh(radGeo, mat(0x161616));
      rad.position.set(x, 0.5, z);
      rad.castShadow = true;
      lkw.add(rad);
    }
  }
  kamera.position.set(-L * 0.45, 4 + L * 0.35, 6 + L * 0.8);
  steuerung.target.set(L * 0.05, H, 0);
}

// Ladung, Hilfsmittel, Gurte
const ladungGruppe = new THREE.Group();
szene.add(ladungGruppe);
let anklickbar = [];

const FARBEN = { holzkiste: 0xc89b5f, gitterbox: 0x9aa3ab, ibc: 0xf2f2ee, fass: 0x1f5fa8, papierrolle: 0xd9c39a, kunststoffkisten: 0x2f7fd0, mauersteine: 0xd98a5a };

function baueObjekt(o, y, status, gewaehlt) {
  const g = new THREE.Group();
  g.position.set(o.x, fahrzeug().hoehe + y, o.z);
  g.rotation.y = o.drehung === 90 ? Math.PI / 2 : 0;
  const { l, b, h } = o;
  if (o.art === 'europalette') {
    const holz = mat(0xd2b48c);
    g.add(kasten(l, 0.022, b, holz, 0, h - 0.011, 0));
    for (const z of [-b / 2 + 0.0725, 0, b / 2 - 0.0725]) { g.add(kasten(l, 0.1, 0.145, holz, 0, 0.072, z)); g.add(kasten(l, 0.022, 0.1, holz, 0, 0.011, z)); }
  } else if (o.typ === 'rhm') {
    g.add(kasten(l, h, b, mat(0x23272a), 0, h / 2, 0));
  } else if (o.form === 'zylinder') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(l / 2, l / 2, h, 32), mat(FARBEN[o.art] ?? 0x888888, { metalness: o.material === 'stahl' ? 0.3 : 0 }));
    m.position.y = h / 2;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  } else if (o.art === 'ibc') {
    g.add(kasten(l, 0.13, b, mat(0x3a3f44), 0, 0.065, 0));
    g.add(kasten(l * 0.94, h - 0.16, b * 0.94, mat(0xf2f2ee, { transparent: true, opacity: 0.88 }), 0, 0.13 + (h - 0.16) / 2, 0));
    const gitter = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(l, h - 0.13, b, 4, 3, 4)), linie(0x8d969e));
    gitter.position.y = 0.13 + (h - 0.13) / 2;
    g.add(gitter);
  } else if (o.art === 'kunststoffkisten') {
    const lagen = Math.max(1, Math.round(h / 0.25));
    for (let i = 0; i < lagen; i++) g.add(kasten(l - 0.01, h / lagen - 0.01, b - 0.01, mat(FARBEN.kunststoffkisten), 0, (h / lagen) * (i + 0.5), 0));
  } else {
    const extra = o.art === 'gitterbox' ? { metalness: 0.5, transparent: true, opacity: 0.75 } : {};
    g.add(kasten(l, h, b, mat(FARBEN[o.art] ?? 0xbbbbbb, extra), 0, h / 2, 0));
  }
  g.traverse((k) => { if (k.isMesh) { k.userData.ziel = { art: 'objekt', id: o.id }; anklickbar.push(k); } });
  // Umriss: gelb = ausgewählt, grün/rot = Prüfergebnis der Ladeeinheit
  if (gewaehlt || status !== undefined) {
    const geo = o.form === 'zylinder' ? new THREE.CylinderGeometry(l / 2 + 0.01, l / 2 + 0.01, h + 0.02, 24) : new THREE.BoxGeometry(l + 0.02, h + 0.02, b + 0.02);
    const umriss = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), linie(gewaehlt ? 0xffc400 : status ? 0x2f9d55 : 0xd2382c));
    geo.dispose();
    umriss.position.y = h / 2;
    g.add(umriss);
  }
  if (gewaehlt) g.add(kasten(l + 0.04, 0.012, b + 0.04, mat(0xffc400, { transparent: true, opacity: 0.6 }), 0, 0.006, 0));
  ladungGruppe.add(g);
}

const unsichtbar = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
function band(a, b, material, breite = 0.05, dicke = 0.012) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(breite, a.distanceTo(b), dicke), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
function baueGurt(g, info, gewaehlt) {
  const { breite: B, hoehe: H } = fahrzeug();
  const e = 0.012;
  const liegt = info.getroffen.length > 0;
  const punkte = liegt
    ? [[-B / 2, 0], [info.z0 - e, info.hoehe + e], [info.z1 + e, info.hoehe + e], [B / 2, 0]]
    : [[-B / 2, 0.02], [B / 2, 0.02]];
  const v = punkte.map(([z, y]) => new THREE.Vector3(g.x, H + y, z));
  const material = gewaehlt ? mat(0xffc400, { emissive: 0x664400 }) : liegt ? mat(0xe8901a, { roughness: 0.5 }) : mat(0xd2382c);
  for (let i = 0; i < v.length - 1; i++) {
    const sichtbar = band(v[i], v[i + 1], material);
    sichtbar.castShadow = true;
    ladungGruppe.add(sichtbar);
    const treffer = band(v[i], v[i + 1], unsichtbar, 0.3, 0.2); // breitere Fläche zum Antippen
    treffer.userData.ziel = { art: 'gurt', id: g.id };
    anklickbar.push(treffer);
    ladungGruppe.add(treffer);
  }
  const ratsche = (a, b) => { const r = a.clone().lerp(b, 0.35); ladungGruppe.add(kasten(0.09, 0.13, 0.06, mat(0x8a949c, { metalness: 0.6, roughness: 0.4 }), r.x, r.y, r.z)); };
  if (liegt) { ratsche(v[0], v[1]); if (g.zweiRatschen) ratsche(v[3], v[2]); }
}

function zeichne() {
  leere(ladungGruppe);
  anklickbar = [];
  const status = new Map();
  for (const e of ergebnis.ergebnisse) for (const m of e.einheit.mitglieder) status.set(m.id, e.ok);
  for (const o of zustand.objekte) {
    const gew = auswahl?.art === 'objekt' && auswahl.id === o.id;
    baueObjekt(o, ergebnis.lage.get(o.id).y, o.typ === 'ladung' ? status.get(o.id) : undefined, gew);
  }
  for (const g of zustand.gurte) baueGurt(g, ergebnis.gurte.find((i) => i.id === g.id), auswahl?.art === 'gurt' && auswahl.id === g.id);
}

function groesse() {
  const { clientWidth: w, clientHeight: h } = behaelter;
  renderer.setSize(w, h, false);
  kamera.aspect = w / h;
  kamera.updateProjectionMatrix();
}
new ResizeObserver(groesse).observe(behaelter);
renderer.setAnimationLoop(() => { steuerung.update(); renderer.render(szene, kamera); });

// ---------- Rechnen und Anzeigen ----------
let geplant = false;
function aktualisiere({ panel = true } = {}) {
  ergebnis = pruefe({ ...zustand, flaeche: fahrzeug() });
  zeichne();
  zeigeErgebnis();
  if (panel) zeigeAuswahl(); else auswahlWerte();
}
function aktualisiereBald() {
  if (geplant) return;
  geplant = true;
  requestAnimationFrame(() => { geplant = false; aktualisiere({ panel: false }); });
}

const $ = (id) => document.getElementById(id);
const zahl = (v, s = 2) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: s });
const RNAME = { vorwaerts: 'vorwärts', rueckwaerts: 'rückwärts', seitlich: 'seitlich' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function einheitName(e) {
  const ladung = e.einheit.mitglieder.filter((o) => o.typ === 'ladung');
  const zaehl = new Map();
  for (const o of ladung) zaehl.set(o.name, (zaehl.get(o.name) ?? 0) + 1);
  let name = [...zaehl].map(([n, k]) => (k > 1 ? `${k} × ${n}` : n)).join(' + ');
  if (e.einheit.mitglieder.some((o) => o.typ === 'palette')) name += ' auf Palette';
  if (e.einheit.rhm) name += ', Matte darunter';
  return name;
}

function zeigeErgebnis() {
  const r = ergebnis;
  const offen = r.ergebnisse.filter((e) => !e.ok).length;
  const leer = r.ergebnisse.length === 0;
  $('status').textContent = leer ? 'Keine Ladung' : r.ok ? '✓ Ladung gesichert' : `✗ ${offen ? `${offen} von ${r.ergebnisse.length} Einheiten nicht gesichert` : 'Bitte Hinweise prüfen'}`;
  $('status').className = `status ${leer ? '' : r.ok ? 'gut' : 'schlecht'}`;
  const meldungen = r.hinweise.map((h) => `<li class="${h.art === 'gurt' ? '' : 'schlecht'}">${esc(h.text)}</li>`).join('');
  const wand = r.stirnwandLast > 0 ? `<p class="werte">Stirnwand: ${zahl(r.stirnwandLast / 10, 0)} daN von ${zahl(STIRNWAND_KRAFT_N / 10, 0)} daN</p>` : '';
  const karten = r.ergebnisse.map((e) => {
    const zeilen = Object.entries(e.richtungen).map(([k, d]) => {
      let text;
      if (d.formschluss) text = 'Formschluss';
      else if (d.brauch === 0) text = 'hält durch Reibung';
      else if (d.hat === 0) text = 'ungesichert';
      else text = `${zahl(d.auslastung * 100, 0)} % ausgelastet`;
      return `<tr><td>${RNAME[k]}</td><td class="${d.ok ? 'gut' : 'schlecht'}">${text}</td></tr>`;
    }).join('');
    const kq = e.kippen.seitlich, kl = e.kippen.laengs;
    const ersteLadung = e.einheit.mitglieder.find((o) => o.typ === 'ladung');
    return `<div class="einheit ${e.ok ? '' : 'nein'}" data-waehle="${ersteLadung.id}">
      <b>${esc(einheitName(e))}</b>
      <span class="werte">${zahl(e.einheit.masse, 0)} kg · μ = ${zahl(e.einheit.mu)} · ${e.gurte.length} Gurt${e.gurte.length === 1 ? '' : 'e'}</span>
      <table>${zeilen}
        <tr><td>Kippen quer</td><td class="${kq.ok ? 'gut' : 'schlecht'}">${kq.brauch === 0 ? 'standsicher' : kq.ok ? 'durch Gurte gehalten' : 'kippt'}</td></tr>
        <tr><td>Kippen längs</td><td class="${kl.ok ? 'gut' : 'schlecht'}">${kl.ok ? 'standsicher' : 'kippt, anders sichern'}</td></tr>
      </table></div>`;
  }).join('');
  $('ergebnis').innerHTML = `${meldungen ? `<ul class="meldungen">${meldungen}</ul>` : ''}${wand}${karten || '<p class="werte">Noch keine Ladung auf der Fläche.</p>'}`;
}

function zeigeAuswahl() {
  const feld = $('auswahl');
  if (auswahl?.art === 'objekt' && objekt(auswahl.id)) {
    const o = objekt(auswahl.id);
    const zyl = o.form === 'zylinder';
    const masse = o.typ === 'rhm' ? '' : `<label>Masse (kg)<input type="number" min="1" step="10" data-feld="masse" value="${o.masse}"></label>`;
    const masse3 = zyl
      ? `<label>Ø (m)<input type="number" min="0.1" step="0.05" data-feld="durchmesser" value="${o.l}"></label><label>Höhe (m)<input type="number" min="0.1" step="0.05" data-feld="h" value="${o.h}"></label>`
      : `<label>Länge (m)<input type="number" min="0.1" step="0.05" data-feld="l" value="${o.l}"></label><label>Breite (m)<input type="number" min="0.1" step="0.05" data-feld="b" value="${o.b}"></label>${o.typ === 'rhm' ? '' : `<label>Höhe (m)<input type="number" min="0.01" step="0.05" data-feld="h" value="${o.h}"></label>`}`;
    const material = o.typ === 'ladung'
      ? `<label>Material Unterseite<select data-feld="material">${Object.entries(MATERIALIEN).map(([k, n]) => `<option value="${k}" ${k === o.material ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`
      : '';
    const mu = o.typ === 'rhm' ? '' : `<label>Reibbeiwert μ (leer = automatisch)<input type="number" min="0.05" max="1" step="0.05" data-feld="mu" value="${o.mu || ''}" placeholder="automatisch"></label>`;
    feld.innerHTML = `<h2>${esc(o.name)}</h2>
      <div class="reihe">${masse}${mu}</div>
      <div class="reihe3">${masse3}</div>
      ${material}
      <p class="werte" id="auswahl-werte"></p>
      <div class="knoepfe">
        ${zyl ? '' : '<button type="button" data-aktion="drehen">Drehen 90°</button>'}
        <button type="button" data-aktion="kopieren">Kopieren</button>
        ${o.typ === 'ladung' ? '<button type="button" data-aktion="gurt-darueber">Gurt darüber</button>' : ''}
        <button type="button" class="gefahr" data-aktion="loeschen">Löschen</button>
      </div>`;
  } else if (auswahl?.art === 'gurt' && gurt(auswahl.id)) {
    const g = gurt(auswahl.id);
    const L = fahrzeug().laenge;
    feld.innerHTML = `<h2>Zurrgurt</h2>
      <label>Vorspannkraft S<sub>TF</sub> (daN)<input type="number" min="10" max="2000" step="10" data-feld="stf" value="${g.stf}"></label>
      <input type="range" min="50" max="1250" step="10" data-feld="stf" value="${g.stf}" aria-label="Vorspannkraft">
      <div class="reihe">
        <label>Zurrkraft LC (daN)<input type="number" min="100" step="100" data-feld="lc" value="${g.lc}"></label>
        <label>Abstand Stirnwand (m)<input type="number" min="0" max="${L}" step="0.05" data-feld="abstand" value="${+(L / 2 - g.x).toFixed(2)}"></label>
      </div>
      <label class="haken"><input type="checkbox" data-feld="zweiRatschen" ${g.zweiRatschen ? 'checked' : ''}> Ratsche auf beiden Seiten (k = 2)</label>
      <p class="werte" id="auswahl-werte"></p>
      <div class="knoepfe"><button type="button" data-aktion="kopieren">Kopieren</button><button type="button" class="gefahr" data-aktion="loeschen">Löschen</button></div>`;
  } else {
    auswahl = null;
    feld.hidden = true;
    return;
  }
  feld.hidden = false;
  auswahlWerte();
}

function auswahlWerte() {
  const ziel = $('auswahl-werte');
  if (!ziel || !auswahl) return;
  if (auswahl.art === 'objekt') {
    const o = objekt(auswahl.id);
    if (!o) return;
    const { traeger } = ergebnis.lage.get(o.id);
    const auf = !traeger ? 'Ladefläche' : traeger.typ === 'palette' ? 'Palette' : traeger.typ === 'rhm' ? 'Antirutschmatte' : traeger.name;
    ziel.textContent = o.typ === 'rhm' ? `μ = ${zahl(0.6)} für alles, was darauf steht` : `steht auf: ${auf} · μ dieser Fuge = ${zahl(fugenReibung(o, traeger))}`;
  } else {
    const g = gurt(auswahl.id), info = ergebnis.gurte.find((i) => i.id === auswahl.id);
    if (!g || !info) return;
    ziel.textContent = info.getroffen.length
      ? `Zurrwinkel α ≈ ${zahl(info.winkel, 0)}° · über ${info.getroffen.length} Ladeeinheit${info.getroffen.length === 1 ? '' : 'en'} · gerechnet mit F_T = ${rechenkraftDaN(g)} daN`
      : 'Liegt auf keiner Ladung. Zum Verschieben ziehen oder Abstand eingeben.';
  }
}

// ---------- Bearbeiten ----------
function feldAenderung(ev) {
  const el = ev.target, feld = el.dataset.feld;
  if (!feld || !auswahl) return;
  if (auswahl.art === 'objekt') {
    const o = objekt(auswahl.id);
    if (feld === 'material') o.material = el.value;
    else if (feld === 'mu') o.mu = el.value === '' ? 0 : Math.min(Math.max(+el.value, 0.05), 1);
    else if (+el.value > 0) {
      if (feld === 'durchmesser') { o.l = o.b = +el.value; } else o[feld] = +el.value;
    } else return;
  } else {
    const g = gurt(auswahl.id);
    const L = fahrzeug().laenge;
    if (feld === 'zweiRatschen') g.zweiRatschen = el.checked;
    else if (feld === 'abstand') { if (el.value === '') return; g.x = Math.min(Math.max(L / 2 - +el.value, -L / 2), L / 2); }
    else if (+el.value > 0) {
      g[feld] = +el.value;
      if (feld === 'stf') for (const anderes of $('auswahl').querySelectorAll('[data-feld="stf"]')) if (anderes !== el) anderes.value = g.stf;
    } else return;
  }
  speichere();
  aktualisiereBald();
}
$('auswahl').addEventListener('input', feldAenderung);
$('auswahl').addEventListener('change', feldAenderung);

$('auswahl').addEventListener('click', (ev) => {
  const aktion = ev.target.closest('[data-aktion]')?.dataset.aktion;
  if (!aktion || !auswahl) return;
  if (auswahl.art === 'objekt') {
    const o = objekt(auswahl.id);
    if (aktion === 'drehen') o.drehung = o.drehung === 90 ? 0 : 90;
    if (aktion === 'loeschen') { zustand.objekte = zustand.objekte.filter((x) => x !== o); auswahl = null; }
    if (aktion === 'kopieren') { const k = { ...o, id: neueId('o') }; auswahl = null; platziereFrei(k); zustand.objekte.push(k); auswahl = { art: 'objekt', id: k.id }; }
    if (aktion === 'gurt-darueber') { neuerGurt(o.x); return; }
  } else {
    const g = gurt(auswahl.id);
    if (aktion === 'loeschen') { zustand.gurte = zustand.gurte.filter((x) => x !== g); auswahl = null; }
    if (aktion === 'kopieren') { const k = { ...g, id: neueId('g'), x: Math.max(g.x - 0.5, -fahrzeug().laenge / 2) }; zustand.gurte.push(k); auswahl = { art: 'gurt', id: k.id }; }
  }
  speichere();
  aktualisiere();
});

$('ergebnis').addEventListener('click', (ev) => {
  const id = ev.target.closest('[data-waehle]')?.dataset.waehle;
  if (id) { auswahl = { art: 'objekt', id }; aktualisiere(); }
});

// Freien Platz von der Stirnwand nach hinten suchen; Ladegut kommt auf eine ausgewählte Palette/Matte
function platziereFrei(o) {
  const { laenge: L, breite: B } = fahrzeug();
  const sel = auswahl?.art === 'objekt' ? objekt(auswahl.id) : null;
  if (o.typ === 'ladung' && sel && sel.typ !== 'ladung') { o.x = sel.x; o.z = sel.z; o.drehung = sel.drehung; return; }
  const andere = zustand.objekte.filter((a) => a.id !== o.id).map(fussabdruck);
  for (let x = L / 2; x > -L / 2; x -= 0.05) {
    for (const seite of [-1, 1, 0]) {
      o.x = 0; o.z = 0;
      const { lx, lz } = fussabdruck(o);
      o.x = x - lx / 2;
      o.z = seite * (B / 2 - lz / 2);
      const f = fussabdruck(o);
      if (f.x0 < -L / 2) continue;
      if (!andere.some((a) => f.x0 < a.x1 - 1e-6 && a.x0 < f.x1 - 1e-6 && f.z0 < a.z1 - 1e-6 && a.z0 < f.z1 - 1e-6)) return;
    }
  }
  o.x = 0; o.z = 0;
}
function neuesObjekt(vorlage) {
  const o = { typ: 'ladung', ...vorlage, id: neueId('o'), x: 0, z: 0, drehung: 0, mu: 0 };
  platziereFrei(o);
  zustand.objekte.push(o);
  auswahl = { art: 'objekt', id: o.id };
  speichere();
  aktualisiere();
}
function neuerGurt(x) {
  const typ = GURTTYPEN.find((t) => t.id === $('gurttyp').value) ?? GURTTYPEN[0];
  const g = { id: neueId('g'), x, stf: typ.stf, lc: typ.lc, zweiRatschen: false };
  zustand.gurte.push(g);
  auswahl = { art: 'gurt', id: g.id };
  speichere();
  aktualisiere();
}

// ---------- Ziehen in der 3D-Ansicht ----------
const strahl = new THREE.Raycaster();
const zeiger = new THREE.Vector2();
let ziehen = null;
let druck = null;

function treffe(ev, y) {
  const r = renderer.domElement.getBoundingClientRect();
  zeiger.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  strahl.setFromCamera(zeiger, kamera);
  return { treffer: strahl.intersectObjects(anklickbar, false)[0], punkt: strahl.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3()) };
}

// Alles, was auf einem Objekt steht, wird mitbewegt
function mitStapel(o) {
  const ids = new Set([o.id]);
  let neu = true;
  while (neu) {
    neu = false;
    for (const a of zustand.objekte) {
      const t = ergebnis.lage.get(a.id)?.traeger;
      if (t && ids.has(t.id) && !ids.has(a.id)) { ids.add(a.id); neu = true; }
    }
  }
  return zustand.objekte.filter((a) => ids.has(a.id));
}

const RASTER = 0.05, MAGNET = 0.08;
function einrasten(o, bewegt) {
  const { laenge: L, breite: B } = fahrzeug();
  o.x = Math.round(o.x / RASTER) * RASTER;
  o.z = Math.round(o.z / RASTER) * RASTER;
  let f = fussabdruck(o);
  const kandX = [[f.x1, L / 2], [f.x0, -L / 2]], kandZ = [[f.z1, B / 2], [f.z0, -B / 2]];
  for (const a of zustand.objekte) {
    if (bewegt.has(a.id)) continue;
    const fa = fussabdruck(a);
    if (o.x > fa.x0 && o.x < fa.x1 && o.z > fa.z0 && o.z < fa.z1) {
      // über einer Palette/Ladung: auf deren Mitte einrasten
      kandX.push([o.x, a.x]);
      kandZ.push([o.z, a.z]);
    } else {
      kandX.push([f.x1, fa.x0], [f.x0, fa.x1]);
      kandZ.push([f.z1, fa.z0], [f.z0, fa.z1]);
    }
  }
  const sprung = (kand, grenze) => kand.map(([ist, soll]) => soll - ist).filter((d) => Math.abs(d) < grenze).sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
  o.x += sprung(kandX, MAGNET);
  o.z += sprung(kandZ, MAGNET);
  f = fussabdruck(o);
  o.x += Math.max(0, -L / 2 - f.x0) - Math.max(0, f.x1 - L / 2);
  o.z += Math.max(0, -B / 2 - f.z0) - Math.max(0, f.z1 - B / 2);
}

// Erfasst den Druck vor der Kamerasteuerung, damit Ziehen die Kamera nicht dreht
behaelter.addEventListener('pointerdown', (ev) => {
  if (ev.target !== renderer.domElement || !ev.isPrimary) return;
  druck = { x: ev.clientX, y: ev.clientY };
  const { treffer } = treffe(ev, fahrzeug().hoehe);
  if (!treffer) return;
  const ziel = treffer.object.userData.ziel;
  steuerung.enabled = false;
  const wechsel = auswahl?.id !== ziel.id;
  auswahl = { ...ziel };
  const yEbene = fahrzeug().hoehe + (ziel.art === 'objekt' ? ergebnis.lage.get(ziel.id).y : 0);
  const { punkt } = treffe(ev, yEbene);
  const gruppe = ziel.art === 'objekt' ? mitStapel(objekt(ziel.id)) : [];
  ziehen = { ziel, yEbene, start: punkt, positionen: new Map(gruppe.map((a) => [a.id, { x: a.x, z: a.z }])), gurtX: ziel.art === 'gurt' ? gurt(ziel.id).x : 0 };
  renderer.domElement.setPointerCapture(ev.pointerId);
  if (wechsel) aktualisiere(); else zeichne();
}, { capture: true });

renderer.domElement.addEventListener('pointermove', (ev) => {
  if (!ziehen || !ziehen.start) return;
  const { punkt } = treffe(ev, ziehen.yEbene);
  if (!punkt) return;
  const dx = punkt.x - ziehen.start.x, dz = punkt.z - ziehen.start.z;
  if (ziehen.ziel.art === 'gurt') {
    const L = fahrzeug().laenge;
    gurt(ziehen.ziel.id).x = Math.min(Math.max(Math.round((ziehen.gurtX + dx) / RASTER) * RASTER, -L / 2), L / 2);
  } else {
    const o = objekt(ziehen.ziel.id);
    const s = ziehen.positionen.get(o.id);
    o.x = s.x + dx; o.z = s.z + dz;
    einrasten(o, new Set(ziehen.positionen.keys()));
    const vx = o.x - s.x, vz = o.z - s.z;
    for (const [id, p] of ziehen.positionen) if (id !== o.id) { const a = objekt(id); a.x = p.x + vx; a.z = p.z + vz; }
  }
  aktualisiereBald();
});

function zeigerHoch(ev) {
  if (ziehen) {
    ziehen = null;
    steuerung.enabled = true;
    speichere();
    aktualisiere();
  } else if (druck && Math.hypot(ev.clientX - druck.x, ev.clientY - druck.y) < 6 && auswahl) {
    auswahl = null; // Tippen ins Leere hebt die Auswahl auf
    aktualisiere();
  }
  druck = null;
}
renderer.domElement.addEventListener('pointerup', zeigerHoch);
renderer.domElement.addEventListener('pointercancel', zeigerHoch);

// ---------- Bedienfeld ----------
const optionen = (liste, wert = (e) => e.id) => liste.map((e) => `<option value="${wert(e)}">${esc(e.name)}</option>`).join('');
$('fahrzeug').innerHTML = optionen(FAHRZEUGE);
$('ladegut').innerHTML = optionen(LADEGUT, (e) => e.art);
$('gurttyp').innerHTML = GURTTYPEN.map((t) => `<option value="${t.id}">${esc(t.name)} (S_TF ${t.stf} daN)</option>`).join('');
$('gurttyp').value = 'langhebel';
$('fahrzeug').value = fahrzeug().id;

$('fahrzeug').addEventListener('change', () => { zustand.fahrzeugId = $('fahrzeug').value; speichere(); baueFahrzeug(); aktualisiere(); });
$('ladegut-neu').addEventListener('click', () => neuesObjekt(LADEGUT.find((v) => v.art === $('ladegut').value)));
$('palette-neu').addEventListener('click', () => neuesObjekt(HILFSMITTEL.find((v) => v.art === 'europalette')));
$('rhm-neu').addEventListener('click', () => neuesObjekt(HILFSMITTEL.find((v) => v.art === 'rhm')));
$('gurt-neu').addEventListener('click', () => {
  const sel = auswahl?.art === 'objekt' ? objekt(auswahl.id) : null;
  neuerGurt(sel ? sel.x : 0);
});
$('beispiel').addEventListener('click', () => { zustand = { fahrzeugId: zustand.fahrzeugId, ...beispiel(zustand.fahrzeugId) }; auswahl = null; speichere(); aktualisiere(); });
$('leeren').addEventListener('click', () => {
  if (!confirm('Alle Ladung, Hilfsmittel und Gurte entfernen?')) return;
  zustand.objekte = []; zustand.gurte = []; auswahl = null; speichere(); aktualisiere();
});

baueFahrzeug();
aktualisiere();
// für die Seitentests
window.lasi = {
  zustand: () => zustand, ergebnis: () => ergebnis, auswahl: () => auswahl,
  // Bildschirmposition eines Punkts auf dem Objekt (Standard: Mitte der Oberseite)
  bildschirm(id, dx = 0, anteilHoehe = 1) {
    const o = objekt(id), r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(o.x + dx, fahrzeug().hoehe + ergebnis.lage.get(id).y + o.h * anteilHoehe, o.z).project(kamera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  },
};
