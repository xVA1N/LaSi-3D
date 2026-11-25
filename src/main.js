import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pruefe, fussabdruck, fugenReibung, rechenkraftDaN, kopfLage, ladereihen, naechsterZurrpunkt, STIRNWAND_KRAFT_N, MU_RHM, ZURRPUNKT_AUSSEN } from './modell.js';
import { FAHRZEUGE, LADEGUT, HILFSMITTEL, GURTTYPEN, MATERIALIEN, beispiel } from './daten.js';
import { bewegGruppe, vereinigung, anWand, verschiebe, abstandVorne, unterlage, setzeUnterlage, freierGurtX, stellplaetze, platzFrei, stapelPlatz, UEBERSTAND_MAX } from './aktionen.js';
import { pruefeUebermass, GRENZEN } from './uebermass.js';
import { pruefeAchslasten, lastverteilungsplan } from './achslast.js';
import { MANOEVER, startzustand, schritt, auswertung } from './fahrt.js';

// ---------- Zustand ----------
const SPEICHER = 'lasi3d-beladung';
let zustand = lade() ?? { fahrzeugId: 'sattel', ...beispiel('sattel') };
let auswahl = null; // { art: 'objekt' | 'gurt', id }
let ergebnis = null;
let uebermass = null;
let achs = null;
let reihen = [];
let ansicht = 'oben';
try { ansicht = localStorage.getItem('lasi3d-ansicht') === '3d' ? '3d' : 'oben'; } catch { /* ohne Speicher: Draufsicht */ }
let zaehler = 0;
// Anzeige-Schalter (im Browser gespeichert)
const anzeige = { reihen: true, achsen: true };
try { Object.assign(anzeige, JSON.parse(localStorage.getItem('lasi3d-anzeige') || '{}')); } catch { /* egal */ }
let zeigeSchwerpunkt = true;
try { zeigeSchwerpunkt = localStorage.getItem('lasi3d-schwerpunkt') !== 'aus'; } catch { /* egal */ }
let platzMuster = null; // null | 'laengs' | 'quer': EPAL-Stellplätze eingeblendet
try { platzMuster = ['laengs', 'quer'].includes(localStorage.getItem('lasi3d-plaetze')) ? localStorage.getItem('lasi3d-plaetze') : null; } catch { /* egal */ }
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
    for (const o of z.objekte) {
      if (o.typ === 'rhm') o.name = 'RHM'; // früher „Antirutschmatte (RHM)“
      if (o.art === 'europalette') o.name = 'EPAL'; // früher „Europalette“
    }
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
// Welt: Fahrzeug und Ladung zusammen, damit sich der Zug bei der Fahrt neigen kann
const welt = new THREE.Group();
szene.add(welt);
const lkw = new THREE.Group();
welt.add(lkw);
// Rad mit Reifen, Felge und Nabe; aussen = +1/−1 (Felge zur Außenseite)
function rad(gruppe, x, y, z, r, breite, aussen) {
  const reifen = new THREE.Mesh(new THREE.CylinderGeometry(r, r, breite, 32).rotateX(Math.PI / 2), mat(0x1b1b1b, { roughness: 0.9 }));
  reifen.position.set(x, y, z);
  reifen.castShadow = true;
  gruppe.add(reifen);
  const flanke = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.01, 32).rotateX(Math.PI / 2), mat(0x2a2a2a, { roughness: 0.95 }));
  flanke.position.set(x, y, z + aussen * (breite / 2 + 0.001));
  gruppe.add(flanke);
  const felge = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, 0.02, 24).rotateX(Math.PI / 2), mat(0xb9c0c6, { metalness: 0.7, roughness: 0.35 }));
  felge.position.set(x, y, z + aussen * (breite / 2 + 0.005));
  gruppe.add(felge);
  const nabe = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.06, 16).rotateX(Math.PI / 2), mat(0x7d858c, { metalness: 0.7, roughness: 0.4 }));
  nabe.position.set(x, y, z + aussen * (breite / 2 + 0.03));
  gruppe.add(nabe);
}
// Achse: Achsrohr und je Seite ein Rad oder Zwillingsräder
function achse(gruppe, x, r, B, zwilling) {
  const rohr = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, B - 0.5, 12).rotateX(Math.PI / 2), mat(0x2b2f33, { metalness: 0.5 }));
  rohr.position.set(x, r, 0);
  gruppe.add(rohr);
  for (const s of [-1, 1]) {
    if (zwilling) { rad(gruppe, x, r, s * (B / 2 - 0.14), r, 0.27, s); rad(gruppe, x, r, s * (B / 2 - 0.43), r, 0.27, s); }
    else rad(gruppe, x, r, s * (B / 2 - 0.21), r, 0.38, s);
  }
}

function baueFahrzeug() {
  leere(lkw);
  const f = fahrzeug();
  const { laenge: L, breite: B, hoehe: H } = f;
  const al = f.achslast;
  const rahmen = mat(0x2b2f33, { metalness: 0.4, roughness: 0.6 });
  const grau = mat(0x9aa3aa, { metalness: 0.5, roughness: 0.5 });
  const lack = mat(0x30577a, { metalness: 0.3 });
  // Ladefläche: Holzboden, Außenrahmen mit Zurrpunkten, Stirnwand
  lkw.add(kasten(L, 0.06, B, mat(0x6b4f35), 0, H - 0.03, 0));
  for (const s of [-1, 1]) {
    lkw.add(kasten(L, 0.18, 0.06, lack, 0, H - 0.09, s * (B / 2 + 0.03)));
    for (let x = -L / 2 + 0.25; x < L / 2; x += 0.5) lkw.add(kasten(0.05, 0.05, 0.03, mat(0x15191c), x, H - 0.09, s * (B / 2 + 0.065)));
  }
  lkw.add(kasten(0.08, f.haus ? 1.3 : 1.6, B, mat(0x56616b, { metalness: 0.4 }), L / 2 + 0.04, H + (f.haus ? 0.65 : 0.8), 0)); // Stirnwand
  const sattel = al.art === 'sattel';
  const rHinten = f.id === 'klein' ? 0.4 : sattel ? 0.53 : 0.5;
  // Längsträger: beim Auflieger vorne als flacher Schwanenhals über der Zugmaschine
  const hals = sattel ? 3.0 : 0;
  for (const s of [-1, 1]) {
    const traegerH = f.id === 'klein' ? 0.2 : 0.38;
    lkw.add(kasten(L - hals, traegerH, 0.12, rahmen, -hals / 2, H - 0.06 - traegerH / 2, s * 0.5));
    if (hals) lkw.add(kasten(hals, 0.16, 0.12, rahmen, L / 2 - hals / 2, H - 0.14, s * 0.5));
  }
  // Achsen des Aufbaus, Kotflügel und Luftfederbälge
  const hintere = sattel ? al.aggregat.raeder : al.hinten.raeder;
  for (const x of hintere) {
    achse(lkw, x, rHinten, B, !sattel);
    for (const s of [-1, 1]) lkw.add(kasten(0.22, 0.2, 0.22, mat(0x1d1f21), x, H - 0.55, s * 0.5));
  }
  const x0 = Math.min(...hintere) - rHinten - 0.12, x1 = Math.max(...hintere) + rHinten + 0.12;
  for (const s of [-1, 1]) lkw.add(kasten(x1 - x0, 0.04, 0.5, mat(0x1d1f21), (x0 + x1) / 2, 2 * rHinten + 0.1, s * (B / 2 - 0.25)));
  // seitlicher Unterfahrschutz zwischen Stützwinden bzw. Fahrerhaus und Achsen
  const schutzVorn = sattel ? L / 2 - 3.2 : L / 2 - 0.3, schutzHinten = x1 + 0.1;
  if (schutzVorn > schutzHinten) {
    for (const s of [-1, 1]) {
      for (const y of [0.45, 0.8]) lkw.add(kasten(schutzVorn - schutzHinten, 0.1, 0.03, grau, (schutzVorn + schutzHinten) / 2, y, s * (B / 2 - 0.04)));
      for (let x = schutzHinten + 0.3; x < schutzVorn; x += 1.6) lkw.add(kasten(0.05, H - 0.4, 0.04, grau, x, (H - 0.1) / 2 + 0.2, s * (B / 2 - 0.08)));
    }
  }
  // Heck: Unterfahrschutz, Leuchten
  lkw.add(kasten(0.12, 0.12, B - 0.25, grau, -L / 2 + 0.2, 0.5, 0));
  for (const s of [-1, 1]) {
    lkw.add(kasten(0.06, H - 0.6, 0.08, grau, -L / 2 + 0.2, (H - 0.6) / 2 + 0.5, s * 0.7));
    lkw.add(kasten(0.05, 0.13, 0.36, mat(0xd32f2f, { emissive: 0x400000 }), -L / 2 - 0.01, H - 0.3, s * (B / 2 - 0.3)));
    lkw.add(kasten(0.06, 0.06, 0.04, mat(0xffa000, { emissive: 0x402000 }), 0, H - 0.2, s * (B / 2 + 0.02))); // Seitenmarkierung
  }
  if (sattel) {
    // Stützwinden mit Fußplatten, Königszapfen
    for (const s of [-1, 1]) {
      lkw.add(kasten(0.12, H - 0.5, 0.12, grau, L / 2 - 2.6, (H - 0.5) / 2 + 0.1, s * 0.62));
      lkw.add(kasten(0.3, 0.05, 0.3, rahmen, L / 2 - 2.6, 0.08, s * 0.62));
    }
    lkw.add(kasten(0.1, 0.1, 1.24, grau, L / 2 - 2.6, H - 0.55, 0));
    const zapfen = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), grau);
    zapfen.position.set(al.zapfen.x, H - 0.28, 0);
    lkw.add(zapfen);
  }
  // Zugmaschine bzw. Fahrgestell vorn
  const vorn = al.vorn.x;
  const rVorn = f.id === 'klein' ? 0.4 : 0.52;
  const hausL = f.id === 'klein' ? 2.0 : 2.3, hausH = f.id === 'klein' ? 2.3 : 2.8;
  const hausHinten = sattel ? L / 2 + 0.45 : L / 2 + 0.15, hausVorn = hausHinten + hausL;
  const boden = sattel ? 1.05 : rVorn * 2 - 0.05;
  const rahmenHinten = sattel ? al.antrieb.x - 1.5 : L / 2 - 0.5;
  for (const s of [-1, 1]) lkw.add(kasten(hausVorn - rahmenHinten, 0.26, 0.1, rahmen, (hausVorn + rahmenHinten) / 2, rVorn + 0.25, s * 0.45));
  achse(lkw, vorn, rVorn, B, false);
  if (sattel) {
    achse(lkw, al.antrieb.x, 0.52, B, true);
    lkw.add(kasten(0.95, 0.08, 0.95, rahmen, al.zapfen.x, H - 0.27, 0)); // Sattelkupplung
    for (const s of [-1, 1]) lkw.add(kasten(1.3, 0.04, 0.55, mat(0x1d1f21), al.antrieb.x, 1.16, s * (B / 2 - 0.27)));
  }
  const weiss = mat(0xe6e9ec, { metalness: 0.15, roughness: 0.45 });
  lkw.add(kasten(hausL, hausH, B, weiss, (hausVorn + hausHinten) / 2, boden + hausH / 2, 0)); // Fahrerhaus
  lkw.add(kasten(0.04, hausH * 0.33, B - 0.25, mat(0x1c2a36, { roughness: 0.15, metalness: 0.3 }), hausVorn + 0.01, boden + hausH * 0.7, 0)); // Frontscheibe
  for (const s of [-1, 1]) lkw.add(kasten(hausL * 0.4, hausH * 0.28, 0.04, mat(0x1c2a36, { roughness: 0.15 }), hausVorn - hausL * 0.25, boden + hausH * 0.7, s * (B / 2 + 0.01))); // Seitenfenster
  lkw.add(kasten(0.05, hausH * 0.22, B - 0.6, mat(0x3a4047), hausVorn + 0.02, boden + hausH * 0.32, 0)); // Kühlergrill
  lkw.add(kasten(0.18, 0.42, B + 0.02, rahmen, hausVorn + 0.06, boden - 0.05, 0)); // Stoßfänger
  for (const s of [-1, 1]) {
    lkw.add(kasten(0.04, 0.14, 0.32, mat(0xfff6d5, { emissive: 0x504a30 }), hausVorn + 0.16, boden + 0.02, s * (B / 2 - 0.32))); // Scheinwerfer
    lkw.add(kasten(0.06, 0.06, 0.28, rahmen, hausVorn - 0.15, boden + hausH * 0.78, s * (B / 2 + 0.14))); // Spiegelarm
    lkw.add(kasten(0.08, 0.38, 0.06, rahmen, hausVorn - 0.15, boden + hausH * 0.7, s * (B / 2 + 0.28))); // Spiegel
    lkw.add(kasten(0.5, 0.16, 0.08, rahmen, hausVorn - 0.55, boden - 0.25, s * (B / 2 - 0.02))); // Trittstufe
  }
  lkw.add(kasten(0.25, 0.1, B - 0.1, weiss, hausVorn - 0.1, boden + hausH + 0.05, 0)); // Sonnenblende
  if (sattel) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 20).rotateZ(Math.PI / 2), mat(0xc9ced3, { metalness: 0.8, roughness: 0.3 }));
    tank.position.set(hausHinten - 0.2, 0.75, -(B / 2 - 0.35));
    lkw.add(tank);
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
welt.add(ladungGruppe);
const objektGruppen = new Map(); // Objekt-ID → gezeichnete Gruppe (für die Fahrt-Simulation)
let anklickbar = [];

