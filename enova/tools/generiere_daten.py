#!/usr/bin/env python3
"""Erzeugt js/codelisten.js und js/din91379.js aus den offiziellen Quellen.

Quellen (im Repository abgelegt):
  * xsd/3.6.2/*.xsd                 – XJustiz 3.6.2 (Codelisten vom Code-Typ 1 stehen als
                                      Enumeration direkt im Schema, DIN 91379 als Pattern)
  * codelisten/genericode/*.xml     – Codelisten vom Code-Typ 3 im Genericode-Format (XRepository)

Aufruf:  python3 enova/tools/generiere_daten.py
Benötigt: lxml  (pip install lxml)
"""
import glob
import json
import os
import re
from lxml import etree

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XSD = os.path.join(BASIS, "xsd", "3.6.2")
GC = os.path.join(BASIS, "codelisten", "genericode")
NS = {"xs": "http://www.w3.org/2001/XMLSchema"}

# ---------------------------------------------------------------------------
# Codelisten vom Code-Typ 1 (Werte und Version fest im XSD)
# ---------------------------------------------------------------------------
TYP1 = {
    "gds.anschriftstyp": "Code.GDS.Anschriftstyp",
    "gds.telekommunikationsart": "Code.GDS.Telekommunikationsart",
    "gds.geschlecht": "Code.GDS.Geschlecht",
    "gds.familienstand": "Code.GDS.Familienstand",
    "gds.bestandteiltyp": "Code.GDS.Bestandteiltyp",
    "dabag.wirtschaftsart": "Code.DABAG.Wirtschaftsart",
    "dabag.grundbuchart": "Code.DABAG.Grundbuchart",
    "dabag.aufteilungsgrund.weg": "Code.DABAG.Aufteilungsgrund.WEG",
}

