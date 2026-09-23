/*
 * eNoVA-Nachrichtenmaske – Bedienoberfläche
 * Rendert das Formular aus dem Zustand, bindet Eingaben per data-pfad und zeigt die Prüfergebnisse.
 */
(function () {
  'use strict';
  var X = window.EnovaXJ;
  var B = window.EnovaBeispiele;
  var P = window.EnovaPDF;

  var SPEICHER = 'enova.entwurf.v1';
  var SPEICHER_CL = 'enova.codelisten.v1';
  var SPEICHER_ANSICHT = 'enova.ansicht.v1';

  var inhalt = document.getElementById('inhalt');
  var S = null;                       // aktueller Zustand
  var pruefung = { fehler: [], hinweise: [] };
  var beruehrt = new Set();           // Felder, deren Meldungen schon angezeigt werden
  var alleZeigen = false;             // nach Exportversuch alle Meldungen zeigen
  var banner = null;                  // {art, html}
  var exportStempel = null;
  var dateiZiel = null;

  var HAEUFIGE_ROLLEN = ['208', '235', '234', '215', '168', '072', '057', '212', '141', '189', '024', '041', '088', '037', '038', '193', '123', '066', '063', '151'];

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------
  function lies(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function schreib(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* Speicher nicht verfügbar */ } }

  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function s(v) { return v === undefined || v === null ? '' : String(v).trim(); }
  function hole(obj, pfad) {
    return pfad.split('.').reduce(function (o, k) { return o === undefined || o === null ? undefined : o[k]; }, obj);
  }
  function setze(obj, pfad, wert) {
    var t = pfad.split('.');
    var o = obj;
    for (var i = 0; i < t.length - 1; i++) o = o[t[i]];
    o[t[t.length - 1]] = wert;
  }
  function idVon(pfad) { return 'f-' + pfad.replace(/[^\w-]/g, '-'); }
  function cssEsc(t) { return window.CSS && CSS.escape ? CSS.escape(t) : String(t).replace(/["\\]/g, '\\$&'); }

  var toastTimer = null;
  function toast(text) {
    var t = document.getElementById('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }

  function bestaetigen(titel, text, knopf, aktion) {
    var d = document.getElementById('bestaetigung');
    if (!d || typeof d.showModal !== 'function') { aktion(); return; }
    document.getElementById('bestaetigung-titel').textContent = titel;
    document.getElementById('bestaetigung-text').textContent = text;
    d.querySelector('[data-dialog="ja"]').textContent = knopf;
    d._aktion = aktion;
    d.showModal();
  }

  function herunterladen(daten, name, typ) {
    var blob = daten instanceof Blob ? daten : new Blob([daten], { type: typ });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  // ---------------------------------------------------------------------------
  // Feld-Bausteine
  // ---------------------------------------------------------------------------
  function meldungsBox(pfad) { return '<div class="meldung" data-meldung="' + esc(pfad) + '" hidden></div>'; }

  function datenliste(listenId, version) {
    var id = 'dl-' + (listenId + '-' + version).replace(/[^\w-]/g, '_');
    if (!document.getElementById(id)) {
      var dl = document.createElement('datalist');
      dl.id = id;
      dl.innerHTML = X.listenWerte(listenId, version).map(function (w) {
        return '<option value="' + esc(w[0]) + '">' + esc(w[1]) + '</option>';
      }).join('');
      document.getElementById('datenlisten').appendChild(dl);
    }
    return id;
  }

  function steuerung(o) {
    var wert = hole(S, o.pfad);
    if (wert === undefined || wert === null) wert = '';
    var a = ' id="' + idVon(o.pfad) + '" data-pfad="' + esc(o.pfad) + '"' +
      (o.din ? ' data-din="' + o.din + '"' : '') + (o.neu ? ' data-neu="1"' : '') +
      (o.pflicht ? ' aria-required="true"' : '') + (o.nurLesen ? ' readonly' : '');
    var opts;
    switch (o.art) {
      case 'textarea':
        return '<textarea' + a + ' rows="' + (o.zeilen || 2) + '"' + (o.platzhalter ? ' placeholder="' + esc(o.platzhalter) + '"' : '') + '>' + esc(wert) + '</textarea>';
      case 'date':
        return '<input type="date"' + a + ' value="' + esc(wert) + '">';
      case 'select':
        opts = (o.ohneLeer ? '' : '<option value="">' + esc(o.leer || '– keine Angabe –') + '</option>') +
          o.optionen.map(function (x) {
            return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(wert) ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
          }).join('');
        return '<select' + a + '>' + opts + '</select>';
      case 'rolle': {
        var nr = X.nummerierung(S);
        opts = '<option value="">' + esc(o.leer || '– keine Angabe –') + '</option>' + nr.liste.map(function (e) {
          return '<option value="' + esc(e.id) + '"' + (e.id === wert ? ' selected' : '') + '>' + esc(X.rollenBeschreibung(S, e)) + '</option>';
        }).join('');
        return '<select' + a + ' data-rollen="1">' + opts + '</select>';
      }
      case 'code': {
        var version = X.listenVersion(S, o.liste);
        var werte = X.listenWerte(o.liste, version);
        if (X.istVollstaendig(o.liste, version)) {
          var gefunden = false;
          function option(w) {
            var sel = !gefunden && w[0] === wert;
            if (sel) gefunden = true;
            var text = o.langText ? w[0] + ' – ' + w[1] : w[1] + ' (' + w[0] + ')';
            return '<option value="' + esc(w[0]) + '"' + (sel ? ' selected' : '') + '>' + esc(text) + '</option>';
          }
          opts = '<option value="">' + esc(o.leer || (o.pflicht ? '– bitte auswählen –' : '– keine Angabe –')) + '</option>';
          if (o.haeufig) {
            var haeufig = o.haeufig.map(function (c) { return werte.filter(function (w) { return w[0] === c; })[0]; }).filter(Boolean);
            opts += '<optgroup label="Häufig bei eNoVA">' + haeufig.map(option).join('') + '</optgroup>';
            opts += '<optgroup label="Alle Werte (' + esc(X.liste(o.liste).name + ' ' + version) + ')">' + werte.map(option).join('') + '</optgroup>';
          } else {
            opts += werte.map(option).join('');
          }
          if (wert && !werte.some(function (w) { return w[0] === wert; })) {
            opts += '<option value="' + esc(wert) + '" selected>Code ' + esc(wert) + ' (nicht in Version ' + esc(version) + ')</option>';
          }
          return '<select' + a + ' data-liste="' + esc(o.liste) + '">' + opts + '</select>';
        }
        var dl = datenliste(o.liste, version);
        return '<div class="code-eingabe"><input type="text"' + a + ' data-liste="' + esc(o.liste) + '" list="' + dl +
          '" value="' + esc(wert) + '" placeholder="Code" autocomplete="off" spellcheck="false" class="mono-eingabe">' +
          '<span class="code-text" data-code-text="' + esc(o.pfad) + '">' + esc(X.codeText(S, o.liste, wert)) + '</span></div>';
      }
      default:
        return '<input type="text"' + a + ' value="' + esc(wert) + '"' +
          (o.platzhalter ? ' placeholder="' + esc(o.platzhalter) + '"' : '') +
          (o.zahl ? ' inputmode="decimal"' : '') + (o.mono ? ' class="mono-eingabe" spellcheck="false"' : '') + ' autocomplete="off">';
    }
  }

  /**
   * o: {pfad, label, art, din, xml, pflicht, b, hilfe, liste, optionen, platzhalter, neu, knopf}
   */
  function feld(o) {
    if (o.art === 'bool') {
      var w = hole(S, o.pfad);
      return '<div class="feld b' + (o.b || 6) + '" data-feld="' + esc(o.pfad) + '">' +
        (o.oben ? '<span class="feld-label" aria-hidden="true">&nbsp;</span>' : '') +
        '<label class="schalter"><input type="checkbox" id="' + idVon(o.pfad) + '" data-pfad="' + esc(o.pfad) + '"' +
        (o.neu ? ' data-neu="1"' : '') + (w === true || w === 'true' ? ' checked' : '') + '> ' + esc(o.label) + '</label>' +
        (o.xml ? '<div class="xml-name">' + esc(o.xml) + '</div>' : '') + meldungsBox(o.pfad) + '</div>';
    }
    var hinweisListe = '';
    if (o.art === 'code') {
      var version = X.listenVersion(S, o.liste);
      if (!X.istVollstaendig(o.liste, version)) {
        hinweisListe = '<div class="hilfe">Teilliste ' + esc(X.liste(o.liste).name + (version ? ' ' + version : '')) +
          ' – Code eintragen oder offizielle Codeliste unter <a href="#codelisten">Codelisten</a> importieren.</div>';
      }
    }
    var ctrl = steuerung(o);
    if (o.knopf) ctrl = '<div class="mit-knopf">' + ctrl + '<button type="button" class="knopf" data-aktion="' + o.knopf.aktion + '" data-ziel="' + esc(o.pfad) + '">' + esc(o.knopf.text) + '</button></div>';
    return '<div class="feld b' + (o.b || 6) + '" data-feld="' + esc(o.pfad) + '">' +
      '<label for="' + idVon(o.pfad) + '">' + esc(o.label) + (o.pflicht ? '<span class="pflicht">Pflicht</span>' : '') + '</label>' +
      ctrl + (o.hilfe ? '<div class="hilfe">' + o.hilfe + '</div>' : '') + hinweisListe +
      (o.xml ? '<div class="xml-name">' + esc(o.xml) + '</div>' : '') + meldungsBox(o.pfad) + '</div>';
  }

  function rollenPillen(pfad, label, xml, hilfe) {
    var werte = hole(S, pfad) || [];
    var nr = X.nummerierung(S);
    var innen = nr.liste.length ? '<div class="pillen-liste">' + nr.liste.map(function (e) {
      return '<label class="pille"><input type="checkbox" data-mehrfach="' + esc(pfad) + '" value="' + esc(e.id) + '"' +
        (werte.indexOf(e.id) >= 0 ? ' checked' : '') + '> ' + esc(X.rollenBeschreibung(S, e)) + '</label>';
    }).join('') + '</div>' : '<p class="leer-hinweis">Noch keine Beteiligten erfasst – zuerst unter „Beteiligte“ anlegen.</p>';
    return '<fieldset class="feld b12" data-feld="' + esc(pfad) + '"><legend>' + esc(label) + '</legend>' + innen +
      (hilfe ? '<div class="hilfe">' + hilfe + '</div>' : '') +
      (xml ? '<div class="xml-name">' + esc(xml) + '</div>' : '') + meldungsBox(pfad) + '</fieldset>';
  }

  function segment(pfad, optionen, label) {
    var w = hole(S, pfad);
    return '<div class="feld b12" data-feld="' + esc(pfad) + '"><span class="feld-label" id="' + idVon(pfad) + '-l">' + esc(label) + '</span>' +
      '<div class="segment" role="radiogroup" aria-labelledby="' + idVon(pfad) + '-l">' + optionen.map(function (o, i) {
        return '<label><input type="radio" name="' + idVon(pfad) + '" id="' + idVon(pfad) + (i ? '-' + i : '') + '" data-pfad="' + esc(pfad) +
          '" data-neu="1" value="' + esc(o[0]) + '"' + (w === o[0] ? ' checked' : '') + '>' + esc(o[1]) + '</label>';
      }).join('') + '</div>' + meldungsBox(pfad) + '</div>';
  }

  function entfernenKnopf(liste, index, was) {
    return '<button type="button" class="knopf entfernen" data-aktion="entfernen" data-liste="' + esc(liste) + '" data-index="' + index +
      '" title="' + esc(was) + ' entfernen" aria-label="' + esc(was) + ' entfernen">×</button>';
  }

  function hinzufuegenKnopf(liste, text, vorlage) {
    return '<button type="button" class="knopf hinzufuegen" data-aktion="hinzufuegen" data-liste="' + esc(liste) + '"' +
      (vorlage ? ' data-vorlage="' + esc(vorlage) + '"' : '') + '>+ ' + esc(text) + '</button>';
  }

  function abschnitt(id, titel, xml, text, innen) {
    return '<section class="abschnitt" id="' + id + '" aria-labelledby="h-' + id + '">' +
      '<header class="abschnitt-kopf"><h2 id="h-' + id + '">' + esc(titel) + '</h2>' + (xml ? '<code class="xml-pfad">' + esc(xml) + '</code>' : '') + '</header>' +
      (text ? '<p class="abschnitt-text">' + text + '</p>' : '') +
      '<div class="meldung" data-meldung-bereich="' + id + '" hidden></div>' + innen + '</section>';
  }

  function anschriftFelder(pfad, mitTyp, xml) {
    var h = '';
    if (mitTyp) h += feld({ pfad: pfad + '.typ', label: 'Anschriftstyp', art: 'code', liste: 'gds.anschriftstyp', b: 4, xml: xml + '/anschriftstyp' });
    h += feld({ pfad: pfad + '.strasse', label: 'Straße', din: 'B', b: mitTyp ? 6 : 7, xml: xml + '/strasse' });
    h += feld({ pfad: pfad + '.hausnummer', label: 'Hausnummer', din: 'B', b: 2, xml: xml + '/hausnummer' });
    if (!mitTyp) h += feld({ pfad: pfad + '.zusatz', label: 'Zusatz', din: 'C', b: 3, xml: xml + '/anschriftenzusatz' });
    h += feld({ pfad: pfad + '.plz', label: 'PLZ', din: 'C', b: 2, xml: xml + '/postleitzahl' });
    h += feld({ pfad: pfad + '.ort', label: 'Ort', din: 'B', b: 4, xml: xml + '/ort' });
    h += feld({ pfad: pfad + '.ortsteil', label: 'Ortsteil', din: 'B', b: 3, xml: xml + '/ortsteil' });
    h += feld({ pfad: pfad + '.bundesland', label: 'Bundesland', art: 'code', liste: 'gds.bundesland', b: 3, xml: xml + '/auswahl_bundesland' });
    if (mitTyp) {
      h += feld({ pfad: pfad + '.zusatz', label: 'Anschriftenzusatz', din: 'C', b: 4, xml: xml + '/anschriftenzusatz' });
      h += feld({ pfad: pfad + '.postfach', label: 'Postfach', din: 'C', b: 3, xml: xml + '/postfachnummer' });
      h += feld({ pfad: pfad + '.staat', label: 'Staat', art: 'code', liste: 'gds.staaten', b: 5, xml: xml + '/staat' });
    }
    return h;
  }

  // ---------------------------------------------------------------------------
  // Abschnitte
  // ---------------------------------------------------------------------------
  var ABSCHNITTE = [
    { id: 'nachricht', titel: 'Nachrichtenart' },
    { id: 'kopf', titel: 'Absender und Empfänger' },
    { id: 'verfahren', titel: 'Verfahren' },
    { id: 'beteiligte', titel: 'Beteiligte' },
    { id: 'gegenstand', titel: 'Ersuchen', nur: ['ersuchen'] },
    { id: 'gegenstand', titel: 'Sachentscheidung', nur: ['entscheidung'] },
    { id: 'urkunde', titel: 'Urkunde' },
    { id: 'grundbesitz', titel: 'Grundbesitz' },
    { id: 'rechtsgeschaeft', titel: 'Rechtsgeschäft' },
    { id: 'mitteilung', titel: 'Angaben ErbStG', nur: ['mitteilung'] },
    { id: 'anlagen', titel: 'Anlagen' },
    { id: 'codelisten', titel: 'Codelisten' },
    { id: 'export', titel: 'Prüfen & Export' }
  ];

  function sichtbareAbschnitte() {
    return ABSCHNITTE.filter(function (a) { return !a.nur || a.nur.indexOf(S.nachricht) >= 0; });
  }

  function bereichVon(pfad) {
    if (/^kopf\./.test(pfad)) return 'kopf';
    if (/^verfahren/.test(pfad)) return 'verfahren';
    if (/^beteiligte/.test(pfad)) return 'beteiligte';
    if (/^fach\.(ersuchen|entscheidungen)/.test(pfad)) return 'gegenstand';
    if (/^fach\.urkunden/.test(pfad)) return 'urkunde';
    if (/^fach\.rechte/.test(pfad)) return 'grundbesitz';
    if (/^fach\.(rechtsgeschaeft|gegenleistungen|anteile|tagUebergabe)/.test(pfad)) return 'rechtsgeschaeft';
    if (/^fach\.(wertangaben|grundDerUebersendung|erbfall|nachlass)/.test(pfad)) return 'mitteilung';
    if (/^dokumente/.test(pfad)) return 'anlagen';
    if (/^(versionen|hersteller)/.test(pfad)) return 'codelisten';
    return 'nachricht';
  }

  function abschnittNachricht() {
    var karten = ['ersuchen', 'entscheidung', 'mitteilung'].map(function (t) {
      var n = X.NACHRICHTEN[t];
      return '<label class="art-karte"><input type="radio" name="nachrichtenart" id="' + idVon('nachricht') + (t === 'ersuchen' ? '' : '-' + t) +
        '" data-pfad="nachricht" data-neu="1" value="' + t + '"' + (S.nachricht === t ? ' checked' : '') + '>' +
        '<span class="art-nummer">' + n.nummer + '</span><span class="art-titel">' + esc(n.titel) + '</span>' +
        '<span class="art-richtung">' + esc(n.richtung) + '</span></label>';
    }).join('');
    return abschnitt('nachricht', 'Nachrichtenart', X.NACHRICHTEN[S.nachricht].element,
      'Die Nachrichtenart bestimmt Aufbau und Pflichtangaben der XJustiz-Datei. Vorkaufsrechtsanfragen und Genehmigungsersuchen sind Ersuchen (2900003); die Antwort der Behörde ist eine Sachentscheidung in derselben Nachricht. Anzeigen an Finanzamt oder Gutachterausschuss sind Mitteilungen (2900004).',
      '<div class="art-karten" role="radiogroup" aria-label="Nachrichtenart">' + karten + '</div>');
  }

  function kommunikationspartner(seite, pfad, xml, platzhalter) {
    var kp = hole(S, pfad + '.kp');
    var h = feld({
      pfad: pfad + '.kp.art', label: 'Art der Stelle', art: 'select', ohneLeer: true, neu: true, b: 12,
      optionen: [['sonstige', 'Stelle mit Bezeichnung'], ['gericht', 'Gericht (Code)'], ['finanzbehoerde', 'Finanzbehörde (Code)']],
      xml: xml + '/informationen/auswahl_kommunikationspartner'
    });
    if (kp.art === 'gericht') h += feld({ pfad: pfad + '.kp.code', label: 'Gericht', art: 'code', liste: 'gds.gerichte', pflicht: true, b: 12, xml: '…/gericht' });
    else if (kp.art === 'finanzbehoerde') h += feld({ pfad: pfad + '.kp.code', label: 'Finanzbehörde', art: 'code', liste: 'gds.finanzbehoerden', pflicht: true, b: 12, xml: '…/finanzbehoerde' });
    else h += feld({ pfad: pfad + '.kp.text', label: 'Bezeichnung', din: 'D', pflicht: true, b: 12, platzhalter: platzhalter, xml: '…/sonstige' });
    h += feld({ pfad: pfad + '.rolle', label: 'Entspricht dem Beteiligten', art: 'rolle', b: 12, xml: '…/auswahl_verweisGrunddaten/ref.rollennummer' });
    h += feld({ pfad: pfad + '.safeId', label: 'SAFE-ID (Routing, optional)', din: 'C', mono: true, b: 12, xml: '…/routingInformationAusSafeverzeichnis' });
    return h;
  }

  function abschnittKopf() {
    var e = S.kopf.empfaenger;
    var abs = '<div class="gruppe"><div class="gruppe-kopf"><h3>Absender</h3></div><div class="felder">' +
      kommunikationspartner('Absender', 'kopf.absender', 'absender', S.nachricht === 'entscheidung' ? 'z. B. Stadt Musterstadt, Bauordnungsamt' : 'z. B. Notarin Dr. Anna Berger, München') +
      feld({ pfad: 'kopf.absender.aktenzeichen', label: 'Eigenes Aktenzeichen', din: 'C', b: 12, platzhalter: S.nachricht === 'entscheidung' ? 'Aktenzeichen der Behörde' : 'z. B. UR 1874/2026', xml: 'absender/aktenzeichen' }) +
      feld({ pfad: 'kopf.absender.nachrichtenID', label: 'Nachrichten-ID', mono: true, nurLesen: true, pflicht: true, b: 12, knopf: { aktion: 'neue-id', text: 'Neu' }, xml: 'absender/eigeneNachrichtenID', hilfe: 'Eindeutige Kennung dieser Nachricht (UUID); der Empfänger bezieht sich in seiner Antwort darauf.' }) +
      '</div></div>';
    var emp = '<div class="gruppe"><div class="gruppe-kopf"><h3>Empfänger</h3></div><div class="felder">' +
      kommunikationspartner('Empfänger', 'kopf.empfaenger', 'empfaenger', S.nachricht === 'entscheidung' ? 'z. B. Notarin Dr. Anna Berger, München' : 'z. B. Stadt Musterstadt, Bauordnungsamt') +
      feld({ pfad: 'kopf.empfaenger.azArt', label: 'Aktenzeichen beim Empfänger', art: 'select', ohneLeer: true, neu: true, b: 12, optionen: [['unbekannt', 'unbekannt'], ['neu', 'neues Verfahren (noch kein Aktenzeichen)'], ['freitext', 'bekannt – Aktenzeichen angeben']], xml: 'empfaenger/auswahl_aktenzeichen' }) +
      (e.azArt === 'freitext' ? feld({ pfad: 'kopf.empfaenger.aktenzeichen', label: 'Aktenzeichen des Empfängers', din: 'C', pflicht: true, b: 12, xml: '…/aktenzeichen.freitext' }) : '') +
      feld({ pfad: 'kopf.empfaenger.fremdeNachrichtenID', label: 'Bezug auf Nachricht (Nachrichten-ID)', mono: true, b: 12, platzhalter: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', xml: 'empfaenger/fremdeNachrichtenID', hilfe: 'Bei einer Antwort: die Nachrichten-ID des Ersuchens.' }) +
      '</div></div>';
    var prozess = '<div class="felder" style="margin-top:14px">' +
      feld({ pfad: 'kopf.prozessID', label: 'Nachrichtenübergreifender Prozess (optional)', mono: true, b: 12, knopf: { aktion: 'neue-id', text: 'Erzeugen' }, xml: 'nachrichtenkopf/nachrichtenuebergreifenderProzess/prozessID', hilfe: 'Verknüpft mehrere Nachrichten eines Vorgangs (z. B. Ersuchen und Sachentscheidung).' }) + '</div>';
    return abschnitt('kopf', 'Absender und Empfänger', 'nachrichtenkopf',
      'Wer sendet die Nachricht an wen? Die Bezeichnung erscheint beim Empfänger im beBPo bzw. EGVP-Postfach.',
      '<div class="felder"><div class="b6 feld">' + abs + '</div><div class="b6 feld">' + emp + '</div></div>' + prozess);
  }

  function abschnittVerfahren() {
    var v = S.verfahren;
    var h = feld({ pfad: 'verfahren.verfahrensnummer', label: 'Verfahrensnummer', din: 'C', b: 4, xml: 'verfahrensdaten/verfahrensnummer', hilfe: 'Vorgangsnummer des Absenders, falls vorhanden.' });
    h += feld({
      pfad: 'verfahren.behoerde.art', label: 'Zuständige Stelle (Instanz)', art: 'select', ohneLeer: true, neu: true, b: 4,
      optionen: [['keine', 'keine Angabe'], ['sonstige', 'Behörde (Bezeichnung)'], ['gericht', 'Gericht (Code)'], ['finanzbehoerde', 'Finanzbehörde (Code)']],
      xml: 'instanzdaten/auswahl_instanzbehoerde'
    });
    if (v.behoerde.art === 'sonstige') h += feld({ pfad: 'verfahren.behoerde.text', label: 'Bezeichnung der Stelle', din: 'D', pflicht: true, b: 4, xml: '…/sonstige' });
    else if (v.behoerde.art === 'gericht') h += feld({ pfad: 'verfahren.behoerde.code', label: 'Gericht', art: 'code', liste: 'gds.gerichte', pflicht: true, b: 4, xml: '…/gericht' });
    else if (v.behoerde.art === 'finanzbehoerde') h += feld({ pfad: 'verfahren.behoerde.code', label: 'Finanzbehörde', art: 'code', liste: 'gds.finanzbehoerden', pflicht: true, b: 4, xml: '…/finanzbehoerde' });
    else h += '<div class="feld b4"></div>';
    h += feld({ pfad: 'verfahren.aktenzeichen', label: 'Aktenzeichen der Stelle', din: 'C', b: 4, xml: 'instanzdaten/aktenzeichen' });
    h += feld({ pfad: 'verfahren.gegenstand', label: 'Verfahrensgegenstand', din: 'C', b: 8, platzhalter: 'z. B. Vorkaufsrechtsanfrage Aberlestraße 34', xml: 'instanzdaten/verfahrensgegenstand/gegenstand' });
    return abschnitt('verfahren', 'Verfahren', 'grunddaten/verfahrensdaten', 'Optionale Angaben zum Verfahren bei der zuständigen Stelle.', '<div class="felder">' + h + '</div>');
  }

  function abschnittBeteiligte() {
    var nr = X.nummerierung(S);
    var karten = S.beteiligte.map(function (b, i) {
      var p = 'beteiligte.' + i;
      var rollenText = b.rollen.map(function (r) { return X.codeText(S, 'gds.rollenbezeichnung', r.code) || 'Rolle offen'; }).join(', ');
      var h = '<div class="gruppe" id="beteiligter-' + i + '"><div class="gruppe-kopf"><h3><span class="nummer" title="Beteiligtennummer">' + (i + 1) + '</span>' +
        esc(X.beteiligtenName(b) || 'Neuer Beteiligter') + '<span class="gruppe-sub">' + esc(rollenText) + '</span></h3>' +
        entfernenKnopf('beteiligte', i, 'Beteiligten') + '</div><div class="felder">';
      h += segment(p + '.art', [['person', 'Natürliche Person'], ['organisation', 'Organisation / Behörde']], 'Art des Beteiligten');
      b.rollen.forEach(function (r, j) {
        h += '<div class="feld b12"><div class="zeile" style="padding:0;border:0"><div class="felder">' +
          feld({ pfad: p + '.rollen.' + j + '.code', label: 'Rolle (Rollennummer ' + nr.rollen[r.id] + ')', art: 'code', liste: 'gds.rollenbezeichnung', haeufig: HAEUFIGE_ROLLEN, pflicht: true, neu: true, b: 12, xml: 'beteiligung/rolle/rollenbezeichnung' }) +
          '</div>' + (b.rollen.length > 1 ? entfernenKnopf(p + '.rollen', j, 'Rolle') : '<span></span>') + '</div></div>';
      });
      h += '<div class="feld b12">' + hinzufuegenKnopf(p + '.rollen', 'Weitere Rolle') + '</div>';
      if (b.art === 'organisation') {
        var xo = 'beteiligter/auswahl_beteiligter/organisation';
        h += feld({ pfad: p + '.organisation.bezeichnung', label: 'Bezeichnung', din: 'D', pflicht: true, neu: true, b: 8, xml: xo + '/bezeichnung/bezeichnung.aktuell' });
        h += feld({ pfad: p + '.organisation.kurzbezeichnung', label: 'Kurzbezeichnung', din: 'D', b: 4, xml: xo + '/kurzbezeichnung' });
        h += feld({ pfad: p + '.organisation.sitz', label: 'Sitz', din: 'B', b: 6, xml: xo + '/sitz/ort' });
        h += feld({ pfad: p + '.organisation.wirtschaftsId', label: 'Wirtschafts-Identifikationsnummer', din: 'C', mono: true, b: 6, xml: xo + '/bundeseinheitlicheWirtschaftsnummer' });
      } else {
        var xp = 'natuerlichePerson';
        h += feld({ pfad: p + '.person.titel', label: 'Titel', din: 'C', b: 2, xml: xp + '/vollerName/titel' });
        h += feld({ pfad: p + '.person.vorname', label: 'Vorname(n)', din: 'A', neu: true, b: 4, xml: xp + '/vollerName/vorname' });
        h += feld({ pfad: p + '.person.namensvorsatz', label: 'Namensvorsatz', din: 'A', b: 2, platzhalter: 'von, van …', xml: xp + '/vollerName/namensvorsatz' });
        h += feld({ pfad: p + '.person.nachname', label: 'Nachname', din: 'A', pflicht: true, neu: true, b: 4, xml: xp + '/vollerName/nachname' });
        h += feld({ pfad: p + '.person.geburtsname', label: 'Geburtsname', din: 'A', b: 4, xml: xp + '/vollerName/geburtsname' });
        h += feld({ pfad: p + '.person.geburtsdatum', label: 'Geburtsdatum', art: 'date', b: 4, xml: xp + '/geburt/geburtsdatum' });
        h += feld({ pfad: p + '.person.geburtsort', label: 'Geburtsort', din: 'B', b: 4, xml: xp + '/geburt/geburtsort/ort' });
        h += feld({ pfad: p + '.person.geschlecht', label: 'Geschlecht', art: 'code', liste: 'gds.geschlecht', b: 4, xml: xp + '/geschlecht' });
        h += feld({ pfad: p + '.person.familienstand', label: 'Familienstand', art: 'code', liste: 'gds.familienstand', b: 4, xml: xp + '/familienstand' });
        h += feld({ pfad: p + '.person.steuerId', label: 'Steuer-Identifikationsnummer', din: 'C', mono: true, b: 4, xml: xp + '/steueridentifikationsnummer', hilfe: 'Für Anzeigen an das Finanzamt (§ 20 GrEStG).' });
      }
      h += '</div><div class="unterkopf">Anschrift <code class="xml-pfad">…/anschrift</code></div><div class="felder">' + anschriftFelder(p + '.anschrift', true, 'anschrift') + '</div>';
      h += '<div class="unterkopf">Kommunikation <code class="xml-pfad">…/telekommunikation</code></div>';
      h += (b.kontakt || []).map(function (t, j) {
        return '<div class="zeile"><div class="felder">' +
          feld({ pfad: p + '.kontakt.' + j + '.art', label: 'Art', art: 'code', liste: 'gds.telekommunikationsart', pflicht: true, b: 4 }) +
          feld({ pfad: p + '.kontakt.' + j + '.verbindung', label: 'Verbindung', din: 'C', pflicht: true, b: 8 }) +
          '</div>' + entfernenKnopf(p + '.kontakt', j, 'Kommunikationsverbindung') + '</div>';
      }).join('');
      h += hinzufuegenKnopf(p + '.kontakt', 'Telefon, E-Mail oder Postfach') + '</div>';
      return h;
    }).join('');
    var knoepfe = '<div class="knopfreihe">' +
      hinzufuegenKnopf('beteiligte', 'Notar(in)', '208') + hinzufuegenKnopf('beteiligte', 'Veräußerer', '168') +
      hinzufuegenKnopf('beteiligte', 'Erwerber', '072') + hinzufuegenKnopf('beteiligte', 'Behörde', 'org:189') +
      hinzufuegenKnopf('beteiligte', 'Sonstige Beteiligte', '') + '</div>';
    return abschnitt('beteiligte', 'Beteiligte', 'grunddaten/verfahrensdaten/beteiligung',
      'Alle Personen und Stellen mit ihrer Rolle. Rollen- und Beteiligtennummern werden automatisch fortlaufend vergeben; andere Abschnitte verweisen darauf.',
      (karten || '<p class="leer-hinweis">Noch keine Beteiligten erfasst.</p>') + knoepfe);
  }

  function abschnittGegenstand() {
    if (S.nachricht === 'mitteilung') return '';
    var ersuchen = S.nachricht === 'ersuchen';
    var liste = ersuchen ? 'fach.ersuchen' : 'fach.entscheidungen';
    var cl = ersuchen ? 'enova.ersuchensachentscheidung' : 'enova.sachentscheidung';
    var eintraege = hole(S, liste);
    var h = eintraege.map(function (e, i) {
      var p = liste + '.' + i;
      var inner = feld({ pfad: p + '.code', label: ersuchen ? 'Gegenstand des Ersuchens' : 'Entscheidung', art: 'code', liste: cl, langText: true, pflicht: true, neu: true, b: 12, xml: (ersuchen ? 'ersuchenSachentscheidung/ersuchenSachentscheidung' : 'sachentscheidung/sachentscheidung') });
      var text = X.codeText(S, cl, e.code);
      if (text) inner += '<div class="feld b12"><div class="code-beschreibung">' + esc(text) + '</div></div>';
      inner += feld({ pfad: p + '.hinweise', label: 'Hinweise', art: 'textarea', din: 'C', b: 12, xml: '…/hinweise_sonstige' });
      if (!ersuchen) inner += rollenPillen(p + '.adressaten', 'Adressat der Entscheidung', '…/adressatDerSachentscheidung', 'Häufig nicht das Notariat, sondern ein Beteiligter (z. B. der Käufer).');
      return '<div class="zeile"><div class="felder">' + inner + '</div>' + (eintraege.length > 1 ? entfernenKnopf(liste, i, ersuchen ? 'Ersuchen' : 'Entscheidung') : '<span></span>') + '</div>';
    }).join('');
    var version = X.listenVersion(S, cl);
    return abschnitt('gegenstand', ersuchen ? 'Ersuchen' : 'Sachentscheidung', 'fachdaten/auswahl_GegenstandDerNachricht',
      (ersuchen ? 'Worum wird die Stelle ersucht? Mehrere Ersuchen in einer Nachricht sind möglich.' : 'Welche Entscheidung wird mitgeteilt?') +
      ' Werte aus der Codeliste <code>' + esc(X.liste(cl).name) + '</code> Version ' + esc(version) + ' (änderbar unter <a href="#codelisten">Codelisten</a>).',
      h + '<div class="knopfreihe">' + hinzufuegenKnopf(liste, ersuchen ? 'Weiteres Ersuchen' : 'Weitere Entscheidung') + '</div>');
  }

  function abschnittUrkunde() {
    var h = S.fach.urkunden.map(function (u, i) {
      var p = 'fach.urkunden.' + i;
      return '<div class="zeile"><div class="felder">' +
        feld({ pfad: p + '.urNr', label: 'UR-Nummer', din: 'C', b: 4, platzhalter: 'z. B. 1874/2026', xml: 'datenDerUrkunde/urNr' }) +
        feld({ pfad: p + '.datum', label: 'Urkundsdatum', art: 'date', b: 4, xml: 'datenDerUrkunde/urkundsdatum' }) +
        feld({ pfad: p + '.keineBeurkundung', label: 'keine Beurkundung', art: 'bool', b: 4, oben: true, xml: 'datenDerUrkunde/keineBeurkundung' }) +
        rollenPillen(p + '.personen', 'Urkundsperson', 'datenDerUrkunde/urkundsperson', 'In der Regel die Notarin oder der Notar (bzw. die Vertretung).') +
        '</div>' + (S.fach.urkunden.length > 1 ? entfernenKnopf('fach.urkunden', i, 'Urkunde') : '<span></span>') + '</div>';
    }).join('');
    return abschnitt('urkunde', 'Urkunde', 'fachdaten/datenDerUrkunde', 'Die zugrunde liegende notarielle Urkunde. Mindestens ein Eintrag ist Pflicht.',
      h + '<div class="knopfreihe">' + hinzufuegenKnopf('fach.urkunden', 'Weitere Urkunde') + '</div>');
  }

  function abschnittGrundbesitz() {
    var h = S.fach.rechte.map(function (r, i) {
      var p = 'fach.rechte.' + i;
      var titel = r.buchungsart === 'weg' ? 'Wohnungs- oder Teileigentum' : (r.buchungsart === 'keine' ? 'Recht ohne Buchungsangaben' : 'Grundstück');
      var lage = (r.flurstuecke || []).map(function (f) { return s(f.zaehler) ? 'Fl.-Nr. ' + s(f.zaehler) + (s(f.nenner) ? '/' + s(f.nenner) : '') : ''; }).filter(Boolean).join(', ');
      var g = '<div class="gruppe" id="recht-' + i + '"><div class="gruppe-kopf"><h3><span class="nummer">' + (i + 1) + '</span>' + esc(titel) +
        '<span class="gruppe-sub">' + esc([lage, s(r.anschrift.strasse) + ' ' + s(r.anschrift.hausnummer)].map(s).filter(Boolean).join(' · ')) + '</span></h3>' +
        entfernenKnopf('fach.rechte', i, 'Grundbesitz') + '</div><div class="felder">';
      g += segment(p + '.buchungsart', [['grundstueck', 'Grundstück'], ['weg', 'Wohnungs-/Teileigentum'], ['keine', 'ohne Buchungsangaben']], 'Buchungsstelle');
      if (r.buchungsart !== 'keine') {
        g += feld({ pfad: p + '.lfdNummer', label: 'Lfd. Nr. im Bestandsverzeichnis', din: 'C', b: 4, xml: 'buchungsstelle/lfdNummer' });
        g += feld({ pfad: p + '.zusatz', label: 'Zusatz zur Buchungsstelle', din: 'C', b: 8, xml: 'buchungsstelle/zusatz' });
      }
      g += '</div>';
      if (r.buchungsart !== 'keine') {
        g += '<div class="unterkopf">' + (r.buchungsart === 'weg' ? 'Flurstück(e) des aufgeteilten Grundstücks' : 'Flurstück(e)') + ' <code class="xml-pfad">…/grundstueck/flurstuecke</code></div>';
        g += r.flurstuecke.map(function (f, j) {
          var pf = p + '.flurstuecke.' + j;
          return '<div class="zeile"><div class="felder">' +
            feld({ pfad: pf + '.gemarkung', label: 'Gemarkungsschlüssel', din: 'C', pflicht: true, mono: true, b: 3, xml: 'identifikationFlurstueck/gemarkungsschluessel' }) +
            feld({ pfad: pf + '.flur', label: 'Flur', b: 2, zahl: true, xml: '…/flurnummer' }) +
            feld({ pfad: pf + '.zaehler', label: 'Flurstück', din: 'C', pflicht: true, neu: true, b: 2, platzhalter: 'Zähler', xml: '…/flurstuecksnummer/zaehler' }) +
            feld({ pfad: pf + '.nenner', label: 'Unternummer', din: 'C', neu: true, b: 2, platzhalter: 'Nenner', xml: '…/flurstuecksnummer/nenner' }) +
            feld({ pfad: pf + '.groesse', label: 'Größe in m²', din: 'C', b: 3, zahl: true, xml: 'flurstuecke/groesse' }) +
            feld({ pfad: pf + '.wirtschaftsart', label: 'Wirtschaftsart', art: 'code', liste: 'dabag.wirtschaftsart', pflicht: true, b: 5, xml: 'flurstuecke/wirtschaftsart' }) +
            feld({ pfad: pf + '.lage', label: 'Lage', din: 'B', pflicht: true, b: 7, platzhalter: 'Straße und Hausnummer oder Lagebezeichnung', xml: 'flurstuecke/lage' }) +
            '</div>' + (r.flurstuecke.length > 1 ? entfernenKnopf(p + '.flurstuecke', j, 'Flurstück') : '<span></span>') + '</div>';
        }).join('');
        g += hinzufuegenKnopf(p + '.flurstuecke', 'Flurstück');
      }
      if (r.buchungsart === 'weg') {
        var pw = p + '.weg';
        g += '<div class="unterkopf">Wohnungs- oder Teileigentum <code class="xml-pfad">…/wegEinheit</code></div><div class="felder">' +
          feld({ pfad: pw + '.anteilZaehler', label: 'Miteigentumsanteil (Zähler)', b: 3, zahl: true, xml: 'wegEinheit/anteil/…/zaehler' }) +
          feld({ pfad: pw + '.anteilNenner', label: 'Miteigentumsanteil (Nenner)', b: 3, zahl: true, xml: 'wegEinheit/anteil/…/nenner' }) +
          feld({ pfad: pw + '.aufteilungsgrund', label: 'Aufteilung', art: 'code', liste: 'dabag.aufteilungsgrund.weg', pflicht: true, b: 6, xml: 'wegEinheit/erwerbsgrundart' }) +
          feld({ pfad: pw + '.sondereigentumNr', label: 'Nr. laut Aufteilungsplan', din: 'C', b: 3, xml: 'sondereigentum/nummer' }) +
          feld({ pfad: pw + '.sondereigentumBez', label: 'Sondereigentum an', din: 'C', b: 9, platzhalter: 'z. B. Wohnung im 2. OG links mit Kellerabteil', xml: 'sondereigentum/bezeichnung' }) +
          feld({ pfad: pw + '.sondernutzungsrecht', label: 'Sondernutzungsrecht', din: 'C', b: 6, xml: 'wegEinheit/sondernutzungsrechtPauschal' }) +
          feld({ pfad: pw + '.veraeusserungsbeschraenkung', label: 'Veräußerungsbeschränkung', din: 'C', b: 6, platzhalter: 'z. B. Zustimmung des Verwalters (§ 12 WEG)', xml: 'wegEinheit/veraeusserungsbeschraenkung' }) +
          feld({ pfad: pw + '.stockwerkseigentum', label: 'Stockwerkseigentum', art: 'bool', b: 12, xml: 'wegEinheit/stockwerkseigentum' }) +
          '</div>';
      }
      g += '<div class="unterkopf">Grundbuch <code class="xml-pfad">…/bundeslandfremdesGrundbuchblatt</code></div><div class="felder">' +
        feld({ pfad: p + '.grundbuchart', label: 'Grundbuchart', art: 'code', liste: 'dabag.grundbuchart', b: 6, xml: 'beschreibungDesBetroffenenRechts/grundbuchart' }) + '</div>';
      g += r.blaetter.map(function (bl, j) {
        var pb = p + '.blaetter.' + j;
        return '<div class="zeile"><div class="felder">' +
          feld({ pfad: pb + '.amtsgericht', label: 'Amtsgericht', din: 'C', b: 4, platzhalter: 'z. B. München', xml: '…/amtsgericht' }) +
          feld({ pfad: pb + '.bezirk', label: 'Grundbuch von', din: 'C', b: 5, platzhalter: 'Grundbuchbezirk', xml: '…/grundbuchbezirk' }) +
          feld({ pfad: pb + '.blatt', label: 'Blatt', din: 'C', b: 3, xml: '…/grundbuchblatt' }) +
          '</div>' + (r.blaetter.length > 1 ? entfernenKnopf(p + '.blaetter', j, 'Grundbuchblatt') : '<span></span>') + '</div>';
      }).join('') + hinzufuegenKnopf(p + '.blaetter', 'Grundbuchblatt');
      g += '<div class="unterkopf">Lage des Grundbesitzes <code class="xml-pfad">…/anschrift</code></div><div class="felder">' + anschriftFelder(p + '.anschrift', false, 'anschrift') + '</div>';
      g += '<div class="unterkopf">Weitere Angaben <code class="xml-pfad">…/weitereAngabenZumGrundstueck</code></div><div class="felder">' +
        feld({ pfad: p + '.angaben.grundstuecksart', label: 'Grundstücksart', art: 'code', liste: 'enova.grundstuecksart', b: 5, xml: '…/grundstuecksart' }) +
        feld({ pfad: p + '.angaben.baujahr', label: 'Baujahr', b: 2, zahl: true, platzhalter: 'JJJJ', xml: '…/baujahr' }) +
        feld({ pfad: p + '.angaben.wohnflaeche', label: 'Wohnfläche in m²', b: 2, zahl: true, xml: '…/wohnflaeche' }) +
        feld({ pfad: p + '.angaben.teilflaeche', label: 'noch zu vermessende Teilfläche', art: 'bool', b: 3, oben: true, xml: '…/nochZuVermessendeTeilflaeche' }) +
        feld({ pfad: p + '.angaben.sonstiges', label: 'Sonstige Angaben', din: 'C', b: 12, xml: '…/sonstigeAngaben' }) +
        '</div></div>';
      return g;
    }).join('');
    return abschnitt('grundbesitz', 'Betroffener Grundbesitz', 'fachdaten/beschreibungDesBetroffenenRechts',
      'Grundstück, Wohnungseigentum oder sonstiges Recht, auf das sich die Nachricht bezieht – mit Flurstück, Grundbuchstelle und Lage.',
      (h || '<p class="leer-hinweis">Noch kein Grundbesitz erfasst.</p>') + '<div class="knopfreihe">' + hinzufuegenKnopf('fach.rechte', 'Grundbesitz') + '</div>');
  }

  function abschnittRechtsgeschaeft() {
    var rg = S.fach.rechtsgeschaeft;
    var h = '<div class="felder">' +
      feld({ pfad: 'fach.rechtsgeschaeft.art', label: 'Art des Rechtsgeschäfts', art: 'code', liste: 'enova.artdesrechtsgeschaefts', b: 4, xml: 'artDesRechtsgeschaefts/art' }) +
      feld({ pfad: 'fach.rechtsgeschaeft.freitext', label: 'Beschreibung', din: 'C', b: 8, platzhalter: 'z. B. Kaufvertrag über bebautes Grundstück', xml: 'artDesRechtsgeschaefts/freitext' }) +
      feld({ pfad: 'fach.rechtsgeschaeft.rechtswirksamkeit', label: 'Rechtswirksamkeit', art: 'select', b: 4, optionen: [['true', 'eingetreten'], ['false', 'noch nicht eingetreten']], xml: '…/rechtswirksamkeit' }) +
      feld({ pfad: 'fach.rechtsgeschaeft.datum', label: 'Datum der Rechtswirksamkeit', art: 'date', b: 4, xml: '…/datumDerRechtswirksamkeit' }) +
      feld({ pfad: 'fach.rechtsgeschaeft.genehmigendArt', label: 'Wirksamkeit hängt ab von', art: 'select', neu: true, b: 4, leer: 'keiner Genehmigung', optionen: [['beteiligter', 'Genehmigung eines Beteiligten'], ['dritter', 'Genehmigung einer anderen Stelle']], xml: '…/auswahl_genehmigendePerson' });
    if (rg.genehmigendArt === 'beteiligter') h += feld({ pfad: 'fach.rechtsgeschaeft.genehmigendRolle', label: 'Genehmigender Beteiligter', art: 'rolle', pflicht: true, b: 12, xml: '…/beteiligter' });
    if (rg.genehmigendArt === 'dritter') h += feld({ pfad: 'fach.rechtsgeschaeft.genehmigendDritter', label: 'Genehmigende Stelle oder Person', din: 'D', pflicht: true, b: 12, xml: '…/dritter' });
    if (S.nachricht !== 'mitteilung') h += feld({ pfad: 'fach.tagUebergabe', label: 'Tag der Übergabe (Besitz, Nutzen, Lasten)', art: 'date', b: 6, xml: 'fachdaten/tagUebergabe_Anteilsuebergang' });
    h += '</div>';
    h += '<div class="unterkopf">Gegenleistung <code class="xml-pfad">fachdaten/gegenleistung</code></div>';
    h += S.fach.gegenleistungen.map(function (g, i) {
      var p = 'fach.gegenleistungen.' + i;
      return '<div class="zeile"><div class="felder">' +
        feld({ pfad: p + '.art', label: 'Art', art: 'code', liste: 'enova.gegenleistung', b: 3, xml: 'artDerGegenleistung' }) +
        feld({ pfad: p + '.freitext', label: 'Beschreibung', din: 'C', b: 5, platzhalter: 'z. B. Kaufpreis', xml: 'freitext' }) +
        feld({ pfad: p + '.betrag', label: 'Betrag in EUR', b: 4, zahl: true, platzhalter: 'z. B. 450.000,00', xml: 'betrag/zahl' }) +
        '</div>' + entfernenKnopf('fach.gegenleistungen', i, 'Gegenleistung') + '</div>';
    }).join('') + hinzufuegenKnopf('fach.gegenleistungen', 'Gegenleistung');
    h += '<div class="unterkopf">Anteile von Erwerbern und Veräußerern <code class="xml-pfad">fachdaten/erwerber_veraeusserer</code></div>';
    h += S.fach.anteile.map(function (a, i) {
      var p = 'fach.anteile.' + i;
      return '<div class="zeile"><div class="felder">' +
        feld({ pfad: p + '.seite', label: 'Seite', art: 'select', ohneLeer: true, b: 3, optionen: [['erwerber', 'Erwerber'], ['veraeusserer', 'Veräußerer']], xml: 'auswahl_erwerber_veraeusserer' }) +
        feld({ pfad: p + '.rolle', label: 'Beteiligter', art: 'rolle', pflicht: true, b: 5, leer: '– bitte auswählen –' }) +
        feld({ pfad: p + '.zaehler', label: 'Anteil Zähler', b: 2, zahl: true, xml: '…/zaehler' }) +
        feld({ pfad: p + '.nenner', label: 'Nenner', b: 2, zahl: true, xml: '…/nenner' }) +
        feld({ pfad: p + '.sonstiges', label: 'oder Beschreibung des Anteils', din: 'C', b: 12, platzhalter: 'z. B. Alleineigentum', xml: '…/anteilSonstiges' }) +
        '</div>' + entfernenKnopf('fach.anteile', i, 'Anteil') + '</div>';
    }).join('') + hinzufuegenKnopf('fach.anteile', 'Anteil');
    return abschnitt('rechtsgeschaeft', 'Rechtsgeschäft und Gegenleistung', 'fachdaten/artDesRechtsgeschaefts',
      'Das zugrunde liegende Geschäft, Kaufpreis bzw. Gegenleistung und – bei mehreren Erwerbern oder Veräußerern – die Anteile.', h);
  }

  function abschnittMitteilung() {
    if (S.nachricht !== 'mitteilung') return '';
    var w = 'fach.wertangaben.';
    var h = '<div class="felder">' +
      feld({ pfad: w + 'verkehrswert', label: 'Verkehrswert (EUR)', b: 4, zahl: true, xml: 'wertangabenNachErbSTG/verkehrswert' }) +
      feld({ pfad: w + 'geschaeftswert', label: 'Geschäftswert (EUR)', b: 4, zahl: true, xml: '…/geschaeftswert' }) +
      feld({ pfad: w + 'notargebuehren', label: 'Notargebühren (EUR)', b: 4, zahl: true, xml: '…/hoeheDerNotargebuehren' }) +
      feld({ pfad: w + 'einheitswert', label: 'Letzter Einheitswert (EUR)', b: 4, zahl: true, xml: '…/letzterEinheitswert' }) +
      feld({ pfad: w + 'grundbesitzwert', label: 'Letzter Grundbesitzwert (EUR)', b: 4, zahl: true, xml: '…/letzterGrundbesitzwert' }) +
      feld({ pfad: w + 'valutastand', label: 'Übernommene Verbindlichkeiten (EUR)', b: 4, zahl: true, xml: '…/valutastandUebernommenerVerbindlichkeiten' }) +
      feld({ pfad: w + 'jahreswert', label: 'Jahreswert von Gegenleistungen (EUR)', b: 4, zahl: true, xml: '…/jahreswertGegenleistungen', hilfe: 'z. B. Nießbrauch oder Wohnrecht' }) +
      feld({ pfad: 'fach.grundDerUebersendung', label: 'Grund der Übersendung', art: 'code', liste: 'enova.grundderuebersendung', b: 8, xml: 'fachdaten/grundDerUebersendung' }) +
      '</div>';
    h += '<div class="unterkopf">Erbfall <code class="xml-pfad">fachdaten/angabenZumErbfallErblasser</code></div><div class="felder">' +
      feld({ pfad: 'fach.erbfall.erblasser', label: 'Erblasser(in)', art: 'rolle', b: 6, xml: '…/erblasser', hilfe: 'Nur bei Erwerb von Todes wegen.' }) +
      feld({ pfad: 'fach.erbfall.gueterstand', label: 'Güterstand', art: 'code', liste: 'enova.gueterstand', b: 6, xml: '…/gueterstand' }) + '</div>';
    h += S.fach.erbfall.verfuegungen.map(function (v, i) {
      var p = 'fach.erbfall.verfuegungen.' + i;
      return '<div class="zeile"><div class="felder">' +
        feld({ pfad: p + '.datum', label: 'Testament / Erbvertrag vom', art: 'date', pflicht: true, b: 6, xml: '…/testament.erbvertragVom' }) +
        feld({ pfad: p + '.eroeffnet', label: 'Eröffnet am', art: 'date', b: 6, xml: '…/eroeffnetAm' }) +
        '</div>' + entfernenKnopf('fach.erbfall.verfuegungen', i, 'Verfügung') + '</div>';
    }).join('') + hinzufuegenKnopf('fach.erbfall.verfuegungen', 'Verfügung von Todes wegen');
    h += '<div class="felder" style="margin-top:14px">' + feld({ pfad: 'fach.nachlass', label: 'Höhe und Zusammensetzung des Nachlasses', art: 'textarea', din: 'C', zeilen: 3, b: 12, xml: 'fachdaten/hoeheUndZusammensetzungDesNachlasses' }) + '</div>';
    return abschnitt('mitteilung', 'Angaben für das Finanzamt', 'fachdaten (2900004)',
      'Wertangaben nach dem ErbStG und Angaben zum Erbfall. Beträge können in deutscher Schreibweise eingegeben werden (z. B. 450.000,00).', h);
  }

  function abschnittAnlagen() {
    var h = S.dokumente.map(function (d, i) {
      var p = 'dokumente.' + i;
      return '<div class="zeile"><div class="felder">' +
        feld({ pfad: p + '.dateiname', label: 'Datei', din: 'C', pflicht: true, b: 6, knopf: { aktion: 'datei-waehlen', text: 'Auswählen …' }, xml: 'dokument/…/datei/dateiname' }) +
        feld({ pfad: p + '.signatur', label: 'Signaturdatei (optional)', din: 'C', b: 6, knopf: { aktion: 'datei-waehlen', text: 'Auswählen …' }, platzhalter: 'z. B. Urkunde.pdf.pkcs7', xml: '…/datei (bestandteil 003)' }) +
        feld({ pfad: p + '.klasse', label: 'Dokumentklasse', art: 'code', liste: 'gds.dokumentklasse', pflicht: true, b: 4, xml: '…/dokumentklasse' }) +
        feld({ pfad: p + '.typ', label: 'Dokumenttyp', art: 'code', liste: 'gds.dokumenttyp', b: 4, xml: '…/dokumententyp' }) +
        feld({ pfad: p + '.anzeigename', label: 'Anzeigename', din: 'C', b: 4, xml: '…/anzeigename' }) +
        '</div>' + entfernenKnopf('dokumente', i, 'Anlage') + '</div>';
    }).join('');
    return abschnitt('anlagen', 'Anlagen', 'schriftgutobjekte/dokument',
      'Dateien, die zusammen mit der <code>xjustiz_nachricht.xml</code> über beBPo bzw. EGVP versandt werden (z. B. die Urkunde). Hier werden nur die Metadaten erfasst; „Auswählen …“ übernimmt den Dateinamen, die Datei selbst wird nicht hochgeladen.',
      h + '<div class="knopfreihe">' + hinzufuegenKnopf('dokumente', 'Anlage') + '</div>');
  }

  function abschnittCodelisten() {
    var cl = window.ENOVA_CODELISTEN;
    var zeilen = Object.keys(cl).filter(function (id) { return cl[id].typ === 3; }).map(function (id) {
      var l = cl[id];
      var v = X.listenVersion(S, id);
      var versionen = Object.keys(l.versionen || {});
      var dlId = 'dl-versionen-' + id.replace(/\W/g, '_');
      var status;
      if (X.istVollstaendig(id, v)) status = (l.importiert || []).indexOf(v) >= 0 ? '<span class="etikett import">importiert</span>' : '<span class="etikett ok">vollständig</span>';
      else status = '<span class="etikett teil">Teilliste · ' + X.listenWerte(id, v).length + ' Werte</span>';
      return '<tr><td><strong>' + esc(l.name) + '</strong><br><code class="xml-pfad">' + esc(l.uri) + '</code></td>' +
        '<td><input type="text" id="' + idVon('versionen.' + id) + '" data-version="' + esc(id) + '" value="' + esc(v) + '" list="' + dlId + '" class="mono-eingabe" aria-label="Version ' + esc(l.name) + '" placeholder="Version">' +
        '<datalist id="' + dlId + '">' + versionen.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
        '<div class="meldung" data-meldung="versionen.' + esc(id) + '" hidden></div></td><td>' + status + '</td></tr>';
    }).join('');
    var h = '<div class="tabelle-rahmen"><table><thead><tr><th>Codeliste (Code-Typ 3)</th><th>listVersionID</th><th>Werte</th></tr></thead><tbody>' + zeilen + '</tbody></table></div>';
    h += '<div class="knopfreihe"><button type="button" class="knopf" data-aktion="oeffnen">Codeliste importieren (Genericode) …</button>' +
      (lies(SPEICHER_CL) && lies(SPEICHER_CL).length ? '<button type="button" class="knopf leise" data-aktion="codelisten-zuruecksetzen">Importierte Codelisten entfernen</button>' : '') + '</div>';
    h += '<div class="unterkopf">Herstellerinformation <code class="xml-pfad">nachrichtenkopf/herstellerinformation</code></div><div class="felder">' +
      feld({ pfad: 'hersteller.name', label: 'Produktname', din: 'D', pflicht: true, b: 5 }) +
      feld({ pfad: 'hersteller.hersteller', label: 'Hersteller', din: 'D', pflicht: true, b: 5 }) +
      feld({ pfad: 'hersteller.version', label: 'Version', din: 'C', pflicht: true, b: 2 }) + '</div>';
    return abschnitt('codelisten', 'Codelisten und Versionen', 'listURI / listVersionID',
      'Codelisten vom Typ 1 sind fest im Schema XJustiz 3.6.2 hinterlegt. Für Codelisten vom Typ 3 wird die Version in der Nachricht angegeben. Voreingestellt sind die Versionen, die in eNoVA-Nachrichten derzeit verwendet werden. Teillisten lassen sich vervollständigen: Codeliste im XRepository als <em>Genericode</em> herunterladen und hier importieren – sie bleibt in diesem Browser gespeichert.', h);
  }

  function abschnittExport() {
    return abschnitt('export', 'Prüfen und Exportieren', X.NACHRICHTEN[S.nachricht].element,
      'Die Nachricht wird fortlaufend gegen die Regeln von XJustiz 3.6.2 geprüft: Pflichtelemente, Datentypen, Codelisten und zulässige Zeichen nach DIN 91379. XML und PDF lassen sich herunterladen, sobald keine Fehler mehr bestehen.',
      '<div id="pruefergebnis"></div>' +
      '<div class="knopfreihe">' +
      '<button type="button" class="knopf primaer" data-aktion="xml">XML herunterladen</button>' +
      '<button type="button" class="knopf" data-aktion="pdf">PDF herunterladen</button>' +
      '<button type="button" class="knopf" data-aktion="entwurf">Entwurf sichern (.json)</button>' +
      (S.nachricht === 'ersuchen' ? '<button type="button" class="knopf leise" data-aktion="antwort">Antwort (Sachentscheidung) vorbereiten</button>' : '') +
      '</div>' +
      '<p class="hilfe" style="margin-top:12px">Die XML-Datei heißt <code>xjustiz_nachricht.xml</code> und wird zusammen mit den Anlagen über das besondere elektronische Behördenpostfach (beBPo), das Notarpostfach bzw. EGVP versandt.</p>' +
      '<details class="vorschau" id="vorschau"><summary>XML-Vorschau</summary><pre id="xml-vorschau" tabindex="0"></pre></details>');
  }

  // ---------------------------------------------------------------------------
  // Rendern
  // ---------------------------------------------------------------------------
  var renderAusstehend = false;
  var zeigerUnten = false;
  function renderSpaeter() {
    renderAusstehend = true;
    setTimeout(function () { if (renderAusstehend && !zeigerUnten) render(); }, 0);
  }

  function render() {
    renderAusstehend = false;
    var aktiv = document.activeElement;
    var fokusId = aktiv && aktiv.id && inhalt.contains(aktiv) ? aktiv.id : null;
    var auswahl = fokusId && typeof aktiv.selectionStart === 'number' ? [aktiv.selectionStart, aktiv.selectionEnd] : null;
    var vorschauOffen = document.getElementById('vorschau') && document.getElementById('vorschau').open;

    var bannerHtml = banner ? '<div class="banner ' + banner.art + '" role="status">' + banner.html + '</div>' : '';
    inhalt.innerHTML = bannerHtml + abschnittNachricht() + abschnittKopf() + abschnittVerfahren() + abschnittBeteiligte() +
      abschnittGegenstand() + abschnittUrkunde() + abschnittGrundbesitz() + abschnittRechtsgeschaeft() +
      abschnittMitteilung() + abschnittAnlagen() + abschnittCodelisten() + abschnittExport();

    if (vorschauOffen) document.getElementById('vorschau').open = true;
    renderNavigation();
    pruefen();
    if (fokusId) {
      var el = document.getElementById(fokusId);
      if (el) {
        el.focus({ preventScroll: true });
        if (auswahl && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(auswahl[0], auswahl[1]); } catch (e) { /* nicht unterstützt */ } }
      }
    }
    beobachteAbschnitte();
  }

  function renderNavigation() {
    document.getElementById('navigation').innerHTML = sichtbareAbschnitte().map(function (a) {
      return '<li><a href="#' + a.id + '" data-nav="' + a.id + '">' + esc(a.titel) + '<span class="zaehler" data-zaehler="' + a.id + '"></span></a></li>';
    }).join('');
  }

  var beobachter = null;
  function beobachteAbschnitte() {
    if (!('IntersectionObserver' in window)) return;
    if (beobachter) beobachter.disconnect();
    beobachter = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (e.isIntersecting) {
          document.querySelectorAll('.navigation a').forEach(function (a) { a.classList.toggle('aktiv', a.dataset.nav === e.target.id); });
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    inhalt.querySelectorAll('.abschnitt').forEach(function (a) { beobachter.observe(a); });
  }

  // ---------------------------------------------------------------------------
  // Prüfung und Anzeige
  // ---------------------------------------------------------------------------
  var pruefTimer = null;
  function pruefenSpaeter() { clearTimeout(pruefTimer); pruefTimer = setTimeout(pruefen, 250); }

  function pruefen() {
    pruefung = X.pruefe(S);
    inhalt.querySelectorAll('[data-meldung]').forEach(function (m) { m.hidden = true; m.textContent = ''; m.classList.remove('hinweis'); });
    inhalt.querySelectorAll('.hat-fehler, .hat-hinweis').forEach(function (f) { f.classList.remove('hat-fehler', 'hat-hinweis'); });
    inhalt.querySelectorAll('[data-meldung-bereich]').forEach(function (m) { m.hidden = true; m.innerHTML = ''; });

    var zaehler = {};
    function melden(p, art) {
      var bereich = bereichVon(p.pfad);
      zaehler[bereich] = zaehler[bereich] || { fehler: 0, hinweise: 0 };
      zaehler[bereich][art === 'fehler' ? 'fehler' : 'hinweise'] += 1;
      if (!(alleZeigen || beruehrt.has(p.pfad) || art === 'hinweis')) return;
      var m = inhalt.querySelector('[data-meldung="' + cssEsc(p.pfad) + '"]');
      if (m) {
        if (!m.hidden && art === 'hinweis') return;
        m.textContent = p.text;
        m.hidden = false;
        m.classList.toggle('hinweis', art === 'hinweis');
        var f = m.closest('.feld');
        if (f) f.classList.add(art === 'fehler' ? 'hat-fehler' : 'hat-hinweis');
      } else {
        var b = inhalt.querySelector('[data-meldung-bereich="' + bereich + '"]');
        if (b) {
          b.hidden = false;
          b.innerHTML += '<div class="' + (art === 'hinweis' ? 'meldung hinweis' : 'meldung') + '">' + esc(p.text) + '</div>';
        }
      }
    }
    pruefung.fehler.forEach(function (p) { melden(p, 'fehler'); });
    pruefung.hinweise.forEach(function (p) { melden(p, 'hinweis'); });

    document.querySelectorAll('[data-zaehler]').forEach(function (z) {
      var c = zaehler[z.dataset.zaehler];
      z.className = 'zaehler';
      if (c && c.fehler) { z.textContent = c.fehler; z.classList.add('fehler'); z.title = c.fehler + ' Fehler'; }
      else if (c && c.hinweise) { z.textContent = c.hinweise; z.classList.add('hinweis'); z.title = c.hinweise + ' Hinweise'; }
      else { z.textContent = ''; z.title = ''; }
    });

    var status = document.getElementById('status');
    var nf = pruefung.fehler.length, nh = pruefung.hinweise.length;
    status.className = 'status' + (nf ? ' fehler' : (nh ? ' hinweis' : ''));
    document.getElementById('status-text').innerHTML = nf
      ? '<button type="button" data-aktion="zu-fehlern">' + nf + ' ' + (nf === 1 ? 'Fehler verhindert' : 'Fehler verhindern') + ' den Export</button>' + (nh ? ' · ' + nh + ' Hinweis' + (nh === 1 ? '' : 'e') : '')
      : 'Nachricht ist vollständig nach XJustiz ' + X.XJUSTIZ_VERSION + (nh ? ' · <button type="button" data-aktion="zu-fehlern">' + nh + ' Hinweis' + (nh === 1 ? '' : 'e') + '</button>' : '');

    var ziel = document.getElementById('pruefergebnis');
    if (ziel) {
      var liste = pruefung.fehler.map(function (p) { return { p: p, art: 'fehler' }; }).concat(pruefung.hinweise.map(function (p) { return { p: p, art: 'hinweis' }; }));
      ziel.innerHTML = (nf
        ? '<div class="pruefstatus fehler"><div><strong>' + nf + ' Fehler</strong><span>Diese Angaben müssen korrigiert werden, damit eine schemakonforme XJustiz-Nachricht entsteht.</span></div></div>'
        : '<div class="pruefstatus ok"><div><strong>Bereit zum Export</strong><span>Alle Pflichtangaben, Datentypen und Codelisten entsprechen XJustiz ' + X.XJUSTIZ_VERSION + '.' + (nh ? ' Bitte die Hinweise prüfen.' : '') + '</span></div></div>') +
        (liste.length ? '<ul class="pruefliste">' + liste.map(function (e) {
          return '<li><span class="art ' + e.art + '">' + (e.art === 'fehler' ? 'Fehler' : 'Hinweis') + '</span><span>' + esc(e.p.text) + '</span>' +
            '<button type="button" class="knopf leise" data-aktion="springe" data-ziel="' + esc(e.p.pfad) + '">Zum Feld</button></li>';
        }).join('') + '</ul>' : '');
    }
    var vorschau = document.getElementById('vorschau');
    if (vorschau && vorschau.open) zeigeVorschau();
  }

  function zeigeVorschau() {
    var r = X.erzeugeXML(S, { erstellungszeitpunkt: exportZeit() });
    var t = r.xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    t = t.replace(/(&lt;\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)(\s*\/?&gt;)/g, function (m, a, name, attrs, ende) {
      return a + '<span class="x-tag">' + name + '</span>' + attrs.replace(/([\w:.-]+)="([^"]*)"/g, '<span class="x-attr">$1</span>="<span class="x-wert">$2</span>"') + ende;
    });
    document.getElementById('xml-vorschau').innerHTML = t;
  }

  function springe(pfad) {
    var el = document.getElementById(idVon(pfad));
    var ziel = el ? (el.closest('.feld') || el) : document.getElementById(bereichVon(pfad));
    if (!ziel) return;
    ziel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    if (el) setTimeout(function () { el.focus({ preventScroll: true }); }, 300);
  }

  function exportZeit() {
    var sig = JSON.stringify(S);
    if (!exportStempel || exportStempel.sig !== sig) exportStempel = { sig: sig, zeit: X.zeitstempel() };
    return exportStempel.zeit;
  }

  function exportBereit() {
    pruefen();
    if (pruefung.fehler.length) {
      alleZeigen = true;
      pruefen();
      toast(pruefung.fehler.length + ' Fehler verhindern den Export – bitte zuerst korrigieren.');
      springe(pruefung.fehler[0].pfad);
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Zustand ändern
  // ---------------------------------------------------------------------------
  var speicherTimer = null;
  function speichernSpaeter() { clearTimeout(speicherTimer); speicherTimer = setTimeout(function () { schreib(SPEICHER, S); }, 400); }

  function geaendert() { speichernSpaeter(); pruefenSpaeter(); }

  function bereinigeVerweise() {
    var gueltig = X.nummerierung(S).rollen;
    function ok(id) { return !!gueltig[id]; }
    ['absender', 'empfaenger'].forEach(function (k) { if (S.kopf[k].rolle && !ok(S.kopf[k].rolle)) S.kopf[k].rolle = ''; });
    S.fach.urkunden.forEach(function (u) { u.personen = (u.personen || []).filter(ok); });
    S.fach.entscheidungen.forEach(function (e) { e.adressaten = (e.adressaten || []).filter(ok); });
    if (S.fach.rechtsgeschaeft.genehmigendRolle && !ok(S.fach.rechtsgeschaeft.genehmigendRolle)) S.fach.rechtsgeschaeft.genehmigendRolle = '';
    S.fach.anteile.forEach(function (a) { if (a.rolle && !ok(a.rolle)) a.rolle = ''; });
    if (S.fach.erbfall.erblasser && !ok(S.fach.erbfall.erblasser)) S.fach.erbfall.erblasser = '';
  }

  function vorlage(liste, arg) {
    var letzter = liste.split('.').pop();
    switch (letzter) {
      case 'beteiligte': {
        var org = /^org:/.test(arg || '');
        var b = X.neuerBeteiligter(org ? arg.slice(4) : (arg || ''));
        if (org) b.art = 'organisation';
        return b;
      }
      case 'rollen': return { id: X.neueId('r'), code: '' };
      case 'kontakt': return { art: '007', verbindung: '' };
      case 'ersuchen': return { code: '', hinweise: '' };
      case 'entscheidungen': return { code: '', hinweise: '', adressaten: [] };
      case 'urkunden': return { urNr: '', datum: '', personen: [], keineBeurkundung: false };
      case 'rechte': return X.neuesRecht();
      case 'flurstuecke': return X.neuesFlurstueck();
      case 'blaetter': return { amtsgericht: '', bezirk: '', blatt: '' };
      case 'gegenleistungen': return { art: '', freitext: '', betrag: '' };
      case 'anteile': return { seite: 'erwerber', rolle: '', zaehler: '', nenner: '', sonstiges: '' };
      case 'verfuegungen': return { datum: '', eroeffnet: '' };
      case 'dokumente': return { id: X.uuid(), dateiname: '', signatur: '', klasse: '', typ: '', anzeigename: '' };
      default: throw new Error('Keine Vorlage für ' + liste);
    }
  }

  function uebernehmen(t, abgeschlossen) {
    var pfad = t.dataset.pfad;
    if (t.type === 'radio' && !t.checked) return;
    var v = t.type === 'checkbox' ? t.checked : t.value;
    if (abgeschlossen && t.dataset.din && typeof v === 'string') {
      var n = X.typografieAnpassen(v, t.dataset.din);
      if (n !== v) { v = n; t.value = n; toast('Typografische Zeichen wurden an DIN 91379 angepasst (z. B. „ “ → ").'); }
    }
    setze(S, pfad, v);
    if (abgeschlossen) beruehrt.add(pfad);
    if (t.dataset.liste) {
      var ct = inhalt.querySelector('[data-code-text="' + cssEsc(pfad) + '"]');
      if (ct) ct.textContent = X.codeText(S, t.dataset.liste, v);
    }
    geaendert();
  }

  function zustandLaden(z, bannerNeu) {
    S = z;
    beruehrt = new Set();
    alleZeigen = false;
    exportStempel = null;
    banner = bannerNeu || null;
    schreib(SPEICHER, S);
    render();
    window.scrollTo(0, 0);
  }

  function beispielBanner(titel) {
    return {
      art: 'info',
      html: '<p><strong>Beispieldaten geladen:</strong> ' + esc(titel) + '. Alle Namen und Daten sind fiktiv – zum Ausprobieren von Prüfung, XML- und PDF-Export.</p>' +
        '<div class="banner-knoepfe"><button type="button" class="knopf" data-aktion="leeren">Leeres Formular</button>' +
        '<button type="button" class="knopf leise" data-aktion="banner-zu">Ausblenden</button></div>'
    };
  }

  // ---------------------------------------------------------------------------
  // Dateien öffnen
  // ---------------------------------------------------------------------------
  function dateiVerarbeiten(name, text) {
    var t = text.replace(/^\uFEFF/, '').trim();
    if (t.charAt(0) === '{') {
      var z = JSON.parse(t);
      if (z.format !== 'enova-nachrichtenmaske') throw new Error('Die JSON-Datei ist kein Entwurf dieser Maske.');
      zustandLaden(z, { art: 'info', html: '<p><strong>Entwurf geöffnet:</strong> ' + esc(name) + '</p><div class="banner-knoepfe"><button type="button" class="knopf leise" data-aktion="banner-zu">Ausblenden</button></div>' });
      return;
    }
    if (/<(\w+:)?CodeList[\s>]/.test(t.slice(0, 2000))) {
      var eintrag = X.genericodeImportieren(t);
      X.codelisteUebernehmen(eintrag);
      var gespeichert = (lies(SPEICHER_CL) || []).filter(function (e) { return !(e.id === eintrag.id && e.version === eintrag.version); });
      gespeichert.push(eintrag);
      schreib(SPEICHER_CL, gespeichert);
      S.versionen[eintrag.id] = eintrag.version;
      render();
      toast('Codeliste ' + X.liste(eintrag.id).name + ' ' + eintrag.version + ' importiert (' + eintrag.werte.length + ' Werte).');
      return;
    }
    var r = X.leseXML(t);
    var info = X.NACHRICHTEN[r.zustand.nachricht];
    var html = '<p><strong>Nachricht geöffnet:</strong> ' + esc(info.titel) + ' (' + esc(info.element) + ') von ' +
      esc(r.zustand.kopf.absender.kp.text || r.zustand.kopf.absender.kp.code || 'unbekanntem Absender') +
      (r.herkunft.name ? ', erstellt mit ' + esc(r.herkunft.name + ' ' + r.herkunft.version) : '') + '.';
    if (r.nichtUebernommen.length) {
      html += ' Einige Angaben werden von dieser Maske nicht bearbeitet und fehlen beim erneuten Export:<ul>' +
        r.nichtUebernommen.slice(0, 12).map(function (p) { return '<li><code>' + esc(p) + '</code></li>'; }).join('') +
        (r.nichtUebernommen.length > 12 ? '<li>… und ' + (r.nichtUebernommen.length - 12) + ' weitere</li>' : '') + '</ul>';
    }
    html += '</p><div class="banner-knoepfe">' +
      (r.zustand.nachricht === 'ersuchen' ? '<button type="button" class="knopf primaer" data-aktion="antwort">Antwort (Sachentscheidung) vorbereiten</button>' : '') +
      '<button type="button" class="knopf leise" data-aktion="banner-zu">Ausblenden</button></div>';
    r.zustand.hersteller = S && S.hersteller ? S.hersteller : r.zustand.hersteller;
    zustandLaden(r.zustand, { art: r.nichtUebernommen.length ? 'warnung' : 'info', html: html });
  }

  function dateienLesen(dateien) {
    Array.prototype.forEach.call(dateien, function (datei) {
      var leser = new FileReader();
      leser.onload = function () {
        try { dateiVerarbeiten(datei.name, String(leser.result)); }
        catch (e) { toast(datei.name + ': ' + e.message); }
      };
      leser.onerror = function () { toast(datei.name + ' konnte nicht gelesen werden.'); };
      leser.readAsText(datei, 'utf-8');
    });
  }

  // ---------------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------------
  function aktion(knopf) {
    var a = knopf.dataset.aktion;
    switch (a) {
      case 'hinzufuegen': {
        var liste = knopf.dataset.liste;
        hole(S, liste).push(vorlage(liste, knopf.dataset.vorlage));
        geaendert();
        render();
        var neu = hole(S, liste).length - 1;
        var erstes = inhalt.querySelector('[data-pfad^="' + cssEsc(liste + '.' + neu + '.') + '"]:not([type="radio"])');
        if (erstes) { erstes.focus({ preventScroll: true }); erstes.scrollIntoView({ block: 'center' }); }
        break;
      }
      case 'entfernen': {
        hole(S, knopf.dataset.liste).splice(Number(knopf.dataset.index), 1);
        bereinigeVerweise();
        geaendert();
        render();
        break;
      }
      case 'neue-id':
        setze(S, knopf.dataset.ziel, X.uuid());
        geaendert();
        render();
        break;
      case 'datei-waehlen':
        dateiZiel = knopf.dataset.ziel;
        document.getElementById('datei-name').click();
        break;
      case 'oeffnen':
        document.getElementById('datei-oeffnen').click();
        break;
      case 'neu':
        bestaetigen('Neue Nachricht beginnen?', 'Alle Eingaben dieser Nachricht werden verworfen. Importierte Codelisten bleiben erhalten.', 'Neu beginnen', function () {
          zustandLaden(X.neuerZustand(S.nachricht));
        });
        break;
      case 'leeren':
        zustandLaden(X.neuerZustand(S.nachricht));
        break;
      case 'banner-zu':
        banner = null;
        render();
        break;
      case 'antwort':
        bestaetigen('Antwort vorbereiten?', 'Aus diesem Ersuchen wird eine Sachentscheidung: Absender und Empfänger werden getauscht und die Nachrichten-ID des Ersuchens als Bezug übernommen.', 'Antwort vorbereiten', function () {
          zustandLaden(X.antwortAuf(S), { art: 'info', html: '<p><strong>Antwort vorbereitet.</strong> Bitte die Entscheidung auswählen, das eigene Aktenzeichen ergänzen und den Bescheid als Anlage verzeichnen.</p><div class="banner-knoepfe"><button type="button" class="knopf leise" data-aktion="banner-zu">Ausblenden</button></div>' });
          springe('fach.entscheidungen.0.code');
        });
        break;
      case 'codelisten-zuruecksetzen':
        schreib(SPEICHER_CL, []);
        toast('Importierte Codelisten entfernt. Die Seite wird neu geladen.');
        setTimeout(function () { location.reload(); }, 900);
        break;
      case 'springe':
        springe(knopf.dataset.ziel);
        break;
      case 'zu-fehlern':
        alleZeigen = true;
        pruefen();
        document.getElementById('export').scrollIntoView({ block: 'start' });
        break;
      case 'xml': {
        if (!exportBereit()) return;
        var r = X.erzeugeXML(S, { erstellungszeitpunkt: exportZeit() });
        herunterladen(r.xml, 'xjustiz_nachricht.xml', 'application/xml;charset=utf-8');
        toast('xjustiz_nachricht.xml wurde erstellt.');
        break;
      }
      case 'pdf': {
        if (!exportBereit()) return;
        try {
          var doc = P.erzeuge(S, { erstellungszeitpunkt: exportZeit() });
          var name = P.dateiname(S);
          herunterladen(doc.output('blob'), name, 'application/pdf');
          toast(name + ' wurde erstellt.');
        } catch (e) {
          toast('PDF konnte nicht erstellt werden: ' + e.message);
        }
        break;
      }
      case 'entwurf': {
        var d = new Date();
        herunterladen(JSON.stringify(S, null, 1), 'eNoVA-Entwurf_' + d.toISOString().slice(0, 10) + '.json', 'application/json');
        toast('Entwurf gesichert. Über „Datei öffnen“ lässt er sich wieder laden.');
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Ereignisse
  // ---------------------------------------------------------------------------
  function ereignisse() {
    inhalt.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.pfad && t.type !== 'checkbox' && t.type !== 'radio') uebernehmen(t, false);
    });
    inhalt.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.mehrfach) {
        var liste = hole(S, t.dataset.mehrfach);
        var i = liste.indexOf(t.value);
        if (t.checked && i < 0) liste.push(t.value);
        if (!t.checked && i >= 0) liste.splice(i, 1);
        beruehrt.add(t.dataset.mehrfach);
        geaendert();
        return;
      }
      if (t.dataset.version) {
        S.versionen[t.dataset.version] = t.value.trim();
        geaendert();
        renderSpaeter();
        return;
      }
      if (t.dataset.pfad) {
        uebernehmen(t, true);
        if (t.dataset.neu) renderSpaeter();
      }
    });
    // Neu zeichnen erst, wenn der Fokus gewechselt hat und keine Maustaste gedrückt ist –
    // sonst ginge ein Klick auf einen Knopf verloren, der gerade ersetzt wird.
    document.addEventListener('pointerdown', function () { zeigerUnten = true; }, true);
    document.addEventListener('pointerup', function () {
      zeigerUnten = false;
      setTimeout(function () { if (renderAusstehend) render(); }, 0);
    }, true);
    inhalt.addEventListener('focusout', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.pfad && !beruehrt.has(t.dataset.pfad)) { beruehrt.add(t.dataset.pfad); pruefenSpaeter(); }
    });
    document.addEventListener('click', function (e) {
      var k = e.target.closest('[data-aktion]');
      if (k) { e.preventDefault(); aktion(k); }
    });
    document.getElementById('datei-oeffnen').addEventListener('change', function (e) {
      dateienLesen(e.target.files);
      e.target.value = '';
    });
    document.getElementById('datei-name').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (f && dateiZiel) {
        setze(S, dateiZiel, X.typografieAnpassen(f.name, 'C'));
        beruehrt.add(dateiZiel);
        geaendert();
        render();
      }
      e.target.value = '';
    });
    var beispielWahl = document.getElementById('beispiel-wahl');
    beispielWahl.innerHTML += Object.keys(B).map(function (k) { return '<option value="' + k + '">' + esc(B[k].titel) + '</option>'; }).join('');
    beispielWahl.addEventListener('change', function () {
      var k = beispielWahl.value;
      beispielWahl.value = '';
      if (!k) return;
      bestaetigen('Beispiel laden?', 'Die aktuellen Eingaben werden durch das Beispiel „' + B[k].titel + '“ ersetzt.', 'Beispiel laden', function () {
        zustandLaden(B[k].erzeugen(), beispielBanner(B[k].titel));
      });
    });
    var dialog = document.getElementById('bestaetigung');
    dialog.addEventListener('click', function (e) {
      var k = e.target.closest('[data-dialog]');
      if (!k) return;
      dialog.close();
      if (k.dataset.dialog === 'ja' && dialog._aktion) dialog._aktion();
      dialog._aktion = null;
    });
    var xmlNamen = document.getElementById('xml-namen');
    var ansicht = lies(SPEICHER_ANSICHT) || {};
    if (ansicht.xmlNamen === false) { xmlNamen.checked = false; document.body.classList.add('ohne-xml'); }
    xmlNamen.addEventListener('change', function () {
      document.body.classList.toggle('ohne-xml', !xmlNamen.checked);
      schreib(SPEICHER_ANSICHT, { xmlNamen: xmlNamen.checked });
    });
    document.addEventListener('toggle', function (e) { if (e.target.id === 'vorschau' && e.target.open) zeigeVorschau(); }, true);
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) dateienLesen(e.dataTransfer.files);
    });
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  function start() {
    (lies(SPEICHER_CL) || []).forEach(function (e) {
      try { X.codelisteUebernehmen(e); } catch (err) { /* Liste wird nicht mehr verwendet */ }
    });
    ereignisse();
    var entwurf = lies(SPEICHER);
    if (entwurf && entwurf.format === 'enova-nachrichtenmaske' && entwurf.kopf) {
      S = entwurf;
      var basis = X.neuerZustand(S.nachricht);
      Object.keys(basis.versionen).forEach(function (k) { if (!(k in S.versionen)) S.versionen[k] = basis.versionen[k]; });
      banner = { art: 'info', html: '<p><strong>Entwurf wiederhergestellt.</strong> Die zuletzt bearbeitete Nachricht wurde aus dem Zwischenspeicher dieses Browsers geladen.</p><div class="banner-knoepfe"><button type="button" class="knopf" data-aktion="neu">Neue Nachricht</button><button type="button" class="knopf leise" data-aktion="banner-zu">Ausblenden</button></div>' };
    } else {
      S = B.ersuchen.erzeugen();
      banner = beispielBanner(B.ersuchen.titel);
    }
    render();
  }

  window.EnovaApp = { zustand: function () { return S; }, pruefung: function () { return pruefung; } };
  start();
})();
