#!/usr/bin/env node
/*
 * End-to-End-Test der Maske im Browser (Playwright/Chromium):
 * Beispiel laden, XML und PDF herunterladen, XML gegen XSD validieren, Re-Import,
 * Antwort erstellen, Nachrichtenart wechseln, Fehler- und Zeichenprüfung, Codelisten-Import.
 *
 * Aufruf:   node enova/tests/oberflaeche.test.js
 * Benötigt: playwright (npm), Chromium, xmllint
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let playwright;
try { playwright = require('playwright'); } catch (e) {
  const global = execFileSync('npm', ['root', '-g']).toString().trim();
  playwright = require(path.join(global, 'playwright'));
}

const BASIS = path.resolve(__dirname, '..');
const XSD = path.join(BASIS, 'xsd', '3.6.2', 'xjustiz_2900_dabag_3_2.xsd');
const URL = 'file://' + path.join(BASIS, 'index.html');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'enova-ui-'));
const bilder = process.env.ENOVA_SCREENSHOTS || '';

let bestanden = 0;
let fehlgeschlagen = 0;
async function test(name, fn) {
  try { await fn(); bestanden += 1; console.log('  ok   ' + name); } catch (e) {
    fehlgeschlagen += 1; console.log('  FEHLER ' + name + '\n         ' + String(e.stack || e).split('\n').slice(0, 6).join('\n         '));
  }
}
function pruefe(bedingung, text) { if (!bedingung) throw new Error(text); }
function xsdValide(datei) {
  try { execFileSync('xmllint', ['--noout', '--schema', XSD, datei], { stdio: 'pipe' }); } catch (e) {
    throw new Error('XSD-Validierung fehlgeschlagen:\n' + e.stderr.toString());
  }
}
function ohneZeit(xml) { return xml.replace(/<tns:erstellungszeitpunkt>[^<]*<\/tns:erstellungszeitpunkt>/, ''); }

(async () => {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 }, locale: 'de-DE' });
  const page = await context.newPage();
  const fehlerKonsole = [];
  page.on('console', (m) => { if (m.type() === 'error') fehlerKonsole.push(m.text()); });
  page.on('pageerror', (e) => fehlerKonsole.push(e.message));

  async function download(knopfSelektor, name) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click(knopfSelektor)]);
    const ziel = path.join(tmp, name);
    await dl.saveAs(ziel);
    return { datei: ziel, vorschlag: dl.suggestedFilename() };
  }
  async function statusText() { return (await page.textContent('#status-text')).trim(); }

  console.log('Oberflächentest ' + URL);
  await page.goto(URL);
  await page.waitForFunction(() => window.EnovaApp && window.EnovaApp.zustand());

  await test('Seite lädt ohne Skriptfehler mit Beispieldaten', async () => {
    pruefe(fehlerKonsole.length === 0, 'Konsolenfehler: ' + fehlerKonsole.join(' | '));
    pruefe(/vollständig nach XJustiz 3\.6\.2/.test(await statusText()), 'Status: ' + await statusText());
    pruefe(await page.isVisible('text=Beispieldaten geladen'), 'Beispiel-Banner fehlt');
  });

  if (bilder) {
    await page.screenshot({ path: path.join(bilder, 'desktop.png'), fullPage: false });
  }

  let ersuchenXml;
  await test('XML-Download (Ersuchen) ist XSD-valide', async () => {
    const r = await download('.statusleiste [data-aktion="xml"]', 'ersuchen.xml');
    pruefe(r.vorschlag === 'xjustiz_nachricht.xml', 'Dateiname: ' + r.vorschlag);
    xsdValide(r.datei);
    ersuchenXml = fs.readFileSync(r.datei, 'utf8');
    pruefe(ersuchenXml.includes('<tns:nachricht.enova.entscheidung.2900003'), 'Falsches Wurzelelement');
  });

  await test('PDF-Download (Ersuchen) erzeugt ein gültiges PDF mit Inhalt', async () => {
    const r = await download('.statusleiste [data-aktion="pdf"]', 'ersuchen.pdf');
    const daten = fs.readFileSync(r.datei);
    pruefe(daten.slice(0, 5).toString() === '%PDF-', 'Kein PDF-Kopf');
    pruefe(daten.length > 20000, 'PDF zu klein: ' + daten.length);
    pruefe(/\.pdf$/.test(r.vorschlag) && r.vorschlag.startsWith('eNoVA_'), 'Dateiname: ' + r.vorschlag);
    try {
      const text = execFileSync('pdftotext', ['-layout', r.datei, '-']).toString();
      for (const muss of ['Ersuchen um Sachentscheidung', 'Aberlestraße 34', 'Keller', 'Seite 1 von', '890.000,00 EUR']) {
        pruefe(text.includes(muss), 'PDF-Text enthält nicht: ' + muss);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  });

  await test('Re-Import der XML ergibt dieselbe Nachricht', async () => {
    await page.setInputFiles('#datei-oeffnen', path.join(tmp, 'ersuchen.xml'));
    await page.waitForSelector('text=Nachricht geöffnet');
    const r = await download('.statusleiste [data-aktion="xml"]', 'ersuchen-reimport.xml');
    const neu = fs.readFileSync(r.datei, 'utf8');
    pruefe(ohneZeit(neu) === ohneZeit(ersuchenXml), 'XML nach Re-Import unterscheidet sich');
  });

  await test('Antwort (Sachentscheidung) vorbereiten, ausfüllen und exportieren', async () => {
    await page.click('.banner [data-aktion="antwort"]');
    await page.click('#bestaetigung [data-dialog="ja"]');
    await page.waitForFunction(() => window.EnovaApp.zustand().nachricht === 'entscheidung');
    const z = await page.evaluate(() => window.EnovaApp.zustand());
    pruefe(z.kopf.empfaenger.fremdeNachrichtenID && ersuchenXml.includes(z.kopf.empfaenger.fremdeNachrichtenID), 'Bezugs-ID fehlt');
    pruefe(/Fehler/.test(await statusText()), 'Ohne Entscheidung müsste ein Fehler bestehen');
    await page.selectOption('#f-fach-entscheidungen-0-code', '003');
    await page.fill('#f-kopf-absender-aktenzeichen', 'Az. 61.2-VK/2026/0815');
    await page.locator('#f-kopf-absender-aktenzeichen').blur();
    await page.waitForFunction(() => /vollständig/.test(document.getElementById('status-text').textContent));
    const r = await download('.statusleiste [data-aktion="xml"]', 'entscheidung.xml');
    xsdValide(r.datei);
    const xml = fs.readFileSync(r.datei, 'utf8');
    pruefe(xml.includes('<tns:sachentscheidung listURI="urn:xoev-de:xjustiz:codeliste:enova.sachentscheidung" listVersionID="1.0">'), 'Sachentscheidung fehlt');
    pruefe(xml.includes('<tns:aktenzeichen.freitext>UR 1874/2026</tns:aktenzeichen.freitext>'), 'Aktenzeichen des Notars fehlt');
    const pdf = await download('.statusleiste [data-aktion="pdf"]', 'entscheidung.pdf');
    pruefe(fs.readFileSync(pdf.datei).slice(0, 5).toString() === '%PDF-', 'Kein PDF');
  });

  await test('Pflichtfeld leer: Export wird verhindert und Fehler angezeigt', async () => {
    await page.fill('#f-beteiligte-1-person-nachname', '');
    await page.locator('#f-beteiligte-1-person-nachname').blur();
    await page.waitForFunction(() => /Fehler/.test(document.getElementById('status-text').textContent));
    let heruntergeladen = false;
    page.once('download', () => { heruntergeladen = true; });
    await page.click('.statusleiste [data-aktion="xml"]');
    await page.waitForTimeout(600);
    pruefe(!heruntergeladen, 'Trotz Fehler heruntergeladen');
    const meldung = await page.textContent('[data-meldung="beteiligte.1.person.nachname"]');
    pruefe(/Pflichtangabe fehlt/.test(meldung), 'Feldmeldung fehlt: ' + meldung);
    await page.fill('#f-beteiligte-1-person-nachname', 'Huber');
    await page.locator('#f-beteiligte-1-person-nachname').blur();
    await page.waitForFunction(() => !/Fehler/.test(document.getElementById('status-text').textContent));
  });

  await test('Unzulässige Zeichen werden gemeldet, typografische Zeichen ersetzt', async () => {
    await page.fill('#f-beteiligte-1-person-vorname', 'Max 😀');
    await page.locator('#f-beteiligte-1-person-vorname').blur();
    await page.waitForFunction(() => /U\+1F600/.test(document.querySelector('[data-meldung="beteiligte.1.person.vorname"]').textContent));
    await page.fill('#f-beteiligte-1-person-vorname', 'Maximilian');
    await page.locator('#f-beteiligte-1-person-vorname').blur();
    await page.fill('#f-fach-entscheidungen-0-hinweise', 'Bescheid „vorläufig“ – siehe Anlage…');
    await page.locator('#f-fach-entscheidungen-0-hinweise').blur();
    const wert = await page.inputValue('#f-fach-entscheidungen-0-hinweise');
    pruefe(wert === 'Bescheid "vorläufig" - siehe Anlage...', 'Ersetzt: ' + wert);
    await page.waitForFunction(() => !/Fehler/.test(document.getElementById('status-text').textContent));
  });

  await test('Wechsel zur Mitteilung (2900004) mit Wertangaben ist XSD-valide', async () => {
    await page.check('input[data-pfad="nachricht"][value="mitteilung"]', { force: true });
    await page.waitForSelector('#mitteilung');
    await page.fill('#f-fach-wertangaben-geschaeftswert', '890.000,00');
    await page.locator('#f-fach-wertangaben-geschaeftswert').blur();
    await page.waitForFunction(() => /vollständig/.test(document.getElementById('status-text').textContent));
    const r = await download('.statusleiste [data-aktion="xml"]', 'mitteilung.xml');
    xsdValide(r.datei);
    const xml = fs.readFileSync(r.datei, 'utf8');
    pruefe(xml.includes('<tns:nachricht.enova.mitteilung.2900004'), 'Falsches Wurzelelement');
    pruefe(xml.includes('<tns:zahl>890000.00</tns:zahl>'), 'Betrag nicht normalisiert');
  });

  await test('Beteiligten hinzufügen und entfernen bereinigt Verweise', async () => {
    const vorher = await page.evaluate(() => window.EnovaApp.zustand().beteiligte.length);
    await page.click('#beteiligte [data-aktion="hinzufuegen"][data-vorlage="072"]');
    await page.fill('#f-beteiligte-' + vorher + '-person-nachname', 'Neumann');
    await page.locator('#f-beteiligte-' + vorher + '-person-nachname').blur();
    await page.waitForTimeout(100);
    const rolle = await page.evaluate((i) => window.EnovaApp.zustand().beteiligte[i].rollen[0].id, vorher);
    await page.click('#rechtsgeschaeft [data-aktion="hinzufuegen"][data-liste="fach.anteile"]');
    const n = await page.evaluate(() => window.EnovaApp.zustand().fach.anteile.length - 1);
    await page.selectOption('#f-fach-anteile-' + n + '-rolle', rolle);
    await page.fill('#f-fach-anteile-' + n + '-sonstiges', 'Restanteil');
    await page.locator('#f-fach-anteile-' + n + '-sonstiges').blur();
    await page.click('#beteiligter-' + vorher + ' [data-aktion="entfernen"][data-liste="beteiligte"]');
    const z = await page.evaluate(() => window.EnovaApp.zustand());
    pruefe(z.beteiligte.length === vorher, 'Beteiligter nicht entfernt');
    pruefe(z.fach.anteile[n].rolle === '', 'Verweis nicht bereinigt');
    await page.click('#rechtsgeschaeft [data-aktion="entfernen"][data-liste="fach.anteile"][data-index="' + n + '"]');
  });

  await test('Genericode-Codeliste importieren ergänzt die Auswahl', async () => {
    const gc = '<?xml version="1.0" encoding="UTF-8"?>\n<gc:CodeList xmlns:gc="http://docs.oasis-open.org/codelist/ns/genericode/1.0/">' +
      '<Identification><ShortName>enova.grundstuecksart</ShortName><Version>9.9-test</Version>' +
      '<CanonicalUri>urn:xoev-de:xjustiz:codeliste:enova.grundstuecksart</CanonicalUri></Identification>' +
      '<ColumnSet><Column Id="code" Use="required"><ShortName>Schlüssel</ShortName></Column><Column Id="wert" Use="required"><ShortName>Wert</ShortName></Column>' +
      '<Key Id="k"><ShortName>k</ShortName><ColumnRef Ref="code"/></Key></ColumnSet><SimpleCodeList>' +
      '<Row><Value ColumnRef="code"><SimpleValue>901</SimpleValue></Value><Value ColumnRef="wert"><SimpleValue>Testwert A</SimpleValue></Value></Row>' +
      '<Row><Value ColumnRef="code"><SimpleValue>902</SimpleValue></Value><Value ColumnRef="wert"><SimpleValue>Testwert B</SimpleValue></Value></Row>' +
      '</SimpleCodeList></gc:CodeList>';
    const datei = path.join(tmp, 'test-codeliste.xml');
    fs.writeFileSync(datei, gc);
    await page.setInputFiles('#datei-oeffnen', datei);
    await page.waitForFunction(() => window.EnovaApp.zustand().versionen['enova.grundstuecksart'] === '9.9-test');
    const istSelect = await page.evaluate(() => document.getElementById('f-fach-rechte-0-angaben-grundstuecksart').tagName);
    pruefe(istSelect === 'SELECT', 'Nach Import sollte eine Auswahlliste erscheinen, ist ' + istSelect);
    await page.selectOption('#f-fach-rechte-0-angaben-grundstuecksart', '902');
    await page.click('[data-aktion="codelisten-zuruecksetzen"]');
    await page.waitForLoadState('load');
    await page.waitForFunction(() => window.EnovaApp && window.EnovaApp.zustand());
  });

  await test('Mobile Darstellung ohne horizontales Scrollen', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const breite = await page.evaluate(() => document.documentElement.scrollWidth);
    if (bilder) await page.screenshot({ path: path.join(bilder, 'mobil.png'), fullPage: false });
    pruefe(breite <= 390, 'Seite ist ' + breite + 'px breit');
  });

  await test('Keine Skriptfehler während des gesamten Tests', async () => {
    pruefe(fehlerKonsole.length === 0, 'Konsolenfehler: ' + fehlerKonsole.join(' | '));
  });

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
