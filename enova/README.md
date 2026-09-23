# eNoVA-Nachrichtenmaske

HTML-Maske zum Erstellen von XJustiz-Nachrichten für den **elektronischen Notar-Verwaltungs-Austausch (eNoVA)**
nach dem eNoVA-Gesetz (Gesetz zur Digitalisierung des Vollzugs von Immobilienverträgen, der gerichtlichen
Genehmigungen von notariellen Rechtsgeschäften und der steuerlichen Anzeigen der Notare).

Die Daten werden in einer Formularmaske erfasst, fortlaufend gegen die Regeln von **XJustiz 3.6.2** geprüft und
anschließend als **`xjustiz_nachricht.xml`** oder als **PDF** heruntergeladen. Alles läuft lokal im Browser – ohne
Server, ohne CDN, ohne Übertragung von Daten.

## Starten

`enova/index.html` im Browser öffnen (Doppelklick genügt). Alternativ über einen beliebigen Webserver, z. B.:

```sh
npx http-server enova
```

Beim ersten Öffnen ist ein fiktives Beispiel (Vorkaufsrechtsanfrage) geladen. „Neue Nachricht“ leert das Formular.

## Grundlage: XJustiz 3.6.2, Fachmodul DABAG

| | |
| --- | --- |
| Standard | XJustiz **3.6.2** (gültig vom 30.04.2026 bis 30.04.2027) |
| Schema | `xsd/3.6.2/xjustiz_2900_dabag_3_2.xsd` (Fachmodul DABAG 3.2) samt Grunddatensatz 3.6 und Codelisten |
| Nachrichten | `nachricht.enova.entscheidung.2900003`, `nachricht.enova.mitteilung.2900004` |
| Zeichensatz | DIN 91379 (Datentypen A–E), exakt aus `din-norm-91379-datatypes.xsd` übernommen |

Die Reihenfolge und Pflichtigkeit aller Elemente folgt den `xs:sequence`-Definitionen dieser Schemata. Jede
Nachricht, die die Maske ausgibt, ist in den automatischen Tests gegen das offizielle XSD validiert (siehe unten).

> **Ausblick:** XJustiz 4.1.0 ist veröffentlicht und wird zum **30.04.2027** für eNoVA (Fachmodul DABAG) verbindlich.
> Bis dahin gilt 3.6.2. Für den Umstieg sind die Schemata unter `xsd/` zu ersetzen und der Generator
> (`js/xjustiz.js`) an die Änderungen des Fachmoduls anzupassen; die Tests zeigen dabei jede Abweichung an.

## Nachrichtenarten

| Nachrichtenart | XJustiz-Nachricht | Typische Verwendung |
| --- | --- | --- |
| **Ersuchen um Sachentscheidung** | `nachricht.enova.entscheidung.2900003` mit `ersuchenSachentscheidung` | Notar an Gemeinde, Genehmigungsbehörde oder Gericht: Vorkaufsrechtsanfrage (§§ 24 ff. BauGB), Genehmigungen nach BauGB, GrdstVG, GVO, familien-, betreuungs-, nachlassgerichtliche Genehmigung, Rechtskraftzeugnis, Unbedenklichkeitsbescheinigung |
| **Sachentscheidung** | `nachricht.enova.entscheidung.2900003` mit `sachentscheidung` | Antwort der Behörde bzw. des Gerichts an den Notar (z. B. Negativzeugnis, Verzicht, Genehmigung) |
| **Mitteilung** | `nachricht.enova.mitteilung.2900004` | Notar an Finanzamt (Grunderwerbsteuer, Erbschaft-/Schenkungsteuer) oder Gutachterausschuss |

Für Behörden: Ein eingegangenes Ersuchen (`xjustiz_nachricht.xml`) über **Datei öffnen** laden und
**Antwort (Sachentscheidung) vorbereiten** wählen. Absender und Empfänger werden getauscht, die Nachrichten-ID des
Ersuchens wird als Bezug (`fremdeNachrichtenID`) übernommen.

## Was die Maske kann

- Erfassung aller Angaben der beiden eNoVA-Nachrichten: Nachrichtenkopf, Beteiligte mit Rollen, Ersuchen bzw.
  Sachentscheidungen, Urkunde, betroffener Grundbesitz (Grundstück oder Wohnungs-/Teileigentum mit Flurstücken,
  Grundbuchblatt, Lage), Rechtsgeschäft, Gegenleistung, Erwerber-/Veräußereranteile, Wertangaben nach ErbStG,
  Erbfall, Anlagen.
- Fortlaufende Prüfung: Pflichtelemente, Datentypen (Datum, Jahr, Zahl, UUID), Codelisten, Verweise auf Beteiligte
  und zulässige Zeichen nach DIN 91379. XML und PDF lassen sich erst herunterladen, wenn keine Fehler mehr bestehen.
- Typografische Zeichen aus Textverarbeitungen („ “ – …), die in XJustiz-Feldern unzulässig sind, werden beim
  Verlassen des Feldes automatisch ersetzt.
- Deutsche Zahlenschreibweise (`450.000,00`) wird korrekt als `xs:double` geschrieben.
- Rollen- und Beteiligtennummern werden automatisch vergeben; Verweise (`ref.rollennummer`) zeigen stets auf die
  Rollennummer, wie im Grunddatensatz vorgesehen.
