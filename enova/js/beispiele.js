/*
 * Beispieldaten (fiktiv) für die drei Nachrichtenarten.
 * Dienen als Startzustand der Maske und als Testfälle für die XSD-Validierung.
 */
(function (root) {
  'use strict';
  var X = root.EnovaXJ;

  function person(rolle, daten, anschrift, kontakt) {
    var b = X.neuerBeteiligter(rolle);
    Object.assign(b.person, daten);
    Object.assign(b.anschrift, anschrift || {});
    b.kontakt = kontakt || [];
    return b;
  }

  function grunddaten(z) {
    var notarin = person('208', { titel: 'Dr.', vorname: 'Anna', nachname: 'Berger', geschlecht: '2' },
      { typ: '003', strasse: 'Maximilianstraße', hausnummer: '12', plz: '80539', ort: 'München', bundesland: '09' },
      [{ art: '007', verbindung: '089 2233440' }, { art: '001', verbindung: 'kanzlei@notarin-berger.example' }]);
    notarin.rollen.push({ id: X.neueId('r'), code: '215' });
    var verkaeufer = person('168', { vorname: 'Maximilian', nachname: 'Huber', geburtsdatum: '1961-04-18', geschlecht: '1', steuerId: '' },
      { typ: '017', strasse: 'Pippinger Straße', hausnummer: '71', plz: '81245', ort: 'München', bundesland: '09', staat: '000' });
    var kaeuferin = person('072', { vorname: 'Sophie', nachname: 'Keller', geburtsname: 'Wagner', geburtsdatum: '1988-11-02', geschlecht: '2' },
      { typ: '017', strasse: 'Schleißheimer Straße', hausnummer: '140', zusatz: 'Rückgebäude', plz: '80797', ort: 'München', bundesland: '09', staat: '000' });
    var kaeufer = person('072', { vorname: 'Jonas', nachname: 'Keller', geburtsdatum: '1986-02-27', geschlecht: '1' },
      { typ: '017', strasse: 'Schleißheimer Straße', hausnummer: '140', zusatz: 'Rückgebäude', plz: '80797', ort: 'München', bundesland: '09', staat: '000' });
    z.beteiligte = [notarin, verkaeufer, kaeuferin, kaeufer];

    z.fach.urkunden = [{ urNr: '1874/2026', datum: '2026-09-15', personen: [notarin.rollen[0].id], keineBeurkundung: false }];

    var recht = X.neuesRecht();
    recht.lfdNummer = '3';
    recht.flurstuecke = [{
      gemarkung: '1905', flur: '', zaehler: '306', nenner: '46', wirtschaftsart: '012',
      lage: 'Aberlestraße 34', groesse: '357'
    }];
    recht.anschrift = Object.assign(X.leereAnschrift(), { strasse: 'Aberlestraße', hausnummer: '34', plz: '81247', ort: 'München', ortsteil: 'Obermenzing', bundesland: '09' });
    recht.angaben = { grundstuecksart: '003', baujahr: '1972', wohnflaeche: '142,5', sonstiges: 'Einfamilienhaus mit Garage', teilflaeche: false };
    recht.grundbuchart = '009';
    recht.blaetter = [{ amtsgericht: 'München', bezirk: 'Obermenzing', blatt: '1714' }];
    z.fach.rechte = [recht];

    z.fach.rechtsgeschaeft = { art: '', freitext: 'Kaufvertrag über bebautes Grundstück', rechtswirksamkeit: 'false', genehmigendArt: '', genehmigendRolle: '', genehmigendDritter: '', datum: '' };
    z.fach.gegenleistungen = [{ art: '', freitext: 'Kaufpreis', betrag: '890.000,00' }];
    z.fach.anteile = [
      { seite: 'erwerber', rolle: kaeuferin.rollen[0].id, zaehler: '1', nenner: '2', sonstiges: '' },
      { seite: 'erwerber', rolle: kaeufer.rollen[0].id, zaehler: '1', nenner: '2', sonstiges: '' }
    ];
    z.dokumente = [{
      id: X.uuid(), dateiname: 'UR_1874-2026_Kaufvertrag.pdf', signatur: 'UR_1874-2026_Kaufvertrag.pdf.pkcs7',
      klasse: '015', typ: '102', anzeigename: 'Kaufvertrag UR-Nr. 1874/2026 (beglaubigte Abschrift)'
    }];
    return { notarin: notarin, verkaeufer: verkaeufer, kaeuferin: kaeuferin, kaeufer: kaeufer };
  }

  function ersuchen() {
    var z = X.neuerZustand('ersuchen');
    var p = grunddaten(z);
    z.kopf.absender.kp = { art: 'sonstige', text: 'Notarin Dr. Anna Berger, München', code: '' };
    z.kopf.absender.aktenzeichen = 'UR 1874/2026';
    z.kopf.absender.rolle = p.notarin.rollen[0].id;
    z.kopf.empfaenger.kp = { art: 'sonstige', text: 'Landeshauptstadt München, Referat für Stadtplanung und Bauordnung', code: '' };
    z.kopf.empfaenger.azArt = 'unbekannt';
    z.verfahren = {
      verfahrensnummer: '2026-0915-1874',
      behoerde: { art: 'sonstige', text: 'Landeshauptstadt München, Referat für Stadtplanung und Bauordnung', code: '' },
      aktenzeichen: '', gegenstand: 'Vorkaufsrechtsanfrage Aberlestraße 34, Fl.-Nr. 306/46'
    };
    z.fach.ersuchen = [{ code: '003', hinweise: 'Um Übersendung des Negativzeugnisses bzw. der Verzichtserklärung an das Notariat wird gebeten.' }];
    return z;
  }

  function entscheidung() {
    var z = X.antwortAuf(ersuchen());
    z.kopf.absender.aktenzeichen = 'PLAN-HA II/52-VK 2026/4711';
    z.kopf.empfaenger.fremdeNachrichtenID = X.uuid();
    z.fach.entscheidungen = [{
      code: '001', hinweise: 'Das Grundstück liegt nicht im Geltungsbereich einer Vorkaufsrechtssatzung.',
      adressaten: [z.beteiligte[0].rollen[0].id]
    }];
    z.dokumente = [{
      id: X.uuid(), dateiname: 'Negativzeugnis_VK-2026-4711.pdf', signatur: '',
      klasse: '015', typ: '', anzeigename: 'Negativzeugnis nach § 28 Abs. 1 BauGB'
    }];
    return z;
  }

  function mitteilung() {
    var z = X.neuerZustand('mitteilung');
    var p = grunddaten(z);
    p.verkaeufer.person.steuerId = '12345678901';
    z.kopf.absender.kp = { art: 'sonstige', text: 'Notarin Dr. Anna Berger, München', code: '' };
    z.kopf.absender.aktenzeichen = 'UR 1874/2026';
    z.kopf.absender.rolle = p.notarin.rollen[0].id;
    z.kopf.empfaenger.kp = { art: 'sonstige', text: 'Finanzamt München, Grunderwerbsteuerstelle', code: '' };
    z.kopf.empfaenger.azArt = 'unbekannt';
    z.verfahren.verfahrensnummer = '2026-0915-1874';
    z.fach.rechtsgeschaeft.datum = '';
    z.fach.wertangaben.geschaeftswert = '890.000,00';
    z.fach.wertangaben.notargebuehren = '4.235,60';
    return z;
  }

  root.EnovaBeispiele = {
    ersuchen: { titel: 'Vorkaufsrechtsanfrage an die Gemeinde', erzeugen: ersuchen },
    entscheidung: { titel: 'Antwort der Gemeinde (Negativzeugnis)', erzeugen: entscheidung },
    mitteilung: { titel: 'Veräußerungsanzeige an das Finanzamt', erzeugen: mitteilung }
  };
})(typeof window !== 'undefined' ? window : globalThis);