const FARBEN = { rohr: 0x6f7c86, holzkiste: 0xc89b5f, gitterbox: 0x9aa3ab, ibc: 0xf2f2ee, fass: 0x1f5fa8, papierrolle: 0xd9c39a, kunststoffkisten: 0x2f7fd0, mauersteine: 0xd98a5a, europalette: 0xd2b48c, rhm: 0x23272a };
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
  } else if (o.form === 'rohr') {
    // liegendes Rohr, Achse in Längsrichtung des Objekts; auf Wunsch auf Kanthölzern mit Keilen
    const r = b / 2, yc = h - r;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 32, 1, true).rotateZ(Math.PI / 2), mat(FARBEN.rohr, { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
    m.position.y = yc;
    m.castShadow = true; // kein eigener Schatten auf der offenen Röhre (sonst Streifen)
    g.add(m);
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 32).rotateY(s * Math.PI / 2), mat(0x8a96a0, { metalness: 0.6, side: THREE.DoubleSide }));
      ring.position.set(s * l / 2, yc, 0);
      g.add(ring);
    }
    if (o.keile) {
      const holz = mat(0xa8865a), keil = mat(0x7a5a36);
      for (const x of [-l / 2 + Math.min(0.6, l / 4), l / 2 - Math.min(0.6, l / 4)]) {
        g.add(kasten(0.12, 0.1, b + 0.3, holz, x, 0.05, 0));
        for (const s of [-1, 1]) {
          const k = kasten(0.12, 0.1, 0.12, keil, x, 0.14, s * (r * 0.62));
          k.rotation.x = s * Math.PI / 4;
          g.add(k);
        }
      }
    }
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
  objektGruppen.set(o.id, g);
}

