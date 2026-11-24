// Kataloge für den Editor. Maße in m, Massen in kg, Kräfte in daN.
// Reibbeiwerte stehen in src/modell.js (REIBWERTE) und sind Richtwerte.

// gesamtlaenge: Fahrzeug bzw. Zug ohne Überstand; laengeMax: Fahrzeug samt Ladung (§ 22 Abs. 2 StVO); nutzlast: Beispielwert,
// im Fahrzeugschein prüfen und im Bedienfeld anpassen
// achslast: Lage der Achsen (x wie auf der Ladefläche), Leergewicht je Achse und zulässige Achslast (Beispielwerte)
export const FAHRZEUGE = [
  { id: 'sattel', name: 'Sattelauflieger, Pritsche/Plane (13,6 m)', laenge: 13.6, breite: 2.48, hoehe: 1.2, breiteAussen: 2.55, gesamtlaenge: 16.5, laengeMax: 20.75, nutzlast: 24000, achsen: [-4.4, -3.1, -1.8], haus: false,
    achslast: {
      art: 'sattel', zapfen: { x: 6.3, leer: 2500 },
      aggregat: { name: 'Achsaggregat Auflieger', x: -3.1, raeder: [-4.4, -3.1, -1.8], leer: 4500, max: 24000 },
      vorn: { name: 'Vorderachse Zugmaschine', x: 8.7, raeder: [8.7], leer: 5500, max: 8000 },
      antrieb: { name: 'Antriebsachse Zugmaschine', x: 5.8, raeder: [5.8], leer: 2000, max: 11500 },
    } },
  { id: 'motorwagen', name: 'Motorwagen (7,3 m)', laenge: 7.3, breite: 2.48, hoehe: 1.15, breiteAussen: 2.55, gesamtlaenge: 10.0, laengeMax: 20.75, nutzlast: 14000, achsen: [-2.2, -0.9], haus: true,
    achslast: {
      art: 'einzel',
      vorn: { name: 'Vorderachse', x: 4.95, raeder: [4.95], leer: 5500, max: 8000 },
      hinten: { name: 'Hinterachsen (Doppelachse)', x: -1.55, raeder: [-2.2, -0.9], leer: 3500, max: 19000 },
    } },
  { id: 'klein', name: 'Kleiner Lkw bis 7,5 t (6,2 m)', laenge: 6.2, breite: 2.4, hoehe: 1.0, breiteAussen: 2.5, gesamtlaenge: 8.3, laengeMax: 20.75, nutzlast: 3300, achsen: [-1.0], haus: true,
    achslast: {
      art: 'einzel',
      vorn: { name: 'Vorderachse', x: 4.2, raeder: [4.2], leer: 2400, max: 4300 },
      hinten: { name: 'Hinterachse', x: -1.0, raeder: [-1.0], leer: 1800, max: 5600 },
    } },
];

export const LADEGUT = [
  { art: 'holzkiste', name: 'Holzkiste', form: 'quader', material: 'holz', masse: 800, l: 1.2, b: 1.0, h: 1.0 },
  { art: 'gitterbox', name: 'Gitterbox', form: 'quader', material: 'stahl', masse: 450, l: 1.24, b: 0.835, h: 0.97 },
  { art: 'ibc', name: 'IBC 1000 l, gefüllt', form: 'quader', material: 'stahl', masse: 1050, l: 1.2, b: 1.0, h: 1.16 },
  { art: 'fass', name: 'Fass 200 l', form: 'zylinder', material: 'stahl', masse: 220, l: 0.6, b: 0.6, h: 0.9 },
  { art: 'papierrolle', name: 'Papierrolle, stehend', form: 'zylinder', material: 'papier', masse: 1500, l: 1.2, b: 1.2, h: 1.4 },
  { art: 'kunststoffkisten', name: 'Kunststoffkisten, gestapelt', form: 'quader', material: 'kunststoff', masse: 300, l: 1.2, b: 0.8, h: 1.0 },
  { art: 'mauersteine', name: 'Mauersteine, Paket', form: 'quader', material: 'stein', masse: 1000, l: 1.2, b: 0.8, h: 1.0 },
];

export const HILFSMITTEL = [
  { art: 'europalette', typ: 'palette', name: 'Europalette', form: 'quader', material: 'holz', masse: 25, l: 1.2, b: 0.8, h: 0.144 },
  { art: 'rhm', typ: 'rhm', name: 'RHM', form: 'quader', material: 'rhm', masse: 0, l: 1.2, b: 0.8, h: 0.008 },
];

export const GURTTYPEN = [
  { id: 'standard', name: 'Zurrgurt, Standardratsche', stf: 250, lc: 2500 },
  { id: 'langhebel', name: 'Zurrgurt, Langhebelratsche', stf: 500, lc: 2500 },
  { id: 'zug', name: 'Zurrgurt, Zugratsche', stf: 750, lc: 2500 },
];

export const MATERIALIEN = { holz: 'Holz', stahl: 'Stahl', kunststoff: 'Kunststoff', papier: 'Papier', stein: 'Stein/Folie' };

// Beispiele zum Laden; x und z beziehen sich auf die Mitte der Ladefläche
export function beispiel(fahrzeugId) {
  const objekte = [], gurte = [];
  let n = 0;
  const neu = (vorlage, x, z, drehung = 0) => { const o = { ...vorlage, typ: vorlage.typ ?? 'ladung', id: `o${++n}`, x, z, drehung }; objekte.push(o); return o; };
  const vorlage = (art) => LADEGUT.find((v) => v.art === art) ?? HILFSMITTEL.find((v) => v.art === art);
  if (fahrzeugId === 'sattel') {
    // vier Reihen Mauersteine auf Paletten quer, an die Stirnwand geschoben, je Reihe ein Gurt
    for (let i = 0; i < 4; i++) {
      const x = 6.8 - 0.4 - i * 0.8;
      for (const z of [-0.62, 0.62]) { neu(vorlage('europalette'), x, z, 90); neu(vorlage('mauersteine'), x, z, 90); }
      gurte.push({ id: `g${i + 1}`, x, stf: 500, lc: 2500, zweiRatschen: false });
    }
    neu(vorlage('rhm'), -1.5, 0, 0);
    const rolle = neu(vorlage('papierrolle'), -1.5, 0);
    gurte.push({ id: 'g5', x: rolle.x - 0.3, stf: 500, lc: 2500, zweiRatschen: false }, { id: 'g6', x: rolle.x + 0.3, stf: 500, lc: 2500, zweiRatschen: false });
  } else {
    const vorne = fahrzeugId === 'klein' ? 3.1 : 3.65;
    for (const z of [-0.55, 0.55]) { neu({ ...vorlage('rhm'), l: 1.2, b: 1.0 }, vorne - 0.6, z); neu(vorlage('ibc'), vorne - 0.6, z); }
    gurte.push({ id: 'g1', x: vorne - 0.6, stf: 500, lc: 2500, zweiRatschen: false });
    const x = vorne - 1.2 - 0.6;
    neu(vorlage('europalette'), x, -0.55); neu(vorlage('fass'), x - 0.3, -0.55); neu(vorlage('fass'), x + 0.3, -0.55);
    neu(vorlage('europalette'), x, 0.55); neu(vorlage('fass'), x - 0.3, 0.55); neu(vorlage('fass'), x + 0.3, 0.55);
    gurte.push({ id: 'g2', x: x - 0.3, stf: 250, lc: 2500, zweiRatschen: false }, { id: 'g3', x: x + 0.3, stf: 250, lc: 2500, zweiRatschen: false });
  }
  return { objekte, gurte };
}