- **XML-Download** als `xjustiz_nachricht.xml`, **PDF-Download** als lesbare Darstellung derselben Nachricht
  (gleiche Nachrichten-ID und gleicher Erstellungszeitpunkt).
- **Import** vorhandener eNoVA-Nachrichten (2900003/2900004, z. B. aus XNotar) mit Hinweis auf Angaben, die die
  Maske nicht bearbeitet.
- Entwurf wird im Browser zwischengespeichert; zusätzlich als `.json` sicherbar.
- XML-Vorschau und – abschaltbar – die XML-Elementnamen unter jedem Feld.

## Codelisten

- **Code-Typ 1** (Version fest im Schema): Anschriftstyp, Telekommunikationsart, Geschlecht, Familienstand,
  Bestandteiltyp, Wirtschaftsart, Grundbuchart, Aufteilungsgrund WEG – direkt aus den XSD erzeugt, vollständig.
- **Code-Typ 3** (Version wird in der Nachricht angegeben): voreingestellt sind die Versionen, die in
  eNoVA-Nachrichten derzeit verwendet werden. Vollständig enthalten sind `GDS.Rollenbezeichnung` (3.5, 3.6),
  `ENOVA.ErsuchenSachentscheidung` (1.0, 1.1), `ENOVA.Sachentscheidung` (1.0, 1.1) und die Bundesländer.
  Für `ENOVA.Grundstuecksart`, `ENOVA.ArtDesRechtsgeschaefts`, `ENOVA.Gegenleistung`,
  `ENOVA.GrundDerUebersendung`, `ENOVA.Gueterstand`, `GDS.Dokumentklasse`, `GDS.Dokumenttyp`, `BfJ.Staat`,
  `GDS.Gerichte`, `GDS.Finanzbehoerden` und die Währung liegen nur einzelne belegte Werte vor. Diese Felder
  akzeptieren jeden Code; die offizielle Liste lässt sich im **XRepository** als *Genericode* herunterladen und über
  **Datei öffnen** (oder im Abschnitt „Codelisten“) importieren. Danach erscheint eine vollständige Auswahlliste.

Versionen können im Abschnitt „Codelisten“ geändert werden, z. B. auf `ENOVA.Sachentscheidung 1.1`.

## Aufbau

```
enova/
├── index.html                 Maske
├── css/app.css                Gestaltung (hell/dunkel, ohne externe Schriften)
├── js/xjustiz.js              Datenmodell, Prüfung, XML-Erzeugung, XML-Import, Genericode-Import
├── js/pdf.js                  PDF-Ausgabe (jsPDF + AutoTable)
├── js/app.js                  Bedienoberfläche
├── js/beispiele.js            fiktive Beispieldaten
├── js/codelisten.js           Codelisten (erzeugt)
├── js/din91379.js             Zeichenprüfung DIN 91379 (erzeugt)
├── beispiele/*.xml            erzeugte Beispielnachrichten (XSD-valide)
├── codelisten/genericode/     Quellen der Typ-3-Codelisten
├── xsd/3.6.2/                 offizielle XJustiz-Schemata
├── tools/generiere_daten.py   erzeugt codelisten.js und din91379.js aus XSD und Genericode
├── tests/                     XSD-Validierung und Browser-Test
└── vendor/                    jsPDF, AutoTable, Schrift (siehe vendor/LIZENZEN.md)
```

## Tests

```sh
node enova/tests/xsd-validierung.test.js   # Nachrichten gegen das XSD prüfen (benötigt xmllint)
node enova/tests/oberflaeche.test.js       # Bedienung im Browser (benötigt Playwright + Chromium)
python3 enova/tools/generiere_daten.py     # Codelisten und Zeichenprüfung neu erzeugen (benötigt lxml)
```

`xsd-validierung.test.js` erzeugt Beispiel-, Minimal- und Maximalnachrichten aller drei Nachrichtenarten und
validiert sie mit `xmllint` gegen `xjustiz_2900_dabag_3_2.xsd`; außerdem wird geprüft, dass fehlerhafte Eingaben
erkannt werden. `oberflaeche.test.js` bedient die Seite in Chromium, lädt XML und PDF herunter, validiert die XML,
liest sie wieder ein und prüft Antwort-Erstellung, Fehleranzeige, Zeichenersetzung und die mobile Darstellung.

## Grenzen

- Nicht als Eingabe vorgesehen sind seltene Strukturen des Grunddatensatzes und des Fachmoduls, z. B. Erbbaurecht,
  Nutzungsrecht und Miteigentum nach § 3 Abs. 4 GBO als Buchungsstelle, Registereintragungen, Staatsangehörigkeit,
  Ausweisdokumente oder Bankverbindungen. Beim Import werden solche Angaben aufgelistet.
- Die Maske erzeugt die Nachricht; den Versand (beBPo, Notarpostfach, EGVP) und eine ggf. erforderliche qualifizierte
  elektronische Signatur übernimmt die jeweilige Postfach-Software.
- Anlagen werden nur mit ihren Metadaten verzeichnet und sind beim Versand gemeinsam mit der XML-Datei beizufügen.