// mangelhafte Gurte blinken rot (Deckkraft wird in der Zeichenschleife geändert)
// ohne Tiefentest: auch sichtbar, wenn der Gurt durch Ladung läuft
const mangelMat = new THREE.MeshStandardMaterial({ color: 0xff2d2d, emissive: 0xb00000, transparent: true, opacity: 1, depthTest: false });
const unsichtbar = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
function band(a, b, material, breite = 0.05, dicke = 0.012) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(breite, a.distanceTo(b), dicke), material);
  if (material === mangelMat) m.renderOrder = 10;
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
function baueGurt(g, info, gewaehlt) {
  const { breite: B, hoehe: H } = fahrzeug();
  const e = 0.012;
  const liegt = info.getroffen.length > 0;
  // straff über die Kanten (obere konvexe Hülle), knapp außerhalb der Ladung gezeichnet
  const punkte = liegt
    ? info.weg.map(([z, y], i, w) => (y > 0 ? [z + (i <= w.length / 2 ? -e : e) * (Math.abs(z) < B / 2 ? 1 : 0), y + e] : [z, y]))
    : [[-B / 2, 0.02], [B / 2, 0.02]];
  const v = punkte.map(([z, y]) => new THREE.Vector3(g.x, H + y, z));
  const material = gewaehlt ? mat(0xffc400, { emissive: 0x664400 }) : info.mangel ? mangelMat : mat(0xe8901a, { roughness: 0.5 });
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
  const material = gewaehlt ? mat(0xffc400, { emissive: 0x664400 }) : info.mangel ? mangelMat : mat(0xe8901a, { roughness: 0.5 });
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

const ZURRART = { diagonal: 'Diagonalzurren', schraeg: 'Schrägzurren', frei: 'Einzelgurt' };
const ECKEN = { vl: 'vorne links', vr: 'vorne rechts', hl: 'hinten links', hr: 'hinten rechts' };
function baueDirekt(g, info, gewaehlt) {
  if (!info?.getroffen.length) return;
  const { hoehe: H } = fahrzeug();
  const p = new THREE.Vector3(info.p.x, H + info.p.y, info.p.z), a = new THREE.Vector3(info.a.x, H, info.a.z);
  const material = gewaehlt ? mat(0xffc400, { emissive: 0x664400 }) : info.mangel ? mangelMat : mat(0xe8901a, { roughness: 0.5 });
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
  if (gewaehlt) ladungGruppe.add(kasten(0.12, 0.12, 0.12, mat(0xffc400, { emissive: 0x664400 }), a.x, a.y - 0.05, a.z)); // genutzter Zurrpunkt
}

function baueBucht(g, info, gewaehlt) {
  if (!info?.getroffen.length) return;
  const { hoehe: H } = fahrzeug();
  const e = ergebnis.ergebnisse.find((x) => x.id === info.getroffen[0])?.einheit;
  const links = g.seite === 'l', zc = (info.z0 + info.z1) / 2;
  let punkte;
  if (e?.rund) {
    // um den runden Querschnitt herum: von der nahen Oberseite über die Kuppe, die ferne Seite und unten zurück
    const r = (info.z1 - info.z0) / 2 + 0.015, yc = info.hoehe - r + 0.015;
    punkte = [];
    for (let i = 0; i <= 15; i++) {
      const w = (links ? 135 - i * 15 : 45 + i * 15) * Math.PI / 180;
      punkte.push([zc + r * Math.cos(w), Math.max(yc + r * Math.sin(w), 0.02)]);
    }
  } else {
    const n = links ? info.z0 - 0.015 : info.z1 + 0.015, w = links ? info.z1 + 0.015 : info.z0 - 0.015;
    punkte = [[n, info.hoehe + 0.015], [w, info.hoehe + 0.015], [w, 0.02], [zc, 0.02]];
  }
  const a = new THREE.Vector3(g.x, H, info.a.z);
  const v = [a, ...punkte.map(([z, y]) => new THREE.Vector3(g.x, H + y, z)), a];
  const material = gewaehlt ? mat(0xffc400, { emissive: 0x664400 }) : info.mangel ? mangelMat : mat(0xe8901a, { roughness: 0.5 });
  for (let i = 0; i < v.length - 1; i++) {
    if (v[i].distanceTo(v[i + 1]) < 1e-4) continue;
    ladungGruppe.add(band(v[i], v[i + 1], material, 0.05, 0.012));
    const treffer = band(v[i], v[i + 1], unsichtbar, 0.25, 0.2);
    treffer.userData.ziel = { art: 'gurt', id: g.id };
    anklickbar.push(treffer);
    ladungGruppe.add(treffer);
  }
  const r = a.clone().lerp(v[1], 0.35);
  ladungGruppe.add(kasten(0.09, 0.13, 0.06, mat(0x8a949c, { metalness: 0.6, roughness: 0.4 }), r.x, r.y, r.z));
}

function zeichne() {
  leere(ladungGruppe);
  objektGruppen.clear();
  anklickbar = [];
  const status = new Map();
  for (const e of ergebnis.ergebnisse) for (const m of e.einheit.mitglieder) status.set(m.id, e.ok);
  for (const m of uebermass.meldungen) if (m.id) status.set(m.id, false);
  for (const h of ergebnis.hinweise) if (h.art === 'lose') status.set(h.id, false);
  for (const o of zustand.objekte) {
    const gew = auswahl?.art === 'objekt' && auswahl.id === o.id;
    baueObjekt(o, ergebnis.lage.get(o.id).y, o.typ !== 'rhm' ? status.get(o.id) : undefined, gew, o.hochkant && deckNachMinus(o));
  }
  for (const g of zustand.gurte) {
    const info = ergebnis.gurte.find((i) => i.id === g.id), gew = auswahl?.art === 'gurt' && auswahl.id === g.id;
    const vorher = ladungGruppe.children.length;
    if (g.art === 'kopf') baueKopf(g, info, gew); else if (g.art === 'direkt') baueDirekt(g, info, gew); else if (g.art === 'bucht') baueBucht(g, info, gew); else baueGurt(g, info, gew);
    for (const k of ladungGruppe.children.slice(vorher)) k.userData.gurt = g.id; // Teile des Gurts merken
  }
  if (anzeige.reihen) baueReihen();
  bauePlaetze();
  baueAchslast();
  baueUebermass();
  baueMarken();
  baueMini();
}

// EPAL-Stellplätze: freie Plätze als helle Felder zum Antippen
const platzMat = new THREE.MeshBasicMaterial({ color: 0x7fd3a8, transparent: true, opacity: 0.45, depthWrite: false });
const platzRand = new THREE.LineBasicMaterial({ color: 0x2e8a5c });
function freiePlaetze() {
  return platzMuster ? stellplaetze(fahrzeug(), platzMuster).filter((p) => platzFrei(p, zustand.objekte)) : [];
}
function bauePlaetze() {
  const H = fahrzeug().hoehe;
  for (const p of freiePlaetze()) {
    const feld = new THREE.Mesh(new THREE.BoxGeometry(p.lx - 0.06, 0.006, p.lz - 0.06), platzMat);
    feld.position.set(p.x, H + 0.004, p.z);
    feld.userData.ziel = { art: 'platz', id: `platz-${p.nr}`, nr: p.nr };
    anklickbar.push(feld);
    ladungGruppe.add(feld);
    const rand = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(p.lx - 0.06, 0.006, p.lz - 0.06)), platzRand);
    rand.position.copy(feld.position);
    ladungGruppe.add(rand);
  }
}
const epalVorlage = () => HILFSMITTEL.find((v) => v.art === 'europalette');
function neueEpal(p) {
  const o = { ...epalVorlage(), id: neueId('o'), x: p.x, z: p.z, drehung: p.drehung, mu: 0 };
  zustand.objekte.push(o);
  return o;
}
// Platz angetippt: ausgewähltes Teil dorthin, sonst eine EPAL hinstellen
function platzAntippen(nr) {
  const p = stellplaetze(fahrzeug(), platzMuster).find((x) => x.nr === nr);
  if (!p) return;
  const sel = gewaehltesObjekt();
  if (sel && sel.typ !== 'rhm') {
    const { wurzel, gruppe } = bewegGruppe(zustand.objekte, ergebnis.lage, sel);
    // leere EPAL dreht sich passend zum Platz, sonst bleibt die Drehung
    if (wurzel.art === 'europalette' && !wurzel.hochkant && gruppe.length === 1) wurzel.drehung = p.drehung;
    const dx = p.x - wurzel.x, dz = p.z - wurzel.z;
    for (const a of gruppe) { a.x = Math.round((a.x + dx) * 1000) / 1000; a.z = Math.round((a.z + dz) * 1000) / 1000; }
  } else neueEpal(p);
  aendere();
}
function zeigePlatzleiste() {
  const bar = $('platzleiste');
  if (!platzMuster || fahrt) { bar.hidden = true; return; }
  const alle = stellplaetze(fahrzeug(), 'laengs').length, quer = stellplaetze(fahrzeug(), 'quer').length;
  const frei = freiePlaetze().length;
  bar.hidden = false;
  bar.innerHTML = `<div class="platzzeile"><b>Stellplätze</b>
      <div class="chips"><button type="button" data-muster="laengs" class="${platzMuster === 'laengs' ? 'an' : ''}">längs ${alle}</button><button type="button" data-muster="quer" class="${platzMuster === 'quer' ? 'an' : ''}">quer ${quer}</button></div>
      <span class="werte">${frei} frei</span></div>
    <div class="platzzeile"><span class="werte">Platz antippen: EPAL hin (Ausgewähltes dorthin)</span>
      <button type="button" data-platz-aktion="fuellen" ${frei ? '' : 'disabled'}>Alle füllen</button><button type="button" class="leise" data-platz-aktion="fertig">Fertig</button></div>`;
}
function setzePlatzMuster(m) {
  platzMuster = m;
  try { localStorage.setItem('lasi3d-plaetze', m ?? ''); } catch { /* egal */ }
  aktualisiere();
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

// Schwerpunkt der Ladung und überladene Achsen (rot um die Räder)
// Schwerpunkt-Kennzeichen (Verpackungskennzeichen nach ISO 7000-0627): Kreis aus vier Bogenstücken mit Fadenkreuz
function zeichneSchwerpunktZeichen(ctx, g, farbe = '#000') {
  const c = g / 2, r = g * 0.27, dicke = g * 0.095;
  ctx.strokeStyle = farbe;
  ctx.lineWidth = dicke;
  ctx.lineCap = 'butt';
  for (let k = 0; k < 4; k++) {
    const mitte = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(c, c, r, mitte - Math.PI * 0.19, mitte + Math.PI * 0.19);
    ctx.stroke();
  }
  ctx.lineWidth = g * 0.04;
  ctx.beginPath();
  ctx.moveTo(c - g * 0.42, c); ctx.lineTo(c + g * 0.42, c);
  ctx.moveTo(c, c - g * 0.42); ctx.lineTo(c, c + g * 0.42);
  ctx.stroke();
}
const SCHWERPUNKT_SVG = (groesse = 16) => `<svg class="sp-zeichen" width="${groesse}" height="${groesse}" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor"><path stroke-width="14" d="M36.5 26.6A27 27 0 0 1 63.5 26.6M73.4 36.5A27 27 0 0 1 73.4 63.5M63.5 73.4A27 27 0 0 1 36.5 73.4M26.6 63.5A27 27 0 0 1 26.6 36.5"/><path stroke-width="6" d="M6 50H94M50 6V94"/></g></svg>`;
let schwerpunktTextur = null;
function spTextur() {
  if (schwerpunktTextur) return schwerpunktTextur;
  const g = 256, leinwand = document.createElement('canvas');
  leinwand.width = leinwand.height = g;
  const ctx = leinwand.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, g, g);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, g - 6, g - 6);
  zeichneSchwerpunktZeichen(ctx, g);
  schwerpunktTextur = new THREE.CanvasTexture(leinwand);
  schwerpunktTextur.colorSpace = THREE.SRGBColorSpace;
  return schwerpunktTextur;
}

