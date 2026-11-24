// Gewicht und Abmessungen der Beladung gegen die Grenzen der StVO/StVZO prüfen.
// Ohne Browser, damit es mit `npm test` geprüft werden kann.

import { fussabdruck } from './modell.js';

export const GRENZEN = {
  breite: 2.55, // § 32 StVZO
  hoehe: 4.0, // § 32 StVZO, § 22 StVO
  ueberstandHinten: 1.5, // § 22 Abs. 4 StVO
  ueberstandHintenKurz: 3.0, // bei Fahrten bis 100 km
  kennzeichnungAb: 1.0, // ab 1 m Überstand hinten kenntlich machen
  seitlichLeuchteAb: 0.4, // seitlich mehr als 40 cm über die Leuchten: Leuchten nötig
};

/**
 * @param {{objekte:object[], lage:Map, fahrzeug:object, nutzlast?:number}} p
 * @returns Werte, Meldungen (stufe: 'fehler' | 'pflicht' | 'hinweis') und was markiert werden muss
 */
export function pruefeUebermass({ objekte, lage, fahrzeug, nutzlast }) {
  const L = fahrzeug.laenge / 2, B = fahrzeug.breite / 2;
  const grenzeNutzlast = nutzlast > 0 ? nutzlast : fahrzeug.nutzlast;
  const masse = objekte.reduce((s, o) => s + (o.masse || 0), 0);
  const meldungen = [];
  const leer = !objekte.length;
  const fs = objekte.map((o) => ({ o, f: fussabdruck(o), oben: (lage.get(o.id)?.y ?? 0) + o.h }));
  const x0 = leer ? -L : Math.min(...fs.map((a) => a.f.x0));
  const z0 = leer ? -B : Math.min(...fs.map((a) => a.f.z0));
  const z1 = leer ? B : Math.max(...fs.map((a) => a.f.z1));
  const oben = leer ? 0 : Math.max(...fs.map((a) => a.oben));

  const ueberHinten = Math.max(0, -L - x0);
  const ueberLinks = Math.max(0, -B - z0), ueberRechts = Math.max(0, z1 - B);
  // Gesamtbreite: Fahrzeug und Ladung zusammen
  const breite = Math.max(fahrzeug.breiteAussen / 2, z1) + Math.max(fahrzeug.breiteAussen / 2, -z0);
  const hoehe = fahrzeug.hoehe + oben;
  const laenge = fahrzeug.gesamtlaenge + ueberHinten;
  const m = (v) => `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
  const kg = (v) => `${Math.round(v).toLocaleString('de-DE')} kg`;

  if (masse > grenzeNutzlast) meldungen.push({ art: 'gewicht', stufe: 'fehler', text: `Zu schwer: ${kg(masse)} geladen, Nutzlast ${kg(grenzeNutzlast)} (${kg(masse - grenzeNutzlast)} zu viel).` });
  if (breite > GRENZEN.breite + 1e-9) meldungen.push({ art: 'breite', stufe: 'fehler', text: `Zu breit: ${m(breite)}, erlaubt sind ${m(GRENZEN.breite)}. Nur mit Ausnahmegenehmigung.` });
  else if (Math.max(ueberLinks, ueberRechts) > 0.005) meldungen.push({ art: 'seitlich', stufe: 'hinweis', text: `Ladung steht seitlich ${m(Math.max(ueberLinks, ueberRechts))} über die Ladefläche.` });
  if (Math.max(ueberLinks, ueberRechts) > GRENZEN.seitlichLeuchteAb) meldungen.push({ art: 'seitlich', stufe: 'pflicht', text: 'Seitlich mehr als 40 cm Überstand: Leuchten und Rückstrahler an der Ladung nötig.' });
  if (hoehe > GRENZEN.hoehe + 1e-9) meldungen.push({ art: 'hoehe', stufe: 'fehler', text: `Zu hoch: ${m(hoehe)} über der Fahrbahn, erlaubt sind ${m(GRENZEN.hoehe)}.` });
  if (ueberHinten > GRENZEN.ueberstandHintenKurz + 1e-9) meldungen.push({ art: 'hinten', stufe: 'fehler', text: `Überstand hinten ${m(ueberHinten)}: erlaubt sind höchstens ${m(GRENZEN.ueberstandHintenKurz)} (bei Fahrten bis 100 km).` });
  else if (ueberHinten > GRENZEN.ueberstandHinten + 1e-9) meldungen.push({ art: 'hinten', stufe: 'fehler', text: `Überstand hinten ${m(ueberHinten)}: erlaubt sind ${m(GRENZEN.ueberstandHinten)}, nur bei Fahrten bis 100 km bis ${m(GRENZEN.ueberstandHintenKurz)}.` });
  if (ueberHinten > GRENZEN.kennzeichnungAb + 1e-9) meldungen.push({ art: 'kennzeichnung', stufe: 'pflicht', text: 'Überstand hinten über 1 m: hellrote Fahne oder Schild (mind. 30 × 30 cm) am Ende der Ladung, bei Dunkelheit rote Leuchte und Rückstrahler.' });
  if (laenge > fahrzeug.laengeMax + 1e-9) meldungen.push({ art: 'laenge', stufe: 'fehler', text: `Zu lang: ${m(laenge)} mit Überstand, erlaubt sind ${m(fahrzeug.laengeMax)}.` });

  // Ladung, deren Mitte nicht mehr auf der Fläche liegt, kippt über die Kante
  for (const { o } of fs) {
    if (lage.get(o.id)?.traeger || o.typ === 'rhm') continue;
    if (o.x < -L || Math.abs(o.z) > B) meldungen.push({ art: 'auflage', stufe: 'fehler', id: o.id, text: `${o.name} liegt mit dem Schwerpunkt außerhalb der Ladefläche und kippt über die Kante.` });
  }

  // Das Teil am weitesten hinten bekommt die Fahne
  const hinterstes = ueberHinten > 0 ? fs.reduce((a, b) => (b.f.x0 < a.f.x0 ? b : a)) : null;
  const fahne = ueberHinten > GRENZEN.kennzeichnungAb + 1e-9 ? { x: hinterstes.f.x0, y: hinterstes.oben, z: hinterstes.o.z } : null;

  return {
    masse, nutzlast: grenzeNutzlast, breite, hoehe, laenge, laengeMax: fahrzeug.laengeMax,
    ueberHinten, ueberLinks, ueberRechts, meldungen, fahne,
    zuBreit: breite > GRENZEN.breite + 1e-9, zuHoch: hoehe > GRENZEN.hoehe + 1e-9,
    ok: !meldungen.some((x) => x.stufe === 'fehler'),
  };
}
