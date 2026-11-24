import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pruefe, fussabdruck, fugenReibung, rechenkraftDaN, kopfLage, ladereihen, STIRNWAND_KRAFT_N, MU_RHM, ZURRPUNKT_AUSSEN } from './modell.js';
import { FAHRZEUGE, LADEGUT, HILFSMITTEL, GURTTYPEN, MATERIALIEN, beispiel } from './daten.js';
import { bewegGruppe, vereinigung, anWand, verschiebe, abstandVorne, unterlage, setzeUnterlage, freierGurtX, UEBERSTAND_MAX } from './aktionen.js';
import { pruefeUebermass, GRENZEN } from './uebermass.js';

// ---------- Zustand ----------
const SPEICHER = 'lasi3d-beladung';
let zustand = lade() ?? { fahrzeugId: 'sattel', ...beispiel('sattel') };
let auswahl = null; // { art: 'objekt' | 'gurt', id }
let ergebnis = null;
let uebermass = null;
let reihen = [];
let ansicht = 'oben';
try { ansicht = localStorage.getItem('lasi3d-ansicht') === '3d' ? '3d' : 'oben'; } catch { /* ohne Speicher: Draufsicht */ }
let zaehler = 0;
const neueId = (p) => `${p}${Date.now().toString(36)}${++zaehler}`;
const fahrzeug = () => FAHRZEUGE.find((f) => f.id === zustand.fahrzeugId) ?? FAHRZEUGE[0];
const objekt = (id) => zustand.objekte.find((o) => o.id === id);
const gurt = (id) => zustand.gurte.find((g) => g.id === id);
const gewaehltesObjekt = () => (auswahl?.art === 'objekt' ? objekt(auswahl.id) : null);
const gewaehlterGurt = () => (auswahl?.art === 'gurt' ? gurt(auswahl.id) : null);

function lade() {
  try {
    const z = JSON.parse(localStorage.getItem(SPEICHER));
    if (!(z && Array.isArray(z.objekte) && Array.isArray(z.gurte))) return null;
    for (const o of z.objekte) if (o.typ === 'rhm') o.name = 'RHM'; // früher „Antirutschmatte (RHM)“
    return z;
  } catch { return null; }
}
function speichere() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(zustand)); } catch { /* privater Modus: nicht speichern */ }
}

// ---------- Szene und Kameras ----------
// Achsen: x = Fahrtrichtung (vorne = +x, Stirnwand), y = oben, z = quer (−z links, +z rechts)
const behaelter = document.getElementById('szene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
behaelter.prepend(renderer.domElement);

const szene = new THREE.Scene();
szene.background = new THREE.Color(0xdfe6ea);

const kamera3d = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
const steuer3d = new OrbitControls(kamera3d, renderer.domElement);
steuer3d.enableDamping = true;
steuer3d.maxPolarAngle = Math.PI / 2 - 0.05;

// Draufsicht: Stirnwand oben, ein Finger verschiebt die Ansicht, zwei Finger zoomen
const HOEHE_OBEN = 10; // sichtbare Höhe in m bei Zoom 1
const kameraOben = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
kameraOben.up.set(1, 0, 0);
const steuerOben = new OrbitControls(kameraOben, renderer.domElement);
steuerOben.enableRotate = false;
steuerOben.screenSpacePanning = true;
steuerOben.zoomToCursor = true;
steuerOben.minZoom = 0.4;
steuerOben.maxZoom = 8;
steuerOben.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
steuerOben.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

const kamera = () => (ansicht === '3d' ? kamera3d : kameraOben);
const steuerung = () => (ansicht === '3d' ? steuer3d : steuerOben);

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
  kamera3d.position.set(-L * 0.45, 4 + L * 0.35, 6 + L * 0.8);
  steuer3d.target.set(L * 0.05, H, 0);
  steuer3d.update();
  rahmeOben();
}

// Draufsicht so einrichten, dass die Breite gut lesbar ist und die Stirnwand oben steht
function rahmeOben(mitteX) {
  const { laenge: L, breite: B } = fahrzeug();
  const { clientWidth: w, clientHeight: h } = behaelter;
  // Breite der Fläche plus Rand für Meterzahlen und Übersicht; auf breiten Bildschirmen höchstens 130 px/m
  const pxM = Math.min(w / (B + 1.1), 130);
  const zoom = Math.max(HOEHE_OBEN / (L + 1.5), (pxM * HOEHE_OBEN) / Math.max(h, 1));
  kameraOben.zoom = zoom;
  kameraOben.updateProjectionMatrix();
  const sichtbar = HOEHE_OBEN / zoom;
  const x = mitteX ?? L / 2 - sichtbar / 2 + 0.7;
  setzeObenZiel(x);
}
function setzeObenZiel(x) {
  const { laenge: L, hoehe: H } = fahrzeug();
  const tx = Math.min(Math.max(x, -L / 2), L / 2 + 1);
  steuerOben.target.set(tx, H, 0.1);
  kameraOben.position.set(tx, H + 50, 0.1);
  kameraOben.lookAt(steuerOben.target);
  steuerOben.update();
}

// Ladung, Hilfsmittel, Gurte
const ladungGruppe = new THREE.Group();
szene.add(ladungGruppe);
let anklickbar = [];

const FARBEN = { holzkiste: 0xc89b5f, gitterbox: 0x9aa3ab, ibc: 0xf2f2ee, fass: 0x1f5fa8, papierrolle: 0xd9c39a, kunststoffkisten: 0x2f7fd0, mauersteine: 0xd98a5a, europalette: 0xd2b48c, rhm: 0x23272a };
const css = (farbe) => `#${farbe.toString(16).padStart(6, '0')}`;

// Europalette liegend (dx × dz, 144 mm hoch): 5 Deckbretter und 3 Bodenbretter längs der 1,2-m-Seite,
// 3 Querbretter, 9 Klötze
function europalette(dx, dz) {
  const holz = mat(FARBEN.europalette), klotz = mat(0xb8956a);
  const lang = Math.max(dx, dz), kurz = Math.min(dx, dz), T = 0.022, H = 0.144;
  const p = new THREE.Group();
  const reihen = [-kurz / 2 + 0.0725, 0, kurz / 2 - 0.0725];
  const spalten = [-lang / 2 + 0.0725, 0, lang / 2 - 0.0725];
  for (const [z, w] of [[reihen[0], 0.145], [-kurz * 0.205, 0.1], [0, 0.145], [kurz * 0.205, 0.1], [reihen[2], 0.145]]) p.add(kasten(lang, T, w, holz, 0, H - T / 2, z));
  for (const x of spalten) p.add(kasten(0.145, T, kurz, holz, x, H - 1.5 * T, 0));
  for (const x of spalten) for (const z of reihen) p.add(kasten(0.145, H - 3 * T, z === 0 ? 0.145 : 0.1, klotz, x, T + (H - 3 * T) / 2, z));
  for (const z of reihen) p.add(kasten(lang, T, z === 0 ? 0.145 : 0.1, holz, 0, T / 2, z));
  if (dz <= dx) return p;
  // Längsseite in z: in eigener Gruppe drehen, damit spätere Drehungen sich nicht überlagern
  p.rotation.y = Math.PI / 2;
  const huelle = new THREE.Group();
  huelle.add(p);
  return huelle;
}