function baueAchslast() {
  const { breite: B, hoehe: H } = fahrzeug();
  const sp = achs.schwerpunkt;
  if (sp.masse > 0 && zeigeSchwerpunkt) {
    // Aufkleber flach auf der Ladefläche und ein Schild darüber, das immer zur Kamera zeigt
    const aufkleber = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: spTextur() }));
    aufkleber.position.set(sp.x, H + 0.006, sp.z);
    ladungGruppe.add(aufkleber);
    // roter Strich senkrecht vom Schwerpunkt bis über die höchste Ladung, auch durch die Ladung sichtbar
    const oben = Math.max(0.6, ...zustand.objekte.map((o) => (ergebnis.lage.get(o.id)?.y ?? 0) + o.h)) + 0.35;
    const strich = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, oben, 12), new THREE.MeshBasicMaterial({ color: 0xe53935, depthTest: false, transparent: true }));
    strich.position.set(sp.x, H + oben / 2, sp.z);
    strich.renderOrder = 8;
    ladungGruppe.add(strich);
    const schild = new THREE.Sprite(new THREE.SpriteMaterial({ map: spTextur(), depthTest: false }));
    schild.scale.set(0.45, 0.45, 1);
    schild.position.set(sp.x, H + oben + 0.2, sp.z);
    schild.renderOrder = 9;
    ladungGruppe.add(schild);
  }
  const rot = mat(0xe53935, { transparent: true, opacity: 0.35, depthWrite: false });
  for (const a of achs.achsen) if (!a.ok) for (const x of a.raeder) ladungGruppe.add(kasten(1.15, 1.15, B + 0.2, rot, x, 0.55, 0));
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
  if (anzeige.reihen) for (const r of reihen) marke(`reihe r${(r.nr - 1) % 2}`, `LR${r.nr}`, new THREE.Vector3(r.x1 - 0.1, H, B / 2 - 0.05));
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
  if (achs.schwerpunkt.masse > 0 && zeigeSchwerpunkt && ansicht === '3d') marke('mass', `${SCHWERPUNKT_SVG(14)} Schwerpunkt`, new THREE.Vector3(achs.schwerpunkt.x, H + Math.max(0.6, ...zustand.objekte.map((o) => (ergebnis.lage.get(o.id)?.y ?? 0) + o.h)) + 0.85, achs.schwerpunkt.z));
  for (const a of achs.achsen) if (!a.ok) marke('warnung', `${a.name}: ${zahl(a.last / 1000, 1)} t`, new THREE.Vector3(a.x, 1.3, B / 2));
  if (anzeige.achsen) for (const a of einzelachsen()) marke(`achsnr ${a.last > a.max + 1e-6 ? 'zu' : ''}`, a.nr, new THREE.Vector3(a.x, 0.5, B / 2 + 0.05));
  if (anzeige.achsen && achs.zapfen) marke('achsnr zapfen', '⊙', new THREE.Vector3(achs.zapfen.x, H - 0.3, B / 2 + 0.05));
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

// ---------- Fahrt-Simulation ----------
let fahrt = null;
let letzteZeit = performance.now();
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
function fahrtSchritt() {
  const jetzt = performance.now(), dt = Math.min(0.05, (jetzt - letzteZeit) / 1000);
  letzteZeit = jetzt;
  if (!fahrt) return;
  const f = fahrzeug();
  const p = fahrt.m.phasen[fahrt.phase];
  let neigung = { x: 0, z: 0 };
  if (p) {
    for (let t = 0; t < dt; t += 0.01) schritt(fahrt.z, p, Math.min(0.01, dt - t), f);
    fahrt.t += dt;
    neigung = p.r === 'vorwaerts' ? { x: 0, z: -0.025 } : p.r === 'rueckwaerts' ? { x: 0, z: 0.015 } : { x: 0.035 * p.dz, z: 0 };
    if (fahrt.t >= p.dauer) { fahrt.phase += 1; fahrt.t = 0; }
  } else if (!fahrt.fertig) {
    for (let t = 0; t < dt; t += 0.01) schritt(fahrt.z, { r: 'vorwaerts', dx: 0, dz: 0 }, Math.min(0.01, dt - t), f); // ausrollen, Herunterfallen zu Ende
    fahrt.nach = (fahrt.nach ?? 0) + dt;
    if (fahrt.nach > 1.2) { fahrt.fertig = true; zeigeFahrtErgebnis(); }
  }
  welt.rotation.x += (neigung.x - welt.rotation.x) * 0.12;
  welt.rotation.z += (neigung.z - welt.rotation.z) * 0.12;
  // Lage der bewegten Einheiten anwenden
  for (const u of fahrt.z) {
    const e = ergebnis.ergebnisse.find((x) => x.id === u.id);
    if (!e) continue;
    const y0 = f.hoehe + u.basisY;
    let q = new THREE.Quaternion(), pivot = null;
    if (u.kippRichtung && u.kipp > 0) {
      const [achse, w, px, pz] = { links: [X, -u.kipp, 0, u.f.z0], rechts: [X, u.kipp, 0, u.f.z1], vorne: [Z, -u.kipp, u.f.x1, 0], hinten: [Z, u.kipp, u.f.x0, 0] }[u.kippRichtung];
      q = new THREE.Quaternion().setFromAxisAngle(achse, w);
      pivot = new THREE.Vector3(px + u.x, y0 + u.y, pz + u.z);
    }
    for (const m of e.einheit.mitglieder) {
      const g = objektGruppen.get(m.id);
      if (!g?.userData.basisPos) continue;
      const pos = g.userData.basisPos.clone().add(new THREE.Vector3(u.x, u.y, u.z));
      if (pivot) pos.sub(pivot).applyQuaternion(q).add(pivot);
      g.position.copy(pos);
      g.quaternion.copy(q).multiply(g.userData.basisQuat);
      if (m.form === 'rohr' && u.roll) g.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X, -u.roll));
    }
  }
}

function oeffneFahrtWahl() {
  oeffneBlatt(`<h3 id="blatt-titel">Fahrt simulieren</h3>
    <p class="werte">Ladung, die laut Prüfung nicht hält, rutscht, rollt oder kippt sichtbar mit dem nicht gehaltenen Teil der Kraft, bis sie anschlägt oder herunterfällt. Ihre Gurte werden ausgeblendet.</p>
    <div class="katalog" style="grid-template-columns:1fr">${Object.entries(MANOEVER).map(([k, m]) => `<button type="button" data-fahrt="${k}"><span>${m.name}<small>${m.text}</small></span></button>`).join('')}</div>
    ${fuss(false)}`);
}
function starteFahrt(k) {
  schliesseBlatt();
  beendeFahrt(false);
  auswahl = null;
  const los = () => {
    aktualisiere();
    for (const g of objektGruppen.values()) { g.userData.basisPos = g.position.clone(); g.userData.basisQuat = g.quaternion.clone(); }
    const m = MANOEVER[k];
    const z = startzustand(ergebnis, { ...fahrzeug(), wandHoehe: fahrzeug().haus ? 1.3 : 1.6 }, ergebnis.lage);
    // Gurte von Einheiten ausblenden, die bei diesem Manöver nicht halten
    const bewegt = new Set(z.filter((u) => m.phasen.some((p) => {
      const d = u.richtungen[p.r];
      return !(d.ok || d.formschluss) || (p.r === 'seitlich' ? !u.kippen.seitlich.ok : !u.kippen.laengs.ok && !d.formschluss);
    })).map((u) => u.id));
    for (const c of ladungGruppe.children) {
      const info = c.userData.gurt && ergebnis.gurte.find((i) => i.id === c.userData.gurt);
      if (info?.getroffen?.some((id) => bewegt.has(id))) c.visible = false;
    }
    fahrt = { k, m, z, phase: 0, t: 0, fertig: false };
    markenFeld.style.display = 'none';
    $('leiste').hidden = true;
    $('fahrtband').hidden = false;
    $('fahrtband').innerHTML = `<b>${m.name}</b> · ${m.text}`;
  };
  if (ansicht !== '3d') { setzeAnsicht('3d'); requestAnimationFrame(() => requestAnimationFrame(los)); } else los();
}
function zeigeFahrtErgebnis() {
  const aus = auswertung(fahrt.z).filter((a) => a.was.length);
  const name = (id) => { const e = ergebnis.ergebnisse.find((x) => x.id === id); const r = reihen.find((x) => x.ids.includes(id)); return `${r ? `LR${r.nr} ` : ''}${einheitName(e)}`; };
  $('fahrtband').innerHTML = `<b>${fahrt.m.name}:</b> ${aus.length ? `<span class="schlecht">${aus.length} ${aus.length === 1 ? 'Einheit hält' : 'Einheiten halten'} nicht</span>` : '<span class="gut">✓ Alles hat gehalten</span>'}
    ${aus.length ? `<ul>${aus.map((a) => `<li>${esc(name(a.id))}: ${esc(a.was.join(', '))}</li>`).join('')}</ul>` : ''}
    <div class="knoepfe"><button type="button" data-fahrt-aktion="nochmal">Nochmal</button><button type="button" class="leise" data-fahrt-aktion="andere">Andere Fahrt</button><button type="button" class="leise" data-fahrt-aktion="ende">Beenden</button></div>`;
}
function beendeFahrt(neuZeichnen = true) {
  if (!fahrt) return;
  fahrt = null;
  welt.rotation.set(0, 0, 0);
  markenFeld.style.display = '';
  $('fahrtband').hidden = true;
  if (neuZeichnen) aktualisiere();
}

