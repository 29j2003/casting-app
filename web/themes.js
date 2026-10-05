// =====================================================================
//  CAST-OVERLAY · THEMES (Grundeinstellungen)
//  Alles hier lässt sich auch in der Steuerseite unter „Theme anpassen"
//  ändern – das hier sind nur die Startwerte.
//    dunkel = Balken   hell = Felder   textDunkel = Schrift auf den Feldern
//    akzent = Theme-Farbe   linie = farbige Linie zwischen Balken und Feld
//    icon = Logo im dunklen Quadrat ("" = kein Logo)
//    schriftBild = Schriftzug als Bild (ersetzt zeile1/zeile2)
//    markeBild = komplettes Logo als Bild (ersetzt Quadrat + Schriftzug)
//    markeBox = das Logo-Bild auf einem dunklen Kasten zeigen (für Logos ohne eigenen Hintergrund)
//    hintergrundBild = Hintergrund, wenn keine Videos laufen
//    iconPlatte = Farbe des Logo-Felds (leer = wie die Balken)   ecken = "aussen" | "gerade" | "alle"
//    kopfText = Schrift in den Balken   markeText = "hell" | "dunkel" (Platte hinter dem Schriftzug)
//    zeilenTausch = Zeile 1 groß, Zeile 2 klein in Akzentfarbe (z. B. „ESEA / LEAGUE“)   vorlagen = Farbvorlagen
//    schrift = Schriftart (Rajdhani ist mitgeliefert)   schriftDatei = eigene Schriftdatei aus fonts/
//    fett = Schrift zusätzlich verstärken (Umriss), true/false
// =====================================================================
window.CAST_THEMES = {
  regulaer: {
    name: "Regulär",
    // Nachtviolett · das Logo-Feld bleibt neutral, damit jedes Org- oder Streamer-Logo passt
    dunkel: "#1E1240", hell: "#EFEDF6", textDunkel: "#120B26", akzent: "#8B6CFF", linie: true,
    iconPlatte: "#0D0C12", kopfText: "#FFFFFF",
    // Farbvorlagen (Setup → Theme anpassen): Nachtviolett ist Standard, Royal und Orchidee als Alternativen
    vorlagen: {
      "Nachtviolett": { dunkel: "#1E1240", akzent: "#8B6CFF", hell: "#EFEDF6", textDunkel: "#120B26", kopfText: "#FFFFFF" },
      "Royal": { dunkel: "#3A1D8C", akzent: "#A98BFF", hell: "#F1EEF9", textDunkel: "#160D33", kopfText: "#FFFFFF" },
      "Orchidee": { dunkel: "#4A1670", akzent: "#D59BFF", hell: "#F5F0F9", textDunkel: "#1F0B2E", kopfText: "#FFFFFF" }
    },
    icon: "", schriftBild: "",
    zeile1: "COUNTER-STRIKE", zeile2: "CAST",
    schrift: "Rajdhani", schriftDatei: "", fett: true
  },
  dachcs: {
    name: "DACH CS – eigener Stil",
    // Farben aus dem Press Kit: Navy #101526, Gelb #FCC659, Hellgrau #ECF0F1
    dunkel: "#101526", hell: "#EAEAEA", textDunkel: "#101526", akzent: "#FCC659", linie: true,
    icon: "medien/themes/dachcs/hahn_gelb.svg", schriftBild: "",
    markeBild: "medien/themes/dachcs/logo_text_rechts_3.svg",     // Press Kit: gelbes Quadrat + Navy-Feld (wie im Konzept)
    hintergrundBild: "medien/themes/dachcs/blau_1.svg",           // wenn keine Videos laufen
    zeile1: "DACH CS", zeile2: "MASTERS",
    schrift: "Rajdhani", schriftDatei: "", fett: true,
    // Auswahl in der Steuerseite (Press Kit)
    auswahl: {
      markeBild: {
        "Gelbes Quadrat · Navy-Feld (Standard)": "medien/themes/dachcs/logo_text_rechts_3.svg",
        "Gelbes Quadrat · helles Feld": "medien/themes/dachcs/logo_text_rechts_1.svg",
        "Navy Quadrat · helles Feld": "medien/themes/dachcs/logo_text_rechts_2.svg"
      },
      hintergrundBild: {
        "Navy (ruhig)": "medien/themes/dachcs/blau_1.svg",
        "Navy (gespiegelt)": "medien/themes/dachcs/blau_2.svg",
        "Gelb (ruhig)": "medien/themes/dachcs/gelb.svg",
        "Navy/Gelb": "medien/themes/dachcs/blau_gelb.svg",
        "Gelb/Navy": "medien/themes/dachcs/gelb_blau.svg"
      },
      icon: {
        "Hahn gelb": "medien/themes/dachcs/hahn_gelb.svg",
        "Hahn weiß": "medien/themes/dachcs/hahn_weiss.svg",
        "Hahn navy": "medien/themes/dachcs/hahn_blau.svg"
      }
    }
  },
  "dachcs-offiziell": {
    name: "DACH CS – Offiziell",
    // Grafiken kommen als offizielle Browserquellen von DACH CS (Nutzer-ID + Key) – die App zeigt sie in EINER Quelle,
    // setzt Kameras/Inhalt in die Rahmen und legt ihre Einblendungen darüber. Farben für die Einblendungen wie DACH CS.
    offiziell: true,
    dunkel: "#101526", hell: "#EAEAEA", textDunkel: "#101526", akzent: "#FCC659", linie: true,
    icon: "medien/themes/dachcs/hahn_gelb.svg", schriftBild: "", markeBild: "medien/themes/dachcs/logo_text_rechts_3.svg",
    zeile1: "DACH CS", zeile2: "OFFIZIELL"
  },
  esea: {
    name: "ESEA",
    // Grün aus dem Stern gemessen – bitte mit dem offiziellen Brand-Kit abgleichen
    dunkel: "#121412", hell: "#F2F4F2", textDunkel: "#0D100D", akzent: "#3EB047", linie: true, kopfText: "#FFFFFF",
    // Konzept: Stern im dunklen Feld + „ESEA / LEAGUE“ in der Overlay-Schrift auf dunkler Platte (statt des alten Schriftzug-Bilds)
    icon: "medien/themes/esea-stern.png", schriftBild: "", markeText: "dunkel", zeilenTausch: true,
    zeile1: "ESEA", zeile2: "LEAGUE",
    schrift: "Rajdhani", schriftDatei: "", fett: true      // eigene Schrift: Datei in fonts/ legen und in der Steuerseite wählen
  },
  uniliga: {
    name: "Uniliga",
    dunkel: "#0F1B1B", hell: "#EEF6F5", textDunkel: "#0B1414", akzent: "#00E9C6", linie: true,
    icon: "medien/themes/uniliga.png", schriftBild: "",
    markeBild: "medien/themes/uniliga-wortmarke.png",   // offizielle Wortmarke mit Icon
    markeBox: true,                                     // Logo auf dunklem Kasten zeigen
    zeile1: "UNILIGA", zeile2: "COUNTER-STRIKE",
    schrift: "Rajdhani", schriftDatei: "", fett: true,
    auswahl: {
      markeBild: {
        "Wortmarke mit Icon": "medien/themes/uniliga-wortmarke.png"
      }
    }
  }
};