function baueObjekt(o, y, status, gewaehlt, deckNachMinus = false) {
  const g = new THREE.Group();
  g.position.set(o.x, fahrzeug().hoehe + y, o.z);
  g.rotation.y = o.drehung === 90 ? Math.PI / 2 : 0;
  const { l, b, h } = o;
  if (o.art === 'europalette' && o.hochkant) {
    // liegend gebaute Palette um die Längsachse aufgestellt: Dicke in x, Breite in z, Höhe in y
    const p = europalette(h, b);
    // Deckseite zur Ladung, Klötze nach außen
    p.rotation.z = deckNachMinus ? Math.PI / 2 : -Math.PI / 2;
    p.position.set(deckNachMinus ? l / 2 : -l / 2, h / 2, 0);
    g.add(p);
  } else if (o.art === 'europalette') {
    g.add(europalette(l, b));
  } else if (o.typ === 'rhm') {
    g.add(kasten(l, h, b, mat(FARBEN.rhm), 0, h / 2, 0));
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
  if (gewaehlt) {
    g.add(kasten(l + 0.06, 0.012, b + 0.06, mat(0xffc400, { transparent: true, opacity: 0.7 }), 0, 0.006, 0));
    g.add(kasten(l + 0.02, 0.008, b + 0.02, mat(0xffc400, { transparent: true, opacity: 0.35, depthWrite: false }), 0, h + 0.012, 0));
  }
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
    const sichtbar = band(v[i], v[i + 1], material, ansicht === 'oben' ? 0.07 : 0.05);
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

function baueKopf(g, info, gewaehlt) {
  if (!info?.getroffen.length) return;
  const { hoehe: H } = fahrzeug();
  const B = fahrzeug().breite + 2 * ZURRPUNKT_AUSSEN;
  const e = 0.03, richtung = info.richtung === 'rueckwaerts' ? -1 : 1, aussen = richtung * e;
  const v = [[info.ankerX, 0, -B / 2], [info.x + aussen, info.y, info.z0 - e], [info.x + aussen, info.y, info.z1 + e], [info.ankerX, 0, B / 2]]
    .map(([x, y, z]) => new THREE.Vector3(x, H + y, z));
  const material = gewaehlt ? mat(0xffc400, { emissive: 0x664400 }) : mat(0xe8901a, { roughness: 0.5 });
  for (let i = 0; i < v.length - 1; i++) {
    const sichtbar = band(v[i], v[i + 1], material, 0.012, ansicht === 'oben' ? 0.07 : 0.05);
    sichtbar.castShadow = true;
    ladungGruppe.add(sichtbar);
    const treffer = band(v[i], v[i + 1], unsichtbar, 0.2, 0.3);
    treffer.userData.ziel = { art: 'gurt', id: g.id };
    anklickbar.push(treffer);
    ladungGruppe.add(treffer);
  }
  const r = v[0].clone().lerp(v[1], 0.4);
  ladungGruppe.add(kasten(0.13, 0.09, 0.06, mat(0x8a949c, { metalness: 0.6, roughness: 0.4 }), r.x, r.y, r.z));
  // Kantenschoner: Winkelprofil an beiden senkrechten Kanten, um die die Schlinge läuft
  const schoner = mat(0x2d6fb0, { roughness: 0.5 });
  const arm = 0.13, dick = 0.015, hoch = 0.16, yS = H + info.y;
  for (const [zEcke, nachInnen] of [[info.z0, 1], [info.z1, -1]]) {
    const xAussen = info.x + richtung * (dick / 2 + 0.002);
    ladungGruppe.add(kasten(dick, hoch, arm, schoner, xAussen, yS, zEcke + nachInnen * (arm / 2 - dick)));
    ladungGruppe.add(kasten(arm, hoch, dick, schoner, info.x - richtung * (arm / 2 - dick), yS, zEcke - nachInnen * (dick / 2 + 0.002)));
  }
}

// Hochkant-Palette: Deckseite zeigt zur angrenzenden Ladung (Ladung dahinter = Deck nach −x)
function deckNachMinus(p) {
  const f = fussabdruck(p);
  const ueberlapp = (e) => e.einheit.f.z0 < f.z1 && f.z0 < e.einheit.f.z1;
  const davor = ergebnis.ergebnisse.some((e) => ueberlapp(e) && Math.abs(e.einheit.f.x0 - f.x1) <= 0.05);
  const dahinter = ergebnis.ergebnisse.some((e) => ueberlapp(e) && Math.abs(e.einheit.f.x1 - f.x0) <= 0.05);
  return dahinter && !davor;
}

const ZURRART = { diagonal: 'Diagonalzurren', schraeg: 'Schrägzurren' };
function baueDirekt(g, info, gewaehlt) {
  if (!info?.getroffen.length) return;
  const { hoehe: H } = fahrzeug();
  const p = new THREE.Vector3(info.p.x, H + info.p.y, info.p.z), a = new THREE.Vector3(info.a.x, H, info.a.z);
  const material = gewaehlt ? mat(0xffc400, { emissive: 0x664400 }) : mat(0xe8901a, { roughness: 0.5 });
  const sichtbar = band(p, a, material, 0.05, 0.012);
  sichtbar.castShadow = true;
  ladungGruppe.add(sichtbar);
  const treffer = band(p, a, unsichtbar, 0.25, 0.25);
  treffer.userData.ziel = { art: 'gurt', id: g.id };
  anklickbar.push(treffer);
  ladungGruppe.add(treffer);
  ladungGruppe.add(kasten(0.06, 0.06, 0.06, mat(0x30363b, { metalness: 0.6 }), p.x, p.y, p.z)); // Zurrpunkt an der Ladung
  const r = p.clone().lerp(a, 0.65);
  ladungGruppe.add(kasten(0.09, 0.13, 0.06, mat(0x8a949c, { metalness: 0.6, roughness: 0.4 }), r.x, r.y, r.z));
}

function zeichne() {
  leere(ladungGruppe);
  anklickbar = [];
  const status = new Map();
  for (const e of ergebnis.ergebnisse) for (const m of e.einheit.mitglieder) status.set(m.id, e.ok);
  for (const m of uebermass.meldungen) if (m.id) status.set(m.id, false);
  for (const o of zustand.objekte) {
    const gew = auswahl?.art === 'objekt' && auswahl.id === o.id;
    baueObjekt(o, ergebnis.lage.get(o.id).y, o.typ === 'ladung' ? status.get(o.id) : undefined, gew, o.hochkant && deckNachMinus(o));
  }
  for (const g of zustand.gurte) {
    const info = ergebnis.gurte.find((i) => i.id === g.id), gew = auswahl?.art === 'gurt' && auswahl.id === g.id;
    if (g.art === 'kopf') baueKopf(g, info, gew); else if (g.art === 'direkt') baueDirekt(g, info, gew); else baueGurt(g, info, gew);
  }
  baueReihen();
  baueUebermass();
  baueMarken();
  baueMini();
}

// Ladereihen: Streifen im Wechsel auf der Ladefläche unter der Ladung
const REIHENFARBEN = [0x4f9dde, 0x58c08a];
function baueReihen() {
  const { breite: B, hoehe: H } = fahrzeug();
  for (const r of reihen) {
    const farbe = REIHENFARBEN[(r.nr - 1) % 2];
    const streifen = kasten(r.x1 - r.x0 - 0.04, 0.004, B - 0.04, mat(farbe, { transparent: true, opacity: 0.45, depthWrite: false }), (r.x0 + r.x1) / 2, H + 0.003, 0);
    streifen.castShadow = false;
    ladungGruppe.add(streifen);
    // farbiger Balken auf beiden Außenrahmen, damit die Reihe auch unter der Ladung sichtbar ist
    for (const seite of [-1, 1]) ladungGruppe.add(kasten(r.x1 - r.x0 - 0.06, 0.03, 0.07, mat(farbe), (r.x0 + r.x1) / 2, H + 0.015, seite * (B / 2 + 0.035)));
  }
}

// Markierungen bei Übermaß: Fahne am Überstand, Maßlinie, rote Grenzflächen für Breite und Höhe
function baueUebermass() {
  const { laenge: L, breite: B, hoehe: H } = fahrzeug();
  const rot = mat(0xd32f2f, { roughness: 0.6 });
  const grenze = mat(0xe53935, { transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const u = uebermass;
  if (u.ueberHinten > 0.005) {
    // Maßlinie auf Höhe der Ladefläche von der Kante bis zum Ende der Ladung
    const z = Math.min(Math.max(u.fahne?.z ?? 0, -B / 2), B / 2);
    ladungGruppe.add(kasten(u.ueberHinten, 0.02, 0.04, rot, -L / 2 - u.ueberHinten / 2, H - 0.05, z));
    for (const x of [-L / 2, -L / 2 - u.ueberHinten]) ladungGruppe.add(kasten(0.02, 0.18, 0.04, rot, x, H - 0.05, z));
  }
  if (u.fahne) {
    const { x, y, z } = u.fahne;
    ladungGruppe.add(kasten(0.02, 0.5, 0.02, mat(0x444444), x - 0.03, H + y + 0.05, z)); // Stab
    ladungGruppe.add(kasten(0.01, 0.3, 0.3, mat(0xff3b30, { emissive: 0x551010 }), x - 0.04, H + y + 0.13, z + 0.16)); // Fahne 30 × 30 cm
  }
  const x0 = -L / 2 - u.ueberHinten, laengeZone = L + u.ueberHinten;
  // Grenzlinien für Breite, auch in der Draufsicht sichtbar (immer obenauf gezeichnet)
  if (u.zuBreit) {
    const linie = new THREE.LineBasicMaterial({ color: 0xe53935, depthTest: false });
    for (const s of [-1, 1]) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, H + 0.02, s * GRENZEN.breite / 2), new THREE.Vector3(L / 2, H + 0.02, s * GRENZEN.breite / 2)]);
      const l = new THREE.Line(geo, linie);
      l.renderOrder = 10;
      ladungGruppe.add(l);
    }
  }
  if (u.zuBreit) {
    for (const s of [-1, 1]) {
      const ebene = new THREE.Mesh(new THREE.PlaneGeometry(laengeZone, GRENZEN.hoehe - 0.3), grenze);
      ebene.position.set(x0 + laengeZone / 2, (GRENZEN.hoehe + 0.3) / 2, s * GRENZEN.breite / 2);
      ladungGruppe.add(ebene);
    }
  }
  if (u.zuHoch) {
    const ebene = new THREE.Mesh(new THREE.PlaneGeometry(laengeZone, GRENZEN.breite), grenze);
    ebene.rotation.x = -Math.PI / 2;
    ebene.position.set(x0 + laengeZone / 2, GRENZEN.hoehe, 0);
    ladungGruppe.add(ebene);
  }
}

// ---------- Beschriftungen über der Ansicht ----------
const markenFeld = document.getElementById('marken');
let marken = [];
const pxProMeter = () => (ansicht === 'oben' ? (behaelter.clientHeight * kameraOben.zoom) / HOEHE_OBEN : Infinity);
const laenge = (m) => (Math.abs(m) < 1 ? `${Math.round(m * 100)} cm` : `${zahl(m, 2)} m`);