renderer.setAnimationLoop(() => {
  fahrtSchritt();
  steuerung().update();
  if (ansicht === 'oben') begrenzeOben();
  mangelMat.opacity = 0.25 + 0.75 * (Math.sin(performance.now() / 160) > 0 ? 1 : 0);
  renderer.render(szene, kamera());
  setzeMarken();
  if (ansicht === 'oben') setzeMiniSicht();
});

// ---------- Rechnen und Anzeigen ----------
let geplant = false;
function aktualisiere() {
  zustand.gurte = zustand.gurte.filter((g) => !g.ziel || objekt(g.ziel));
  ergebnis = pruefe({ ...zustand, flaeche: fahrzeug() });
  achs = pruefeAchslasten({ objekte: zustand.objekte, fahrzeug: fahrzeug() });
  reihen = ladereihen(ergebnis.ergebnisse.map((e) => e.einheit));
  uebermass = pruefeUebermass({ objekte: zustand.objekte, lage: ergebnis.lage, fahrzeug: fahrzeug(), nutzlast: zustand.nutzlast });
  if (auswahl && !(gewaehltesObjekt() || gewaehlterGurt())) auswahl = null;
  zeichne();
  zeigeErgebnis();
  zeigeAchsbox();
  zeigeAnzeige();
  zeigeLeiste();
  zeigePlatzleiste();
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
  if (!ladung.length) {
    const p = e.einheit.mitglieder.filter((o) => o.typ === 'palette').length;
    return `${p > 1 ? `${p} × ` : ''}EPAL, leer${e.einheit.rhm ? ', RHM darunter' : ''}`;
  }
  if (e.einheit.mitglieder.some((o) => o.typ === 'palette')) name += ' auf EPAL';
  if (e.einheit.rhm) name += ', RHM darunter';
  return name;
}

/** Kurzer Status der Einheit, zu der ein Objekt gehört: { ok, text } */
function objektStatus(o) {
  const e = ergebnis.ergebnisse.find((x) => x.einheit.mitglieder.some((m) => m.id === o.id));
  if (!e) {
    if (ergebnis.hinweise.some((h) => h.art === 'lose' && h.id === o.id)) return { ok: false, text: '✗ steht ungesichert' };
    return { ok: true, text: o.hochkant ? '✓ gehalten (Füllmittel oder Lastverteiler)' : 'trägt keine Ladung' };
  }
  const probleme = [];
  for (const [r, d] of Object.entries(e.richtungen)) if (!d.ok) probleme.push(d.hat === 0 ? `${RNAME[r]} ${d.rollt ? 'rollt' : 'ungesichert'}` : `${RNAME[r]} ${zahl(d.auslastung * 100, 0)} %`);
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
  if (info?.mangel) return { ok: false, text: `✗ Zurrmittel mangelhaft: ${info.mangel}` };
  if (g.art === 'bucht') {
    if (!info?.getroffen.length) return { ok: false, text: '✗ ohne Ladung' };
    return { ok: true, text: `α ≈ ${zahl(info.winkel, 0)}° · Zurrpunkt ${g.seite === 'l' ? 'links' : 'rechts'}, ${zahl(fahrzeug().laenge / 2 - g.x, 2)} m ab Stirnwand` };
  }
  if (g.art === 'direkt') {
    if (!info?.getroffen.length) return { ok: false, text: '✗ ohne Ladung' };
    if (Math.hypot(info.d.x, info.d.z) < 0.25) return { ok: false, text: '✗ Gurt fast senkrecht, hält kaum: Ladung vom Rand abrücken oder Zurrpunkt weiter weg' };
    const wo = g.ankerX != null ? `Zurrpunkt ${zahl(fahrzeug().laenge / 2 - g.ankerX, 2)} m ab Stirnwand, ${(g.ankerSeite ?? g.ecke[1]) === 'l' ? 'links' : 'rechts'}` : `Zurrpunkt ${laenge(g.abstand)} ${g.ecke[0] === 'v' ? 'davor' : 'dahinter'}`;
    return { ok: true, text: `α ≈ ${zahl(info.winkel, 0)}° · β ≈ ${zahl(info.beta, 0)}° · ${wo}` };
  }
  if (g.art === 'kopf') {
    if (!info?.getroffen.length) return { ok: false, text: '✗ ohne Ladung' };
    return { ok: true, text: `α ≈ ${zahl(info.winkel, 0)}° · β ≈ ${zahl(info.beta, 0)}°${info.lastverteiler ? ' · um EPAL als Lastverteiler' : ''}` };
  }
  if (!info?.getroffen.length) return { ok: false, text: '✗ liegt auf keiner Ladung' };
  const gekappt = g.stf > g.lc / 2 ? ` · gerechnet mit ${rechenkraftDaN(g)} daN` : '';
  return { ok: true, text: `α ≈ ${zahl(info.winkel, 0)}° · über ${info.getroffen.length} Einheit${info.getroffen.length === 1 ? '' : 'en'}${gekappt}` };
}

// Achsen einzeln von vorn nach hinten: Zugmaschine bzw. Fahrgestell und beim Sattelzug die Aufliegerachsen 1, 2, 3
function einzelachsen() {
  const al = fahrzeug().achslast;
  const liste = [];
  for (const a of achs.achsen) {
    const n = a.raeder.length;
    a.raeder.forEach((x) => liste.push({ x, last: a.last / n, max: a.max / n, gruppe: a === achs.achsen.at(-1) && al.art === 'sattel' ? 'auflieger' : 'fahrzeug', name: a.name }));
  }
  liste.sort((p, q) => q.x - p.x);
  let nrFz = 0, nrAuf = 0;
  for (const e of liste) {
    if (al.art === 'sattel' && e.gruppe === 'fahrzeug') e.nr = ++nrFz === 1 ? 'VA' : 'HA';
    else if (e.gruppe === 'auflieger') e.nr = String(++nrAuf);
    else e.nr = String(++nrFz);
  }
  return liste;
}
function zeigeAnzeige() {
  const schalter = [['reihen', 'Ladereihen', anzeige.reihen], ['achsen', 'Achslasten', anzeige.achsen], ['schwerpunkt', 'Schwerpunkt', zeigeSchwerpunkt]];
  $('anzeige').innerHTML = schalter.map(([k, t, an]) => `<button type="button" data-anzeige="${k}" class="${an ? 'an' : ''}" aria-pressed="${an}">${an ? '✓ ' : ''}${t}</button>`).join('');
}
function zeigeAchsbox() {
  const box = $('achsbox');
  if (!achs || !anzeige.achsen) { box.textContent = ''; return; }
  const t = (kg) => `${zahl(kg / 1000, 1)} t`;
  const zeile = (nr, last, max, extra = '') => `<div class="zeile ${last > max + 1e-6 ? 'zu' : ''}"><span class="nr ${extra}">${nr}</span><span class="wert">${t(last)}</span><span class="max">/ ${t(max)}</span></div>`;
  const achsen = einzelachsen();
  const sattel = fahrzeug().achslast.art === 'sattel';
  let html = '';
  if (sattel) {
    html += `<div class="gruppe">Zugmaschine</div>${achsen.filter((a) => a.gruppe === 'fahrzeug').map((a) => zeile(a.nr, a.last, a.max)).join('')}`;
    html += `<div class="gruppe">Auflieger</div><div class="zeile"><span class="nr zapfen" title="Königszapfen">⊙</span><span class="wert">${t(achs.zapfen.last)}</span><span class="max">Zapfen</span></div>`;
    html += achsen.filter((a) => a.gruppe === 'auflieger').map((a) => zeile(a.nr, a.last, a.max)).join('');
  } else html += achsen.map((a) => zeile(a.nr, a.last, a.max)).join('');
  const ok = achs.achsen.every((x) => x.ok);
  box.innerHTML = `<div class="kopf"><span>Achslasten ${ok ? '<span class="gut">✓</span>' : '<span class="schlecht">✗</span>'}</span>
    <span class="knoepfchen"><button type="button" data-sp class="${zeigeSchwerpunkt ? 'an' : ''}" title="Schwerpunkt ${zeigeSchwerpunkt ? 'ausblenden' : 'einblenden'}" aria-pressed="${zeigeSchwerpunkt}">${SCHWERPUNKT_SVG(16)}</button><button type="button" data-lvp title="Lastverteilungsplan" aria-label="Lastverteilungsplan">ⓘ</button><span>${box.classList.contains('zu-klein') ? '▸' : '▾'}</span></span></div><div class="inhalt">${html}</div>`;
}
// Antippen klappt das Kästchen ein und aus; bleibt im Browser gespeichert
try { if (localStorage.getItem('lasi3d-achsbox') === 'zu') document.getElementById('achsbox').classList.add('zu-klein'); } catch { /* egal */ }
document.getElementById('achsbox').addEventListener('click', (ev) => {
  const box = document.getElementById('achsbox');
  if (ev.target.closest('[data-sp]')) {
    zeigeSchwerpunkt = !zeigeSchwerpunkt;
    try { localStorage.setItem('lasi3d-schwerpunkt', zeigeSchwerpunkt ? 'an' : 'aus'); } catch { /* egal */ }
    aktualisiere();
    return;
  }
  if (ev.target.closest('[data-lvp]')) {
    oeffneBlatt(`<h3 id="blatt-titel">Lastverteilungsplan</h3>${achslastBlock()}${fuss(false)}`);
    return;
  }
  box.classList.toggle('zu-klein');
  try { localStorage.setItem('lasi3d-achsbox', box.classList.contains('zu-klein') ? 'zu' : 'auf'); } catch { /* egal */ }
  zeigeAchsbox();
});

