/*
 * eNoVA-Nachrichtenmaske – Kern: Datenmodell, Prüfung, XML-Erzeugung und XML-Import
 *
 * Grundlage: XJustiz 3.6.2, Fachmodul DABAG (xjustiz_2900_dabag_3_2.xsd)
 *   nachricht.enova.entscheidung.2900003  – Ersuchen um bzw. Mitteilung einer Sachentscheidung
 *   nachricht.enova.mitteilung.2900004    – Mitteilung (z. B. an Finanzamt / Gutachterausschuss)
 *
 * Die Reihenfolge aller Elemente folgt exakt den xs:sequence-Definitionen des Schemas.
 * Läuft im Browser (window.EnovaXJ) und in Node (module.exports) für die Tests.
 */
(function (root) {
  'use strict';

  var XJUSTIZ_VERSION = '3.6.2';
  var NS = 'http://www.xjustiz.de';

  var NACHRICHTEN = {
    ersuchen: {
      element: 'nachricht.enova.entscheidung.2900003', nummer: '2900003',
      titel: 'Ersuchen um Sachentscheidung', richtung: 'Notar an Behörde oder Gericht'
    },
    entscheidung: {
      element: 'nachricht.enova.entscheidung.2900003', nummer: '2900003',
      titel: 'Sachentscheidung', richtung: 'Behörde oder Gericht an Notar'
    },
    mitteilung: {
      element: 'nachricht.enova.mitteilung.2900004', nummer: '2900004',
      titel: 'Mitteilung', richtung: 'Notar an Finanzamt oder Gutachterausschuss'
    }
  };

  var PRODUKT = { name: 'eNoVA-Nachrichtenmaske', version: '1.0.0' };

  // ---------------------------------------------------------------------------
  // Codelisten
  // ---------------------------------------------------------------------------
  function codelisten() { return root.ENOVA_CODELISTEN || {}; }

  function liste(id) {
    var l = codelisten()[id];
    if (!l) throw new Error('Unbekannte Codeliste: ' + id);
    return l;
  }

  function listenVersion(zustand, id) {
    var l = liste(id);
    if (l.typ === 1) return l.standardVersion;
    var v = zustand && zustand.versionen && zustand.versionen[id];
    return (v === undefined || v === null) ? l.standardVersion : String(v).trim();
  }

  function listenWerte(id, version) {
    var l = liste(id);
    return (l.versionen && l.versionen[version]) || [];
  }

  /** Vollständig = alle Werte dieser Listenversion liegen lokal vor (XSD, Genericode oder Import). */
  function istVollstaendig(id, version) {
    var l = liste(id);
    if (l.typ === 1) return true;
    if (!l.versionen || !l.versionen[version]) return false;
    return !!l.vollstaendig || (l.importiert || []).indexOf(version) >= 0;
  }

  /** Übernimmt eine Codeliste im Genericode-Format (Download aus dem XRepository). */
  function genericodeImportieren(text, DOMParserKlasse) {
    var Parser = DOMParserKlasse || root.DOMParser;
    var doc = new Parser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Die Datei ist kein wohlgeformtes XML.');
    function lokal(e, n) {
      var aus = [];
      for (var c = e && e.firstElementChild; c; c = c.nextElementSibling) if (c.localName === n) aus.push(c);
      return aus;
    }
    var w = doc.documentElement;
    if (w.localName !== 'CodeList') throw new Error('Keine Genericode-Codeliste (Wurzelelement CodeList erwartet).');
    var ident = lokal(w, 'Identification')[0];
    var uri = ((lokal(ident, 'CanonicalUri')[0] || {}).textContent || '').trim();
    var version = ((lokal(ident, 'Version')[0] || {}).textContent || '').trim();
    var cl = codelisten();
    var id = Object.keys(cl).filter(function (k) { return cl[k].uri === uri; })[0];
    if (!id) throw new Error('Die Codeliste ' + (uri || '(ohne Kennung)') + ' wird in dieser Maske nicht verwendet.');
    var spalten = lokal(w, 'ColumnSet')[0];
    var schluessel = '';
    lokal(spalten, 'Key').forEach(function (k) {
      var ref = lokal(k, 'ColumnRef')[0];
      if (ref && !schluessel) schluessel = ref.getAttribute('Ref');
    });
    var ids = lokal(spalten, 'Column').map(function (c) { return c.getAttribute('Id'); });
    schluessel = schluessel || ids[0];
    var wertspalte = ids.indexOf('wert') >= 0 ? 'wert' : ids.filter(function (x) { return x !== schluessel; })[0];
    var werte = [];
    lokal(lokal(w, 'SimpleCodeList')[0], 'Row').forEach(function (row) {
      var d = {};
      lokal(row, 'Value').forEach(function (v) {
        var sv = lokal(v, 'SimpleValue')[0];
        d[v.getAttribute('ColumnRef')] = sv ? sv.textContent.replace(/\s+/g, ' ').trim() : '';
      });
      if (d[schluessel]) werte.push([d[schluessel], d[wertspalte] || '']);
    });
    if (!werte.length) throw new Error('Die Codeliste enthält keine Werte.');
    return { id: id, version: version, werte: werte };
  }

  function codelisteUebernehmen(eintrag) {
    var l = liste(eintrag.id);
    l.versionen = l.versionen || {};
    l.versionen[eintrag.version] = eintrag.werte;
    l.importiert = l.importiert || [];
    if (l.importiert.indexOf(eintrag.version) < 0) l.importiert.push(eintrag.version);
  }

  function codeText(zustand, id, code) {
    if (!code) return '';
    var werte = listenWerte(id, listenVersion(zustand, id));
    for (var i = 0; i < werte.length; i++) if (werte[i][0] === code) return werte[i][1];
    // in anderen Versionen nachsehen (z. B. nach Import einer Nachricht)
    var l = liste(id);
    for (var v in l.versionen) {
      var w = l.versionen[v];
      for (var j = 0; j < w.length; j++) if (w[j][0] === code) return w[j][1];
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------
  function uuid() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  var zaehler = 0;
  function neueId(praefix) { zaehler += 1; return praefix + Date.now().toString(36) + zaehler.toString(36); }

  function s(wert) { return wert === undefined || wert === null ? '' : String(wert).trim(); }

  function zeitstempel(datum) {
    var d = datum || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var off = -d.getTimezoneOffset();
    var vz = off >= 0 ? '+' : '-';
    off = Math.abs(off);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' +
      p(d.getMinutes()) + ':' + p(d.getSeconds()) + vz + p(Math.floor(off / 60)) + ':' + p(off % 60);
  }

  /** Deutsche Zahlenschreibweise ("450.000,50", "357,5") in xs:double-Schreibweise wandeln. */
  function zahlNormieren(wert) {
    var v = s(wert).replace(/[\s  ]/g, '').replace(/(EUR|€)$/i, '');
    if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
    return v;
  }

  function gueltigesDatum(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  var DIN_NAMEN = {
    A: 'Namen natürlicher Personen', B: 'Adressbestandteile', C: 'Freitext',
    D: 'Bezeichnungen', E: 'erweiterter Freitext'
  };

  /** Prüft einen Wert gegen den XSD-Datentyp. Liefert {wert} oder {fehler}. */
  function pruefeWert(wert, typ) {
    var v = wert;
    switch (typ) {
      case 'A': case 'B': case 'C': case 'D': case 'E': {
        var re = root.ENOVA_DIN91379 && root.ENOVA_DIN91379[typ];
        if (re && !re.test(v)) {
          var zeichen = Array.from(v);
          for (var i = 0; i < zeichen.length; i++) {
            if (!re.test(zeichen[i]) && !/\p{M}/u.test(zeichen[i])) {
              var cp = zeichen[i].codePointAt(0).toString(16).toUpperCase();
              while (cp.length < 4) cp = '0' + cp;
              return { fehler: 'Das Zeichen „' + zeichen[i] + '“ (U+' + cp + ') ist nach DIN 91379 (Datentyp ' + typ +
                ', ' + DIN_NAMEN[typ] + ') nicht zulässig.' };
            }
          }
          return { fehler: 'Enthält eine nach DIN 91379 (Datentyp ' + typ + ') unzulässige Zeichenfolge.' };
        }
        return { wert: v };
      }
      case 'datum':
        if (!/^\d{4}((-\d{2})?-\d{2})?$/.test(v)) return { fehler: 'Datum im Format JJJJ-MM-TT (oder JJJJ-MM bzw. JJJJ) angeben.' };
        if (v.length === 10 && !gueltigesDatum(v)) return { fehler: 'Kein gültiges Kalenderdatum.' };
        return { wert: v };
      case 'date':
        if (!gueltigesDatum(v)) return { fehler: 'Gültiges Datum im Format JJJJ-MM-TT angeben.' };
        return { wert: v };
      case 'gYear':
        if (!/^\d{4}$/.test(v)) return { fehler: 'Jahr vierstellig angeben (z. B. 1978).' };
        return { wert: v };
      case 'double': {
        var z = zahlNormieren(v);
        if (!/^-?\d+(\.\d+)?$/.test(z)) return { fehler: 'Zahl angeben (z. B. 450000 oder 450.000,50).' };
        return { wert: z };
      }
      case 'integer':
        if (!/^\d+$/.test(v)) return { fehler: 'Ganze Zahl ohne Nachkommastellen angeben.' };
        return { wert: String(parseInt(v, 10)) };
      case 'uuid':
        if (!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(v)) {
          return { fehler: 'UUID im Format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx angeben.' };
        }
        return { wert: v.toLowerCase() };
      default:
        return { wert: v };
    }
  }

  /** Ersatz für typografische Zeichen, die in manchen DIN-91379-Datentypen nicht zulässig sind
   *  (z. B. beim Einfügen aus Textverarbeitungen). Ersetzt nur, was im Zieldatentyp unzulässig ist. */
  var TYPOGRAFIE = [
    [/[\u2010-\u2015\u2212]/g, '-'], [/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"'],
    [/[\u2018\u201A\u201B\u2039\u203A]/g, "'"], [/\u2026/g, '...'], [/[\u2002-\u200A\u202F]/g, ' '],
    [/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, ''], [/\u2022/g, '-']
  ];
  function typografieAnpassen(wert, typ) {
    var re = root.ENOVA_DIN91379 && root.ENOVA_DIN91379[typ];
    if (!re || !wert || re.test(wert)) return wert;
    return Array.from(wert).map(function (z) {
      if (re.test(z)) return z;
      for (var i = 0; i < TYPOGRAFIE.length; i++) {
        var r = z.replace(TYPOGRAFIE[i][0], TYPOGRAFIE[i][1]);
        if (r !== z) return r;
      }
      return z;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Datenmodell
  // ---------------------------------------------------------------------------
  function leereAnschrift() {
    return { typ: '', zusatz: '', strasse: '', hausnummer: '', postfach: '', plz: '', ort: '', ortsteil: '', bundesland: '', staat: '' };
  }

  function neuerBeteiligter(rollenCode) {
    return {
      id: neueId('b'), art: 'person',
      rollen: [{ id: neueId('r'), code: rollenCode || '' }],
      person: { titel: '', vorname: '', namensvorsatz: '', nachname: '', geburtsname: '', geburtsdatum: '', geburtsort: '', geschlecht: '', familienstand: '', steuerId: '' },
      organisation: { bezeichnung: '', kurzbezeichnung: '', sitz: '', wirtschaftsId: '' },
      anschrift: leereAnschrift(),
      kontakt: []
    };
  }

  function neuesFlurstueck() {
    return { gemarkung: '', flur: '', zaehler: '', nenner: '', wirtschaftsart: '', lage: '', groesse: '' };
  }

  function neuesRecht() {
    return {
      id: neueId('g'), buchungsart: 'grundstueck', lfdNummer: '',
      flurstuecke: [neuesFlurstueck()],
      weg: { anteilZaehler: '', anteilNenner: '', sondereigentumNr: '', sondereigentumBez: '', aufteilungsgrund: '', stockwerkseigentum: false, veraeusserungsbeschraenkung: '', sondernutzungsrecht: '' },
      zusatz: '',
      anschrift: leereAnschrift(),
      angaben: { grundstuecksart: '', baujahr: '', wohnflaeche: '', sonstiges: '', teilflaeche: false },
      grundbuchart: '',
      blaetter: [{ amtsgericht: '', bezirk: '', blatt: '' }]
    };
  }

  function neuerZustand(typ) {
    var versionen = {};
    var cl = codelisten();
    Object.keys(cl).forEach(function (id) { if (cl[id].typ === 3) versionen[id] = cl[id].standardVersion; });
    return {
      format: 'enova-nachrichtenmaske', formatVersion: 1,
      nachricht: typ || 'ersuchen',
      versionen: versionen,
      hersteller: { name: PRODUKT.name, hersteller: 'Open-Source-Werkzeug', version: PRODUKT.version },
      kopf: {
        absender: { kp: { art: 'sonstige', text: '', code: '' }, safeId: '', aktenzeichen: '', nachrichtenID: uuid(), rolle: '' },
        empfaenger: { kp: { art: 'sonstige', text: '', code: '' }, safeId: '', azArt: 'unbekannt', aktenzeichen: '', fremdeNachrichtenID: '', rolle: '' },
        prozessID: ''
      },
      verfahren: { verfahrensnummer: '', behoerde: { art: 'keine', text: '', code: '' }, aktenzeichen: '', gegenstand: '' },
      beteiligte: [],
      fach: {
        ersuchen: [{ code: '', hinweise: '' }],
        entscheidungen: [{ code: '', hinweise: '', adressaten: [] }],
        urkunden: [{ urNr: '', datum: '', personen: [], keineBeurkundung: false }],
        rechte: [],
        rechtsgeschaeft: { art: '', freitext: '', rechtswirksamkeit: '', genehmigendArt: '', genehmigendRolle: '', genehmigendDritter: '', datum: '' },
        gegenleistungen: [],
        anteile: [],
        tagUebergabe: '',
        wertangaben: { verkehrswert: '', geschaeftswert: '', notargebuehren: '', einheitswert: '', grundbesitzwert: '', valutastand: '', jahreswert: '' },
        grundDerUebersendung: '',
        erbfall: { erblasser: '', gueterstand: '', verfuegungen: [] },
        nachlass: ''
      },
      dokumente: []
    };
  }

  /** Vergibt Beteiligten- und Rollennummern in Dokumentreihenfolge. */
  function nummerierung(z) {
    var rollen = {}, beteiligte = {}, liste = [], nr = 0;
    (z.beteiligte || []).forEach(function (b, i) {
      beteiligte[b.id] = i + 1;
      (b.rollen || []).forEach(function (r) {
        nr += 1;
        rollen[r.id] = nr;
        liste.push({ id: r.id, nummer: nr, code: r.code, beteiligter: b, beteiligtennummer: i + 1 });
      });
    });
    return { rollen: rollen, beteiligte: beteiligte, liste: liste };
  }

  function beteiligtenName(b) {
    if (!b) return '';
    if (b.art === 'organisation') return s(b.organisation.bezeichnung);
    var p = b.person;
    return [p.titel, p.vorname, p.namensvorsatz, p.nachname].map(s).filter(Boolean).join(' ');
  }

  function rollenBeschreibung(z, eintrag) {
    var name = beteiligtenName(eintrag.beteiligter) || 'Beteiligter ' + eintrag.beteiligtennummer;
    var rolle = codeText(z, 'gds.rollenbezeichnung', eintrag.code) || 'ohne Rolle';
    return 'Nr. ' + eintrag.nummer + ' · ' + rolle + ' · ' + name;
  }

  // ---------------------------------------------------------------------------
  // XML-Knoten und Serialisierung
  // ---------------------------------------------------------------------------
  function flach(kinder) {
    var aus = [];
    (function f(k) {
      for (var i = 0; i < k.length; i++) {
        if (Array.isArray(k[i])) f(k[i]);
        else if (k[i]) aus.push(k[i]);
      }
    })(kinder);
    return aus;
  }

  /** Optionales Element: entfällt, wenn es keinen Inhalt hat. */
  function el(name, inhalt, attrs) {
    if (inhalt === undefined || inhalt === null) return null;
    if (Array.isArray(inhalt)) {
      var k = flach(inhalt);
      if (!k.length) return null;
      return { name: name, kinder: k, attrs: attrs };
    }
    var t = String(inhalt);
    if (t === '') return null;
    return { name: name, text: t, attrs: attrs };
  }

  /** Pflichtelement: wird auch ohne Inhalt geschrieben. */
  function pel(name, inhalt, attrs) {
    return el(name, inhalt, attrs) || { name: name, kinder: [], attrs: attrs };
  }

  function esc(t, attr) {
    var r = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (attr) r = r.replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
    return r.replace(/\r\n?/g, '\n');
  }

  function qname(n) { return n === 'code' ? 'code' : 'tns:' + n; }

  function serialisiere(knoten, tiefe, aus) {
    var einr = new Array(tiefe + 1).join('  ');
    var attrs = '';
    if (knoten.attrs) {
      Object.keys(knoten.attrs).forEach(function (a) {
        if (knoten.attrs[a] !== undefined && knoten.attrs[a] !== null && knoten.attrs[a] !== '') {
          attrs += ' ' + a + '="' + esc(knoten.attrs[a], true) + '"';
        }
      });
    }
    var q = qname(knoten.name);
    if (knoten.text !== undefined) {
      aus.push(einr + '<' + q + attrs + '>' + esc(knoten.text) + '</' + q + '>');
    } else if (!knoten.kinder.length) {
      aus.push(einr + '<' + q + attrs + '/>');
    } else {
      aus.push(einr + '<' + q + attrs + '>');
      knoten.kinder.forEach(function (k) { serialisiere(k, tiefe + 1, aus); });
      aus.push(einr + '</' + q + '>');
    }
  }

  // ---------------------------------------------------------------------------
  // Generator mit gleichzeitiger Prüfung
  // ---------------------------------------------------------------------------
  function Kontext(z) {
    this.z = z;
    this.fehler = [];
    this.hinweise = [];
    this.nr = nummerierung(z);
  }

  Kontext.prototype.fehlerMelden = function (pfad, text) { this.fehler.push({ pfad: pfad, text: text }); };
  Kontext.prototype.hinweisMelden = function (pfad, text) { this.hinweise.push({ pfad: pfad, text: text }); };

  /** Textelement mit Datentypprüfung. opts: {pflicht, label} */
  Kontext.prototype.t = function (name, wert, typ, pfad, opts) {
    opts = opts || {};
    var v = s(wert);
    var label = opts.label || name;
    if (v === '') {
      if (opts.pflicht) this.fehlerMelden(pfad, label + ': Pflichtangabe fehlt.');
      return null;
    }
    var r = pruefeWert(v, typ);
    if (r.fehler) { this.fehlerMelden(pfad, label + ': ' + r.fehler); return el(name, v); }
    return el(name, r.wert);
  };

  /** Code-Element (xoev-code:Code) mit listURI/listVersionID. */
  Kontext.prototype.c = function (name, listenId, code, pfad, opts) {
    opts = opts || {};
    var v = s(code);
    var label = opts.label || name;
    var l = liste(listenId);
    if (v === '') {
      if (opts.pflicht) this.fehlerMelden(pfad, label + ': Bitte einen Wert auswählen.');
      return null;
    }
    var version = listenVersion(this.z, listenId);
    if (l.typ === 3 && !version) {
      this.fehlerMelden('versionen.' + listenId, label + ': Für die Codeliste ' + l.name +
        ' ist keine Version (listVersionID) hinterlegt. Bitte unter „Codelisten“ angeben.');
    }
    var werte = listenWerte(listenId, version);
    var bekannt = werte.some(function (w) { return w[0] === v; });
    if (!bekannt) {
      if (istVollstaendig(listenId, version)) {
        this.fehlerMelden(pfad, label + ': Der Code „' + v + '“ ist in ' + l.name + ' ' + version + ' nicht enthalten.');
      } else {
        this.hinweisMelden(pfad, label + ': Code „' + v + '“ ist lokal nicht hinterlegt – bitte gegen ' + l.name +
          (version ? ' ' + version : '') + ' (XRepository) prüfen.');
      }
    }
    var r = pruefeWert(v, 'C');
    if (r.fehler) this.fehlerMelden(pfad, label + ': ' + r.fehler);
    return el(name, [el('code', v)], { listURI: l.uri, listVersionID: version });
  };

  Kontext.prototype.bool = function (name, wert) {
    if (wert === true || wert === 'true') return el(name, 'true');
    if (wert === false || wert === 'false') return el(name, 'false');
    return null;
  };

  /** Verweis auf eine Rolle (Type.GDS.Ref.Rollennummer). */
  Kontext.prototype.refRolle = function (name, rollenId, pfad, opts) {
    opts = opts || {};
    if (!rollenId) {
      if (opts.pflicht) this.fehlerMelden(pfad, (opts.label || name) + ': Bitte einen Beteiligten auswählen.');
      return null;
    }
    var nummer = this.nr.rollen[rollenId];
    if (!nummer) {
      this.fehlerMelden(pfad, (opts.label || name) + ': Der ausgewählte Beteiligte existiert nicht mehr.');
      return null;
    }
    return el(name, [el('ref.rollennummer', String(nummer))]);
  };

  Kontext.prototype.geldbetrag = function (name, wert, pfad, label) {
    if (s(wert) === '') return null;
    return el(name, [
      this.t('zahl', wert, 'double', pfad, { pflicht: true, label: label }),
      el('auswahl_waehrung', [this.c('waehrung', 'gds.waehrung', 'EUR', pfad, { label: 'Währung' })])
    ]);
  };

  Kontext.prototype.anschrift = function (name, a, pfad, mitTyp) {
    var hatInhalt = ['zusatz', 'strasse', 'hausnummer', 'postfach', 'plz', 'ort', 'ortsteil'].some(function (k) { return s(a[k]) !== ''; });
    if (!hatInhalt) return null;
    return el(name, [
      mitTyp ? this.c('anschriftstyp', 'gds.anschriftstyp', a.typ, pfad + '.typ', { label: 'Anschriftstyp' }) : null,
      this.t('anschriftenzusatz', a.zusatz, 'C', pfad + '.zusatz', { label: 'Anschriftenzusatz' }),
      this.t('strasse', a.strasse, 'B', pfad + '.strasse', { label: 'Straße' }),
      this.t('hausnummer', a.hausnummer, 'B', pfad + '.hausnummer', { label: 'Hausnummer' }),
      this.t('postfachnummer', a.postfach, 'C', pfad + '.postfach', { label: 'Postfach' }),
      this.t('postleitzahl', a.plz, 'C', pfad + '.plz', { label: 'Postleitzahl' }),
      this.t('ort', a.ort, 'B', pfad + '.ort', { label: 'Ort' }),
      this.t('ortsteil', a.ortsteil, 'B', pfad + '.ortsteil', { label: 'Ortsteil' }),
      s(a.bundesland) ? el('auswahl_bundesland', [this.c('bundesland.BRD', 'gds.bundesland', a.bundesland, pfad + '.bundesland', { label: 'Bundesland' })]) : null,
      this.c('staat', 'gds.staaten', a.staat, pfad + '.staat', { label: 'Staat' })
    ]);
  };

  Kontext.prototype.kommunikation = function (liste, pfad) {
    var k = this;
    return (liste || []).map(function (t, i) {
      var p = pfad + '.' + i;
      return el('telekommunikation', [
        k.c('telekommunikationsart', 'gds.telekommunikationsart', t.art, p + '.art', { pflicht: true, label: 'Kommunikationsart' }),
        k.t('verbindung', t.verbindung, 'C', p + '.verbindung', { pflicht: true, label: 'Verbindung' })
      ]);
    });
  };

  Kontext.prototype.kommunikationspartner = function (seite, daten, pfad) {
    var kp = daten.kp || {};
    var auswahl;
    if (kp.art === 'gericht') {
      auswahl = this.c('gericht', 'gds.gerichte', kp.code, pfad + '.kp.code', { pflicht: true, label: 'Gericht (Code)' });
    } else if (kp.art === 'finanzbehoerde') {
      auswahl = this.c('finanzbehoerde', 'gds.finanzbehoerden', kp.code, pfad + '.kp.code', { pflicht: true, label: 'Finanzbehörde (Code)' });
    } else {
      auswahl = this.t('sonstige', kp.text, 'D', pfad + '.kp.text', { pflicht: true, label: seite + ': Bezeichnung' });
    }
    return pel('informationen', [
      pel('auswahl_kommunikationspartner', [auswahl]),
      this.t('routingInformationAusSafeverzeichnis', daten.safeId, 'C', pfad + '.safeId', { label: 'SAFE-ID' }),
      daten.rolle ? el('auswahl_verweisGrunddaten', [this.refRolle('ref.rollennummer', daten.rolle, pfad + '.rolle', { label: seite + ': Verweis auf Beteiligten' })]) : null
    ]);
  };

  Kontext.prototype.nachrichtenkopf = function (erstellt) {
    var z = this.z, k = z.kopf, a = k.absender, e = k.empfaenger;
    var azAuswahl;
    if (e.azArt === 'freitext') {
      azAuswahl = this.t('aktenzeichen.freitext', e.aktenzeichen, 'C', 'kopf.empfaenger.aktenzeichen', { pflicht: true, label: 'Aktenzeichen des Empfängers' });
    } else if (e.azArt === 'neu') {
      azAuswahl = el('aktenzeichen.neu', 'true');
    } else {
      azAuswahl = el('aktenzeichen.unbekannt', 'true');
    }
    var h = z.hersteller || {};
    return pel('nachrichtenkopf', [
      el('erstellungszeitpunkt', erstellt),
      pel('absender', [
        this.kommunikationspartner('Absender', a, 'kopf.absender'),
        this.t('aktenzeichen', a.aktenzeichen, 'C', 'kopf.absender.aktenzeichen', { label: 'Aktenzeichen des Absenders' }),
        this.t('eigeneNachrichtenID', a.nachrichtenID, 'uuid', 'kopf.absender.nachrichtenID', { pflicht: true, label: 'Nachrichten-ID' })
      ]),
      pel('empfaenger', [
        this.kommunikationspartner('Empfänger', e, 'kopf.empfaenger'),
        pel('auswahl_aktenzeichen', [azAuswahl]),
        this.t('fremdeNachrichtenID', e.fremdeNachrichtenID, 'uuid', 'kopf.empfaenger.fremdeNachrichtenID', { label: 'Bezugsnachricht (Nachrichten-ID)' })
      ]),
      s(k.prozessID) ? el('nachrichtenuebergreifenderProzess', [
        this.t('prozessID', k.prozessID, 'uuid', 'kopf.prozessID', { pflicht: true, label: 'Prozess-ID' })
      ]) : null,
      pel('herstellerinformation', [
        this.t('nameDesProdukts', h.name, 'D', 'hersteller.name', { pflicht: true, label: 'Produktname' }),
        this.t('herstellerDesProdukts', h.hersteller, 'D', 'hersteller.hersteller', { pflicht: true, label: 'Hersteller' }),
        this.t('version', h.version, 'C', 'hersteller.version', { pflicht: true, label: 'Produktversion' })
      ])
    ], { xjustizVersion: XJUSTIZ_VERSION });
  };

  Kontext.prototype.person = function (b, pfad) {
    var p = b.person;
    var pp = pfad + '.person';
    if (s(p.steuerId) && !/^\d{11}$/.test(s(p.steuerId).replace(/\s/g, ''))) {
      this.hinweisMelden(pp + '.steuerId', 'Steuer-Identifikationsnummer: üblicherweise 11 Ziffern.');
    }
    return el('natuerlichePerson', [
      pel('vollerName', [
        this.t('vorname', p.vorname, 'A', pp + '.vorname', { label: 'Vorname' }),
        this.t('titel', p.titel, 'C', pp + '.titel', { label: 'Titel' }),
        this.t('namensvorsatz', p.namensvorsatz, 'A', pp + '.namensvorsatz', { label: 'Namensvorsatz' }),
        this.t('nachname', p.nachname, 'A', pp + '.nachname', { pflicht: true, label: 'Nachname' }),
        this.t('geburtsname', p.geburtsname, 'A', pp + '.geburtsname', { label: 'Geburtsname' })
      ]),
      el('geburt', [
        this.t('geburtsdatum', p.geburtsdatum, 'datum', pp + '.geburtsdatum', { label: 'Geburtsdatum' }),
        s(p.geburtsort) ? el('geburtsort', [this.t('ort', p.geburtsort, 'B', pp + '.geburtsort', { label: 'Geburtsort' })]) : null
      ]),
      this.c('geschlecht', 'gds.geschlecht', p.geschlecht, pp + '.geschlecht', { label: 'Geschlecht' }),
      this.c('familienstand', 'gds.familienstand', p.familienstand, pp + '.familienstand', { label: 'Familienstand' }),
      this.anschrift('anschrift', b.anschrift, pfad + '.anschrift', true),
      this.kommunikation(b.kontakt, pfad + '.kontakt'),
      this.t('steueridentifikationsnummer', s(p.steuerId).replace(/\s/g, ''), 'C', pp + '.steuerId', { label: 'Steuer-ID' })
    ]);
  };

  Kontext.prototype.organisation = function (b, pfad) {
    var o = b.organisation;
    var po = pfad + '.organisation';
    return el('organisation', [
      pel('bezeichnung', [this.t('bezeichnung.aktuell', o.bezeichnung, 'D', po + '.bezeichnung', { pflicht: true, label: 'Bezeichnung' })]),
      this.t('kurzbezeichnung', o.kurzbezeichnung, 'D', po + '.kurzbezeichnung', { label: 'Kurzbezeichnung' }),
      s(o.sitz) ? el('sitz', [this.t('ort', o.sitz, 'B', po + '.sitz', { label: 'Sitz' })]) : null,
      this.anschrift('anschrift', b.anschrift, pfad + '.anschrift', true),
      this.kommunikation(b.kontakt, pfad + '.kontakt'),
      this.t('bundeseinheitlicheWirtschaftsnummer', o.wirtschaftsId, 'C', po + '.wirtschaftsId', { label: 'Wirtschafts-Identifikationsnummer' })
    ]);
  };

  Kontext.prototype.grunddaten = function () {
    var z = this.z, k = this, v = z.verfahren;
    var instanz = null;
    var hatBehoerde = v.behoerde && v.behoerde.art && v.behoerde.art !== 'keine';
    if (hatBehoerde || s(v.aktenzeichen) || s(v.gegenstand)) {
      var behoerde;
      if (!hatBehoerde) {
        k.fehlerMelden('verfahren.behoerde.art', 'Instanzbehörde: Pflichtangabe, sobald Aktenzeichen oder Verfahrensgegenstand angegeben sind.');
      } else if (v.behoerde.art === 'gericht') {
        behoerde = k.c('gericht', 'gds.gerichte', v.behoerde.code, 'verfahren.behoerde.code', { pflicht: true, label: 'Instanzbehörde (Gericht)' });
      } else if (v.behoerde.art === 'finanzbehoerde') {
        behoerde = k.c('finanzbehoerde', 'gds.finanzbehoerden', v.behoerde.code, 'verfahren.behoerde.code', { pflicht: true, label: 'Instanzbehörde (Finanzbehörde)' });
      } else {
        behoerde = k.t('sonstige', v.behoerde.text, 'D', 'verfahren.behoerde.text', { pflicht: true, label: 'Instanzbehörde' });
      }
      instanz = pel('instanzdaten', [
        pel('auswahl_instanzbehoerde', [behoerde]),
        s(v.aktenzeichen) ? el('aktenzeichen', [el('auswahl_aktenzeichen', [
          k.t('aktenzeichen.freitext', v.aktenzeichen, 'C', 'verfahren.aktenzeichen', { label: 'Aktenzeichen des Verfahrens' })
        ])]) : null,
        s(v.gegenstand) ? el('verfahrensgegenstand', [
          k.t('gegenstand', v.gegenstand, 'C', 'verfahren.gegenstand', { pflicht: true, label: 'Verfahrensgegenstand' })
        ]) : null
      ]);
    }
    var beteiligungen = (z.beteiligte || []).map(function (b, i) {
      var pfad = 'beteiligte.' + i;
      if (!b.rollen || !b.rollen.length) k.fehlerMelden(pfad + '.rollen', 'Beteiligter ' + (i + 1) + ': mindestens eine Rolle angeben.');
      return pel('beteiligung', [
        (b.rollen || []).map(function (r, j) {
          return pel('rolle', [
            el('rollennummer', String(k.nr.rollen[r.id])),
            k.c('rollenbezeichnung', 'gds.rollenbezeichnung', r.code, pfad + '.rollen.' + j + '.code', { pflicht: true, label: 'Rolle' })
          ]);
        }),
        pel('beteiligter', [
          el('beteiligtennummer', String(i + 1)),
          pel('auswahl_beteiligter', [b.art === 'organisation' ? k.organisation(b, pfad) : k.person(b, pfad)])
        ])
      ]);
    });
    return pel('grunddaten', [
      el('verfahrensdaten', [
        k.t('verfahrensnummer', v.verfahrensnummer, 'C', 'verfahren.verfahrensnummer', { label: 'Verfahrensnummer' }),
        instanz,
        beteiligungen
      ])
    ]);
  };

  Kontext.prototype.schriftgutobjekte = function () {
    var k = this;
    var docs = (this.z.dokumente || []).map(function (d, i) {
      var p = 'dokumente.' + i;
      var signatur = s(d.signatur);
      return pel('dokument', [
        pel('identifikation', [
          k.t('id', d.id, 'uuid', p + '.id', { pflicht: true, label: 'Dokument-ID' }),
          el('nummerImUebergeordnetenContainer', String(i + 1))
        ]),
        pel('xjustiz.fachspezifischeDaten', [
          k.c('dokumentklasse', 'gds.dokumentklasse', d.klasse, p + '.klasse', { pflicht: true, label: 'Dokumentklasse' }),
          k.c('dokumententyp', 'gds.dokumenttyp', d.typ, p + '.typ', { label: 'Dokumenttyp' }),
          k.t('anzeigename', d.anzeigename, 'C', p + '.anzeigename', { label: 'Anzeigename' }),
          pel('datei', [
            k.t('dateiname', d.dateiname, 'C', p + '.dateiname', { pflicht: true, label: 'Dateiname' }),
            k.c('bestandteil', 'gds.bestandteiltyp', '001', p + '.dateiname', { label: 'Bestandteil' })
          ]),
          signatur ? el('datei', [
            k.t('dateiname', signatur, 'C', p + '.signatur', { label: 'Signaturdatei' }),
            k.c('bestandteil', 'gds.bestandteiltyp', '003', p + '.signatur', { label: 'Bestandteil' }),
            k.t('dateiname.bezugsdatei', d.dateiname, 'C', p + '.dateiname', { label: 'Bezugsdatei' })
          ]) : null
        ])
      ]);
    });
    return el('schriftgutobjekte', docs);
  };

  Kontext.prototype.flurstuecke = function (liste, pfad) {
    var k = this;
    if (!liste || !liste.length) k.fehlerMelden(pfad, 'Mindestens ein Flurstück angeben.');
    return (liste || []).map(function (f, i) {
      var p = pfad + '.' + i;
      return pel('flurstuecke', [
        pel('identifikationFlurstueck', [
          k.t('gemarkungsschluessel', f.gemarkung, 'C', p + '.gemarkung', { pflicht: true, label: 'Gemarkungsschlüssel' }),
          k.t('flurnummer', f.flur, 'integer', p + '.flur', { label: 'Flur' }),
          pel('flurstuecksnummer', [
            k.t('zaehler', f.zaehler, 'C', p + '.zaehler', { pflicht: true, label: 'Flurstücksnummer (Zähler)' }),
            k.t('nenner', f.nenner, 'C', p + '.nenner', { label: 'Flurstücksnummer (Nenner)' })
          ])
        ]),
        k.c('wirtschaftsart', 'dabag.wirtschaftsart', f.wirtschaftsart, p + '.wirtschaftsart', { pflicht: true, label: 'Wirtschaftsart' }),
        k.t('lage', f.lage, 'B', p + '.lage', { pflicht: true, label: 'Lage' }),
        k.t('groesse', f.groesse, 'C', p + '.groesse', { label: 'Größe' })
      ]);
    });
  };

  Kontext.prototype.anteil = function (name, zaehlerW, nennerW, sonstiges, pfad, label) {
    if (s(zaehlerW) || s(nennerW)) {
      return el(name, [el('auswahl_anteil', [el('anteilNumerisch', [
        this.t('zaehler', zaehlerW, 'integer', pfad + '.zaehler', { pflicht: true, label: label + ' (Zähler)' }),
        this.t('nenner', nennerW, 'integer', pfad + '.nenner', { pflicht: true, label: label + ' (Nenner)' })
      ])])]);
    }
    if (s(sonstiges)) {
      return el(name, [el('auswahl_anteil', [this.t('anteilSonstiges', sonstiges, 'C', pfad + '.sonstiges', { label: label })])]);
    }
    return null;
  };

  Kontext.prototype.buchungsstelle = function (r, pfad) {
    if (r.buchungsart === 'keine') return null;
    var auswahl;
    if (r.buchungsart === 'weg') {
      var w = r.weg, pw = pfad + '.weg';
      auswahl = el('wegEinheit', [
        this.anteil('anteil', w.anteilZaehler, w.anteilNenner, '', pw + '.anteil', 'Miteigentumsanteil'),
        el('aufgeteilteBuchungstelle', [el('auswahl_buchungsstelle', [el('grundstueck', this.flurstuecke(r.flurstuecke, pfad + '.flurstuecke'))])]),
        this.t('veraeusserungsbeschraenkung', w.veraeusserungsbeschraenkung, 'C', pw + '.veraeusserungsbeschraenkung', { label: 'Veräußerungsbeschränkung' }),
        pel('sondereigentum', [
          this.t('nummer', w.sondereigentumNr, 'C', pw + '.sondereigentumNr', { label: 'Nr. laut Aufteilungsplan' }),
          this.t('bezeichnung', w.sondereigentumBez, 'C', pw + '.sondereigentumBez', { label: 'Bezeichnung des Sondereigentums' })
        ]),
        this.t('sondernutzungsrechtPauschal', w.sondernutzungsrecht, 'C', pw + '.sondernutzungsrecht', { label: 'Sondernutzungsrecht' }),
        this.c('erwerbsgrundart', 'dabag.aufteilungsgrund.weg', w.aufteilungsgrund, pw + '.aufteilungsgrund', { pflicht: true, label: 'Aufteilungsgrund' }),
        el('stockwerkseigentum', w.stockwerkseigentum ? 'true' : 'false')
      ]);
      if (!s(w.sondereigentumNr) && !s(w.sondereigentumBez)) {
        this.hinweisMelden(pw + '.sondereigentumNr', 'Sondereigentum: Nummer oder Bezeichnung angeben.');
      }
    } else {
      auswahl = pel('grundstueck', this.flurstuecke(r.flurstuecke, pfad + '.flurstuecke'));
    }
    return pel('buchungsstelle', [
      this.t('lfdNummer', r.lfdNummer, 'C', pfad + '.lfdNummer', { label: 'Lfd. Nr. im Bestandsverzeichnis' }),
      pel('auswahl_buchungsstelle', [auswahl]),
      this.t('zusatz', r.zusatz, 'C', pfad + '.zusatz', { label: 'Zusatz' })
    ]);
  };

  Kontext.prototype.rechte = function () {
    var k = this;
    return (this.z.fach.rechte || []).map(function (r, i) {
      var p = 'fach.rechte.' + i, a = r.angaben || {};
      var angaben = el('weitereAngabenZumGrundstueck', [
        k.c('grundstuecksart', 'enova.grundstuecksart', a.grundstuecksart, p + '.angaben.grundstuecksart', { label: 'Grundstücksart' }),
        k.t('baujahr', a.baujahr, 'gYear', p + '.angaben.baujahr', { label: 'Baujahr' }),
        k.t('wohnflaeche', a.wohnflaeche, 'double', p + '.angaben.wohnflaeche', { label: 'Wohnfläche' }),
        k.t('sonstigeAngaben', a.sonstiges, 'C', p + '.angaben.sonstiges', { label: 'Sonstige Angaben' }),
        a.teilflaeche ? el('nochZuVermessendeTeilflaeche', 'true') : null
      ]);
      var blaetter = (r.blaetter || []).filter(function (b) { return s(b.amtsgericht) || s(b.bezirk) || s(b.blatt); });
      return pel('beschreibungDesBetroffenenRechts', [
        k.buchungsstelle(r, p),
        k.anschrift('anschrift', r.anschrift, p + '.anschrift', false),
        angaben,
        k.c('grundbuchart', 'dabag.grundbuchart', r.grundbuchart, p + '.grundbuchart', { label: 'Grundbuchart' }),
        blaetter.map(function (b) {
          var j = r.blaetter.indexOf(b), pb = p + '.blaetter.' + j;
          return pel('bundeslandfremdesGrundbuchblatt', [
            k.t('amtsgericht', b.amtsgericht, 'C', pb + '.amtsgericht', { pflicht: true, label: 'Amtsgericht' }),
            k.t('grundbuchbezirk', b.bezirk, 'C', pb + '.bezirk', { pflicht: true, label: 'Grundbuchbezirk' }),
            k.t('grundbuchblatt', b.blatt, 'C', pb + '.blatt', { pflicht: true, label: 'Grundbuchblatt' })
          ]);
        })
      ]);
    });
  };

  Kontext.prototype.gemeinsameFachdaten = function () {
    var k = this, f = this.z.fach;
    var urkunden = (f.urkunden && f.urkunden.length ? f.urkunden : [{}]).map(function (u, i) {
      var p = 'fach.urkunden.' + i;
      if (!u.keineBeurkundung && !s(u.urNr)) k.hinweisMelden(p + '.urNr', 'Urkunde: UR-Nummer angeben (oder „keine Beurkundung“ wählen).');
      return pel('datenDerUrkunde', [
        k.t('urNr', u.urNr, 'C', p + '.urNr', { label: 'UR-Nummer' }),
        k.t('urkundsdatum', u.datum, 'datum', p + '.datum', { label: 'Urkundsdatum' }),
        (u.personen || []).map(function (r, j) {
          return k.refRolle('urkundsperson', r, p + '.personen', { label: 'Urkundsperson' });
        }),
        u.keineBeurkundung ? el('keineBeurkundung', 'true') : null
      ]);
    });
    var rg = f.rechtsgeschaeft || {};
    var genehmigend = null;
    if (rg.genehmigendArt === 'beteiligter') {
      genehmigend = el('auswahl_genehmigendePerson', [k.refRolle('beteiligter', rg.genehmigendRolle, 'fach.rechtsgeschaeft.genehmigendRolle', { pflicht: true, label: 'Genehmigende Person' })]);
    } else if (rg.genehmigendArt === 'dritter') {
      genehmigend = el('auswahl_genehmigendePerson', [k.t('dritter', rg.genehmigendDritter, 'D', 'fach.rechtsgeschaeft.genehmigendDritter', { pflicht: true, label: 'Genehmigende Stelle' })]);
    }
    var rechtsgeschaeft = el('artDesRechtsgeschaefts', [
      k.c('art', 'enova.artdesrechtsgeschaefts', rg.art, 'fach.rechtsgeschaeft.art', { label: 'Art des Rechtsgeschäfts' }),
      k.t('freitext', rg.freitext, 'C', 'fach.rechtsgeschaeft.freitext', { label: 'Beschreibung des Rechtsgeschäfts' }),
      k.bool('rechtswirksamkeit', rg.rechtswirksamkeit),
      genehmigend,
      k.t('datumDerRechtswirksamkeit', rg.datum, 'date', 'fach.rechtsgeschaeft.datum', { label: 'Datum der Rechtswirksamkeit' })
    ]);
    var gegenleistungen = (f.gegenleistungen || []).map(function (g, i) {
      var p = 'fach.gegenleistungen.' + i;
      return el('gegenleistung', [
        k.c('artDerGegenleistung', 'enova.gegenleistung', g.art, p + '.art', { label: 'Art der Gegenleistung' }),
        k.t('freitext', g.freitext, 'C', p + '.freitext', { label: 'Beschreibung der Gegenleistung' }),
        k.geldbetrag('betrag', g.betrag, p + '.betrag', 'Betrag')
      ]);
    });
    var anteile = (f.anteile || []).map(function (a, i) {
      var p = 'fach.anteile.' + i;
      var ant = k.anteil('anteilAmErwerb_Veraeusserung', a.zaehler, a.nenner, a.sonstiges, p, 'Anteil');
      if (!ant) k.fehlerMelden(p + '.zaehler', 'Anteil: Bruchteil (Zähler/Nenner) oder Beschreibung angeben.');
      return pel('erwerber_veraeusserer', [
        pel('auswahl_erwerber_veraeusserer', [k.refRolle(a.seite === 'veraeusserer' ? 'veraeusserer' : 'erwerber', a.rolle, p + '.rolle', { pflicht: true, label: 'Beteiligter' })]),
        ant
      ]);
    });
    return { urkunden: urkunden, rechtsgeschaeft: rechtsgeschaeft, gegenleistungen: gegenleistungen, anteile: anteile };
  };

  Kontext.prototype.fachdaten2900003 = function () {
    var k = this, z = this.z, f = z.fach;
    var gegenstand;
    if (z.nachricht === 'entscheidung') {
      if (!f.entscheidungen.length) k.fehlerMelden('fach.entscheidungen', 'Mindestens eine Sachentscheidung angeben.');
      gegenstand = f.entscheidungen.map(function (e, i) {
        var p = 'fach.entscheidungen.' + i;
        return pel('sachentscheidung', [
          k.c('sachentscheidung', 'enova.sachentscheidung', e.code, p + '.code', { pflicht: true, label: 'Sachentscheidung' }),
          k.t('hinweise_sonstige', e.hinweise, 'C', p + '.hinweise', { label: 'Hinweise' }),
          (e.adressaten || []).map(function (r) { return k.refRolle('adressatDerSachentscheidung', r, p + '.adressaten', { label: 'Adressat' }); })
        ]);
      });
    } else {
      if (!f.ersuchen.length) k.fehlerMelden('fach.ersuchen', 'Mindestens ein Ersuchen angeben.');
      gegenstand = f.ersuchen.map(function (e, i) {
        var p = 'fach.ersuchen.' + i;
        return pel('ersuchenSachentscheidung', [
          k.c('ersuchenSachentscheidung', 'enova.ersuchensachentscheidung', e.code, p + '.code', { pflicht: true, label: 'Ersuchen' }),
          k.t('hinweise_sonstige', e.hinweise, 'C', p + '.hinweise', { label: 'Hinweise' })
        ]);
      });
    }
    var g = this.gemeinsameFachdaten();
    return pel('fachdaten', [
      pel('auswahl_GegenstandDerNachricht', gegenstand),
      g.urkunden,
      this.rechte(),
      g.rechtsgeschaeft,
      g.gegenleistungen,
      g.anteile,
      k.t('tagUebergabe_Anteilsuebergang', f.tagUebergabe, 'date', 'fach.tagUebergabe', { label: 'Tag der Übergabe' })
    ]);
  };

  Kontext.prototype.fachdaten2900004 = function () {
    var k = this, f = this.z.fach, w = f.wertangaben || {};
    var g = this.gemeinsameFachdaten();
    var wert = el('wertangabenNachErbSTG', [
      k.geldbetrag('verkehrswert', w.verkehrswert, 'fach.wertangaben.verkehrswert', 'Verkehrswert'),
      k.geldbetrag('geschaeftswert', w.geschaeftswert, 'fach.wertangaben.geschaeftswert', 'Geschäftswert'),
      k.geldbetrag('hoeheDerNotargebuehren', w.notargebuehren, 'fach.wertangaben.notargebuehren', 'Notargebühren'),
      k.geldbetrag('letzterEinheitswert', w.einheitswert, 'fach.wertangaben.einheitswert', 'Letzter Einheitswert'),
      k.geldbetrag('letzterGrundbesitzwert', w.grundbesitzwert, 'fach.wertangaben.grundbesitzwert', 'Letzter Grundbesitzwert'),
      k.geldbetrag('valutastandUebernommenerVerbindlichkeiten', w.valutastand, 'fach.wertangaben.valutastand', 'Valutastand übernommener Verbindlichkeiten'),
      k.geldbetrag('jahreswertGegenleistungen', w.jahreswert, 'fach.wertangaben.jahreswert', 'Jahreswert von Gegenleistungen')
    ]);
    var eb = f.erbfall || {};
    var erbfall = null;
    if (eb.erblasser || s(eb.gueterstand) || (eb.verfuegungen || []).length) {
      erbfall = pel('angabenZumErbfallErblasser', [
        k.refRolle('erblasser', eb.erblasser, 'fach.erbfall.erblasser', { pflicht: true, label: 'Erblasser' }),
        k.c('gueterstand', 'enova.gueterstand', eb.gueterstand, 'fach.erbfall.gueterstand', { label: 'Güterstand' }),
        (eb.verfuegungen || []).map(function (v, i) {
          var p = 'fach.erbfall.verfuegungen.' + i;
          return pel('angabenVerfuegungVonTodesWegen', [
            k.t('testament.erbvertragVom', v.datum, 'date', p + '.datum', { pflicht: true, label: 'Testament/Erbvertrag vom' }),
            k.t('eroeffnetAm', v.eroeffnet, 'date', p + '.eroeffnet', { label: 'Eröffnet am' })
          ]);
        })
      ]);
    }
    return pel('fachdaten', [
      g.urkunden,
      this.rechte(),
      g.rechtsgeschaeft,
      g.gegenleistungen,
      g.anteile,
      wert,
      k.c('grundDerUebersendung', 'enova.grundderuebersendung', f.grundDerUebersendung, 'fach.grundDerUebersendung', { label: 'Grund der Übersendung' }),
      erbfall,
      k.t('hoeheUndZusammensetzungDesNachlasses', f.nachlass, 'C', 'fach.nachlass', { label: 'Höhe und Zusammensetzung des Nachlasses' })
    ]);
  };

  Kontext.prototype.semantischeHinweise = function () {
    var z = this.z, k = this;
    if (!(z.beteiligte || []).length) k.hinweisMelden('beteiligte', 'Es sind keine Beteiligten erfasst.');
    if (!(z.fach.rechte || []).length) k.hinweisMelden('fach.rechte', 'Es ist kein betroffener Grundbesitz erfasst.');
    if (z.nachricht !== 'entscheidung' && !(z.dokumente || []).length) {
      k.hinweisMelden('dokumente', 'Es ist keine Anlage (z. B. die Urkunde) verzeichnet.');
    }
    if (z.nachricht === 'entscheidung' && !s(z.kopf.empfaenger.fremdeNachrichtenID)) {
      k.hinweisMelden('kopf.empfaenger.fremdeNachrichtenID', 'Für eine Antwort sollte die Nachrichten-ID des Ersuchens als Bezug angegeben werden.');
    }
  };

  /** Erzeugt die XJustiz-Nachricht. Liefert {xml, fehler, hinweise}. */
  function erzeugeXML(z, optionen) {
    optionen = optionen || {};
    var k = new Kontext(z);
    var info = NACHRICHTEN[z.nachricht] || NACHRICHTEN.ersuchen;
    var erstellt = optionen.erstellungszeitpunkt || zeitstempel();
    var wurzel = pel(info.element, [
      k.nachrichtenkopf(erstellt),
      k.grunddaten(),
      k.schriftgutobjekte(),
      z.nachricht === 'mitteilung' ? k.fachdaten2900004() : k.fachdaten2900003()
    ], { 'xmlns:tns': NS });
    k.semantischeHinweise();
    var zeilen = ['<?xml version="1.0" encoding="UTF-8"?>'];
    serialisiere(wurzel, 0, zeilen);
    return { xml: zeilen.join('\n') + '\n', fehler: k.fehler, hinweise: k.hinweise, erstellungszeitpunkt: erstellt };
  }

  function pruefe(z) {
    var r = erzeugeXML(z, { erstellungszeitpunkt: '2000-01-01T00:00:00+00:00' });
    return { fehler: r.fehler, hinweise: r.hinweise };
  }

  // ---------------------------------------------------------------------------
  // Import einer vorhandenen XJustiz-Nachricht (2900003 / 2900004)
  // ---------------------------------------------------------------------------
  function leseXML(text, DOMParserKlasse) {
    var Parser = DOMParserKlasse || root.DOMParser;
    var doc = new Parser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Die Datei ist kein wohlgeformtes XML.');
    var wurzel = doc.documentElement;
    var name = wurzel.localName;
    if (wurzel.namespaceURI !== NS || (name !== NACHRICHTEN.ersuchen.element && name !== NACHRICHTEN.mitteilung.element)) {
      throw new Error('Keine eNoVA-Nachricht: erwartet wird nachricht.enova.entscheidung.2900003 oder nachricht.enova.mitteilung.2900004 (gefunden: ' + name + ').');
    }
    var gelesen = new Set();

    function kinder(e, n) {
      var aus = [];
      if (!e) return aus;
      for (var c = e.firstElementChild; c; c = c.nextElementSibling) {
        if ((c.namespaceURI === NS || (n === 'code' && !c.namespaceURI)) && (!n || c.localName === n)) aus.push(c);
      }
      return aus;
    }
    function kind(e, n) { return kinder(e, n)[0] || null; }
    function pfad(e) {
      var p = [];
      var n = e;
      while (n && n.nodeType === 1) { p.unshift(n.localName); n = n.parentNode; }
      return p;
    }
    function markiere(e) { if (e) { var n = e; while (n && n.nodeType === 1) { gelesen.add(n); n = n.parentNode; } } }
    function txt(e, n) {
      var c = n ? kind(e, n) : e;
      if (!c) return '';
      markiere(c);
      return c.textContent.trim();
    }
    var z = neuerZustand(name === NACHRICHTEN.mitteilung.element ? 'mitteilung' : 'ersuchen');
    function code(e, n, listenId) {
      var c = n ? kind(e, n) : e;
      if (!c) return '';
      var cc = kind(c, 'code');
      if (!cc) return '';
      markiere(cc);
      var v = c.getAttribute('listVersionID');
      if (listenId && v && liste(listenId).typ === 3) z.versionen[listenId] = v;
      return cc.textContent.trim();
    }

    var rollenNachNummer = {};
    var beteiligteNachNummer = {};

    // Nachrichtenkopf
    var kopf = kind(wurzel, 'nachrichtenkopf');
    markiere(kind(kopf, 'erstellungszeitpunkt'));
    function kpLesen(knoten, ziel) {
      var inf = kind(knoten, 'informationen');
      var aw = kind(inf, 'auswahl_kommunikationspartner');
      if (kind(aw, 'gericht')) { ziel.kp = { art: 'gericht', text: '', code: code(aw, 'gericht', 'gds.gerichte') }; }
      else if (kind(aw, 'finanzbehoerde')) { ziel.kp = { art: 'finanzbehoerde', text: '', code: code(aw, 'finanzbehoerde', 'gds.finanzbehoerden') }; }
      else { ziel.kp = { art: 'sonstige', text: txt(aw, 'sonstige'), code: '' }; }
      ziel.safeId = txt(inf, 'routingInformationAusSafeverzeichnis');
      var vw = kind(inf, 'auswahl_verweisGrunddaten');
      var ref = kind(vw, 'ref.rollennummer');
      ziel._rolleNr = ref ? (kind(ref, 'ref.rollennummer') ? txt(ref, 'ref.rollennummer') : txt(ref)) : '';
    }
    var abs = kind(kopf, 'absender'), emp = kind(kopf, 'empfaenger');
    kpLesen(abs, z.kopf.absender);
    z.kopf.absender.aktenzeichen = txt(abs, 'aktenzeichen');
    z.kopf.absender.nachrichtenID = txt(abs, 'eigeneNachrichtenID') || uuid();
    kpLesen(emp, z.kopf.empfaenger);
    var az = kind(emp, 'auswahl_aktenzeichen');
    if (kind(az, 'aktenzeichen.freitext')) { z.kopf.empfaenger.azArt = 'freitext'; z.kopf.empfaenger.aktenzeichen = txt(az, 'aktenzeichen.freitext'); }
    else if (kind(az, 'aktenzeichen.neu')) { z.kopf.empfaenger.azArt = 'neu'; txt(az, 'aktenzeichen.neu'); }
    else { z.kopf.empfaenger.azArt = 'unbekannt'; txt(az, 'aktenzeichen.unbekannt'); }
    z.kopf.empfaenger.fremdeNachrichtenID = txt(emp, 'fremdeNachrichtenID');
    z.kopf.prozessID = txt(kind(kopf, 'nachrichtenuebergreifenderProzess'), 'prozessID');
    var hi = kind(kopf, 'herstellerinformation');
    var fremdHersteller = { name: txt(hi, 'nameDesProdukts'), hersteller: txt(hi, 'herstellerDesProdukts'), version: txt(hi, 'version') };

    // Grunddaten
    var vd = kind(kind(wurzel, 'grunddaten'), 'verfahrensdaten');
    z.verfahren.verfahrensnummer = txt(vd, 'verfahrensnummer');
    var inst = kind(vd, 'instanzdaten');
    if (inst) {
      var ib = kind(inst, 'auswahl_instanzbehoerde');
      if (kind(ib, 'gericht')) z.verfahren.behoerde = { art: 'gericht', text: '', code: code(ib, 'gericht', 'gds.gerichte') };
      else if (kind(ib, 'finanzbehoerde')) z.verfahren.behoerde = { art: 'finanzbehoerde', text: '', code: code(ib, 'finanzbehoerde', 'gds.finanzbehoerden') };
      else if (kind(ib, 'sonstige')) z.verfahren.behoerde = { art: 'sonstige', text: txt(ib, 'sonstige'), code: '' };
      z.verfahren.aktenzeichen = txt(kind(kind(inst, 'aktenzeichen'), 'auswahl_aktenzeichen'), 'aktenzeichen.freitext');
      z.verfahren.gegenstand = txt(kind(inst, 'verfahrensgegenstand'), 'gegenstand');
    }

    function anschriftLesen(a) {
      var r = leereAnschrift();
      if (!a) return r;
      r.typ = code(a, 'anschriftstyp', 'gds.anschriftstyp');
      r.zusatz = kinder(a, 'anschriftenzusatz').map(function (x) { return txt(x); }).join(', ');
      r.strasse = txt(a, 'strasse'); r.hausnummer = txt(a, 'hausnummer'); r.postfach = txt(a, 'postfachnummer');
      r.plz = txt(a, 'postleitzahl'); r.ort = txt(a, 'ort'); r.ortsteil = txt(a, 'ortsteil');
      r.bundesland = code(kind(a, 'auswahl_bundesland'), 'bundesland.BRD', 'gds.bundesland');
      r.staat = code(a, 'staat', 'gds.staaten');
      return r;
    }
    function kontaktLesen(e) {
      return kinder(e, 'telekommunikation').map(function (t) {
        return { art: code(t, 'telekommunikationsart', 'gds.telekommunikationsart'), verbindung: txt(t, 'verbindung') };
      });
    }

    kinder(vd, 'beteiligung').forEach(function (bg) {
      var b = neuerBeteiligter('');
      b.rollen = kinder(bg, 'rolle').map(function (r) {
        var rolle = { id: neueId('r'), code: code(r, 'rollenbezeichnung', 'gds.rollenbezeichnung') };
        var nr = txt(r, 'rollennummer');
        if (nr) rollenNachNummer[nr] = rolle.id;
        return rolle;
      });
      var bt = kind(bg, 'beteiligter');
      var bnr = txt(bt, 'beteiligtennummer');
      var aw = kind(bt, 'auswahl_beteiligter');
      var np = kind(aw, 'natuerlichePerson'), org = kind(aw, 'organisation');
      if (org) {
        b.art = 'organisation';
        b.organisation.bezeichnung = txt(kind(org, 'bezeichnung'), 'bezeichnung.aktuell');
        b.organisation.kurzbezeichnung = txt(org, 'kurzbezeichnung');
        b.organisation.sitz = txt(kind(org, 'sitz'), 'ort');
        b.organisation.wirtschaftsId = txt(org, 'bundeseinheitlicheWirtschaftsnummer');
        b.anschrift = anschriftLesen(kind(org, 'anschrift'));
        b.kontakt = kontaktLesen(org);
      } else if (np) {
        var vn = kind(np, 'vollerName');
        b.person.vorname = txt(vn, 'vorname'); b.person.titel = txt(vn, 'titel');
        b.person.namensvorsatz = txt(vn, 'namensvorsatz'); b.person.nachname = txt(vn, 'nachname');
        b.person.geburtsname = txt(vn, 'geburtsname');
        var gb = kind(np, 'geburt');
        b.person.geburtsdatum = txt(gb, 'geburtsdatum');
        b.person.geburtsort = txt(kind(gb, 'geburtsort'), 'ort');
        b.person.geschlecht = code(np, 'geschlecht', 'gds.geschlecht');
        b.person.familienstand = code(np, 'familienstand', 'gds.familienstand');
        b.person.steuerId = txt(np, 'steueridentifikationsnummer');
        b.anschrift = anschriftLesen(kind(np, 'anschrift'));
        b.kontakt = kontaktLesen(np);
      }
      if (bnr) beteiligteNachNummer[bnr] = b;
      z.beteiligte.push(b);
    });

    function rolleZu(nr) {
      if (!nr) return '';
      if (rollenNachNummer[nr]) return rollenNachNummer[nr];
      // manche Absender verweisen auf die Beteiligtennummer
      var b = beteiligteNachNummer[nr];
      return b && b.rollen[0] ? b.rollen[0].id : '';
    }
    function refLesen(e) { return e ? rolleZu(txt(e, 'ref.rollennummer')) : ''; }
    z.kopf.absender.rolle = rolleZu(z.kopf.absender._rolleNr); delete z.kopf.absender._rolleNr;
    z.kopf.empfaenger.rolle = rolleZu(z.kopf.empfaenger._rolleNr); delete z.kopf.empfaenger._rolleNr;

    // Schriftgutobjekte
    kinder(kind(wurzel, 'schriftgutobjekte'), 'dokument').forEach(function (d) {
      var fd = kind(d, 'xjustiz.fachspezifischeDaten');
      var dateien = kinder(fd, 'datei');
      var original = dateien.filter(function (x) { return code(x, 'bestandteil', 'gds.bestandteiltyp') !== '003'; })[0] || dateien[0];
      var signatur = dateien.filter(function (x) { return code(x, 'bestandteil', 'gds.bestandteiltyp') === '003'; })[0];
      markiere(kind(kind(d, 'identifikation'), 'nummerImUebergeordnetenContainer'));
      z.dokumente.push({
        id: txt(kind(d, 'identifikation'), 'id') || uuid(),
        dateiname: original ? txt(original, 'dateiname') : '',
        signatur: signatur ? txt(signatur, 'dateiname') : '',
        klasse: code(fd, 'dokumentklasse', 'gds.dokumentklasse'),
        typ: code(fd, 'dokumententyp', 'gds.dokumenttyp'),
        anzeigename: txt(fd, 'anzeigename')
      });
      if (signatur) markiere(kind(signatur, 'dateiname.bezugsdatei'));
    });

    // Fachdaten
    var fd = kind(wurzel, 'fachdaten'), f = z.fach;
    var ag = kind(fd, 'auswahl_GegenstandDerNachricht');
    if (ag) {
      var ents = kinder(ag, 'sachentscheidung');
      if (ents.length) {
        z.nachricht = 'entscheidung';
        f.entscheidungen = ents.map(function (e) {
          return {
            code: code(e, 'sachentscheidung', 'enova.sachentscheidung'),
            hinweise: txt(e, 'hinweise_sonstige'),
            adressaten: kinder(e, 'adressatDerSachentscheidung').map(refLesen).filter(Boolean)
          };
        });
      } else {
        f.ersuchen = kinder(ag, 'ersuchenSachentscheidung').map(function (e) {
          return { code: code(e, 'ersuchenSachentscheidung', 'enova.ersuchensachentscheidung'), hinweise: txt(e, 'hinweise_sonstige') };
        });
      }
    }
    f.urkunden = kinder(fd, 'datenDerUrkunde').map(function (u) {
      return {
        urNr: txt(u, 'urNr'), datum: txt(u, 'urkundsdatum'),
        personen: kinder(u, 'urkundsperson').map(refLesen).filter(Boolean),
        keineBeurkundung: txt(u, 'keineBeurkundung') === 'true'
      };
    });
    if (!f.urkunden.length) f.urkunden = [{ urNr: '', datum: '', personen: [], keineBeurkundung: false }];

    function flurstueckeLesen(g) {
      return kinder(g, 'flurstuecke').map(function (fl) {
        var id = kind(fl, 'identifikationFlurstueck'), fn = kind(id, 'flurstuecksnummer');
        return {
          gemarkung: txt(id, 'gemarkungsschluessel'), flur: txt(id, 'flurnummer'),
          zaehler: txt(fn, 'zaehler'), nenner: txt(fn, 'nenner'),
          wirtschaftsart: code(fl, 'wirtschaftsart', 'dabag.wirtschaftsart'),
          lage: kinder(fl, 'lage').map(function (x) { return txt(x); }).join(', '),
          groesse: txt(fl, 'groesse')
        };
      });
    }
    f.rechte = kinder(fd, 'beschreibungDesBetroffenenRechts').map(function (r) {
      var recht = neuesRecht();
      var bs = kind(r, 'buchungsstelle');
      if (!bs) recht.buchungsart = 'keine';
      else {
        recht.lfdNummer = txt(bs, 'lfdNummer');
        recht.zusatz = txt(bs, 'zusatz');
        var aw = kind(bs, 'auswahl_buchungsstelle');
        var weg = kind(aw, 'wegEinheit');
        if (weg) {
          recht.buchungsart = 'weg';
          var an = kind(kind(kind(weg, 'anteil'), 'auswahl_anteil'), 'anteilNumerisch');
          recht.weg.anteilZaehler = txt(an, 'zaehler'); recht.weg.anteilNenner = txt(an, 'nenner');
          recht.flurstuecke = flurstueckeLesen(kind(kind(kind(weg, 'aufgeteilteBuchungstelle'), 'auswahl_buchungsstelle'), 'grundstueck'));
          recht.weg.veraeusserungsbeschraenkung = txt(weg, 'veraeusserungsbeschraenkung');
          var se = kind(weg, 'sondereigentum');
          recht.weg.sondereigentumNr = txt(se, 'nummer'); recht.weg.sondereigentumBez = txt(se, 'bezeichnung');
          recht.weg.sondernutzungsrecht = txt(weg, 'sondernutzungsrechtPauschal');
          recht.weg.aufteilungsgrund = code(weg, 'erwerbsgrundart', 'dabag.aufteilungsgrund.weg');
          recht.weg.stockwerkseigentum = txt(weg, 'stockwerkseigentum') === 'true';
        } else {
          recht.flurstuecke = flurstueckeLesen(kind(aw, 'grundstueck'));
        }
        if (!recht.flurstuecke.length) recht.flurstuecke = [neuesFlurstueck()];
      }
      recht.anschrift = anschriftLesen(kind(r, 'anschrift'));
      var wa = kind(r, 'weitereAngabenZumGrundstueck');
      if (wa) {
        recht.angaben = {
          grundstuecksart: code(wa, 'grundstuecksart', 'enova.grundstuecksart'), baujahr: txt(wa, 'baujahr'),
          wohnflaeche: txt(wa, 'wohnflaeche').replace('.', ','), sonstiges: txt(wa, 'sonstigeAngaben'),
          teilflaeche: txt(wa, 'nochZuVermessendeTeilflaeche') === 'true'
        };
      }
      recht.grundbuchart = code(r, 'grundbuchart', 'dabag.grundbuchart');
      var bl = kinder(r, 'bundeslandfremdesGrundbuchblatt').map(function (b) {
        return { amtsgericht: txt(b, 'amtsgericht'), bezirk: txt(b, 'grundbuchbezirk'), blatt: txt(b, 'grundbuchblatt') };
      });
      recht.blaetter = bl.length ? bl : [{ amtsgericht: '', bezirk: '', blatt: '' }];
      return recht;
    });

    var rg = kind(fd, 'artDesRechtsgeschaefts');
    if (rg) {
      var gp = kind(rg, 'auswahl_genehmigendePerson');
      f.rechtsgeschaeft = {
        art: code(rg, 'art', 'enova.artdesrechtsgeschaefts'), freitext: txt(rg, 'freitext'),
        rechtswirksamkeit: txt(rg, 'rechtswirksamkeit'),
        genehmigendArt: kind(gp, 'beteiligter') ? 'beteiligter' : (kind(gp, 'dritter') ? 'dritter' : ''),
        genehmigendRolle: refLesen(kind(gp, 'beteiligter')), genehmigendDritter: txt(gp, 'dritter'),
        datum: txt(rg, 'datumDerRechtswirksamkeit')
      };
    }
    function betrag(e) { return txt(e, 'zahl') ? (markiere(kind(kind(e, 'auswahl_waehrung'), 'waehrung')), txt(e, 'zahl').replace('.', ',')) : ''; }
    f.gegenleistungen = kinder(fd, 'gegenleistung').map(function (g) {
      var b = kind(g, 'betrag');
      if (b) code(kind(b, 'auswahl_waehrung'), 'waehrung', 'gds.waehrung');
      return { art: code(g, 'artDerGegenleistung', 'enova.gegenleistung'), freitext: txt(g, 'freitext'), betrag: betrag(b) };
    });
    f.anteile = kinder(fd, 'erwerber_veraeusserer').map(function (a) {
      var aw = kind(a, 'auswahl_erwerber_veraeusserer');
      var ver = kind(aw, 'veraeusserer');
      var ant = kind(kind(a, 'anteilAmErwerb_Veraeusserung'), 'auswahl_anteil');
      var num = kind(ant, 'anteilNumerisch');
      return {
        seite: ver ? 'veraeusserer' : 'erwerber', rolle: refLesen(ver || kind(aw, 'erwerber')),
        zaehler: txt(num, 'zaehler'), nenner: txt(num, 'nenner'), sonstiges: txt(ant, 'anteilSonstiges')
      };
    });
    f.tagUebergabe = txt(fd, 'tagUebergabe_Anteilsuebergang');

    var wa = kind(fd, 'wertangabenNachErbSTG');
    if (wa) {
      f.wertangaben = {
        verkehrswert: betrag(kind(wa, 'verkehrswert')), geschaeftswert: betrag(kind(wa, 'geschaeftswert')),
        notargebuehren: betrag(kind(wa, 'hoeheDerNotargebuehren')), einheitswert: betrag(kind(wa, 'letzterEinheitswert')),
        grundbesitzwert: betrag(kind(wa, 'letzterGrundbesitzwert')),
        valutastand: betrag(kind(wa, 'valutastandUebernommenerVerbindlichkeiten')),
        jahreswert: betrag(kind(wa, 'jahreswertGegenleistungen'))
      };
    }
    f.grundDerUebersendung = code(fd, 'grundDerUebersendung', 'enova.grundderuebersendung');
    var ef = kind(fd, 'angabenZumErbfallErblasser');
    if (ef) {
      f.erbfall = {
        erblasser: refLesen(kind(ef, 'erblasser')),
        gueterstand: code(ef, 'gueterstand', 'enova.gueterstand'),
        verfuegungen: kinder(ef, 'angabenVerfuegungVonTodesWegen').map(function (v) {
          return { datum: txt(v, 'testament.erbvertragVom'), eroeffnet: txt(v, 'eroeffnetAm') };
        })
      };
    }
    f.nachlass = txt(fd, 'hoeheUndZusammensetzungDesNachlasses');

    // Nicht übernommene Angaben ermitteln (Blattelemente, die nicht gelesen wurden)
    var nichtUebernommen = new Set();
    (function lauf(e) {
      if (!e.firstElementChild) {
        if (!gelesen.has(e) && e.textContent.trim() !== '') nichtUebernommen.add(pfad(e).slice(1).join('/'));
        return;
      }
      for (var c = e.firstElementChild; c; c = c.nextElementSibling) lauf(c);
    })(wurzel);
    nichtUebernommen.delete('nachrichtenkopf/herstellerinformation/nameDesProdukts');
    nichtUebernommen.delete('nachrichtenkopf/herstellerinformation/herstellerDesProdukts');
    nichtUebernommen.delete('nachrichtenkopf/herstellerinformation/version');

    return { zustand: z, nichtUebernommen: Array.from(nichtUebernommen), herkunft: fremdHersteller };
  }

  /** Erstellt aus einem eingegangenen Ersuchen die Antwort (Sachentscheidung). */
  function antwortAuf(alt) {
    var z = JSON.parse(JSON.stringify(alt));
    var a = alt.kopf.absender, e = alt.kopf.empfaenger;
    z.nachricht = 'entscheidung';
    z.kopf.absender = {
      kp: JSON.parse(JSON.stringify(e.kp)), safeId: e.safeId || '',
      aktenzeichen: e.azArt === 'freitext' ? e.aktenzeichen : '',
      nachrichtenID: uuid(), rolle: e.rolle || ''
    };
    z.kopf.empfaenger = {
      kp: JSON.parse(JSON.stringify(a.kp)), safeId: a.safeId || '',
      azArt: s(a.aktenzeichen) ? 'freitext' : 'unbekannt', aktenzeichen: a.aktenzeichen || '',
      fremdeNachrichtenID: a.nachrichtenID || '', rolle: a.rolle || ''
    };
    var urkundspersonen = [];
    (alt.fach.urkunden || []).forEach(function (u) { urkundspersonen = urkundspersonen.concat(u.personen || []); });
    z.fach.entscheidungen = (alt.fach.ersuchen || []).map(function () {
      return { code: '', hinweise: '', adressaten: urkundspersonen.slice(0, 1) };
    });
    if (!z.fach.entscheidungen.length) z.fach.entscheidungen = [{ code: '', hinweise: '', adressaten: [] }];
    z.dokumente = [];
    return z;
  }

  var api = {
    XJUSTIZ_VERSION: XJUSTIZ_VERSION, NACHRICHTEN: NACHRICHTEN, PRODUKT: PRODUKT,
    liste: liste, listenVersion: listenVersion, listenWerte: listenWerte, codeText: codeText,
    istVollstaendig: istVollstaendig, genericodeImportieren: genericodeImportieren, codelisteUebernehmen: codelisteUebernehmen,
    uuid: uuid, neueId: neueId, zeitstempel: zeitstempel, zahlNormieren: zahlNormieren, pruefeWert: pruefeWert,
    typografieAnpassen: typografieAnpassen,
    neuerZustand: neuerZustand, neuerBeteiligter: neuerBeteiligter, neuesRecht: neuesRecht,
    neuesFlurstueck: neuesFlurstueck, leereAnschrift: leereAnschrift,
    nummerierung: nummerierung, beteiligtenName: beteiligtenName, rollenBeschreibung: rollenBeschreibung,
    erzeugeXML: erzeugeXML, pruefe: pruefe, leseXML: leseXML, antwortAuf: antwortAuf
  };
  root.EnovaXJ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
