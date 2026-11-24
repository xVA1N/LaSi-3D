// Achslasten über das Hebelgesetz: Ladung als Gesamtmasse im gemeinsamen Schwerpunkt.
// Einzelfahrzeug: Balken auf Vorder- und Hinterachse. Sattelzug: Auflieger auf Königszapfen und
// Achsaggregat, die Zapfenlast verteilt sich auf Vorder- und Antriebsachse der Zugmaschine.
// Ohne Browser, damit es mit `npm test` geprüft werden kann.

export const LENKACHSE_MIN = 0.2; // Richtwert: Lenkachse mindestens 20 % der tatsächlichen Gesamtmasse

/** Lasten je Achse in kg, wenn die Masse m (kg) bei x (m, Koordinaten der Ladefläche) liegt */
export function lasten(achslast, m, x) {
  const a = achslast;
  if (a.art === 'einzel') {
    const sv = (x - a.hinten.x) / (a.vorn.x - a.hinten.x);
    return [
      { ...a.vorn, last: a.vorn.leer + m * sv, lenk: true },
      { ...a.hinten, last: a.hinten.leer + m * (1 - sv) },
    ];
  }
  const k = (x - a.aggregat.x) / (a.zapfen.x - a.aggregat.x);
  const zapfen = a.zapfen.leer + m * k;
  const radstand = a.vorn.x - a.antrieb.x;
  return [
    { ...a.vorn, last: a.vorn.leer + (zapfen * (a.zapfen.x - a.antrieb.x)) / radstand, lenk: true },
    { ...a.antrieb, last: a.antrieb.leer + (zapfen * (a.vorn.x - a.zapfen.x)) / radstand },
    { ...a.aggregat, last: a.aggregat.leer + m * (1 - k) },
  ];
}

const leergewicht = (a) => (a.art === 'einzel' ? a.vorn.leer + a.hinten.leer : a.vorn.leer + a.antrieb.leer + a.aggregat.leer + a.zapfen.leer);

/** Schwerpunkt der Ladung (Masse, x, z) */
export function schwerpunkt(objekte) {
  const m = objekte.reduce((s, o) => s + (o.masse || 0), 0);
  if (m <= 0) return { masse: 0, x: 0, z: 0 };
  return { masse: m, x: objekte.reduce((s, o) => s + (o.masse || 0) * o.x, 0) / m, z: objekte.reduce((s, o) => s + (o.masse || 0) * o.z, 0) / m };
}

/** Achslasten prüfen */
export function pruefeAchslasten({ objekte, fahrzeug }) {
  const a = fahrzeug.achslast;
  const sp = schwerpunkt(objekte);
  const achsen = lasten(a, sp.masse, sp.x).map((x) => ({ ...x, ok: x.last <= x.max + 1e-6 }));
  const gesamt = achsen.reduce((s, x) => s + x.last, 0);
  const meldungen = achsen.filter((x) => !x.ok).map((x) => ({ art: 'achslast', stufe: 'fehler', text: `${x.name} überladen: ${Math.round(x.last).toLocaleString('de-DE')} kg von ${x.max.toLocaleString('de-DE')} kg.` }));
  const lenk = achsen.find((x) => x.lenk);
  // Bei Einzelfahrzeugen gilt der Richtwert für die ganze Masse, beim Sattelzug für die Zugmaschine mit Zapfenlast
  const bezug = a.art === 'einzel' ? gesamt : achsen.filter((x) => x !== achsen.at(-1)).reduce((s, x) => s + x.last, 0);
  const lenkanteil = lenk.last / bezug;
  if (sp.masse > 0 && lenkanteil < LENKACHSE_MIN) meldungen.push({ art: 'lenkachse', stufe: 'fehler', text: `Lenkachse zu leicht: ${Math.round(lenkanteil * 100)} %, mindestens ${LENKACHSE_MIN * 100} % (Richtwert). Ladung weiter nach vorne.` });
  return { achsen, gesamt, schwerpunkt: sp, lenkanteil, meldungen, ok: !meldungen.length };
}

/**
 * Lastverteilungsplan: höchste zulässige Ladungsmasse je Lage des Schwerpunkts.
 * Achslasten sind linear in der Masse: last = a + b · m. Begrenzt durch Achsen, Nutzlast und Lenkachse.
 */
export function lastverteilungsplan(fahrzeug, nutzlast, schritte = 80) {
  const a = fahrzeug.achslast, L = fahrzeug.laenge / 2;
  const leer = leergewicht(a);
  const punkte = [];
  for (let i = 0; i <= schritte; i++) {
    const x = L - (i * 2 * L) / schritte;
    const ohne = lasten(a, 0, x), mit = lasten(a, 1, x);
    let p = nutzlast;
    ohne.forEach((achse, j) => {
      const b = mit[j].last - achse.last;
      if (b > 1e-9) p = Math.min(p, (achse.max - achse.last) / b);
    });
    // Lenkachse: vorn ≥ 20 % der Bezugsmasse
    if (a.art === 'einzel') {
      const bv = mit[0].last - ohne[0].last;
      if (bv < LENKACHSE_MIN) p = Math.min(p, (ohne[0].last - LENKACHSE_MIN * leer) / (LENKACHSE_MIN - bv));
    }
    punkte.push({ x, abstand: L - x, masse: Math.max(0, p) });
  }
  return punkte;
}