function achslastBlock() {
  const f = fahrzeug(), L = f.laenge;
  const nutzlast = uebermass.nutzlast;
  const zeilen = achs.achsen.map((a) => `<tr><td>${esc(a.name)}</td><td class="${a.ok ? 'gut' : 'schlecht'}">${zahl(a.last / 1000, 2)} t</td><td>max. ${zahl(a.max / 1000, 1)} t</td></tr>`).join('');
  const lenk = achs.schwerpunkt.masse > 0 ? `<tr><td>Anteil Lenkachse</td><td class="${achs.lenkanteil >= 0.2 ? 'gut' : 'schlecht'}">${zahl(achs.lenkanteil * 100, 0)} %</td><td>mind. 20 %</td></tr>` : '';
  // Diagramm: waagerecht Abstand des Schwerpunkts von der Stirnwand, senkrecht Masse der Ladung
  const W = 320, H = 150, li = 34, re = 10, ob = 12, un = 26;
  const px = (abstand) => li + (abstand / L) * (W - li - re);
  const py = (m) => ob + (1 - m / nutzlast) * (H - ob - un);
  const plan = lastverteilungsplan(f, nutzlast);
  const linie = plan.map((p, i) => `${i ? 'L' : 'M'}${px(p.abstand).toFixed(1)},${py(p.masse).toFixed(1)}`).join(' ');
  const flaeche = `${linie} L${px(L)},${py(0)} L${px(0)},${py(0)} Z`;
  const achsLinien = achs.achsen.flatMap((a) => a.raeder).filter((x) => x <= L / 2 && x >= -L / 2)
    .map((x) => `<line x1="${px(L / 2 - x)}" x2="${px(L / 2 - x)}" y1="${ob}" y2="${H - un}" class="achse"/>`).join('');
  const sp = achs.schwerpunkt;
  const punkt = sp.masse > 0 ? `<circle cx="${px(Math.min(Math.max(L / 2 - sp.x, 0), L))}" cy="${py(Math.min(sp.masse, nutzlast * 1.05))}" r="5" class="${achs.ok && sp.masse <= nutzlast ? 'ok' : 'nein'}"/>` : '';
  const svg = `<svg class="plan" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lastverteilungsplan">
    <path d="${flaeche}" class="erlaubt"/><path d="${linie}" class="grenze"/>${achsLinien}
    <line x1="${li}" x2="${W - re}" y1="${H - un}" y2="${H - un}" class="achse-x"/>
    <text x="${li}" y="${H - 8}">Stirnwand</text><text x="${W - re}" y="${H - 8}" text-anchor="end">${zahl(L, 1)} m</text>
    <text x="${li - 4}" y="${ob + 4}" text-anchor="end">${zahl(nutzlast / 1000, 1)} t</text><text x="${li - 4}" y="${H - un}" text-anchor="end">0</text>
    ${punkt}</svg>`;
  return `<div class="masse"><b>Achslasten</b><table>${zeilen}${lenk}</table>
    <div class="plan-titel">Lastverteilungsplan <span class="werte">· grün: erlaubte Masse je Lage des Schwerpunkts, Punkt: deine Ladung</span></div>${svg}
    ${achs.meldungen.length ? `<ul class="meldungen">${achs.meldungen.map((m) => `<li class="schlecht">${esc(m.text)}</li>`).join('')}</ul>` : ''}
    <p class="werte">Leergewichte und zulässige Achslasten sind Beispielwerte; maßgeblich sind Fahrzeugschein und Typenschild.</p></div>`;
}

function zeigeErgebnis() {
  const r = ergebnis;
  const offen = r.ergebnisse.filter((e) => !e.ok).length;
  const leer = r.ergebnisse.length === 0;
  const um = uebermass, umFehler = um.meldungen.filter((m) => m.stufe === 'fehler');
  const alles = r.ok && um.ok && achs.ok;
  $('status').textContent = leer ? 'Keine Ladung'
    : alles ? `✓ Ladung gesichert${um.meldungen.some((m) => m.stufe === 'pflicht') ? ' · Kennzeichnung nötig' : ''}`
    : `✗ ${[r.hinweise.some((h) => h.art === 'gurt-mangel') ? 'Zurrmittel mangelhaft' : '', offen ? `${offen} nicht gesichert` : '', r.hinweise.some((h) => h.art === 'lose') ? 'lose Teile' : '', umFehler.length ? 'Übermaß' : '', achs.ok ? '' : 'Achslast'].filter(Boolean).join(' · ') || 'Hinweise prüfen'}`;
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
      else if (d.hat === 0) text = d.rollt ? 'rollt, ungesichert' : 'ungesichert';
      else text = `${{ kopf: 'Kopfschlinge ', direkt: 'Direktzurren ', bucht: 'Buchtlashing ' }[d.methode] ?? ''}${zahl(d.auslastung * 100, 0)} % ausgelastet`;
      return `<tr><td>${RNAME[k]}</td><td class="${d.ok ? 'gut' : 'schlecht'}">${text}</td></tr>`;
    }).join('');
    const kq = e.kippen.seitlich, kl = e.kippen.laengs;
    const ersteLadung = e.einheit.mitglieder.find((o) => o.typ === 'ladung') ?? e.einheit.mitglieder[0];
    return `<div class="einheit ${e.ok ? '' : 'nein'}" data-waehle="${ersteLadung.id}">
      <b>${reihen.find((r) => r.ids.includes(e.id)) ? `<span class="reihe-nr">LR${reihen.find((r) => r.ids.includes(e.id)).nr}</span> ` : ''}${esc(einheitName(e))}</b>
      <span class="werte">${zahl(e.einheit.masse, 0)} kg · μ = ${zahl(e.einheit.mu)} · ${e.gurte.length} Gurt${e.gurte.length === 1 ? '' : 'e'}</span>
      <table>${zeilen}
        <tr><td>Kippen quer</td><td class="${kq.ok ? 'gut' : 'schlecht'}">${kq.brauch === 0 ? 'standsicher' : kq.ok ? 'durch Gurte gehalten' : 'kippt'}</td></tr>
        <tr><td>Kippen längs</td><td class="${kl.ok ? 'gut' : 'schlecht'}">${kl.ok ? 'standsicher' : 'kippt, anders sichern'}</td></tr>
      </table></div>`;
  }).join('');
  $('ergebnis').innerHTML = `${masse}${achslastBlock()}${meldungen ? `<ul class="meldungen">${meldungen}</ul>` : ''}${wand}${karten || '<p class="werte">Noch keine Ladung auf der Fläche.</p>'}`;
}