function marke(klasse, html, punkt, nurOben = false) {
  const el = document.createElement('div');
  el.className = `marke ${klasse}`;
  el.innerHTML = html;
  markenFeld.append(el);
  marken.push({ el, punkt, nurOben, klasse });
}
function baueMarken() {
  markenFeld.textContent = '';
  marken = [];
  const { laenge: L, breite: B, hoehe: H } = fahrzeug();
  if (ansicht === 'oben') {
    for (let m = 0; m <= Math.floor(L); m++) marke('meter', `${m} m`, new THREE.Vector3(L / 2 - m, H, -B / 2 - 0.12), true);
    marke('wand', '▲ Stirnwand · Fahrtrichtung', new THREE.Vector3(L / 2 + 0.9, H + 3.5, 0), true);
    for (const o of zustand.objekte) {
      if (o.typ !== 'ladung') continue;
      const kurz = o.name.split(/[ ,]/)[0];
      marke('name', `${esc(kurz)}<small>${zahl(o.masse, 0)} kg</small>`, new THREE.Vector3(o.x, H + ergebnis.lage.get(o.id).y + o.h, o.z), true);
    }
  }
  // Schild in der vorderen rechten Ecke der Reihe, damit es die Namen in der Mitte nicht verdeckt
  for (const r of reihen) marke(`reihe r${(r.nr - 1) % 2}`, `LR${r.nr}`, new THREE.Vector3(r.x1 - 0.1, H, B / 2 - 0.05));
  if (uebermass.ueberHinten > 0.005) {
    const z = Math.min(Math.max(uebermass.fahne?.z ?? 0, -B / 2), B / 2);
    marke(uebermass.ueberHinten > GRENZEN.kennzeichnungAb ? 'warnung' : 'mass', `Überstand ${laenge(uebermass.ueberHinten)}`, new THREE.Vector3(-L / 2 - uebermass.ueberHinten / 2, H, z));
  }
  const seitlich = Math.max(uebermass.ueberLinks, uebermass.ueberRechts);
  if (seitlich > 0.005) {
    // am Teil, das am weitesten übersteht
    const rechts = uebermass.ueberRechts >= uebermass.ueberLinks;
    const teil = zustand.objekte.reduce((a, b) => {
      const fa = fussabdruck(a), fb = fussabdruck(b);
      return (rechts ? fb.z1 > fa.z1 : fb.z0 < fa.z0) ? b : a;
    });
    const f = fussabdruck(teil);
    marke(uebermass.zuBreit ? 'warnung' : 'mass', `seitlich ${laenge(seitlich)} · Breite ${zahl(uebermass.breite, 2)} m`,
      new THREE.Vector3(teil.x, H + ergebnis.lage.get(teil.id).y + teil.h, rechts ? f.z1 : f.z0));
  }
  if (uebermass.zuHoch) marke('warnung', `Höhe ${zahl(uebermass.hoehe, 2)} m`, new THREE.Vector3(0, GRENZEN.hoehe, 0));
  const o = gewaehltesObjekt();
  if (o) {
    const a = abstandVorne(zustand.objekte, ergebnis.lage, o, fahrzeug());
    const u = vereinigung(bewegGruppe(zustand.objekte, ergebnis.lage, o).gruppe);
    const davor = a.bis && (a.bis.typ === 'ladung' ? a.bis : zustand.objekte.find((x) => x.typ === 'ladung' && bewegGruppe(zustand.objekte, ergebnis.lage, x).gruppe.includes(a.bis)) ?? a.bis);
    const text = a.bis
      ? `↑ ${laenge(a.abstand)} bis ${esc(davor.name.split(/[ ,]/)[0])}<br>${laenge(a.stirnwand)} bis Stirnwand`
      : `↑ ${laenge(a.stirnwand)} bis Stirnwand`;
    marke('abstand', text, new THREE.Vector3(u.x1, H + ergebnis.lage.get(o.id).y + o.h, (u.z0 + u.z1) / 2));
  }
  setzeMarken();
}
const projektion = new THREE.Vector3();
function setzeMarken() {
  const w = behaelter.clientWidth, h = behaelter.clientHeight;
  const klein = pxProMeter() < 45;
  for (const m of marken) {
    projektion.copy(m.punkt).project(kamera());
    const x = ((projektion.x + 1) / 2) * w, y = ((1 - projektion.y) / 2) * h;
    const weg = projektion.z > 1 || x < -100 || x > w + 100 || y < -50 || y > h + 50 || (m.nurOben && ansicht !== 'oben') || (klein && m.klasse === 'name');
    m.el.style.display = weg ? 'none' : '';
    if (weg) continue;
    const halb = m.el.offsetWidth / 2;
    const links = m.klasse === 'abstand' ? Math.min(Math.max(x, 8), w - m.el.offsetWidth - 8)
      : m.klasse === 'warnung' || m.klasse === 'mass' ? Math.min(Math.max(x, halb + 8), w - halb - 8) : x;
    m.el.style.left = `${links}px`;
    m.el.style.top = `${m.klasse === 'abstand' ? Math.max(y, m.el.offsetHeight + 56) : y}px`;
  }
}

// Übersicht der ganzen Fläche in der Draufsicht; Antippen springt dorthin
const mini = document.getElementById('mini');
const MINI_BREITE = 30;
function baueMini() {
  if (ansicht !== 'oben') return;
  const { laenge: L, breite: B } = fahrzeug();
  const k = MINI_BREITE / B;
  mini.style.height = `${L * k}px`;
  const reihenfolge = { rhm: 0, palette: 1, ladung: 2 };
  const objekte = [...zustand.objekte].sort((a, b) => reihenfolge[a.typ] - reihenfolge[b.typ]);
  mini.innerHTML = objekte.map((o) => {
    const f = fussabdruck(o);
    const farbe = auswahl?.id === o.id ? '#ffc400' : css(FARBEN[o.art] ?? 0x999999);
    return `<i style="top:${(L / 2 - f.x1) * k}px;left:${(f.z0 + B / 2) * k}px;width:${Math.max(f.lz * k - 1, 1)}px;height:${Math.max(f.lx * k - 1, 1)}px;background:${farbe}"></i>`;
  }).join('') + '<u id="mini-sicht"></u>';
}
function setzeMiniSicht() {
  const u = document.getElementById('mini-sicht');
  if (!u) return;
  const { laenge: L, breite: B } = fahrzeug();
  const k = MINI_BREITE / B;
  const halb = HOEHE_OBEN / kameraOben.zoom / 2;
  const oben = Math.max(0, (L / 2 - (steuerOben.target.x + halb)) * k), unten = Math.min(L * k, (L / 2 - (steuerOben.target.x - halb)) * k);
  u.style.top = `${oben}px`;
  u.style.height = `${Math.max(unten - oben, 4)}px`;
}
function miniSprung(ev) {
  const r = mini.getBoundingClientRect();
  const { laenge: L } = fahrzeug();
  setzeObenZiel(L / 2 - ((ev.clientY - r.top) / r.height) * L);
}
mini.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); mini.setPointerCapture(ev.pointerId); miniSprung(ev); });
mini.addEventListener('pointermove', (ev) => { if (mini.hasPointerCapture(ev.pointerId)) miniSprung(ev); });

let letzteHoehe = 0;
function groesse() {
  const { clientWidth: w, clientHeight: h } = behaelter;
  renderer.setSize(w, h, false);
  kamera3d.aspect = w / h;
  kamera3d.updateProjectionMatrix();
  const a = w / Math.max(h, 1);
  if (letzteHoehe && h && h !== letzteHoehe) kameraOben.zoom *= letzteHoehe / h;
  letzteHoehe = h;
  Object.assign(kameraOben, { left: (-HOEHE_OBEN * a) / 2, right: (HOEHE_OBEN * a) / 2, top: HOEHE_OBEN / 2, bottom: -HOEHE_OBEN / 2 });
  kameraOben.updateProjectionMatrix();
}
new ResizeObserver(groesse).observe(behaelter);
// Draufsicht: nur vor und zurück verschieben (quer fest), Zoom zwischen ganzer Fläche und Nahansicht
function begrenzeOben() {
  const { laenge: L, hoehe: H } = fahrzeug();
  // ganz heraus: ganze Fläche samt Überstand in der Höhe sichtbar
  steuerOben.minZoom = HOEHE_OBEN / (L + 2 + (uebermass?.ueberHinten ?? 0));
  if (kameraOben.zoom < steuerOben.minZoom) { kameraOben.zoom = steuerOben.minZoom; kameraOben.updateProjectionMatrix(); }
  const halb = HOEHE_OBEN / kameraOben.zoom / 2;
  const vorn = L / 2 + 1.2 - halb, hinten = -L / 2 - 0.8 - (uebermass?.ueberHinten ?? 0) + halb;
  const x = vorn < hinten ? (vorn + hinten) / 2 : Math.min(Math.max(steuerOben.target.x, hinten), vorn);
  steuerOben.target.set(x, H, 0.1);
  kameraOben.position.set(x, H + 50, 0.1);
}

renderer.setAnimationLoop(() => {
  steuerung().update();
  if (ansicht === 'oben') begrenzeOben();
  renderer.render(szene, kamera());
  setzeMarken();
  if (ansicht === 'oben') setzeMiniSicht();
});

// ---------- Rechnen und Anzeigen ----------
let geplant = false;
function aktualisiere() {
  zustand.gurte = zustand.gurte.filter((g) => !g.ziel || objekt(g.ziel));
  ergebnis = pruefe({ ...zustand, flaeche: fahrzeug() });
  reihen = ladereihen(ergebnis.ergebnisse.map((e) => e.einheit));
  uebermass = pruefeUebermass({ objekte: zustand.objekte, lage: ergebnis.lage, fahrzeug: fahrzeug(), nutzlast: zustand.nutzlast });
  if (auswahl && !(gewaehltesObjekt() || gewaehlterGurt())) auswahl = null;
  zeichne();
  zeigeErgebnis();
  zeigeLeiste();
  blattLage();
}
function aktualisiereBald() {
  if (geplant) return;
  geplant = true;
  requestAnimationFrame(() => { geplant = false; aktualisiere(); });
}
function aendere() { speichere(); aktualisiere(); }

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
  if (e.einheit.rhm) name += ', RHM darunter';
  return name;
}

/** Kurzer Status der Einheit, zu der ein Objekt gehört: { ok, text } */
function objektStatus(o) {
  const e = ergebnis.ergebnisse.find((x) => x.einheit.mitglieder.some((m) => m.id === o.id));
  if (!e) return { ok: true, text: 'trägt keine Ladung' };
  const probleme = [];
  for (const [r, d] of Object.entries(e.richtungen)) if (!d.ok) probleme.push(d.hat === 0 ? `${RNAME[r]} ungesichert` : `${RNAME[r]} ${zahl(d.auslastung * 100, 0)} %`);
  if (!e.kippen.seitlich.ok) probleme.push('kippt quer');
  if (!e.kippen.laengs.ok) probleme.push('kippt längs');
  const ids = new Set(e.einheit.mitglieder.map((m) => m.id));
  if (ergebnis.hinweise.some((h) => h.art === 'kollision' && h.ids.some((i) => ids.has(i)))) probleme.push('überschneidet sich');
  if (uebermass.meldungen.some((m) => m.art === 'auflage' && ids.has(m.id))) probleme.push('kippt über die Kante');
  if (!probleme.length) {
    const max = Math.max(...Object.values(e.richtungen).filter((d) => !d.formschluss && d.brauch > 0).map((d) => d.auslastung), 0);
    return { ok: true, text: max > 0 ? `✓ gesichert · höchstens ${zahl(max * 100, 0)} % ausgelastet` : '✓ gesichert' };
  }
  return { ok: false, text: `✗ ${probleme.slice(0, 2).join(', ')}` };
}
const einheitVon = (o) => ergebnis.ergebnisse.find((x) => x.einheit.mitglieder.some((m) => m.id === o.id));
const SEITE = { hinten: 'hinten', vorne: 'vorne' };
function gurtStatus(g) {
  const info = ergebnis.gurte.find((i) => i.id === g.id);
  if (g.art === 'direkt') {
    if (!info?.getroffen.length) return { ok: false, text: '✗ ohne Ladung' };
    if (Math.hypot(info.d.x, info.d.z) < 0.25) return { ok: false, text: '✗ Gurt fast senkrecht, hält kaum: Ladung vom Rand abrücken oder Zurrpunkt weiter weg' };
    return { ok: true, text: `α ≈ ${zahl(info.winkel, 0)}° · β ≈ ${zahl(info.beta, 0)}° · Zurrpunkt ${laenge(g.abstand)} ${g.ecke[0] === 'v' ? 'davor' : 'dahinter'}` };
  }
  if (g.art === 'kopf') {
    if (!info?.getroffen.length) return { ok: false, text: '✗ ohne Ladung' };
    return { ok: true, text: `α ≈ ${zahl(info.winkel, 0)}° · β ≈ ${zahl(info.beta, 0)}°${info.lastverteiler ? ' · um Palette als Lastverteiler' : ''}` };
  }
  if (!info?.getroffen.length) return { ok: false, text: '✗ liegt auf keiner Ladung' };
  const gekappt = g.stf > g.lc / 2 ? ` · gerechnet mit ${rechenkraftDaN(g)} daN` : '';
  return { ok: true, text: `α ≈ ${zahl(info.winkel, 0)}° · über ${info.getroffen.length} Einheit${info.getroffen.length === 1 ? '' : 'en'}${gekappt}` };
}

