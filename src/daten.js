// Auswahllisten für die Beispiele.
// Die Reibbeiwerte sind übliche Richtwerte. Maßgeblich sind die Tabellen der
// EN 12195-1 (Anhang B) oder ein Zertifikat für die konkrete Paarung.

export const REIBPAARUNGEN = [
  { id: 'rhm', name: 'Antirutschmatte (RHM) unter der Ladung', mu: 0.6 },
  { id: 'holz-sperrholz', name: 'Schnittholz auf Sperrholz/Siebdruck', mu: 0.45 },
  { id: 'holz-holz-glatt', name: 'Gehobeltes Holz auf Holz', mu: 0.3 },
  { id: 'stahl-holz', name: 'Stahlkiste auf Sperrholz', mu: 0.3 },
  { id: 'kunststoff', name: 'Kunststoffpalette auf Sperrholz', mu: 0.2 },
];

export const ZURRGURTE = [
  { id: 'gurt-ratsche', name: 'Zurrgurt, Standardratsche (S_TF 250 daN)', stf: 250, lc: 2500 },
  { id: 'gurt-langhebel', name: 'Zurrgurt, Langhebelratsche (S_TF 500 daN)', stf: 500, lc: 2500 },
  { id: 'gurt-ergo', name: 'Zurrgurt, Zugratsche (S_TF 750 daN)', stf: 750, lc: 2500 },
];

export const LADUNGEN = [
  { id: 'kiste', name: 'Holzkiste', masse: 1200, laenge: 1.2, breite: 1.0, hoehe: 1.0 },
  { id: 'palette', name: 'Europalette mit Kartons', masse: 600, laenge: 1.2, breite: 0.8, hoehe: 1.4 },
  { id: 'maschine', name: 'Maschine auf Kufen', masse: 3000, laenge: 2.0, breite: 1.2, hoehe: 1.6 },
];

// Sattelauflieger-Pritsche
export const LADEFLAECHE = { laenge: 13.6, breite: 2.48, hoehe: 1.2 };