// ---------- Leiste am ausgewählten Teil ----------
function zeigeLeiste() {
  const leiste = $('leiste');
  const o = gewaehltesObjekt(), g = gewaehlterGurt();
  if ((!o && !g) || fahrt || platzMuster) { leiste.hidden = true; return; }
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
      : g.art === 'direkt' ? `${ZURRART[g.variante]} · LC ${zahl(g.lc, 0)} daN`
      : g.art === 'bucht' ? `Buchtlashing · LC ${zahl(g.lc, 0)} daN` : `Zurrgurt · ${zahl(g.stf, 0)} daN`;
    $('pad').classList.add('nur-laengs');
    $('leiste-knoepfe').classList.remove('vier');
    $('leiste-knoepfe').innerHTML = knopf('bearbeiten', '✎', 'Bearbeiten') + (g.art === 'kopf' || g.art === 'direkt' || g.art === 'bucht' ? '' : knopf('kopieren', '⧉', 'Kopieren')) + knopf('loeschen', '🗑', 'Löschen', 'class="rot"');
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
  else if (g?.art === 'bucht') g.x = Math.round(Math.min(Math.max(g.x + laengs * SCHRITT, -fahrzeug().laenge / 2), fahrzeug().laenge / 2) * 1000) / 1000;
  else if (g?.art === 'direkt' && g.ankerX != null) g.ankerX = naechsterZurrpunkt(fahrzeug().laenge, g.ankerX + laengs * 0.5);
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
  if (aktion === 'bearbeiten') { if (o) oeffneObjektBlatt(); else if (g.art === 'kopf') oeffneKopfBlatt(); else if (g.art === 'direkt') oeffneDirektBlatt(); else if (g.art === 'bucht') oeffneBuchtBlatt(); else oeffneGurtBlatt(); return; }
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
      const ziel = freieStelle(u.x1 - u.x0, u.z1 - u.z0) ?? { x: 0, z: 0 };
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
  const masze = o.form === 'rohr'
    ? feld('Maße in m (Länge · Durchmesser)', `<div class="drei" style="grid-template-columns:1fr 1fr">${stepper('l', o.l, { ...m, schritt: 0.5, max: 18 })}${stepper('rohrd', o.b, m)}</div>`)
      + feld('Lagerung', `<div class="chips"><button type="button" data-keile class="${o.keile ? 'an' : ''}">auf Kanthölzern mit Keilen</button></div><p class="werte">${o.keile ? 'Keile verhindern das Rollen.' : 'Ohne Keile rollt das Rohr quer zu seiner Achse: dann hält nur Formschluss oder eine Zurrung, z. B. Buchtlashing.'}</p>`)
    : o.hochkant ? '' : zyl
    ? feld('Maße in m (Durchmesser · Höhe)', `<div class="drei" style="grid-template-columns:1fr 1fr">${stepper('durchmesser', o.l, m)}${stepper('h', o.h, m)}</div>`)
    : o.typ === 'rhm'
      ? feld('Maße in m (Länge · Breite)', `<div class="drei" style="grid-template-columns:1fr 1fr">${stepper('l', o.l, m)}${stepper('b', o.b, m)}</div>`)
      : feld('Maße in m (Länge · Breite · Höhe)', `<div class="drei">${stepper('l', o.l, m)}${stepper('b', o.b, m)}${stepper('h', o.h, { ...m, min: 0.02 })}</div>`);
  let stehtAuf = '';
  if (o.typ !== 'rhm' && !o.hochkant) {
    const u = unterlage(zustand.objekte, ergebnis.lage, o);
    const wahl = o.typ === 'ladung'
      ? [['flaeche', 'Ladefläche'], ['palette', 'EPAL'], ['matte', 'RHM'], ['palette-matte', 'EPAL + RHM']]
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
  if (g.ankerX != null) {
    // frei gespannter Einzelgurt: Ecke der Ladung, Seite und Zurrpunkt am Rahmen wählen
    const L = fahrzeug().laenge;
    oeffneBlatt(`<h3 id="blatt-titel">Einzelgurt</h3><div class="lage" id="blatt-lage"></div>
      ${feld('Ecke an der Ladung', `<div class="chips">${Object.entries(ECKEN).map(([k, t]) => `<button type="button" data-ecke="${k}" class="${g.ecke === k ? 'an' : ''}">${t}</button>`).join('')}</div>`)}
      ${feld('Zurrpunkt am Rahmen', `<div class="chips" style="margin-bottom:6px"><button type="button" data-ankerseite="l" class="${g.ankerSeite === 'l' ? 'an' : ''}">linker Rahmen</button><button type="button" data-ankerseite="r" class="${g.ankerSeite === 'r' ? 'an' : ''}">rechter Rahmen</button></div>
        ${stepper('ankerab', L / 2 - g.ankerX, { schritt: 0.5, min: 0.25, max: L - 0.25, einheit: 'm ab Stirnwand', nk: 2 })}`)}
      <div class="drei" style="grid-template-columns:1fr 1fr">
        ${feld('Zurrkraft LC', stepper('dlc', g.lc, { schritt: 500, min: 500, max: 10000, einheit: 'daN', nk: 0 }))}
        ${feld('Höhe an der Ladung', stepper('anschlag', g.anschlag, { schritt: 0.05, min: 0.05, max: ziel ? +(ergebnis.lage.get(ziel.id).y + ziel.h).toFixed(2) : 4, einheit: 'm', nk: 2 }))}
      </div>
      <p class="werte">Die Zurrpunkte am Rahmen liegen alle 50 cm. Pfeile ▲▼ in der Leiste oder Ziehen springen zum nächsten Zurrpunkt. Je Gurt gilt LC · (cos α · cos β + 0,75 · μ · sin α); ein Gurt hält nur in die Richtung, in die er zieht.</p>
      ${fuss()}`);
    return;
  }
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

function oeffneBuchtBlatt() {
  const g = gewaehlterGurt();
  if (!g) return;
  const L = fahrzeug().laenge;
  const anzahl = zustand.gurte.filter((x) => x.gruppe && x.gruppe === g.gruppe).length;
  oeffneBlatt(`<h3 id="blatt-titel">Buchtlashing</h3><div class="lage" id="blatt-lage"></div>
    ${feld('Verankert am', `<div class="chips"><button type="button" data-buchtseite="l" class="${g.seite === 'l' ? 'an' : ''}">linken Rahmen (hält nach links)</button><button type="button" data-buchtseite="r" class="${g.seite === 'r' ? 'an' : ''}">rechten Rahmen (hält nach rechts)</button></div>`)}
    <div class="drei" style="grid-template-columns:1fr 1fr">
      ${feld('Zurrkraft LC', stepper('dlc', g.lc, { schritt: 500, min: 500, max: 10000, einheit: 'daN', nk: 0 }))}
      ${feld('Abstand Stirnwand', stepper('abstand', L / 2 - g.x, { schritt: 0.05, min: 0, max: L, einheit: 'm', nk: 2 }))}
    </div>
    ${anzahl > 1 ? `<div class="chips"><button type="button" data-alle class="${alleVierAn ? 'an' : ''}">LC für alle ${anzahl} Schlingen übernehmen</button></div>` : ''}
    <p class="werte">Die Schlinge läuft vom Zurrpunkt über die Ladung, um die ferne Seite herum und unten zurück zum selben Zurrpunkt. Sie zieht die Ladung zu ihrer Seite, deshalb immer paarweise (links und rechts). Je Schenkel LC · (cos α · cos β + 0,75 · μ · sin α). Bei rollender Ladung zählt keine Reibung.</p>
    <div class="fuss"><button type="button" class="gefahr" data-blatt="loeschen">Diese löschen</button>${anzahl > 1 ? '<button type="button" class="gefahr" data-blatt="alle-loeschen">Alle löschen</button>' : ''}<button type="button" data-blatt="fertig">Fertig</button></div>`);
}

function neueBucht(ladung) {
  const e = einheitVon(ladung);
  if (!e) return;
  const f = e.einheit.f, lang = f.x1 - f.x0, gruppe = neueId('z');
  const stellen = lang >= 3 ? [f.x1 - lang * 0.25, f.x0 + lang * 0.25] : [(f.x0 + f.x1) / 2];
  const neu = stellen.flatMap((x) => [['l', x + 0.1], ['r', x - 0.1]].map(([seite, xs]) => ({ id: neueId('g'), art: 'bucht', gruppe, ziel: ladung.id, seite, x: Math.round(xs * 100) / 100, lc: 2500, stf: 500 })));
  zustand.gurte.push(...neu);
  auswahl = { art: 'gurt', id: neu[0].id };
  aendere();
}

function neuerEinzelgurt(ladung) {
  const e = einheitVon(ladung);
  if (!e) return;
  const L = fahrzeug().laenge, f = e.einheit.f;
  const g = { id: neueId('g'), art: 'direkt', variante: 'frei', ziel: ladung.id, ecke: 'hl', ankerSeite: 'l', ankerX: naechsterZurrpunkt(L, f.x0 - 1.0), anschlag: Math.round(Math.min(0.5, e.einheit.hoehe / 2) * 100) / 100, lc: 2500, stf: 500, abstand: 0 };
  zustand.gurte.push(g);
  auswahl = { art: 'gurt', id: g.id };
  aendere();
  oeffneDirektBlatt();
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
      const ladung = e.einheit.mitglieder.find((m) => m.typ === 'ladung') ?? e.einheit.mitglieder[0];
      if (Math.abs(u.x0 - f.x1) <= 0.05) return { ladung, seite: 'hinten' };
      if (Math.abs(u.x1 - f.x0) <= 0.05) return { ladung, seite: 'vorne' };
    }
    return {};
  }
  const e = einheitVon(o);
  return { ladung: e ? e.einheit.mitglieder.find((m) => m.typ === 'ladung') ?? e.einheit.mitglieder[0] : undefined };
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
      ${seite ? '' : k('frei', 'Einzelgurt frei spannen', 'von einer Ecke zu einem beliebigen Zurrpunkt am Rahmen')}
      ${seite ? '' : k('bucht', 'Buchtlashing (Schlingen je Seite)', 'Schlinge um die Ladung, paarweise links und rechts; hält seitlich, auch gegen Rollen')}
    </div>
    ${e && !seite ? `<div class="chips"><button type="button" data-verteiler class="${verteilerAn ? 'an' : ''}">EPAL hochkant als Lastverteiler dazustellen</button></div>` : ''}
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
    if (name === 'rohrd') { o.b = v; o.h = v + (o.keile ? 0.1 : 0); }
    else if (name === 'durchmesser') { o.l = o.b = v; } else if (name === 'material') o.material = v; else o[name] = v;
    if (name === 'mu') { const c = blattInhalt.querySelector('[data-mu-auto]'); c?.classList.remove('an'); }
  } else if (g) {
    if (name === 'abstand') g.x = Math.round((fahrzeug().laenge / 2 - v) * 1000) / 1000;
    else if (name === 'zurrabstand') g.abstand = kopfAbstand(v);
    else if (name === 'dlc') setzeDirekt(g, 'lc', v);
    else if (name === 'dabstand') setzeDirekt(g, 'abstand', direktAbstand(v));
    else if (name === 'anschlag') setzeDirekt(g, 'anschlag', v);
    else if (name === 'ankerab') g.ankerX = naechsterZurrpunkt(fahrzeug().laenge, fahrzeug().laenge / 2 - v);
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
  } else if (el.hasAttribute('data-keile') && o) {
    o.keile = !o.keile;
    o.h = o.b + (o.keile ? 0.1 : 0);
    aendere();
    oeffneObjektBlatt();
  } else if (el.dataset.buchtseite && g) {
    g.seite = el.dataset.buchtseite;
    aendere();
    oeffneBuchtBlatt();
  } else if (el.dataset.ecke && g) {
    g.ecke = el.dataset.ecke;
    aendere();
    oeffneDirektBlatt();
  } else if (el.dataset.ankerseite && g) {
    g.ankerSeite = el.dataset.ankerseite;
    aendere();
    oeffneDirektBlatt();
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
      if (ladung && art === 'bucht') neueBucht(ladung);
      else if (ladung && art === 'frei') neuerEinzelgurt(ladung);
      else if (ladung && (art === 'diagonal' || art === 'schraeg')) neueDirektzurrung(ladung, art);
      else if (ladung) neueKopfschlinge(ladung, art === 'kopf-hinten' ? 'hinten' : 'vorne');
    }
  } else if (el.dataset.fahrt) {
    starteFahrt(el.dataset.fahrt);
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
    <p class="werte">${gewaehltesObjekt()?.typ === 'palette' || gewaehltesObjekt()?.typ === 'rhm' ? 'Kommt auf die ausgewählte EPAL bzw. RHM.' : 'Kommt an die nächste freie Stelle.'}</p>
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
  return null; // nirgends frei
}
function neuesObjekt(vorlage) {
  const o = { typ: 'ladung', ...vorlage, id: neueId('o'), x: 0, z: 0, drehung: 0, mu: 0 };
  const sel = gewaehltesObjekt();
  if (o.typ === 'ladung' && sel && sel.typ !== 'ladung') { o.x = sel.x; o.z = sel.z; o.drehung = sel.drehung; }
  else { const p = freieStelle(o.l, o.b) ?? { x: 0, z: 0 }; o.x = p.x; o.z = p.z; }
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
  if (platzMuster) {
    const naechster = stellplaetze(fahrzeug(), platzMuster).reduce((a, p) => (Math.hypot(p.x - o.x, p.z - o.z) < Math.hypot(a.x - o.x, a.z - o.z) ? p : a));
    if (Math.hypot(naechster.x - o.x, naechster.z - o.z) < 0.35) { o.x = naechster.x; o.z = naechster.z; return; }
  }
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
  if (g) { if (g.ankerX != null) g.ankerX = ziehen.gurtX; else if (g.art === 'kopf' || g.art === 'direkt') g.abstand = ziehen.gurtX; else g.x = ziehen.gurtX; }
  ziehen = null;
  steuerung().enabled = true;
  aktualisiere();
}