function zeigeErgebnis() {
  const r = ergebnis;
  const offen = r.ergebnisse.filter((e) => !e.ok).length;
  const leer = r.ergebnisse.length === 0;
  const um = uebermass, umFehler = um.meldungen.filter((m) => m.stufe === 'fehler');
  const alles = r.ok && um.ok;
  $('status').textContent = leer ? 'Keine Ladung'
    : alles ? `✓ Ladung gesichert${um.meldungen.some((m) => m.stufe === 'pflicht') ? ' · Kennzeichnung nötig' : ''}`
    : `✗ ${[offen ? `${offen} nicht gesichert` : '', umFehler.length ? 'Übermaß' : '', !offen && !umFehler.length ? 'Hinweise prüfen' : ''].filter(Boolean).join(' · ')}`;
  $('status').className = `status ${leer ? '' : alles ? 'gut' : 'schlecht'}`;
  const zeile = (name, wert, grenze, ok) => `<tr><td>${name}</td><td class="${ok ? 'gut' : 'schlecht'}">${wert}</td><td>${grenze}</td></tr>`;
  const m2 = (v) => `${zahl(v, 2)} m`;
  const masse = `<div class="masse"><b>Maße und Gewicht</b><table>
    ${zeile('Gewicht', `${zahl(um.masse, 0)} kg`, `max. ${zahl(um.nutzlast, 0)} kg`, um.masse <= um.nutzlast)}
    ${zeile('Breite', m2(um.breite), `max. ${m2(GRENZEN.breite)}`, !um.zuBreit)}
    ${zeile('Höhe', m2(um.hoehe), `max. ${m2(GRENZEN.hoehe)}`, !um.zuHoch)}
    ${zeile('Länge', m2(um.laenge), `max. ${m2(um.laengeMax)}`, um.laenge <= um.laengeMax + 1e-9)}
    ${zeile('Überstand hinten', m2(um.ueberHinten), `max. ${m2(GRENZEN.ueberstandHinten)}`, um.ueberHinten <= GRENZEN.ueberstandHinten + 1e-9)}
    </table>${um.meldungen.length ? `<ul class="meldungen">${um.meldungen.map((x) => `<li class="${x.stufe === 'fehler' ? 'schlecht' : x.stufe === 'pflicht' ? 'pflicht' : ''}">${esc(x.text)}</li>`).join('')}</ul>` : ''}</div>`;
  const meldungen = r.hinweise.map((h) => `<li class="${h.art === 'gurt' ? '' : 'schlecht'}">${esc(h.text)}</li>`).join('');
  const wand = r.stirnwandLast > 0 ? `<p class="werte">Stirnwand: ${zahl(r.stirnwandLast / 10, 0)} daN von ${zahl(STIRNWAND_KRAFT_N / 10, 0)} daN</p>` : '';
  const karten = r.ergebnisse.map((e) => {
    const zeilen = Object.entries(e.richtungen).map(([k, d]) => {
      let text;
      if (d.formschluss) text = 'Formschluss';
      else if (d.brauch === 0) text = 'hält durch Reibung';
      else if (d.hat === 0) text = 'ungesichert';
      else text = `${{ kopf: 'Kopfschlinge ', direkt: 'Direktzurren ' }[d.methode] ?? ''}${zahl(d.auslastung * 100, 0)} % ausgelastet`;
      return `<tr><td>${RNAME[k]}</td><td class="${d.ok ? 'gut' : 'schlecht'}">${text}</td></tr>`;
    }).join('');
    const kq = e.kippen.seitlich, kl = e.kippen.laengs;
    const ersteLadung = e.einheit.mitglieder.find((o) => o.typ === 'ladung');
    return `<div class="einheit ${e.ok ? '' : 'nein'}" data-waehle="${ersteLadung.id}">
      <b>${reihen.find((r) => r.ids.includes(e.id)) ? `<span class="reihe-nr">LR${reihen.find((r) => r.ids.includes(e.id)).nr}</span> ` : ''}${esc(einheitName(e))}</b>
      <span class="werte">${zahl(e.einheit.masse, 0)} kg · μ = ${zahl(e.einheit.mu)} · ${e.gurte.length} Gurt${e.gurte.length === 1 ? '' : 'e'}</span>
      <table>${zeilen}
        <tr><td>Kippen quer</td><td class="${kq.ok ? 'gut' : 'schlecht'}">${kq.brauch === 0 ? 'standsicher' : kq.ok ? 'durch Gurte gehalten' : 'kippt'}</td></tr>
        <tr><td>Kippen längs</td><td class="${kl.ok ? 'gut' : 'schlecht'}">${kl.ok ? 'standsicher' : 'kippt, anders sichern'}</td></tr>
      </table></div>`;
  }).join('');
  $('ergebnis').innerHTML = `${masse}${meldungen ? `<ul class="meldungen">${meldungen}</ul>` : ''}${wand}${karten || '<p class="werte">Noch keine Ladung auf der Fläche.</p>'}`;
}

// ---------- Leiste am ausgewählten Teil ----------
function zeigeLeiste() {
  const leiste = $('leiste');
  const o = gewaehltesObjekt(), g = gewaehlterGurt();
  if (!o && !g) { leiste.hidden = true; return; }
  leiste.hidden = false;
  const knopf = (aktion, symbol, text, extra = '') => `<button type="button" data-aktion="${aktion}" ${extra}><em>${symbol}</em>${text}</button>`;
  let status;
  if (o) {
    status = objektStatus(o);
    const reihe = reihen.find((r) => r.ids.includes(einheitVon(o)?.id));
    $('leiste-titel').textContent = `${reihe ? `LR${reihe.nr} · ` : ''}${o.typ === 'rhm' ? o.name : `${o.name} · ${zahl(o.masse, 0)} kg`}`;
    $('pad').classList.remove('nur-laengs');
    $('leiste-knoepfe').classList.toggle('vier', o.art === 'europalette');
    $('leiste-knoepfe').innerHTML = knopf('anwand', '⇧', 'An Wand') + knopf('drehen', '⟳', 'Drehen', o.form === 'zylinder' ? 'disabled' : '')
      + (o.art === 'europalette' ? knopf('hochkant', o.hochkant ? '⤓' : '⤒', o.hochkant ? 'Hinlegen' : 'Hochkant', traegtLast(o) ? 'disabled title="Erst die Ladung herunternehmen"' : '') : '')
      + knopf('gurt', '⇵', 'Gurt +', o.typ === 'rhm' ? 'disabled' : '') + knopf('bearbeiten', '✎', 'Bearbeiten') + knopf('kopieren', '⧉', 'Kopieren') + knopf('loeschen', '🗑', 'Löschen', 'class="rot"');
  } else {
    status = gurtStatus(g);
    $('leiste-titel').textContent = g.art === 'kopf' ? `Kopfschlinge ${SEITE[g.seite]} · LC ${zahl(g.lc, 0)} daN`
      : g.art === 'direkt' ? `${ZURRART[g.variante]} · LC ${zahl(g.lc, 0)} daN` : `Zurrgurt · ${zahl(g.stf, 0)} daN`;
    $('pad').classList.add('nur-laengs');
    $('leiste-knoepfe').classList.remove('vier');
    $('leiste-knoepfe').innerHTML = knopf('bearbeiten', '✎', 'Bearbeiten') + (g.art === 'kopf' || g.art === 'direkt' ? '' : knopf('kopieren', '⧉', 'Kopieren')) + knopf('loeschen', '🗑', 'Löschen', 'class="rot"');
  }
  $('leiste-status').textContent = status.text;
  $('leiste-status').className = status.ok ? 'gut' : 'schlecht';
}

const SCHRITT = 0.05;
const traegtLast = (o) => zustand.objekte.some((a) => ergebnis.lage.get(a.id)?.traeger?.id === o.id);
const direktAbstand = (v) => Math.round(Math.min(Math.max(v, 0), 4) * 100) / 100;
let alleVierAn = true;
// Wert eines Direktzurrgurts setzen, auf Wunsch für alle Gurte derselben Zurrung
function setzeDirekt(g, name, wert) {
  for (const x of zustand.gurte) if (x === g || (alleVierAn && x.gruppe && x.gruppe === g.gruppe)) x[name] = wert;
}
const kopfAbstand = (v) => Math.round(Math.min(Math.max(v, 0.2), 8) * 100) / 100;
$('pad').addEventListener('click', (ev) => {
  const schub = ev.target.closest('[data-schub]')?.dataset.schub;
  if (!schub) return;
  const [quer, laengs] = schub.split(',').map(Number);
  const o = gewaehltesObjekt(), g = gewaehlterGurt();
  if (o) verschiebe(zustand.objekte, ergebnis.lage, o, laengs * SCHRITT, quer * SCHRITT, fahrzeug());
  if (g?.art === 'kopf') g.abstand = kopfAbstand(g.abstand + laengs * SCHRITT * (g.seite === 'vorne' ? -1 : 1));
  else if (g?.art === 'direkt') setzeDirekt(g, 'abstand', direktAbstand(g.abstand + laengs * SCHRITT * (g.ecke[0] === 'v' ? 1 : -1)));
  else if (g) { const L = fahrzeug().laenge / 2; g.x = Math.round(Math.min(Math.max(g.x + laengs * SCHRITT, -L), L) * 1000) / 1000; }
  aendere();
});

