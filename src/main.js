import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { niederzurren, zurrwinkel, kippsicher, BEIWERTE_STRASSE, SICHERHEIT_NIEDERZURREN, K_FAKTOR } from './berechnung.js';
import { REIBPAARUNGEN, ZURRGURTE, LADUNGEN, LADEFLAECHE } from './daten.js';

// ---------- Szene ----------
// Achsen: x = Fahrtrichtung (vorne = +x), y = oben, z = quer
const behaelter = document.getElementById('szene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
behaelter.appendChild(renderer.domElement);

const szene = new THREE.Scene();
szene.background = new THREE.Color(0xdfe6ea);
const kamera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
kamera.position.set(-6, 9, 17);
const steuerung = new OrbitControls(kamera, renderer.domElement);
steuerung.target.set(1.5, 1.2, 0);
steuerung.enableDamping = true;
steuerung.maxPolarAngle = Math.PI / 2 - 0.05;

szene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f86, 1.6));
const sonne = new THREE.DirectionalLight(0xffffff, 2.2);
sonne.position.set(10, 18, 8);
sonne.castShadow = true;
sonne.shadow.mapSize.set(2048, 2048);
Object.assign(sonne.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
szene.add(sonne);

const boden = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x9da39a }));
boden.rotation.x = -Math.PI / 2;
boden.receiveShadow = true;
szene.add(boden);

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
function kasten(l, h, b, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, b), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Lkw: Pritsche, Rahmen, Stirnwand, Fahrerhaus, Räder
const { laenge: FL, breite: FB, hoehe: FH } = LADEFLAECHE;
const lkw = new THREE.Group();
lkw.add(kasten(FL, 0.15, FB, mat(0x6b4f35), 0, FH - 0.075, 0)); // Siebdruckboden
lkw.add(kasten(FL, 0.3, 1.0, mat(0x2b2f33), 0, FH - 0.3, 0)); // Rahmen
lkw.add(kasten(0.08, 1.6, FB, mat(0x56616b, { metalness: 0.4 }), FL / 2 - 0.04, FH + 0.8, 0)); // Stirnwand
const haus = kasten(2.3, 2.9, 2.5, mat(0xc9d2d8, { metalness: 0.2 }), FL / 2 + 1.5, 2.0, 0);
lkw.add(haus);
lkw.add(kasten(0.05, 1.1, 2.2, mat(0x1c2a36, { roughness: 0.2 }), FL / 2 + 2.66, 2.6, 0)); // Scheibe
const radGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 24).rotateX(Math.PI / 2);
for (const x of [FL / 2 + 1.8, -FL / 2 + 1.0, -FL / 2 + 2.3, -FL / 2 + 3.6]) {
  for (const z of [-1.05, 1.05]) {
    const rad = new THREE.Mesh(radGeo, mat(0x161616));
    rad.position.set(x, 0.5, z);
    rad.castShadow = true;
    lkw.add(rad);
  }
}
szene.add(lkw);

// Ladung und Gurte werden bei jeder Änderung neu gebaut
const ladungGruppe = new THREE.Group();
szene.add(ladungGruppe);
const holz = mat(0xc89b5f);
const gurtMat = mat(0xe8901a, { roughness: 0.5 });
const ratscheMat = mat(0x8a949c, { metalness: 0.6, roughness: 0.4 });

