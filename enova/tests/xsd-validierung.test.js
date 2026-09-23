#!/usr/bin/env node
/*
 * Prüft, dass die erzeugten Nachrichten gegen das offizielle XJustiz-3.6.2-Schema valide sind.
 *
 * Aufruf:   node enova/tests/xsd-validierung.test.js
 *           ENOVA_BEISPIELE_SCHREIBEN=1 node …  schreibt zusätzlich beispiele/*.xml neu
 * Benötigt: xmllint (libxml2-utils)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const BASIS = path.resolve(__dirname, '..');
const XSD = path.join(BASIS, 'xsd', '3.6.2', 'xjustiz_2900_dabag_3_2.xsd');

// Browser-Skripte in einen gemeinsamen Kontext laden
const ctx = { console, crypto: require('crypto').webcrypto, Uint8Array, Date, Set, Array, Object, JSON, Math, String, RegExp };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const datei of ['js/codelisten.js', 'js/din91379.js', 'js/xjustiz.js', 'js/beispiele.js']) {
  vm.runInContext(fs.readFileSync(path.join(BASIS, datei), 'utf8'), ctx, { filename: datei });
}
const X = ctx.EnovaXJ;
const B = ctx.EnovaBeispiele;

let fehlgeschlagen = 0;
let bestanden = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'enova-'));

function test(name, fn) {
  try {
    fn();
    bestanden += 1;
    console.log('  ok   ' + name);
  } catch (e) {
    fehlgeschlagen += 1;
    console.log('  FEHLER ' + name + '\n         ' + String(e.message).split('\n').join('\n         '));
  }
}

function xsdValide(xml, name) {
  const datei = path.join(tmp, name + '.xml');
  fs.writeFileSync(datei, xml);
  try {
    execFileSync('xmllint', ['--noout', '--schema', XSD, datei], { stdio: 'pipe' });
  } catch (e) {
    throw new Error('XSD-Validierung fehlgeschlagen:\n' + e.stderr.toString());
  }
}

function erzeugeValide(z, name) {
  const r = X.erzeugeXML(z);
  if (r.fehler.length) throw new Error('Unerwartete Prüffehler: ' + JSON.stringify(r.fehler, null, 1));
  xsdValide(r.xml, name);
  return r;
}

console.log('XSD-Validierung gegen ' + path.relative(process.cwd(), XSD));

// 1. Beispiele
for (const typ of Object.keys(B)) {
  test('Beispiel „' + B[typ].titel + '“ ist XSD-valide', () => {
    const r = erzeugeValide(B[typ].erzeugen(), 'beispiel-' + typ);
    if (process.env.ENOVA_BEISPIELE_SCHREIBEN) fs.writeFileSync(path.join(BASIS, 'beispiele', 'beispiel-' + typ + '.xml'), r.xml);
  });
}

// 2. Minimale Nachrichten (nur Pflichtangaben)
for (const typ of ['ersuchen', 'entscheidung', 'mitteilung']) {
  test('Minimale Nachricht (' + typ + ') ist XSD-valide', () => {
    const z = X.neuerZustand(typ);
    z.kopf.absender.kp.text = 'Notariat';
    z.kopf.empfaenger.kp.text = 'Gemeinde';
    z.fach.ersuchen = [{ code: '001', hinweise: '' }];
    z.fach.entscheidungen = [{ code: '001', hinweise: '', adressaten: [] }];
    erzeugeValide(z, 'minimal-' + typ);
  });
}

// 3. Maximal befüllte Nachrichten (alle Felder der Maske)
function maximal(typ) {
  const z = B.ersuchen.erzeugen();
  z.nachricht = typ;
  z.versionen['enova.ersuchensachentscheidung'] = '1.1';
  z.versionen['enova.sachentscheidung'] = '1.1';
  z.versionen['gds.rollenbezeichnung'] = '3.6';
  z.versionen['enova.artdesrechtsgeschaefts'] = '1.0';
  z.versionen['enova.gegenleistung'] = '1.0';
  z.versionen['enova.grundderuebersendung'] = '1.0';
  z.versionen['enova.gueterstand'] = '1.0';
  z.versionen['gds.finanzbehoerden'] = '1.0';
  z.kopf.absender.safeId = 'safe-1234567890-notar';
  z.kopf.empfaenger = { kp: { art: 'gericht', text: '', code: 'D2601' }, safeId: 'govello-1234', azArt: 'freitext', aktenzeichen: '1 VI 123/26', fremdeNachrichtenID: X.uuid(), rolle: z.beteiligte[1].rollen[0].id };
  z.kopf.prozessID = X.uuid();
  z.verfahren.behoerde = { art: 'finanzbehoerde', text: '', code: '9143' };
  z.verfahren.aktenzeichen = 'GrESt 143/26';
  const org = X.neuerBeteiligter('072');
  org.art = 'organisation';
  Object.assign(org.organisation, { bezeichnung: 'Wohnbau Isartal GmbH & Co. KG', kurzbezeichnung: 'Wohnbau Isartal', sitz: 'Freising', wirtschaftsId: 'DE123456789-00001' });
  Object.assign(org.anschrift, { typ: '003', strasse: 'Obere Hauptstraße', hausnummer: '5', postfach: '1122', plz: '85354', ort: 'Freising', bundesland: '09', staat: '000' });
  org.kontakt = [{ art: '008', verbindung: 'safe-de.justiz.987654' }];
  const erblasser = X.neuerBeteiligter('066');
  Object.assign(erblasser.person, { vorname: 'Łukasz', namensvorsatz: 'von', nachname: 'Ōtani-Müller', geburtsname: 'Nowak', geburtsdatum: '1940', geburtsort: 'Kraków', geschlecht: '1', familienstand: '010', steuerId: '12345678901' });
  z.beteiligte.push(org, erblasser);
  const weg = X.neuesRecht();
  weg.buchungsart = 'weg';
  weg.lfdNummer = '1';
  weg.flurstuecke = [
    { gemarkung: '0914', flur: '12', zaehler: '1024', nenner: '', wirtschaftsart: '012', lage: 'Isarweg 3', groesse: '1.250' },
    { gemarkung: '0914', flur: '12', zaehler: '1025', nenner: '2', wirtschaftsart: '009', lage: 'Isarweg', groesse: '85' }
  ];
  weg.weg = { anteilZaehler: '125', anteilNenner: '1000', sondereigentumNr: '7', sondereigentumBez: 'Wohnung im 2. OG links mit Kellerabteil', aufteilungsgrund: '002', stockwerkseigentum: false, veraeusserungsbeschraenkung: 'Zustimmung des Verwalters nach § 12 WEG', sondernutzungsrecht: 'Stellplatz Nr. 7' };
  weg.zusatz = 'Teilfläche';
  weg.angaben = { grundstuecksart: '002', baujahr: '1999', wohnflaeche: '78,4', sonstiges: 'vermietet', teilflaeche: true };
  weg.grundbuchart = '030';
  weg.blaetter = [{ amtsgericht: 'Freising', bezirk: 'Freising', blatt: '8812' }, { amtsgericht: 'Freising', bezirk: 'Freising', blatt: '8813' }];
  const ohne = X.neuesRecht();
  ohne.buchungsart = 'keine';
  ohne.anschrift = Object.assign(X.leereAnschrift(), { ort: 'Freising' });
  ohne.blaetter = [{ amtsgericht: '', bezirk: '', blatt: '' }];
  z.fach.rechte.push(weg, ohne);
  z.fach.ersuchen = [{ code: '018', hinweise: 'Zeile 1\nZeile 2 <mit> & Sonderzeichen "quoted" § 28 BauGB' }, { code: '011', hinweise: '' }];
  z.fach.entscheidungen = [{ code: '032', hinweise: 'Auflage: ...', adressaten: [z.beteiligte[0].rollen[0].id, org.rollen[0].id] }, { code: '003', hinweise: '', adressaten: [] }];
  z.fach.urkunden.push({ urNr: '', datum: '2026-09', personen: [], keineBeurkundung: true });
  z.fach.rechtsgeschaeft = { art: '001', freitext: 'Kauf', rechtswirksamkeit: 'true', genehmigendArt: 'beteiligter', genehmigendRolle: org.rollen[0].id, genehmigendDritter: '', datum: '2026-09-20' };
  z.fach.gegenleistungen.push({ art: '002', freitext: 'Übernahme Grundschuld', betrag: '120000' }, { art: '003', freitext: 'Wohnrecht', betrag: '' });
  z.fach.anteile.push({ seite: 'veraeusserer', rolle: z.beteiligte[1].rollen[0].id, zaehler: '', nenner: '', sonstiges: 'Alleineigentum' });
  z.fach.tagUebergabe = '2026-12-01';
  z.fach.wertangaben = { verkehrswert: '950.000', geschaeftswert: '890.000,00', notargebuehren: '4.235,60', einheitswert: '31.500', grundbesitzwert: '410000', valutastand: '120.000', jahreswert: '6.000,5' };
  z.fach.grundDerUebersendung = '001';
  z.fach.erbfall = { erblasser: erblasser.rollen[0].id, gueterstand: '001', verfuegungen: [{ datum: '2019-03-11', eroeffnet: '2026-08-01' }, { datum: '2021-05-05', eroeffnet: '' }] };
  z.fach.nachlass = 'Grundbesitz in München und Freising, Bankguthaben.';
  z.dokumente.push({ id: X.uuid(), dateiname: 'Lageplan.pdf', signatur: '', klasse: '015', typ: '', anzeigename: '' });
  return z;
}

for (const typ of ['ersuchen', 'entscheidung', 'mitteilung']) {
  test('Maximal befüllte Nachricht (' + typ + ') ist XSD-valide', () => {
    const r = X.erzeugeXML(maximal(typ));
    const echteFehler = r.fehler;
    if (echteFehler.length) throw new Error('Unerwartete Prüffehler: ' + JSON.stringify(echteFehler, null, 1));
    xsdValide(r.xml, 'maximal-' + typ);
  });
}

// 4. Die Prüfung erkennt fehlerhafte Eingaben, bevor ungültiges XML entsteht
function erwarteFehler(name, veraendern, pfad) {
  test('Prüfung meldet: ' + name, () => {
    const z = B.ersuchen.erzeugen();
    veraendern(z);
    const r = X.pruefe(z);
    if (!r.fehler.some((f) => f.pfad === pfad)) {
      throw new Error('Kein Fehler für ' + pfad + ' gemeldet. Gemeldet: ' + JSON.stringify(r.fehler));
    }
  });
}
erwarteFehler('fehlender Nachname', (z) => { z.beteiligte[1].person.nachname = ''; }, 'beteiligte.1.person.nachname');
erwarteFehler('Emoji im Namen (DIN 91379)', (z) => { z.beteiligte[1].person.vorname = 'Max 😀'; }, 'beteiligte.1.person.vorname');
erwarteFehler('Ziffern im Namen (DIN 91379 Datentyp A)', (z) => { z.beteiligte[1].person.nachname = 'Huber2'; }, 'beteiligte.1.person.nachname');
erwarteFehler('ungültiges Datum', (z) => { z.fach.tagUebergabe = '2026-02-30'; }, 'fach.tagUebergabe');
erwarteFehler('Baujahr nicht vierstellig', (z) => { z.fach.rechte[0].angaben.baujahr = '72'; }, 'fach.rechte.0.angaben.baujahr');
erwarteFehler('fehlende Lage des Flurstücks', (z) => { z.fach.rechte[0].flurstuecke[0].lage = ''; }, 'fach.rechte.0.flurstuecke.0.lage');
erwarteFehler('fehlende Wirtschaftsart', (z) => { z.fach.rechte[0].flurstuecke[0].wirtschaftsart = ''; }, 'fach.rechte.0.flurstuecke.0.wirtschaftsart');
erwarteFehler('unbekannter Code in vollständiger Codeliste', (z) => { z.fach.ersuchen[0].code = '999'; }, 'fach.ersuchen.0.code');
erwarteFehler('kein Betrag', (z) => { z.fach.gegenleistungen[0].betrag = 'neunzig'; }, 'fach.gegenleistungen.0.betrag');
erwarteFehler('unvollständiges Grundbuchblatt', (z) => { z.fach.rechte[0].blaetter[0].blatt = ''; }, 'fach.rechte.0.blaetter.0.blatt');
erwarteFehler('fehlende Codelisten-Version', (z) => { z.versionen['enova.ersuchensachentscheidung'] = ''; }, 'versionen.enova.ersuchensachentscheidung');
erwarteFehler('Verweis auf gelöschten Beteiligten', (z) => { z.fach.anteile[0].rolle = 'r-gibt-es-nicht'; }, 'fach.anteile.0.rolle');
erwarteFehler('Empfänger ohne Bezeichnung', (z) => { z.kopf.empfaenger.kp.text = ''; }, 'kopf.empfaenger.kp.text');

test('Typografische Zeichen werden nur bei Bedarf ersetzt', () => {
  const f = [
    ['C', 'Er sagte „Ja“ – sofort…', 'Er sagte "Ja" - sofort...'],
    ['D', 'Stadt „Nord“ – Süd', 'Stadt „Nord“ - Süd'],
    ['A', 'Anne-Marie', 'Anne-Marie'],
    ['C', 'Tab\u00ADtrenn\u200Bung', 'Tabtrennung']
  ];
  for (const [typ, ein, aus] of f) {
    const r = X.typografieAnpassen(ein, typ);
    if (r !== aus) throw new Error(typ + ': ' + JSON.stringify(r) + ' statt ' + JSON.stringify(aus));
    if (!ctx.ENOVA_DIN91379[typ].test(r)) throw new Error('Ergebnis weiterhin unzulässig: ' + r);
  }
});

// 5. Zahlen in deutscher Schreibweise werden korrekt als xs:double geschrieben
test('Deutsche Zahlenschreibweise wird normalisiert', () => {
  const faelle = { '890.000,00': '890000.00', '357,5': '357.5', '450000': '450000', '1.250': '1250', '12.5': '12.5', '4 235,60 €': '4235.60' };
  for (const [ein, aus] of Object.entries(faelle)) {
    if (X.zahlNormieren(ein) !== aus) throw new Error(ein + ' -> ' + X.zahlNormieren(ein) + ' (erwartet ' + aus + ')');
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
process.exit(fehlgeschlagen ? 1 : 0);