$('leiste-knoepfe').addEventListener('click', (ev) => {
  const aktion = ev.target.closest('[data-aktion]')?.dataset.aktion;
  if (aktion) fuehreAus(aktion);
});

function fuehreAus(aktion) {
  const o = gewaehltesObjekt(), g = gewaehlterGurt();
  const L = fahrzeug().laenge;
  if (aktion === 'bearbeiten') { if (o) oeffneObjektBlatt(); else if (g.art === 'kopf') oeffneKopfBlatt(); else if (g.art === 'direkt') oeffneDirektBlatt(); else oeffneGurtBlatt(); return; }
  if (o) {
    const { wurzel, gruppe } = bewegGruppe(zustand.objekte, ergebnis.lage, o);
    if (aktion === 'anwand') anWand(zustand.objekte, ergebnis.lage, o, fahrzeug());
    if (aktion === 'drehen') {
      // Quer- und Längsmaß tauschen; Teile auf der Einheit drehen mit
      for (const a of gruppe) {
        const dx = a.x - wurzel.x, dz = a.z - wurzel.z;
        a.x = wurzel.x + dz; a.z = wurzel.z + dx;
        if (a.form !== 'zylinder') a.drehung = a.drehung === 90 ? 0 : 90;
      }
      ergebnis = pruefe({ ...zustand, flaeche: fahrzeug() });
      verschiebe(zustand.objekte, ergebnis.lage, o, 0, 0, fahrzeug());
    }
    if (aktion === 'gurt') { oeffneGurtWahl(); return; }
    if (aktion === 'hochkant' && !traegtLast(o)) [o.l, o.b, o.h, o.hochkant] = o.hochkant ? [1.2, 0.8, 0.144, false] : [0.144, 1.2, 0.8, true];
    if (aktion === 'kopieren') {
      const neu = new Map(gruppe.map((a) => [a.id, { ...a, id: neueId('o') }]));
      const kopien = [...neu.values()];
      const u = vereinigung(kopien);
      const ziel = freieStelle(u.x1 - u.x0, u.z1 - u.z0);
      for (const k of kopien) { k.x += ziel.x - (u.x0 + u.x1) / 2; k.z += ziel.z - (u.z0 + u.z1) / 2; }
      zustand.objekte.push(...kopien);
      auswahl = { art: 'objekt', id: neu.get(o.id).id };
    }
    if (aktion === 'loeschen') {
      // eigene Palette/RHM unter der Ladung mit entfernen, geteilte bleiben liegen
      const u = unterlage(zustand.objekte, ergebnis.lage, o);
      const weg = new Set([o.id, ...(o.typ === 'ladung' && !u.geteilt ? u.kette.map((a) => a.id) : [])]);
      zustand.objekte = zustand.objekte.filter((a) => !weg.has(a.id));
      // Gurte, die nur über dieser Ladung lagen, gehen mit
      const e = ergebnis.ergebnisse.find((x) => x.einheit.mitglieder.some((m) => m.id === o.id));
      if (e && o.typ === 'ladung' && e.einheit.mitglieder.filter((m) => m.typ === 'ladung').length === 1) {
        const nurHier = new Set(ergebnis.gurte.filter((i) => i.getroffen.length === 1 && i.getroffen[0] === e.id).map((i) => i.id));
        zustand.gurte = zustand.gurte.filter((x) => !nurHier.has(x.id));
      }
      // Kopfschlingen an gelöschter Ladung: auf andere Ladung der Einheit umhängen, sonst entfernen
      const rest = e?.einheit.mitglieder.find((m) => m.typ === 'ladung' && !weg.has(m.id));
      for (const k of zustand.gurte) if (k.ziel && weg.has(k.ziel) && rest) k.ziel = rest.id;
      zustand.gurte = zustand.gurte.filter((k) => !k.ziel || !weg.has(k.ziel));
      auswahl = null;
    }
  } else if (g) {
    if (aktion === 'kopieren') {
      const k = { ...g, id: neueId('g'), x: Math.max(g.x - 0.3, -L / 2) };
      zustand.gurte.push(k);
      auswahl = { art: 'gurt', id: k.id };
    }
    if (aktion === 'loeschen') { zustand.gurte = zustand.gurte.filter((x) => x !== g); auswahl = null; }
  }
  schliesseBlatt();
  aendere();
}

