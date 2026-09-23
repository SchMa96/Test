/*
 * eNoVA-Nachrichtenmaske – PDF-Ausgabe
 * Menschenlesbare Darstellung einer XJustiz-eNoVA-Nachricht (jsPDF + AutoTable, offline).
 */
(function (root) {
  'use strict';
  var X = root.EnovaXJ;

  var FARBE = {
    tinte: [22, 32, 44], grau: [90, 102, 117], hell: [120, 131, 146],
    akzent: [35, 64, 168], linie: [216, 222, 230], kopf: [238, 241, 247]
  };
  var RAND = { l: 20, r: 20, o: 18, u: 22 };

  function s(v) { return v === undefined || v === null ? '' : String(v).trim(); }

  function datumDE(v) {
    v = s(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return m[3] + '.' + m[2] + '.' + m[1];
    m = /^(\d{4})-(\d{2})$/.exec(v);
    if (m) return m[2] + '/' + m[1];
    return v;
  }

  function zeitDE(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s(v));
    return m ? m[3] + '.' + m[2] + '.' + m[1] + ', ' + m[4] + ':' + m[5] + ' Uhr' : s(v);
  }

  function betragDE(v) {
    if (!s(v)) return '';
    var n = Number(X.zahlNormieren(v));
    if (!isFinite(n)) return s(v);
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
  }

  function zahlDE(v, einheit) {
    if (!s(v)) return '';
    var n = Number(X.zahlNormieren(v));
    return (isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : s(v)) + (einheit ? ' ' + einheit : '');
  }

  function code(z, liste, c) {
    if (!s(c)) return '';
    var t = X.codeText(z, liste, c);
    return t ? t + ' (' + c + ')' : 'Code ' + c;
  }

  function anschrift(a) {
    if (!a) return '';
    var z1 = [s(a.strasse), s(a.hausnummer)].filter(Boolean).join(' ');
    var z2 = [s(a.plz), s(a.ort)].filter(Boolean).join(' ');
    return [s(a.zusatz), z1, s(a.postfach) ? 'Postfach ' + s(a.postfach) : '', z2, s(a.ortsteil) ? 'OT ' + s(a.ortsteil) : '']
      .filter(Boolean).join('\n');
  }

  function kp(z, k) {
    if (!k) return '';
    if (k.art === 'gericht') return code(z, 'gds.gerichte', k.code);
    if (k.art === 'finanzbehoerde') return code(z, 'gds.finanzbehoerden', k.code);
    return s(k.text);
  }

  function erzeuge(z, optionen) {
    optionen = optionen || {};
    var jsPDF = root.jspdf && root.jspdf.jsPDF;
    if (!jsPDF) throw new Error('Die PDF-Bibliothek (vendor/jspdf.umd.min.js) wurde nicht geladen.');
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    if (typeof doc.autoTable !== 'function') throw new Error('Das Tabellen-Modul (vendor/jspdf.plugin.autotable.min.js) wurde nicht geladen.');

    var font = root.ENOVA_PDF_FONT;
    var schrift = 'helvetica';
    if (font) {
      doc.addFileToVFS('DejaVuSans.ttf', font.normal);
      doc.addFont('DejaVuSans.ttf', font.name, 'normal');
      doc.addFileToVFS('DejaVuSans-Bold.ttf', font.bold);
      doc.addFont('DejaVuSans-Bold.ttf', font.name, 'bold');
      schrift = font.name;
    }

    var info = X.NACHRICHTEN[z.nachricht] || X.NACHRICHTEN.ersuchen;
    var nr = X.nummerierung(z);
    var breite = doc.internal.pageSize.getWidth();
    var hoehe = doc.internal.pageSize.getHeight();
    var nutz = breite - RAND.l - RAND.r;
    var y = RAND.o;
    var erstellt = optionen.erstellungszeitpunkt || X.zeitstempel();

    doc.setProperties({
      title: info.titel + ' – XJustiz ' + X.XJUSTIZ_VERSION,
      subject: info.element,
      creator: (z.hersteller && z.hersteller.name) || X.PRODUKT.name,
      keywords: 'XJustiz, eNoVA, ' + info.element + ', ' + s(z.kopf.absender.nachrichtenID)
    });

    function farbe(f) { doc.setTextColor(f[0], f[1], f[2]); }
    function platz(mm) {
      if (y + mm > hoehe - RAND.u) { doc.addPage(); y = RAND.o; }
    }

    function rolleText(id) {
      var e = nr.liste.filter(function (x) { return x.id === id; })[0];
      if (!e) return '';
      return (X.beteiligtenName(e.beteiligter) || 'Beteiligter ' + e.beteiligtennummer) + ' (' +
        (X.codeText(z, 'gds.rollenbezeichnung', e.code) || 'Rolle') + ', Rolle Nr. ' + e.nummer + ')';
    }

    var basis = {
      styles: { font: schrift, fontSize: 8.6, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, textColor: FARBE.tinte, lineColor: FARBE.linie, lineWidth: 0.15, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: FARBE.kopf, textColor: FARBE.tinte, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      margin: { left: RAND.l, right: RAND.r, top: RAND.o, bottom: RAND.u },
      theme: 'grid'
    };

    function tabelle(kopf, zeilen, extra) {
      if (!zeilen.length) return;
      var opt = Object.assign({}, basis, extra || {}, { startY: y, head: kopf ? [kopf] : undefined, body: zeilen });
      doc.autoTable(opt);
      y = doc.lastAutoTable.finalY + 5;
    }

    function kv(paare) {
      var zeilen = paare.filter(function (p) { return s(p[1]) !== ''; });
      tabelle(null, zeilen, { columnStyles: { 0: { cellWidth: 52, textColor: FARBE.grau }, 1: {} } });
    }

    function ueberschrift(text, xml) {
      platz(34);
      doc.setFont(schrift, 'bold'); doc.setFontSize(11.5); farbe(FARBE.akzent);
      doc.text(text, RAND.l, y + 4);
      if (xml) {
        doc.setFont(schrift, 'normal'); doc.setFontSize(7); farbe(FARBE.hell);
        doc.text(xml, breite - RAND.r, y + 4, { align: 'right' });
      }
      doc.setDrawColor(FARBE.linie[0], FARBE.linie[1], FARBE.linie[2]); doc.setLineWidth(0.3);
      doc.line(RAND.l, y + 6, breite - RAND.r, y + 6);
      y += 9;
    }

    function unterzeile(text) {
      platz(34);
      doc.setFont(schrift, 'bold'); doc.setFontSize(9.5); farbe(FARBE.tinte);
      doc.text(text, RAND.l, y + 3);
      y += 5.5;
    }

    function absatz(text, groesse, f) {
      doc.setFont(schrift, 'normal'); doc.setFontSize(groesse || 9); farbe(f || FARBE.tinte);
      var zeilen = doc.splitTextToSize(text, nutz);
      zeilen.forEach(function (zeile) { platz(5); doc.text(zeile, RAND.l, y + 3.2); y += (groesse || 9) * 0.45; });
      y += 2;
    }

    // --- Kopf ----------------------------------------------------------------
    doc.setFont(schrift, 'normal'); doc.setFontSize(7.5); farbe(FARBE.hell);
    doc.text('XJustiz ' + X.XJUSTIZ_VERSION + ' · Fachmodul DABAG (eNoVA) · ' + info.element, RAND.l, y + 3);
    y += 6;
    doc.setFont(schrift, 'bold'); doc.setFontSize(19); farbe(FARBE.tinte);
    doc.text(info.titel, RAND.l, y + 7);
    y += 10;
    doc.setFont(schrift, 'normal'); doc.setFontSize(9.5); farbe(FARBE.grau);
    doc.text(info.richtung, RAND.l, y + 4);
    y += 6;
    doc.setFillColor(FARBE.akzent[0], FARBE.akzent[1], FARBE.akzent[2]);
    doc.rect(RAND.l, y + 1, 18, 0.9, 'F');
    y += 6;

    var k = z.kopf, v = z.verfahren;
    var empfAz = k.empfaenger.azArt === 'freitext' ? s(k.empfaenger.aktenzeichen) : (k.empfaenger.azArt === 'neu' ? 'neu zu vergeben' : 'unbekannt');
    var behoerde = !v.behoerde || v.behoerde.art === 'keine' ? '' : kp(z, v.behoerde);
    kv([
      ['Absender', kp(z, k.absender.kp)],
      ['Aktenzeichen Absender', k.absender.aktenzeichen],
      ['Empfänger', kp(z, k.empfaenger.kp)],
      ['Aktenzeichen Empfänger', empfAz],
      ['Nachrichten-ID', k.absender.nachrichtenID],
      ['Bezug (Nachrichten-ID)', k.empfaenger.fremdeNachrichtenID],
      ['Prozess-ID', k.prozessID],
      ['Erstellt am', zeitDE(erstellt)],
      ['Verfahrensnummer', v.verfahrensnummer],
      ['Instanzbehörde', behoerde],
      ['Aktenzeichen Verfahren', v.aktenzeichen],
      ['Verfahrensgegenstand', v.gegenstand]
    ]);

    // --- Gegenstand der Nachricht ------------------------------------------------
    var f = z.fach;
    if (z.nachricht === 'ersuchen') {
      ueberschrift('Ersuchen', 'fachdaten/auswahl_GegenstandDerNachricht');
      tabelle(['Code', 'Gegenstand des Ersuchens', 'Hinweise'], f.ersuchen.map(function (e) {
        return [s(e.code), X.codeText(z, 'enova.ersuchensachentscheidung', e.code), s(e.hinweise)];
      }), { columnStyles: { 0: { cellWidth: 13 }, 2: { cellWidth: 55 } } });
    } else if (z.nachricht === 'entscheidung') {
      ueberschrift('Sachentscheidung', 'fachdaten/auswahl_GegenstandDerNachricht');
      tabelle(['Code', 'Entscheidung', 'Hinweise', 'Adressat'], f.entscheidungen.map(function (e) {
        return [s(e.code), X.codeText(z, 'enova.sachentscheidung', e.code), s(e.hinweise), (e.adressaten || []).map(rolleText).join('\n')];
      }), { columnStyles: { 0: { cellWidth: 13 }, 2: { cellWidth: 45 }, 3: { cellWidth: 40 } } });
    }

    // --- Beteiligte -----------------------------------------------------------------
    if (z.beteiligte.length) {
      ueberschrift('Beteiligte', 'grunddaten/verfahrensdaten/beteiligung');
      tabelle(['Nr.', 'Rolle', 'Name / Bezeichnung', 'Anschrift', 'Weitere Angaben'], z.beteiligte.map(function (b, i) {
        var rollen = b.rollen.map(function (r) {
          return (X.codeText(z, 'gds.rollenbezeichnung', r.code) || r.code) + ' [' + nr.rollen[r.id] + ']';
        }).join('\n');
        var name = X.beteiligtenName(b);
        var weitere = [];
        if (b.art === 'organisation') {
          if (s(b.organisation.kurzbezeichnung)) weitere.push('Kurz: ' + s(b.organisation.kurzbezeichnung));
          if (s(b.organisation.sitz)) weitere.push('Sitz: ' + s(b.organisation.sitz));
          if (s(b.organisation.wirtschaftsId)) weitere.push('W-IdNr.: ' + s(b.organisation.wirtschaftsId));
        } else {
          if (s(b.person.geburtsname)) name += '\ngeb. ' + s(b.person.geburtsname);
          if (s(b.person.geburtsdatum)) weitere.push('geboren ' + datumDE(b.person.geburtsdatum) + (s(b.person.geburtsort) ? ' in ' + s(b.person.geburtsort) : ''));
          if (s(b.person.familienstand)) weitere.push(X.codeText(z, 'gds.familienstand', b.person.familienstand));
          if (s(b.person.steuerId)) weitere.push('Steuer-ID: ' + s(b.person.steuerId));
        }
        (b.kontakt || []).forEach(function (t) {
          if (s(t.verbindung)) weitere.push((X.codeText(z, 'gds.telekommunikationsart', t.art) || 'Kontakt') + ': ' + s(t.verbindung));
        });
        return [String(i + 1), rollen, name, anschrift(b.anschrift), weitere.join('\n')];
      }), { columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 34 }, 2: { cellWidth: 38 }, 3: { cellWidth: 40 } } });
    }

    // --- Urkunde ---------------------------------------------------------------------
    var urk = (f.urkunden || []).filter(function (u) { return s(u.urNr) || s(u.datum) || u.keineBeurkundung || (u.personen || []).length; });
    if (urk.length) {
      ueberschrift('Daten der Urkunde', 'fachdaten/datenDerUrkunde');
      tabelle(['UR-Nummer', 'Urkundsdatum', 'Urkundsperson', 'Hinweis'], urk.map(function (u) {
        return [s(u.urNr), datumDE(u.datum), (u.personen || []).map(rolleText).join('\n'), u.keineBeurkundung ? 'keine Beurkundung' : ''];
      }));
    }

    // --- Grundbesitz --------------------------------------------------------------------
    if ((f.rechte || []).length) {
      ueberschrift('Betroffener Grundbesitz', 'fachdaten/beschreibungDesBetroffenenRechts');
      f.rechte.forEach(function (r, i) {
        var art = r.buchungsart === 'weg' ? 'Wohnungs-/Teileigentum' : (r.buchungsart === 'keine' ? 'ohne Buchungsangaben' : 'Grundstück');
        unterzeile((f.rechte.length > 1 ? (i + 1) + '. ' : '') + art);
        var blaetter = (r.blaetter || []).filter(function (b) { return s(b.amtsgericht) || s(b.bezirk) || s(b.blatt); })
          .map(function (b) { return 'Amtsgericht ' + s(b.amtsgericht) + ', Grundbuch von ' + s(b.bezirk) + ', Blatt ' + s(b.blatt); }).join('\n');
        var a = r.angaben || {};
        var paare = [
          ['Grundbuch', blaetter],
          ['Grundbuchart', code(z, 'dabag.grundbuchart', r.grundbuchart)],
          ['Lfd. Nr. Bestandsverzeichnis', r.buchungsart !== 'keine' ? r.lfdNummer : ''],
          ['Lage / Anschrift', anschrift(r.anschrift).replace(/\n/g, ', ')],
          ['Grundstücksart', code(z, 'enova.grundstuecksart', a.grundstuecksart)],
          ['Baujahr', a.baujahr],
          ['Wohnfläche', zahlDE(a.wohnflaeche, 'm²')],
          ['Sonstige Angaben', a.sonstiges],
          ['Teilfläche', a.teilflaeche ? 'noch zu vermessende Teilfläche' : ''],
          ['Zusatz', r.buchungsart !== 'keine' ? r.zusatz : '']
        ];
        if (r.buchungsart === 'weg') {
          var w = r.weg;
          paare.push(
            ['Miteigentumsanteil', s(w.anteilZaehler) ? s(w.anteilZaehler) + '/' + s(w.anteilNenner) : ''],
            ['Sondereigentum', [s(w.sondereigentumNr) ? 'Nr. ' + s(w.sondereigentumNr) : '', s(w.sondereigentumBez)].filter(Boolean).join(' – ')],
            ['Sondernutzungsrecht', w.sondernutzungsrecht],
            ['Aufteilungsgrund', code(z, 'dabag.aufteilungsgrund.weg', w.aufteilungsgrund)],
            ['Veräußerungsbeschränkung', w.veraeusserungsbeschraenkung],
            ['Stockwerkseigentum', w.stockwerkseigentum ? 'ja' : '']
          );
        }
        kv(paare);
        if (r.buchungsart !== 'keine') {
          tabelle(['Gemarkung', 'Flur', 'Flurstück', 'Wirtschaftsart', 'Lage', 'Größe'], (r.flurstuecke || []).map(function (fl) {
            return [s(fl.gemarkung), s(fl.flur), s(fl.zaehler) + (s(fl.nenner) ? '/' + s(fl.nenner) : ''),
              X.codeText(z, 'dabag.wirtschaftsart', fl.wirtschaftsart), s(fl.lage), s(fl.groesse) ? zahlDE(fl.groesse, 'm²') : ''];
          }), { columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 12 }, 2: { cellWidth: 20 }, 5: { cellWidth: 22, halign: 'right' } } });
        }
      });
    }

    // --- Rechtsgeschäft und Gegenleistung ---------------------------------------------
    var rg = f.rechtsgeschaeft || {};
    var rw = rg.rechtswirksamkeit === 'true' ? 'eingetreten' : (rg.rechtswirksamkeit === 'false' ? 'noch nicht eingetreten' : '');
    var gen = rg.genehmigendArt === 'beteiligter' ? rolleText(rg.genehmigendRolle) : (rg.genehmigendArt === 'dritter' ? s(rg.genehmigendDritter) : '');
    var rgPaare = [
      ['Art des Rechtsgeschäfts', code(z, 'enova.artdesrechtsgeschaefts', rg.art)],
      ['Beschreibung', rg.freitext],
      ['Rechtswirksamkeit', rw],
      ['Genehmigung erforderlich durch', gen],
      ['Datum der Rechtswirksamkeit', datumDE(rg.datum)],
      ['Tag der Übergabe', z.nachricht !== 'mitteilung' ? datumDE(f.tagUebergabe) : '']
    ];
    var gl = (f.gegenleistungen || []).filter(function (g) { return s(g.art) || s(g.freitext) || s(g.betrag); });
    var an = f.anteile || [];
    if (rgPaare.some(function (p) { return s(p[1]); }) || gl.length || an.length) {
      ueberschrift('Rechtsgeschäft und Gegenleistung', 'fachdaten/artDesRechtsgeschaefts');
      kv(rgPaare);
      tabelle(['Art der Gegenleistung', 'Beschreibung', 'Betrag'], gl.map(function (g) {
        return [code(z, 'enova.gegenleistung', g.art), s(g.freitext), betragDE(g.betrag)];
      }), { columnStyles: { 2: { cellWidth: 36, halign: 'right' } } });
      tabelle(['Seite', 'Beteiligter', 'Anteil'], an.map(function (a) {
        return [a.seite === 'veraeusserer' ? 'Veräußerer' : 'Erwerber', rolleText(a.rolle),
          s(a.zaehler) ? s(a.zaehler) + '/' + s(a.nenner) : s(a.sonstiges)];
      }), { columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: 36 } } });
    }

    // --- Mitteilung: Angaben nach ErbStG -------------------------------------------------
    if (z.nachricht === 'mitteilung') {
      var w = f.wertangaben || {};
      var eb = f.erbfall || {};
      var wPaare = [
        ['Verkehrswert', betragDE(w.verkehrswert)], ['Geschäftswert', betragDE(w.geschaeftswert)],
        ['Notargebühren', betragDE(w.notargebuehren)], ['Letzter Einheitswert', betragDE(w.einheitswert)],
        ['Letzter Grundbesitzwert', betragDE(w.grundbesitzwert)],
        ['Übernommene Verbindlichkeiten', betragDE(w.valutastand)], ['Jahreswert von Gegenleistungen', betragDE(w.jahreswert)],
        ['Grund der Übersendung', code(z, 'enova.grundderuebersendung', f.grundDerUebersendung)],
        ['Erblasser', rolleText(eb.erblasser)], ['Güterstand', code(z, 'enova.gueterstand', eb.gueterstand)],
        ['Nachlass', f.nachlass]
      ];
      if (wPaare.some(function (p) { return s(p[1]); }) || (eb.verfuegungen || []).length) {
        ueberschrift('Angaben zur Mitteilung', 'fachdaten/wertangabenNachErbSTG');
        kv(wPaare);
        tabelle(['Verfügung von Todes wegen vom', 'Eröffnet am'], (eb.verfuegungen || []).map(function (vf) {
          return [datumDE(vf.datum), datumDE(vf.eroeffnet)];
        }));
      }
    }

    // --- Anlagen ------------------------------------------------------------------------
    if ((z.dokumente || []).length) {
      ueberschrift('Anlagen', 'schriftgutobjekte/dokument');
      tabelle(['Nr.', 'Datei', 'Dokumentklasse / -typ', 'Bezeichnung'], z.dokumente.map(function (d, i) {
        return [String(i + 1), s(d.dateiname) + (s(d.signatur) ? '\nSignatur: ' + s(d.signatur) : ''),
          [code(z, 'gds.dokumentklasse', d.klasse), code(z, 'gds.dokumenttyp', d.typ)].filter(Boolean).join('\n'), s(d.anzeigename)];
      }), { columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 62 } } });
    }

    platz(14);
    absatz('Dieses Dokument ist eine menschenlesbare Darstellung der XJustiz-Nachricht ' + info.element +
      ' (XJustiz ' + X.XJUSTIZ_VERSION + '). Maßgeblich für die elektronische Verarbeitung ist die strukturierte Datei xjustiz_nachricht.xml.', 7.8, FARBE.grau);

    // --- Fußzeile ------------------------------------------------------------------------
    var seiten = doc.getNumberOfPages();
    for (var i = 1; i <= seiten; i++) {
      doc.setPage(i);
      doc.setDrawColor(FARBE.linie[0], FARBE.linie[1], FARBE.linie[2]); doc.setLineWidth(0.2);
      doc.line(RAND.l, hoehe - 14, breite - RAND.r, hoehe - 14);
      doc.setFont(schrift, 'normal'); doc.setFontSize(7.2); farbe(FARBE.hell);
      doc.text(info.titel + ' · Nachrichten-ID ' + s(k.absender.nachrichtenID), RAND.l, hoehe - 10);
      doc.text('Seite ' + i + ' von ' + seiten, breite - RAND.r, hoehe - 10, { align: 'right' });
    }
    return doc;
  }

  function dateiname(z) {
    var info = X.NACHRICHTEN[z.nachricht] || X.NACHRICHTEN.ersuchen;
    var az = s(z.kopf.absender.aktenzeichen).replace(/[^\wÄÖÜäöüß-]+/g, '-').replace(/^-+|-+$/g, '');
    var d = new Date();
    var tag = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return ['eNoVA', info.titel.replace(/\s+/g, '-'), az, tag].filter(Boolean).join('_') + '.pdf';
  }

  root.EnovaPDF = { erzeuge: erzeuge, dateiname: dateiname, datumDE: datumDE, betragDE: betragDE };
})(typeof window !== 'undefined' ? window : globalThis);