// Gurtstück als flaches Band zwischen zwei Punkten
function band(a, b, breite = 0.05, dicke = 0.012) {
  const laenge = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(breite, laenge, dicke), gurtMat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

function baueLadung({ laenge, breite, hoehe }, anzahlGurte) {
  ladungGruppe.clear();
  const x = FL / 2 - 0.6 - laenge / 2; // mit Abstand zur Stirnwand, damit Niederzurren allein sichern muss
  const y0 = FH;
  ladungGruppe.add(kasten(laenge, hoehe, breite, holz, x, y0 + hoehe / 2, 0));
  const n = Number.isFinite(anzahlGurte) ? Math.min(anzahlGurte, 12) : 0;
  for (let i = 0; i < n; i++) {
    const gx = x - laenge / 2 + (laenge * (i + 0.5)) / n;
    const e = 0.01; // Gurt liegt knapp auf der Ladung
    const punkte = [
      new THREE.Vector3(gx, y0, -FB / 2),
      new THREE.Vector3(gx, y0 + hoehe + e, -breite / 2 - e),
      new THREE.Vector3(gx, y0 + hoehe + e, breite / 2 + e),
      new THREE.Vector3(gx, y0, FB / 2),
    ];
    for (let j = 0; j < 3; j++) ladungGruppe.add(band(punkte[j], punkte[j + 1]));
    const r = punkte[0].clone().lerp(punkte[1], 0.35);
    ladungGruppe.add(kasten(0.08, 0.12, 0.06, ratscheMat, r.x, r.y, r.z - 0.03));
  }
}

function groesse() {
  const { clientWidth: w, clientHeight: h } = behaelter;
  renderer.setSize(w, h, false);
  kamera.aspect = w / h;
  kamera.updateProjectionMatrix();
}
new ResizeObserver(groesse).observe(behaelter);
renderer.setAnimationLoop(() => { steuerung.update(); renderer.render(szene, kamera); });

// ---------- Bedienung ----------
const $ = (id) => document.getElementById(id);
const fuelle = (sel, liste) => { sel.innerHTML = liste.map((e) => `<option value="${e.id}">${e.name}</option>`).join(''); };
fuelle($('ladung'), LADUNGEN);
fuelle($('reibung'), REIBPAARUNGEN.map((r) => ({ ...r, name: `${r.name} (μ = ${r.mu})` })));
fuelle($('gurt'), ZURRGURTE);
$('reibung').value = 'holz-sperrholz';

function uebernehmeLadung() {
  const l = LADUNGEN.find((e) => e.id === $('ladung').value);
  for (const f of ['masse', 'laenge', 'breite', 'hoehe']) $(f).value = l[f];
}

const zahl = (v, s = 2) => v.toLocaleString('de-DE', { maximumFractionDigits: s });
const NAMEN = { vorwaerts: 'vorwärts', rueckwaerts: 'rückwärts', seitlich: 'seitlich' };

function aktualisiere() {
  const masse = +$('masse').value, laenge = +$('laenge').value, hoehe = +$('hoehe').value;
  const breite = Math.min(+$('breite').value, FB);
  const { mu } = REIBPAARUNGEN.find((r) => r.id === $('reibung').value);
  const { stf } = ZURRGURTE.find((g) => g.id === $('gurt').value);
  const k = $('k2').checked ? K_FAKTOR.zweiSpannelemente : K_FAKTOR.einSpannelement;
  let r, kipp, winkel;
  try {
    winkel = zurrwinkel(hoehe, breite, FB);
    r = niederzurren({ masse, mu, winkel, stf, k });
    kipp = kippsicher({ hoehe, breite, laenge });
  } catch {
    $('ergebnis').innerHTML = '<p class="schlecht">Bitte alle Werte als positive Zahlen eingeben.</p>';
    return;
  }
  baueLadung({ laenge, breite, hoehe }, r.anzahl);

  const gesamt = Number.isFinite(r.anzahl)
    ? `<div class="gross">${r.anzahl} Gurt${r.anzahl === 1 ? '' : 'e'}</div><div>maßgebend: ${NAMEN[r.massgebend]}</div>`
    : '<div class="gross schlecht">Nicht möglich</div><div>Ohne Reibung sichert Niederzurren nicht.</div>';
  const zeilen = Object.keys(NAMEN).map((d) => `<tr><td>${NAMEN[d]}</td><td>${Number.isFinite(r[d].anzahl) ? r[d].anzahl : '–'}</td></tr>`).join('');
  const kippText = Object.entries(kipp).filter(([, ok]) => !ok).map(([d]) => NAMEN[d]);
  $('ergebnis').innerHTML = `${gesamt}
    <table><tr><td>Zurrwinkel α</td><td>${zahl(winkel, 1)}°</td></tr>${zeilen}</table>
    <p class="${kippText.length ? 'schlecht' : 'gut'}">${kippText.length ? `Kippgefahr ${kippText.join(', ')}: zusätzlich sichern (z. B. Direktzurren oder Formschluss).` : 'Ladung ist kippsicher.'}</p>`;

  const d = r.massgebend ?? 'vorwaerts';
  const { c } = BEIWERTE_STRASSE[d];
  $('rechenweg').innerHTML = `
    <p>n ≥ (c − μ·c<sub>z</sub>) · m · g / (k · μ · sin α · F<sub>T</sub>) · f<sub>s</sub></p>
    <p>Richtung ${NAMEN[d]}: c = ${zahl(c)}, c<sub>z</sub> = 1, μ = ${zahl(mu)}, m = ${zahl(masse, 0)} kg, g = 9,81 m/s²</p>
    <p>k = ${zahl(k, 1)}, α = ${zahl(winkel, 1)}°, F<sub>T</sub> = S<sub>TF</sub> = ${stf} daN = ${stf * 10} N, f<sub>s</sub> = ${zahl(SICHERHEIT_NIEDERZURREN[d])}</p>
    <p>nicht durch Reibung gehalten: ${zahl(r[d].restkraft, 0)} N · je Gurt zusätzlich: ${zahl(r[d].proGurt, 0)} N</p>
    <p>→ n = ${Number.isFinite(r[d].anzahl) ? r[d].anzahl : '–'}</p>`;
}

$('ladung').addEventListener('change', () => { uebernehmeLadung(); aktualisiere(); });
for (const id of ['masse', 'laenge', 'breite', 'hoehe', 'reibung', 'gurt', 'k2']) $(id).addEventListener('input', aktualisiere);
uebernehmeLadung();
aktualisiere();