// ---------- Fenster von unten ----------
const blattHg = $('blatt'), blattInhalt = $('blatt-inhalt');
function oeffneBlatt(html) {
  blattInhalt.innerHTML = html;
  blattHg.hidden = false;
  blattLage();
}
function schliesseBlatt() { blattHg.hidden = true; blattInhalt.textContent = ''; }
blattHg.addEventListener('click', (ev) => { if (ev.target === blattHg) schliesseBlatt(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') schliesseBlatt(); });

function stepper(feld, wert, { schritt, min, max, einheit = '', nk = 2, platzhalter = '' }) {
  const v = wert === '' ? '' : Number(wert).toFixed(nk);
  return `<div class="step" data-feld="${feld}" data-schritt="${schritt}" data-min="${min}" data-max="${max}" data-nk="${nk}">
    <button type="button" data-d="-1" aria-label="weniger">−</button>
    <input type="number" inputmode="decimal" step="any" value="${v}" placeholder="${platzhalter}" aria-label="${feld}">
    ${einheit ? `<span class="einh">${einheit}</span>` : ''}
    <button type="button" data-d="1" aria-label="mehr">+</button></div>`;
}
const feld = (titel, inhalt) => `<div class="feld"><span>${titel}</span>${inhalt}</div>`;
const fuss = (loeschen = true) => `<div class="fuss">${loeschen ? '<button type="button" class="gefahr" data-blatt="loeschen">Löschen</button>' : ''}<button type="button" data-blatt="fertig">Fertig</button></div>`;

function oeffneObjektBlatt() {
  const o = gewaehltesObjekt();
  if (!o) return;
  const zyl = o.form === 'zylinder';
  const m = { schritt: 0.05, min: 0.05, max: 15, einheit: '', nk: 2 };
  let lagePalette = '';
  if (o.art === 'europalette') {
    const jetzt = !o.hochkant ? 'liegend' : o.b > 1 ? 'hochkant12' : 'hochkant08';
    const wahl = [['liegend', 'liegend'], ['hochkant12', 'hochkant, 1,2 m breit'], ['hochkant08', 'hochkant, 0,8 m breit']];
    lagePalette = feld('Lage', `<div class="chips">${wahl.map(([k, t]) => `<button type="button" data-lage="${k}" class="${jetzt === k ? 'an' : ''}">${t}</button>`).join('')}</div>
      <p class="werte">Hochkant dient sie als Lastverteiler für eine Kopfschlinge oder als Füllmittel vor der Stirnwand.</p>`);
  }
  let masse = '';
  if (o.typ !== 'rhm') masse = feld('Masse', stepper('masse', o.masse, { schritt: o.masse >= 500 ? 50 : 10, min: 1, max: 40000, einheit: 'kg', nk: 0 }));
  const masze = o.hochkant ? '' : zyl
    ? feld('Maße in m (Durchmesser · Höhe)', `<div class="drei" style="grid-template-columns:1fr 1fr">${stepper('durchmesser', o.l, m)}${stepper('h', o.h, m)}</div>`)
    : o.typ === 'rhm'
      ? feld('Maße in m (Länge · Breite)', `<div class="drei" style="grid-template-columns:1fr 1fr">${stepper('l', o.l, m)}${stepper('b', o.b, m)}</div>`)
      : feld('Maße in m (Länge · Breite · Höhe)', `<div class="drei">${stepper('l', o.l, m)}${stepper('b', o.b, m)}${stepper('h', o.h, { ...m, min: 0.02 })}</div>`);
  let stehtAuf = '';
  if (o.typ !== 'rhm' && !o.hochkant) {
    const u = unterlage(zustand.objekte, ergebnis.lage, o);
    const wahl = o.typ === 'ladung'
      ? [['flaeche', 'Ladefläche'], ['palette', 'Palette'], ['matte', 'RHM'], ['palette-matte', 'Palette + RHM']]
      : [['flaeche', 'Ladefläche'], ['matte', 'RHM']];
    const gesperrt = u.geteilt || u.art === 'ladung';
    const notiz = u.geteilt ? '<p class="werte">Steht mit anderer Ladung auf derselben Unterlage; dort bearbeiten.</p>' : u.art === 'ladung' ? '<p class="werte">Steht auf anderer Ladung.</p>' : '';
    stehtAuf = feld(`Steht auf <span class="werte">· μ = ${zahl(fugenReibung(o, ergebnis.lage.get(o.id).traeger))}</span>`, `<div class="chips">${wahl.map(([k, t]) => `<button type="button" data-unterlage="${k}" class="${u.art === k ? 'an' : ''}" ${gesperrt ? 'disabled' : ''}>${t}</button>`).join('')}</div>${notiz}`);
  }
  let mehr = '';
  if (o.typ !== 'rhm' && !o.hochkant) {
    const auto = fugenReibung({ ...o, mu: 0 }, ergebnis.lage.get(o.id).traeger);
    const material = o.typ === 'ladung'
      ? `<label>Material der Unterseite<select data-feld="material">${Object.entries(MATERIALIEN).map(([k, n]) => `<option value="${k}" ${k === o.material ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`
      : '';
    mehr = `<details class="mehr"><summary>Mehr: ${o.typ === 'ladung' ? 'Material, ' : ''}Reibbeiwert μ</summary><div class="inhalt">${material}
      ${feld('Reibbeiwert μ der Fuge darunter', `${stepper('mu', o.mu || auto, { schritt: 0.05, min: 0.05, max: 1, nk: 2 })}<div class="chips" style="margin-top:6px"><button type="button" data-mu-auto class="${o.mu ? '' : 'an'}">automatisch (${zahl(auto)})</button></div>`)}
      </div></details>`;
  }
  oeffneBlatt(`<h3 id="blatt-titel">${esc(o.name)}</h3><div class="lage" id="blatt-lage"></div>${masse}${lagePalette}${masze}${stehtAuf}${mehr}${fuss()}`);
}

function oeffneGurtBlatt() {
  const g = gewaehlterGurt();
  if (!g) return;
  const L = fahrzeug().laenge;
  oeffneBlatt(`<h3 id="blatt-titel">Zurrgurt</h3><div class="lage" id="blatt-lage"></div>
    ${feld('Vorspannkraft S<sub>TF</sub> (vom Etikett)', `${stepper('stf', g.stf, { schritt: 50, min: 50, max: 2000, einheit: 'daN', nk: 0 })}<input type="range" min="50" max="1250" step="10" value="${g.stf}" data-range="stf" aria-label="Vorspannkraft">`)}
    ${feld('Gurttyp übernehmen', `<div class="chips">${GURTTYPEN.map((t) => `<button type="button" data-gurttyp="${t.id}" class="${t.stf === g.stf && t.lc === g.lc ? 'an' : ''}">${esc(t.name.replace('Zurrgurt, ', ''))} · ${t.stf} daN</button>`).join('')}</div>`)}
    <div class="drei" style="grid-template-columns:1fr 1fr">
      ${feld('Zurrkraft LC', stepper('lc', g.lc, { schritt: 500, min: 500, max: 10000, einheit: 'daN', nk: 0 }))}
      ${feld('Abstand Stirnwand', stepper('abstand', L / 2 - g.x, { schritt: 0.05, min: 0, max: L, einheit: 'm', nk: 2 }))}
    </div>
    ${feld('Ratschen', `<div class="chips"><button type="button" data-ratschen="1" class="${g.zweiRatschen ? '' : 'an'}">eine Seite (k = 1,5)</button><button type="button" data-ratschen="2" class="${g.zweiRatschen ? 'an' : ''}">beide Seiten (k = 2)</button></div>`)}
    ${fuss()}`);
}

function oeffneKopfBlatt() {
  const g = gewaehlterGurt();
  if (!g) return;
  oeffneBlatt(`<h3 id="blatt-titel">Kopfschlinge</h3><div class="lage" id="blatt-lage"></div>
    ${feld('Seite der Ladung', `<div class="chips"><button type="button" data-seite="hinten" class="${g.seite === 'hinten' ? 'an' : ''}">hinten (hält nach hinten)</button><button type="button" data-seite="vorne" class="${g.seite === 'vorne' ? 'an' : ''}">vorne (hält nach vorne)</button></div>`)}
    <div class="drei" style="grid-template-columns:1fr 1fr">
      ${feld('Zurrkraft LC', stepper('lc', g.lc, { schritt: 500, min: 500, max: 10000, einheit: 'daN', nk: 0 }))}
      ${feld('Zurrpunkte entfernt', stepper('zurrabstand', g.abstand, { schritt: 0.05, min: 0.2, max: 8, einheit: 'm', nk: 2 }))}
    </div>
    <p class="werte">Gerechnet als Direktzurren: je Schenkel LC · (cos α · cos β + 0,75 · μ · sin α). Je weiter die Zurrpunkte entfernt sind, desto flacher und wirksamer zieht die Schlinge.</p>
    ${fuss()}`);
}

function oeffneDirektBlatt() {
  const g = gewaehlterGurt();
  if (!g) return;
  const anzahl = zustand.gurte.filter((x) => x.gruppe && x.gruppe === g.gruppe).length;
  const ziel = objekt(g.ziel);
  oeffneBlatt(`<h3 id="blatt-titel">${ZURRART[g.variante]}</h3><div class="lage" id="blatt-lage"></div>
    <div class="drei" style="grid-template-columns:1fr 1fr">
      ${feld('Zurrkraft LC', stepper('dlc', g.lc, { schritt: 500, min: 500, max: 10000, einheit: 'daN', nk: 0 }))}
      ${feld('Zurrpunkt am Rahmen', stepper('dabstand', g.abstand, { schritt: 0.05, min: 0, max: 4, einheit: 'm', nk: 2 }))}
    </div>
    ${feld('Höhe des Zurrpunkts an der Ladung', stepper('anschlag', g.anschlag, { schritt: 0.05, min: 0.05, max: ziel ? +(ergebnis.lage.get(ziel.id).y + ziel.h).toFixed(2) : 4, einheit: 'm', nk: 2 }))}
    ${anzahl > 1 ? `<div class="chips"><button type="button" data-alle class="${alleVierAn ? 'an' : ''}">für alle ${anzahl} Gurte übernehmen</button></div>` : ''}
    <p class="werte">„Zurrpunkt am Rahmen“: wie weit der Zurrpunkt in Längsrichtung von der Ecke entfernt ist (0 = genau seitlich, Schrägzurren). Je Gurt gilt LC · (cos α · cos β + 0,75 · μ · sin α). Die Ladung braucht eigene Zurrpunkte mit mindestens dieser LC.</p>
    <div class="fuss"><button type="button" class="gefahr" data-blatt="loeschen">Diesen löschen</button>${anzahl > 1 ? '<button type="button" class="gefahr" data-blatt="alle-loeschen">Alle löschen</button>' : ''}<button type="button" data-blatt="fertig">Fertig</button></div>`);
}

function neueDirektzurrung(ladung, variante) {
  const e = einheitVon(ladung);
  if (!e) return;
  const gruppe = neueId('z');
  const anschlag = Math.round(Math.min(0.5, e.einheit.hoehe / 2) * 100) / 100;
  const neu = ['vl', 'vr', 'hl', 'hr'].map((ecke) => ({ id: neueId('g'), art: 'direkt', variante, gruppe, ziel: ladung.id, ecke, abstand: variante === 'diagonal' ? 1.0 : 0, anschlag, lc: 2500, stf: 500 }));
  zustand.gurte.push(...neu);
  auswahl = { art: 'gurt', id: neu[3].id };
  aendere();
}

let verteilerAn = true;
/**
 * Zu welcher Ladung ein Gurt gehört: Ladegut selbst, Ladung auf einer Palette/RHM,
 * oder bei einer Hochkant-Palette die Ladung, an der sie steht (mit der passenden Seite).
 */
function gurtZiel(o) {
  if (!o) return {};
  if (o.typ === 'ladung') return { ladung: o };
  if (o.hochkant) {
    const f = fussabdruck(o);
    for (const e of ergebnis.ergebnisse) {
      const u = e.einheit.f;
      if (!(u.z0 < f.z1 && f.z0 < u.z1)) continue;
      const ladung = e.einheit.mitglieder.find((m) => m.typ === 'ladung');
      if (Math.abs(u.x0 - f.x1) <= 0.05) return { ladung, seite: 'hinten' };
      if (Math.abs(u.x1 - f.x0) <= 0.05) return { ladung, seite: 'vorne' };
    }
    return {};
  }
  const e = einheitVon(o);
  return { ladung: e?.einheit.mitglieder.find((m) => m.typ === 'ladung') };
}

function oeffneGurtWahl() {
  const o = gewaehltesObjekt();
  const { ladung, seite } = gurtZiel(o);
  const e = ladung ? einheitVon(ladung) : null;
  const k = (art, titel, text) => {
    const aus = art !== 'nieder' && (!e || (seite && !art.endsWith(seite)));
    return `<button type="button" data-neu="${art}" ${aus ? 'disabled' : ''}><span>${titel}<small>${text}</small></span></button>`;
  };
  oeffneBlatt(`<h3 id="blatt-titel">Gurt hinzufügen</h3>
    <div class="katalog" style="grid-template-columns:1fr">
      ${k('nieder', 'Niederzurren', 'quer über die Ladung, drückt sie auf die Fläche')}
      ${k('kopf-hinten', 'Kopfschlinge hinten', 'Schlinge um die Rückseite, hält gegen Rutschen nach hinten')}
      ${k('kopf-vorne', 'Kopfschlinge vorne', 'Schlinge um die Vorderseite, hält gegen Rutschen nach vorne')}
      ${seite ? '' : k('diagonal', 'Diagonalzurren (4 Gurte)', 'von den Ecken schräg nach außen, hält längs und quer')}
      ${seite ? '' : k('schraeg', 'Schrägzurren (4 Gurte)', 'von den Ecken quer zur Seite, hält seitlich')}
    </div>
    ${e && !seite ? `<div class="chips"><button type="button" data-verteiler class="${verteilerAn ? 'an' : ''}">Palette hochkant als Lastverteiler dazustellen</button></div>` : ''}
    ${seite ? '<p class="werte">Die Schlinge läuft um diese Palette und die Ladung dahinter.</p>' : ''}
    ${!e ? `<p class="werte">${o?.hochkant ? 'Für eine Kopfschlinge die Palette direkt an die Ladung stellen (Knopf „An Wand“ oder ziehen).' : 'Für eine Kopfschlinge zuerst Ladegut antippen.'}</p>` : ''}
    <div style="height:12px"></div>${fuss(false)}`);
}

function neueKopfschlinge(o, seite) {
  const e = einheitVon(o);
  if (!e) return;
  if (verteilerAn) {
    const k = kopfLage({ seite, abstand: 1 }, e.einheit, zustand.objekte.filter((p) => p.typ === 'palette' && p.hochkant), fahrzeug());
    if (!k.lastverteiler) {
      const { f } = e.einheit;
      const breit = f.z1 - f.z0 >= 0.95 ? 1.2 : 0.8;
      zustand.objekte.push({
        ...HILFSMITTEL.find((v) => v.art === 'europalette'), id: neueId('o'), mu: 0, drehung: 0, hochkant: true,
        l: 0.144, b: breit, h: breit > 1 ? 0.8 : 1.2,
        x: seite === 'hinten' ? f.x0 - 0.072 : f.x1 + 0.072,
        z: Math.min(Math.max((f.z0 + f.z1) / 2, -fahrzeug().breite / 2 + breit / 2), fahrzeug().breite / 2 - breit / 2), // nicht über den Rand
      });
    }
  }
  const g = { id: neueId('g'), art: 'kopf', ziel: o.id, seite, abstand: 1.0, lc: 2500, stf: 500 };
  zustand.gurte.push(g);
  auswahl = { art: 'gurt', id: g.id };
  aendere();
}

function blattLage() {
  const ziel = $('blatt-lage');
  if (!ziel || blattHg.hidden) return;
  const o = gewaehltesObjekt(), g = gewaehlterGurt();
  const s = o ? objektStatus(o) : g ? gurtStatus(g) : null;
  if (!s) { schliesseBlatt(); return; }
  const zusatz = o?.typ === 'rhm' ? ` · μ = ${zahl(MU_RHM)} für alles darauf` : '';
  ziel.textContent = s.text + zusatz;
  ziel.className = `lage ${s.ok ? 'gut' : 'schlecht'}`;
}

function setzeWert(name, v) {
  const o = gewaehltesObjekt(), g = gewaehlterGurt();
  if (o) {
    if (name === 'durchmesser') { o.l = o.b = v; } else if (name === 'material') o.material = v; else o[name] = v;
    if (name === 'mu') { const c = blattInhalt.querySelector('[data-mu-auto]'); c?.classList.remove('an'); }
  } else if (g) {
    if (name === 'abstand') g.x = Math.round((fahrzeug().laenge / 2 - v) * 1000) / 1000;
    else if (name === 'zurrabstand') g.abstand = kopfAbstand(v);
    else if (name === 'dlc') setzeDirekt(g, 'lc', v);
    else if (name === 'dabstand') setzeDirekt(g, 'abstand', direktAbstand(v));
    else if (name === 'anschlag') setzeDirekt(g, 'anschlag', v);
    else g[name] = v;
    if (name === 'stf') { for (const r of blattInhalt.querySelectorAll('[data-range="stf"]')) r.value = v; for (const i of blattInhalt.querySelectorAll('[data-feld="stf"] input')) if (+i.value !== v) i.value = v; }
    if (name === 'stf' || name === 'lc') for (const c of blattInhalt.querySelectorAll('[data-gurttyp]')) { const t = GURTTYPEN.find((x) => x.id === c.dataset.gurttyp); c.classList.toggle('an', t.stf === g.stf && t.lc === g.lc); }
  }
  speichere();
  aktualisiereBald();
}

blattInhalt.addEventListener('click', (ev) => {
  const el = ev.target.closest('button');
  if (!el) return;
  const o = gewaehltesObjekt(), g = gewaehlterGurt();
  if (el.dataset.d) {
    const s = el.closest('.step'), input = s.querySelector('input');
    const { schritt, min, max, nk } = s.dataset;
    const v = Math.min(Math.max((+input.value || 0) + +el.dataset.d * +schritt, +min), +max);
    input.value = v.toFixed(+nk);
    setzeWert(s.dataset.feld, +input.value);
  } else if (el.dataset.blatt === 'fertig') schliesseBlatt();
  else if (el.dataset.blatt === 'loeschen') fuehreAus('loeschen');
  else if (el.dataset.blatt === 'alle-loeschen' && g) {
    zustand.gurte = zustand.gurte.filter((x) => x.gruppe !== g.gruppe);
    auswahl = null;
    schliesseBlatt();
    aendere();
  } else if (el.hasAttribute('data-alle')) {
    alleVierAn = !alleVierAn;
    el.classList.toggle('an', alleVierAn);
  }
  else if (el.dataset.unterlage && o) {
    setzeUnterlage(zustand.objekte, ergebnis.lage, o, el.dataset.unterlage, neueId);
    aendere();
    oeffneObjektBlatt();
  } else if (el.hasAttribute('data-mu-auto') && o) {
    o.mu = 0;
    aendere();
    oeffneObjektBlatt();
    blattInhalt.querySelector('details.mehr').open = true;
  } else if (el.dataset.gurttyp && g) {
    const t = GURTTYPEN.find((x) => x.id === el.dataset.gurttyp);
    g.stf = t.stf; g.lc = t.lc;
    aendere();
    oeffneGurtBlatt();
  } else if (el.dataset.ratschen && g) {
    g.zweiRatschen = el.dataset.ratschen === '2';
    aendere();
    oeffneGurtBlatt();
  } else if (el.dataset.lage && o) {
    const maße = { liegend: [1.2, 0.8, 0.144, false], hochkant12: [0.144, 1.2, 0.8, true], hochkant08: [0.144, 0.8, 1.2, true] }[el.dataset.lage];
    [o.l, o.b, o.h, o.hochkant] = maße;
    aendere();
    oeffneObjektBlatt();
  } else if (el.dataset.seite && g) {
    g.seite = el.dataset.seite;
    aendere();
    oeffneKopfBlatt();
  } else if (el.hasAttribute('data-verteiler')) {
    verteilerAn = !verteilerAn;
    el.classList.toggle('an', verteilerAn);
  } else if (el.dataset.neu) {
    const art = el.dataset.neu, sel = gewaehltesObjekt();
    schliesseBlatt();
    if (art === 'nieder') {
      const ziel = gurtZiel(sel).ladung;
      const e = ziel ? einheitVon(ziel) : ergebnis.ergebnisse.find((x) => x.gurte.length === 0);
      neuerGurt(e ? freierGurtX(zustand.gurte, e.einheit.f) : ansicht === 'oben' ? steuerOben.target.x : 0);
    } else {
      const { ladung } = gurtZiel(sel);
      if (ladung && (art === 'diagonal' || art === 'schraeg')) neueDirektzurrung(ladung, art);
      else if (ladung) neueKopfschlinge(ladung, art === 'kopf-hinten' ? 'hinten' : 'vorne');
    }
  } else if (el.dataset.ladegut) {
    schliesseBlatt();
    neuesObjekt(LADEGUT.find((v) => v.art === el.dataset.ladegut));
  }
});
blattInhalt.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.range) { setzeWert(el.dataset.range, +el.value); return; }
  if (el.dataset.feld === 'material') { setzeWert('material', el.value); return; }
  const s = el.closest('.step');
  if (!s || el.value === '') return;
  const v = +el.value;
  if (Number.isFinite(v) && v >= +s.dataset.min && v <= +s.dataset.max) setzeWert(s.dataset.feld, v);
});

function oeffneKatalog() {
  oeffneBlatt(`<h3 id="blatt-titel">Ladegut hinzufügen</h3>
    <div class="katalog">${LADEGUT.map((v) => `<button type="button" data-ladegut="${v.art}"><i style="background:${css(FARBEN[v.art])}"></i><span>${esc(v.name)}<small>${zahl(v.masse, 0)} kg · ${v.form === 'zylinder' ? `Ø ${zahl(v.l)} m` : `${zahl(v.l)} × ${zahl(v.b)} m`}</small></span></button>`).join('')}</div>
    <p class="werte">${gewaehltesObjekt()?.typ === 'palette' || gewaehltesObjekt()?.typ === 'rhm' ? 'Kommt auf die ausgewählte Palette bzw. RHM.' : 'Kommt an die nächste freie Stelle.'}</p>
    ${fuss(false)}`);
}

// ---------- Hinzufügen ----------
/** Freie Stelle für eine Grundfläche lx × lz suchen, von der Stirnwand nach hinten */
function freieStelle(lx, lz) {
  const { laenge: L, breite: B } = fahrzeug();
  const andere = zustand.objekte.map(fussabdruck);
  for (let x = L / 2; x - lx >= -L / 2 - 1e-6; x -= 0.05) {
    for (const seite of [-1, 1, 0]) {
      const z = seite * (B / 2 - lz / 2);
      const f = { x0: x - lx, x1: x, z0: z - lz / 2, z1: z + lz / 2 };
      if (!andere.some((a) => f.x0 < a.x1 - 1e-6 && a.x0 < f.x1 - 1e-6 && f.z0 < a.z1 - 1e-6 && a.z0 < f.z1 - 1e-6)) return { x: Math.round((x - lx / 2) * 1000) / 1000, z };
    }
  }
  return { x: 0, z: 0 };
}
function neuesObjekt(vorlage) {
  const o = { typ: 'ladung', ...vorlage, id: neueId('o'), x: 0, z: 0, drehung: 0, mu: 0 };
  const sel = gewaehltesObjekt();
  if (o.typ === 'ladung' && sel && sel.typ !== 'ladung') { o.x = sel.x; o.z = sel.z; o.drehung = sel.drehung; }
  else { const p = freieStelle(o.l, o.b); o.x = p.x; o.z = p.z; }
  zustand.objekte.push(o);
  auswahl = { art: 'objekt', id: o.id };
  aendere();
  zeigeImBild(o.x);
}
function neuerGurt(x) {
  const typ = GURTTYPEN.find((t) => t.id === 'langhebel');
  const g = { id: neueId('g'), x, stf: typ.stf, lc: typ.lc, zweiRatschen: false };
  zustand.gurte.push(g);
  auswahl = { art: 'gurt', id: g.id };
  aendere();
}
// In der Draufsicht dorthin scrollen, wo gerade etwas hinzugekommen ist
function zeigeImBild(x) {
  if (ansicht !== 'oben') return;
  const halb = HOEHE_OBEN / kameraOben.zoom / 2;
  if (Math.abs(x - steuerOben.target.x) > halb * 0.7) setzeObenZiel(x);
}

// ---------- Ziehen in der Ansicht ----------
const strahl = new THREE.Raycaster();
const zeiger = new THREE.Vector2();
let ziehen = null;
let druck = null;

function treffe(ev, y) {
  const r = renderer.domElement.getBoundingClientRect();
  zeiger.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  strahl.setFromCamera(zeiger, kamera());
  return { treffer: strahl.intersectObjects(anklickbar, false)[0], punkt: strahl.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3()) };
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
  const sprung = (kand) => kand.map(([ist, soll]) => soll - ist).filter((d) => Math.abs(d) < MAGNET).sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
  o.x += sprung(kandX);
  o.z += sprung(kandZ);
  f = fussabdruck(o);
  // vorne bis zur Stirnwand, hinten und seitlich darf Ladung überstehen
  const hinten = -L / 2 - UEBERSTAND_MAX.hinten, quer = B / 2 + UEBERSTAND_MAX.seitlich;
  o.x += Math.max(0, hinten - f.x0) - Math.max(0, f.x1 - L / 2);
  o.z += Math.max(0, Math.min(-quer - f.z0, 0)) - Math.max(0, f.z1 - quer);
}

// Erfasst den Druck vor der Kamerasteuerung, damit Ziehen die Ansicht nicht bewegt
// Nur das ausgewählte Teil lässt sich ziehen. Ein anderes Teil wird beim Loslassen (Antippen) ausgewählt;
// bis dahin bewegt die Geste die Ansicht. Kommt ein zweiter Finger dazu, wird das Ziehen abgebrochen.
let tippZiel = null;
const aktiveZeiger = new Set();
function brichZiehenAb() {
  if (!ziehen) return;
  for (const [id, p] of ziehen.positionen) { const a = objekt(id); if (a) { a.x = p.x; a.z = p.z; } }
  const g = ziehen.ziel.art === 'gurt' ? gurt(ziehen.ziel.id) : null;
  if (g) { if (g.art === 'kopf' || g.art === 'direkt') g.abstand = ziehen.gurtX; else g.x = ziehen.gurtX; }
  ziehen = null;
  steuerung().enabled = true;
  aktualisiere();
}

behaelter.addEventListener('pointerdown', (ev) => {
  if (ev.target !== renderer.domElement) return;
  aktiveZeiger.add(ev.pointerId);
  if (aktiveZeiger.size > 1) { brichZiehenAb(); tippZiel = null; druck = null; return; }
  druck = { x: ev.clientX, y: ev.clientY };
  tippZiel = null;
  const { treffer } = treffe(ev, fahrzeug().hoehe);
  if (!treffer) return;
  const ziel = treffer.object.userData.ziel;
  if (auswahl?.id !== ziel.id) { tippZiel = ziel; return; }
  steuerung().enabled = false;
  let gruppe = [], wurzel = null;
  if (ziel.art === 'objekt') ({ gruppe, wurzel } = bewegGruppe(zustand.objekte, ergebnis.lage, objekt(ziel.id)));
  const yEbene = fahrzeug().hoehe + (wurzel ? ergebnis.lage.get(wurzel.id).y : 0);
  const { punkt } = treffe(ev, yEbene);
  ziehen = { ziel, wurzel, yEbene, start: punkt, bewegt: false, positionen: new Map(gruppe.map((a) => [a.id, { x: a.x, z: a.z }])), gurtX: ziel.art === 'gurt' ? (gurt(ziel.id).art === 'kopf' || gurt(ziel.id).art === 'direkt' ? gurt(ziel.id).abstand : gurt(ziel.id).x) : 0 };
  renderer.domElement.setPointerCapture(ev.pointerId);
}, { capture: true });

renderer.domElement.addEventListener('pointermove', (ev) => {
  if (!ziehen || !ziehen.start) return;
  if (!ziehen.bewegt && Math.hypot(ev.clientX - druck.x, ev.clientY - druck.y) < 4) return; // Antippen nicht als Ziehen werten
  ziehen.bewegt = true;
  const { punkt } = treffe(ev, ziehen.yEbene);
  if (!punkt) return;
  const dx = punkt.x - ziehen.start.x, dz = punkt.z - ziehen.start.z;
  if (ziehen.ziel.art === 'gurt' && gurt(ziehen.ziel.id).art === 'direkt') {
    const g = gurt(ziehen.ziel.id);
    g.abstand = direktAbstand(Math.round((ziehen.gurtX + dx * (g.ecke[0] === 'v' ? 1 : -1)) / RASTER) * RASTER);
  } else if (ziehen.ziel.art === 'gurt' && gurt(ziehen.ziel.id).art === 'kopf') {
    const g = gurt(ziehen.ziel.id);
    g.abstand = kopfAbstand(Math.round((ziehen.gurtX + dx * (g.seite === 'vorne' ? -1 : 1)) / RASTER) * RASTER);
  } else if (ziehen.ziel.art === 'gurt') {
    const L = fahrzeug().laenge;
    gurt(ziehen.ziel.id).x = Math.min(Math.max(Math.round((ziehen.gurtX + dx) / RASTER) * RASTER, -L / 2), L / 2);
  } else {
    const w = ziehen.wurzel, s = ziehen.positionen.get(w.id);
    w.x = s.x + dx; w.z = s.z + dz;
    einrasten(w, new Set(ziehen.positionen.keys()));
    const vx = w.x - s.x, vz = w.z - s.z;
    for (const [id, p] of ziehen.positionen) if (id !== w.id) { const a = objekt(id); a.x = p.x + vx; a.z = p.z + vz; }
  }
  aktualisiereBald();
});

function zeigerHoch(ev) {
  aktiveZeiger.delete(ev.pointerId);
  if (ziehen) {
    const bewegt = ziehen.bewegt;
    ziehen = null;
    steuerung().enabled = true;
    if (bewegt) aendere();
  } else if (druck && Math.hypot(ev.clientX - druck.x, ev.clientY - druck.y) < 6) {
    // Antippen: anderes Teil auswählen, ins Leere tippen hebt die Auswahl auf
    if (tippZiel) { auswahl = { ...tippZiel }; aktualisiere(); }
    else if (auswahl) { auswahl = null; aktualisiere(); }
  }
  druck = null;
  tippZiel = null;
}
renderer.domElement.addEventListener('pointerup', zeigerHoch);
renderer.domElement.addEventListener('pointercancel', (ev) => { aktiveZeiger.delete(ev.pointerId); brichZiehenAb(); druck = null; tippZiel = null; });

// ---------- Ansicht umschalten ----------
function setzeAnsicht(neu, erstesMal = false) {
  ansicht = neu;
  try { localStorage.setItem('lasi3d-ansicht', neu); } catch { /* egal */ }
  steuer3d.enabled = neu === '3d';
  steuerOben.enabled = neu === 'oben';
  sonne.castShadow = neu === '3d';
  document.body.classList.toggle('oben', neu === 'oben');
  mini.hidden = neu !== 'oben';
  for (const b of document.querySelectorAll('[data-ansicht]')) b.classList.toggle('an', b.dataset.ansicht === neu);
  // nach der Größenänderung der Ansicht neu einrichten
  requestAnimationFrame(() => {
    groesse();
    if (neu === 'oben') {
      const o = gewaehltesObjekt();
      if (erstesMal) rahmeOben(); else if (o) setzeObenZiel(o.x);
    }
    aktualisiere();
  });
}
document.querySelector('.ansicht').addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-ansicht]')?.dataset.ansicht;
  if (a && a !== ansicht) setzeAnsicht(a);
});

// ---------- Bedienfeld ----------
$('fahrzeug').innerHTML = FAHRZEUGE.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
$('fahrzeug').value = fahrzeug().id;
const zeigeNutzlast = () => { $('nutzlast').value = zustand.nutzlast > 0 ? zustand.nutzlast : fahrzeug().nutzlast; };
$('fahrzeug').addEventListener('change', () => { zustand.fahrzeugId = $('fahrzeug').value; zustand.nutzlast = 0; zeigeNutzlast(); speichere(); baueFahrzeug(); aktualisiere(); });
$('nutzlast').addEventListener('input', () => { const v = +$('nutzlast').value; if (v > 0) { zustand.nutzlast = v; speichere(); aktualisiereBald(); } });
zeigeNutzlast();
$('ladegut-neu').addEventListener('click', oeffneKatalog);
$('palette-neu').addEventListener('click', () => neuesObjekt(HILFSMITTEL.find((v) => v.art === 'europalette')));
// + RHM: unter das ausgewählte Ladegut bzw. die ausgewählte Palette legen, sonst an die nächste freie Stelle
$('rhm-neu').addEventListener('click', () => {
  const sel = gewaehltesObjekt();
  if (sel && sel.typ !== 'rhm' && !sel.hochkant) {
    // bei Ladung auf einer Palette kommt das RHM unter die Palette
    const u = unterlage(zustand.objekte, ergebnis.lage, sel);
    const ziel = u.art === 'palette' && !u.geteilt ? u.kette[0] : sel;
    const uz = unterlage(zustand.objekte, ergebnis.lage, ziel);
    if (!uz.geteilt && uz.art !== 'ladung') {
      if (!uz.art.includes('matte')) setzeUnterlage(zustand.objekte, ergebnis.lage, ziel, uz.art === 'palette' ? 'palette-matte' : 'matte', neueId);
      aendere();
      return;
    }
  }
  neuesObjekt(HILFSMITTEL.find((v) => v.art === 'rhm'));
});
$('gurt-neu').addEventListener('click', oeffneGurtWahl);
$('ergebnis').addEventListener('click', (ev) => {
  const id = ev.target.closest('[data-waehle]')?.dataset.waehle;
  if (!id) return;
  auswahl = { art: 'objekt', id };
  aktualisiere();
  zeigeImBild(objekt(id).x);
  behaelter.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('beispiel').addEventListener('click', () => { zustand = { fahrzeugId: zustand.fahrzeugId, ...beispiel(zustand.fahrzeugId) }; auswahl = null; aendere(); });
$('leeren').addEventListener('click', () => {
  if (!confirm('Alle Ladung, Hilfsmittel und Gurte entfernen?')) return;
  zustand.objekte = []; zustand.gurte = []; auswahl = null; aendere();
});

groesse();
ergebnis = pruefe({ ...zustand, flaeche: fahrzeug() });
baueFahrzeug();
setzeAnsicht(ansicht, true);

// für die Seitentests
window.lasi = {
  zustand: () => zustand, ergebnis: () => ergebnis, auswahl: () => auswahl, ansicht: () => ansicht,
  uebermass: () => uebermass,
  obenSicht: () => ({ x: steuerOben.target.x, z: steuerOben.target.z, zoom: kameraOben.zoom, minZoom: steuerOben.minZoom }),
  // Werte eines Objekts direkt setzen (für die Tests)
  setze(id, werte) { Object.assign(objekt(id), werte); aendere(); },
  // Kamera nah an einen Punkt der Ladefläche (für Bilder in den Tests)
  nah(x, z, abstand = 3) {
    const H = fahrzeug().hoehe;
    steuer3d.target.set(x, H + 0.5, z);
    kamera3d.position.set(x - abstand, H + abstand * 0.8, z + abstand * 0.9);
    steuer3d.update();
  },
  // Bildschirmposition eines Punkts auf dem Objekt (Standard: Mitte der Oberseite)
  bildschirm(id, dx = 0, anteilHoehe = 1, dz = 0) {
    const o = objekt(id), r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(o.x + dx, fahrzeug().hoehe + ergebnis.lage.get(id).y + o.h * anteilHoehe, o.z + dz).project(kamera());
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  },
};