behaelter.addEventListener('pointerdown', (ev) => {
  if (ev.target !== renderer.domElement || fahrt) return;
  aktiveZeiger.add(ev.pointerId);
  if (aktiveZeiger.size > 1) { brichZiehenAb(); tippZiel = null; druck = null; return; }
  druck = { x: ev.clientX, y: ev.clientY };
  tippZiel = null;
  const { treffer } = treffe(ev, fahrzeug().hoehe);
  if (!treffer) return;
  const ziel = treffer.object.userData.ziel;
  if (ziel.art === 'platz' || auswahl?.id !== ziel.id) { tippZiel = ziel; return; }
  steuerung().enabled = false;
  let gruppe = [], wurzel = null;
  if (ziel.art === 'objekt') ({ gruppe, wurzel } = bewegGruppe(zustand.objekte, ergebnis.lage, objekt(ziel.id)));
  const yEbene = fahrzeug().hoehe + (wurzel ? ergebnis.lage.get(wurzel.id).y : 0);
  const { punkt } = treffe(ev, yEbene);
  ziehen = { ziel, wurzel, yEbene, start: punkt, bewegt: false, positionen: new Map(gruppe.map((a) => [a.id, { x: a.x, z: a.z }])), gurtX: ziel.art === 'gurt' ? (gurt(ziel.id).art === 'kopf' || gurt(ziel.id).art === 'direkt' ? gurt(ziel.id).ankerX ?? gurt(ziel.id).abstand : gurt(ziel.id).x) : 0 };
  renderer.domElement.setPointerCapture(ev.pointerId);
}, { capture: true });

renderer.domElement.addEventListener('pointermove', (ev) => {
  if (!ziehen || !ziehen.start) return;
  if (!ziehen.bewegt && Math.hypot(ev.clientX - druck.x, ev.clientY - druck.y) < 4) return; // Antippen nicht als Ziehen werten
  ziehen.bewegt = true;
  const { punkt } = treffe(ev, ziehen.yEbene);
  if (!punkt) return;
  const dx = punkt.x - ziehen.start.x, dz = punkt.z - ziehen.start.z;
  if (ziehen.ziel.art === 'gurt' && gurt(ziehen.ziel.id).ankerX != null) {
    gurt(ziehen.ziel.id).ankerX = naechsterZurrpunkt(fahrzeug().laenge, ziehen.gurtX + dx);
  } else if (ziehen.ziel.art === 'gurt' && gurt(ziehen.ziel.id).art === 'direkt') {
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
    if (tippZiel?.art === 'platz') platzAntippen(tippZiel.nr);
    else if (tippZiel) { auswahl = { ...tippZiel }; aktualisiere(); }
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
$('fahrt-knopf').addEventListener('click', oeffneFahrtWahl);
// Augen-Knopf oben: Menü mit den Anzeige-Schaltern
$('anzeige-knopf').addEventListener('click', (ev) => {
  ev.stopPropagation();
  const menue = $('anzeigemenue');
  menue.hidden = !menue.hidden;
  $('anzeige-knopf').setAttribute('aria-expanded', String(!menue.hidden));
  $('anzeige-knopf').classList.toggle('an', !menue.hidden);
});
document.addEventListener('pointerdown', (ev) => {
  if (!$('anzeigemenue').hidden && !ev.target.closest('#anzeigemenue, #anzeige-knopf')) { $('anzeigemenue').hidden = true; $('anzeige-knopf').classList.remove('an'); }
});
$('anzeige').addEventListener('click', (ev) => {
  const k = ev.target.closest('[data-anzeige]')?.dataset.anzeige;
  if (!k) return;
  if (k === 'schwerpunkt') {
    zeigeSchwerpunkt = !zeigeSchwerpunkt;
    try { localStorage.setItem('lasi3d-schwerpunkt', zeigeSchwerpunkt ? 'an' : 'aus'); } catch { /* egal */ }
  } else {
    anzeige[k] = !anzeige[k];
    try { localStorage.setItem('lasi3d-anzeige', JSON.stringify(anzeige)); } catch { /* egal */ }
  }
  aktualisiere();
});
$('fahrtband').addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-fahrt-aktion]')?.dataset.fahrtAktion;
  if (a === 'nochmal') starteFahrt(fahrt.k);
  if (a === 'andere') { beendeFahrt(); oeffneFahrtWahl(); }
  if (a === 'ende') beendeFahrt();
});
// + EPAL: freier Stellplatz, sonst freie Stelle; ist alles voll, oben auf den ersten EPAL-Stapel (bis 4 m Gesamthöhe)
$('palette-neu').addEventListener('click', () => {
  const frei = freiePlaetze()[0];
  const fertig = (o) => { auswahl = platzMuster ? null : { art: 'objekt', id: o.id }; aendere(); zeigeImBild(o.x); };
  if (frei) { fertig(neueEpal(frei)); return; }
  const v = epalVorlage();
  if (!platzMuster && freieStelle(v.l, v.b)) { neuesObjekt(v); return; }
  const plaetze = stellplaetze(fahrzeug(), platzMuster ?? 'laengs');
  const stapel = stapelPlatz(plaetze, zustand.objekte, ergebnis.lage, GRENZEN.hoehe - fahrzeug().hoehe);
  if (stapel) fertig(neueEpal(stapel.platz));
  else neuesObjekt(v);
});
$('plaetze-knopf').addEventListener('click', () => { setzePlatzMuster(platzMuster ? null : 'laengs'); if (platzMuster && ansicht !== 'oben') setzeAnsicht('oben'); });
$('platzleiste').addEventListener('click', (ev) => {
  const m = ev.target.closest('[data-muster]')?.dataset.muster;
  const a = ev.target.closest('[data-platz-aktion]')?.dataset.platzAktion;
  if (m) setzePlatzMuster(m);
  if (a === 'fertig') setzePlatzMuster(null);
  if (a === 'fuellen') { for (const p of freiePlaetze()) neueEpal(p); auswahl = null; aendere(); }
});
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
  fahrt: () => fahrt && { fertig: fahrt.fertig, z: fahrt.z.map((u) => ({ id: u.id, x: u.x, z: u.z, kipp: u.kipp, faellt: u.faellt })) },
  achslasten: () => achs,
  obenSicht: () => ({ x: steuerOben.target.x, z: steuerOben.target.z, zoom: kameraOben.zoom, minZoom: steuerOben.minZoom }),
  // Werte eines Objekts direkt setzen (für die Tests)
  setze(id, werte) { Object.assign(objekt(id), werte); aendere(); },
  // Kamera frei setzen (für Bilder in den Tests)
  kamera(ziel, pos) { steuer3d.target.set(...ziel); kamera3d.position.set(...pos); steuer3d.update(); },
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