# ---------------------------------------------------------------------------
# Codelisten vom Code-Typ 3 (Version wird in der Nachricht angegeben)
#   vollstaendig=True  -> Werte stammen aus der offiziellen Genericode-Datei
#   vollstaendig=False -> nur einzelne belegte Werte bekannt; weitere Werte können
#                         über den Genericode-Import der Seite nachgeladen werden
# ---------------------------------------------------------------------------
TYP3 = {
    "gds.rollenbezeichnung": {
        "name": "GDS.Rollenbezeichnung",
        "uri": "urn:xoev-de:xjustiz:codeliste:gds.rollenbezeichnung",
        "standardVersion": "3.5",
        "genericode": ["GDS.Rollenbezeichnung-3.5.xml", "GDS.Rollenbezeichnung-3.6.xml"],
    },
    "enova.ersuchensachentscheidung": {
        "name": "ENOVA.ErsuchenSachentscheidung",
        "uri": "urn:xoev-de:xjustiz:codeliste:enova.ersuchensachentscheidung",
        "standardVersion": "1.0",
        "genericode": ["ENOVA.ErsuchenSachentscheidung-1.0.xml", "ENOVA.ErsuchenSachentscheidung-1.1.xml"],
    },
    "enova.sachentscheidung": {
        "name": "ENOVA.Sachentscheidung",
        "uri": "urn:xoev-de:xjustiz:codeliste:enova.sachentscheidung",
        "standardVersion": "1.0",
        "genericode": ["ENOVA.Sachentscheidung-1.0.xml", "ENOVA.Sachentscheidung-1.1.xml"],
    },
    "gds.bundesland": {
        "name": "Bundesland (Destatis)",
        "uri": "urn:de:bund:destatis:bevoelkerungsstatistik:schluessel:bundesland",
        "standardVersion": "2010-04-01",
        "werte": {"2010-04-01": [
            ["01", "Schleswig-Holstein"], ["02", "Hamburg"], ["03", "Niedersachsen"],
            ["04", "Bremen"], ["05", "Nordrhein-Westfalen"], ["06", "Hessen"],
            ["07", "Rheinland-Pfalz"], ["08", "Baden-Württemberg"], ["09", "Bayern"],
            ["10", "Saarland"], ["11", "Berlin"], ["12", "Brandenburg"],
            ["13", "Mecklenburg-Vorpommern"], ["14", "Sachsen"], ["15", "Sachsen-Anhalt"],
            ["16", "Thüringen"]]},
        "vollstaendig": True,
    },
    "enova.grundstuecksart": {
        "name": "ENOVA.Grundstuecksart",
        "uri": "urn:xoev-de:xjustiz:codeliste:enova.grundstuecksart",
        "standardVersion": "1.1",
        "werte": {"1.1": [["002", "Bebaut"], ["003", "Wohngebäude"]]},
        "vollstaendig": False,
    },
    "enova.artdesrechtsgeschaefts": {
        "name": "ENOVA.ArtDesRechtsgeschaefts",
        "uri": "urn:xoev-de:xjustiz:codeliste:enova.artdesrechtsgeschaefts",
        "standardVersion": "", "werte": {}, "vollstaendig": False,
    },
    "enova.gegenleistung": {
        "name": "ENOVA.Gegenleistung",
        "uri": "urn:xoev-de:xjustiz:codeliste:enova.gegenleistung",
        "standardVersion": "", "werte": {}, "vollstaendig": False,
    },
    "enova.grundderuebersendung": {
        "name": "ENOVA.GrundDerUebersendung",
        "uri": "urn:xoev-de:xjustiz:codeliste:enova.grundderuebersendung",
        "standardVersion": "", "werte": {}, "vollstaendig": False,
    },
    "enova.gueterstand": {
        "name": "ENOVA.Gueterstand",
        "uri": "urn:xoev-de:xjustiz:codeliste:enova.gueterstand",
        "standardVersion": "", "werte": {}, "vollstaendig": False,
    },
    "gds.dokumentklasse": {
        "name": "GDS.Dokumentklasse",
        "uri": "urn:xoev-de:xjustiz:codeliste:gds.dokumentklasse",
        "standardVersion": "1.3",
        "werte": {"1.3": [["015", "Schreiben"]]},
        "vollstaendig": False,
    },
    "gds.dokumenttyp": {
        "name": "GDS.Dokumenttyp",
        "uri": "urn:xoev-de:xjustiz:codeliste:gds.dokumenttyp",
        "standardVersion": "4.1",
        "werte": {"4.1": [["102", "Erwerbsurkunde"]]},
        "vollstaendig": False,
    },
    "gds.staaten": {
        "name": "BfJ.Staat",
        "uri": "urn:xoev-de:bund:bfj:codeliste:bfj.staat",
        "standardVersion": "6.1",
        "werte": {"6.1": [["000", "Deutschland"], ["151", "Österreich"]],
                  "7.0": [["000", "Deutschland"]]},
        "vollstaendig": False,
    },
    "gds.waehrung": {
        "name": "XKfz.Waehrung",
        "uri": "urn:xoev-de:bund:kba:codeliste:waehrung",
        "standardVersion": "1.0",
        "werte": {"1.0": [["EUR", "Euro"]]},
        "vollstaendig": False,
    },
    "gds.gerichte": {
        "name": "GDS.Gerichte",
        "uri": "urn:xoev-de:xjustiz:codeliste:gds.gerichte",
        "standardVersion": "3.6",
        "werte": {"3.6": [["D2601", "Amtsgericht München"]]},
        "vollstaendig": False,
    },
    "gds.finanzbehoerden": {
        "name": "GDS.Finanzbehoerden",
        "uri": "urn:xoev-de:ag-it-standards:codeliste:gds.finanzbehoerden",
        "standardVersion": "", "werte": {}, "vollstaendig": False,
    },
}


def lade_xsd():
    baeume = {}
    for f in glob.glob(os.path.join(XSD, "*.xsd")):
        baeume[os.path.basename(f)] = etree.parse(f)
    return baeume


def typ1_liste(baeume, typname):
    for datei, baum in baeume.items():
        ct = baum.xpath(f'//xs:complexType[@name="{typname}"]', namespaces=NS)
        if not ct:
            continue
        ct = ct[0]
        einfach = ct.xpath('.//xs:element[@name="code"]/@type', namespaces=NS)[0].split(":")[1]
        version = ct.xpath('.//xs:attribute[@name="listVersionID"]/@fixed', namespaces=NS)[0]
        uri = ct.xpath('.//xs:attribute[@name="listURI"]/@fixed', namespaces=NS)[0]
        name = ct.xpath(".//codeliste/nameLang/text()")[0]
        for b in baeume.values():
            st = b.xpath(f'//xs:simpleType[@name="{einfach}"]', namespaces=NS)
            if st:
                werte = []
                for e in st[0].xpath(".//xs:enumeration", namespaces=NS):
                    wert = e.xpath(".//wert/text()")
                    werte.append([e.get("value"), wert[0].strip() if wert else ""])
                return {"name": name, "uri": uri, "typ": 1, "standardVersion": version,
                        "versionen": {version: werte}, "vollstaendig": True,
                        "quelle": f"XJustiz 3.6.2, {datei}"}
    raise SystemExit(f"Codeliste {typname} nicht gefunden")


def genericode_liste(dateiname):
    baum = etree.parse(os.path.join(GC, dateiname))
    version = baum.xpath("/*/Identification/Version/text()")[0].strip()
    uri = baum.xpath("/*/Identification/CanonicalUri/text()")[0].strip()
    schluessel = baum.xpath("/*/ColumnSet/Key/ColumnRef/@Ref")[0]
    spalten = baum.xpath("/*/ColumnSet/Column/@Id")
    wertspalte = "wert" if "wert" in spalten else [s for s in spalten if s != schluessel][0]
    werte = []
    for row in baum.xpath("/*/SimpleCodeList/Row"):
        d = {v.get("ColumnRef"): " ".join("".join(v.xpath("SimpleValue/text()")).split())
             for v in row.xpath("Value")}
        werte.append([d[schluessel], d.get(wertspalte, "")])
    return uri, version, werte


def codelisten():
    baeume = lade_xsd()
    ergebnis = {}
    for schluessel, typname in TYP1.items():
        ergebnis[schluessel] = typ1_liste(baeume, typname)
    for schluessel, cfg in TYP3.items():
        eintrag = {"name": cfg["name"], "uri": cfg["uri"], "typ": 3,
                   "standardVersion": cfg["standardVersion"], "versionen": {},
                   "vollstaendig": cfg.get("vollstaendig", True)}
        if "genericode" in cfg:
            quellen = []
            for datei in cfg["genericode"]:
                uri, version, werte = genericode_liste(datei)
                assert uri == cfg["uri"], (uri, cfg["uri"])
                eintrag["versionen"][version] = werte
                quellen.append(datei)
            eintrag["quelle"] = "Genericode (XRepository): " + ", ".join(quellen)
        else:
            eintrag["versionen"] = cfg["werte"]
            eintrag["quelle"] = ("vollständig" if eintrag["vollstaendig"]
                                 else "Teilliste – offizielle Genericode-Datei aus dem XRepository importierbar")
        ergebnis[schluessel] = eintrag
    return ergebnis


# ---------------------------------------------------------------------------
# DIN 91379: XSD-Pattern -> JavaScript-RegExp (Unicode-Modus)
# ---------------------------------------------------------------------------
def xsd_regex_nach_js(muster):
    aus = []
    i = 0
    in_klasse = False

    def lit(c):
        return "\\u{%X}" % ord(c)

    while i < len(muster):
        c = muster[i]
        if c == "\\":
            aus.append(lit(muster[i + 1]))
            i += 2
            continue
        if in_klasse:
            if c == "]":
                in_klasse = False
                aus.append("]")
            elif c == "-":
                aus.append("-")
            else:
                aus.append(lit(c))
        else:
            if c == "[":
                in_klasse = True
                aus.append("[")
            elif c in "()|*+?":
                aus.append("(?:" if c == "(" else c)
            else:
                aus.append(lit(c))
        i += 1
    return "^(?:" + "".join(aus) + ")$"


def din91379():
    baum = etree.parse(os.path.join(XSD, "din-norm-91379-datatypes.xsd"))
    ergebnis = {}
    for st in baum.xpath("//xs:simpleType", namespaces=NS):
        name = st.get("name")
        muster = st.xpath(".//xs:pattern/@value", namespaces=NS)[0]
        ergebnis[name[-1]] = xsd_regex_nach_js(muster)
    return ergebnis


def schreibe(pfad, kopf, variable, daten):
    with open(pfad, "w", encoding="utf-8") as f:
        f.write(kopf)
        text = json.dumps(daten, ensure_ascii=False, indent=1)
        # Code/Wert-Paare kompakt in eine Zeile schreiben
        text = re.sub(r'\[\s+("(?:[^"\\]|\\.)*"),\s+("(?:[^"\\]|\\.)*")\s+\]', r"[\1, \2]", text)
        f.write(f"window.{variable} = {text};\n")


if __name__ == "__main__":
    hinweis = ("/* Automatisch erzeugt durch tools/generiere_daten.py – nicht von Hand bearbeiten.\n"
               " * Grundlage: XJustiz 3.6.2 (XSD) und offizielle Genericode-Codelisten. */\n")
    schreibe(os.path.join(BASIS, "js", "codelisten.js"), hinweis, "ENOVA_CODELISTEN", codelisten())
    din = din91379()
    with open(os.path.join(BASIS, "js", "din91379.js"), "w", encoding="utf-8") as f:
        f.write(hinweis)
        f.write("/* Zulässige Zeichen nach DIN 91379 (Datentypen A–E), übersetzt aus\n"
                " * xsd/3.6.2/din-norm-91379-datatypes.xsd in JavaScript-RegExp. */\n")
        f.write("window.ENOVA_DIN91379 = {\n")
        for k in sorted(din):
            f.write(f'  {k}: new RegExp({json.dumps(din[k])}, "u"),\n')
        f.write("};\n")
    print("codelisten.js und din91379.js geschrieben")
