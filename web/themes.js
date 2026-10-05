// =====================================================================
//  CAST-OVERLAY · THEMES (Grundeinstellungen)
//  Alles hier lässt sich auch in der Steuerseite unter „Theme anpassen"
//  ändern – das hier sind nur die Startwerte.
//    dark = Balken   light = Felder   textDark = Schrift auf den Feldern
//    accent = Theme-Farbe   stroke = farbige Linie zwischen Balken und Feld
//    icon = Logo im dunklen Quadrat ("" = kein Logo)
//    fontImage = Schriftzug als Bild (ersetzt line1/line2)
//    brandImage = komplettes Logo als Bild (ersetzt Quadrat + Schriftzug)
//    brandBox = das Logo-Bild auf einem dunklen Kasten zeigen (für Logos ohne eigenen Hintergrund)
//    backgroundImage = Hintergrund, wenn keine Videos laufen
//    iconDisk = Farbe des Logo-Felds (leer = wie die Balken)   corners = "outside" | "straight" | "all"
//    headText = Schrift in den Balken   brandText = "light" | "dark" (Platte hinter dem Schriftzug)
//    rowsSwap = Zeile 1 groß, Zeile 2 klein in Akzentfarbe (z. B. „ESEA / LEAGUE“)   templates = Farbvorlagen
//    font = Schriftart (Rajdhani ist mitgeliefert)   fontFile = eigene Schriftdatei aus fonts/
//    bold = Schrift zusätzlich verstärken (Umriss), true/false
// =====================================================================
window.CAST_THEMES = {
  regular: {
    name: "Regulär",
    // Nachtviolett · das Logo-Feld bleibt neutral, damit jedes Org- oder Streamer-Logo passt
    dark: "#1E1240", light: "#EFEDF6", textDark: "#120B26", accent: "#8B6CFF", stroke: true,
    iconDisk: "#0D0C12", headText: "#FFFFFF",
    // Farbvorlagen (Setup → Theme anpassen): Nachtviolett ist Standard, Royal und Orchidee als Alternativen
    templates: {
      "Nachtviolett": { dark: "#1E1240", accent: "#8B6CFF", light: "#EFEDF6", textDark: "#120B26", headText: "#FFFFFF" },
      "Royal": { dark: "#3A1D8C", accent: "#A98BFF", light: "#F1EEF9", textDark: "#160D33", headText: "#FFFFFF" },
      "Orchidee": { dark: "#4A1670", accent: "#D59BFF", light: "#F5F0F9", textDark: "#1F0B2E", headText: "#FFFFFF" }
    },
    icon: "", fontImage: "",
    line1: "COUNTER-STRIKE", line2: "CAST",
    font: "Rajdhani", fontFile: "", bold: true
  },
  dachcs: {
    name: "DACH CS – eigener Stil",
    // Farben aus dem Press Kit: Navy #101526, Gelb #FCC659, Hellgrau #ECF0F1
    dark: "#101526", light: "#EAEAEA", textDark: "#101526", accent: "#FCC659", stroke: true,
    icon: "media/themes/dachcs/rooster_yellow.svg", fontImage: "",
    brandImage: "media/themes/dachcs/logo_text_right_3.svg",     // Press Kit: gelbes Quadrat + Navy-Feld (wie im Konzept)
    backgroundImage: "media/themes/dachcs/blue_1.svg",           // wenn keine Videos laufen
    line1: "DACH CS", line2: "MASTERS",
    font: "Rajdhani", fontFile: "", bold: true,
    // Auswahl in der Steuerseite (Press Kit)
    selection: {
      brandImage: {
        "Gelbes Quadrat · Navy-Feld (Standard)": "media/themes/dachcs/logo_text_right_3.svg",
        "Gelbes Quadrat · helles Feld": "media/themes/dachcs/logo_text_right_1.svg",
        "Navy Quadrat · helles Feld": "media/themes/dachcs/logo_text_right_2.svg"
      },
      backgroundImage: {
        "Navy (ruhig)": "media/themes/dachcs/blue_1.svg",
        "Navy (gespiegelt)": "media/themes/dachcs/blue_2.svg",
        "Gelb (ruhig)": "media/themes/dachcs/yellow.svg",
        "Navy/Gelb": "media/themes/dachcs/blue_yellow.svg",
        "Gelb/Navy": "media/themes/dachcs/yellow_blue.svg"
      },
      icon: {
        "Hahn gelb": "media/themes/dachcs/rooster_yellow.svg",
        "Hahn weiß": "media/themes/dachcs/rooster_white.svg",
        "Hahn navy": "media/themes/dachcs/rooster_blue.svg"
      }
    }
  },
  "dachcs-official": {
    name: "DACH CS – Offiziell",
    // Grafiken kommen als offizielle Browserquellen von DACH CS (Nutzer-ID + Key) – die App zeigt sie in EINER Quelle,
    // setzt Kameras/Inhalt in die Rahmen und legt ihre Einblendungen darüber. Farben für die Einblendungen wie DACH CS.
    official: true,
    dark: "#101526", light: "#EAEAEA", textDark: "#101526", accent: "#FCC659", stroke: true,
    icon: "media/themes/dachcs/rooster_yellow.svg", fontImage: "", brandImage: "media/themes/dachcs/logo_text_right_3.svg",
    line1: "DACH CS", line2: "OFFIZIELL"
  },
  esea: {
    name: "ESEA",
    // Grün aus dem Stern gemessen – bitte mit dem offiziellen Brand-Kit abgleichen
    dark: "#121412", light: "#F2F4F2", textDark: "#0D100D", accent: "#3EB047", stroke: true, headText: "#FFFFFF",
    // Konzept: Stern im dunklen Feld + „ESEA / LEAGUE“ in der Overlay-Schrift auf dunkler Platte (statt des alten Schriftzug-Bilds)
    icon: "media/themes/esea-star.png", fontImage: "", brandText: "dark", rowsSwap: true,
    line1: "ESEA", line2: "LEAGUE",
    font: "Rajdhani", fontFile: "", bold: true      // eigene Schrift: Datei in fonts/ legen und in der Steuerseite wählen
  },
  uniliga: {
    name: "Uniliga",
    dark: "#0F1B1B", light: "#EEF6F5", textDark: "#0B1414", accent: "#00E9C6", stroke: true,
    icon: "media/themes/uniliga.png", fontImage: "",
    brandImage: "media/themes/uniliga-wordmark.png",   // offizielle Wortmarke mit Icon
    brandBox: true,                                     // Logo auf dunklem Kasten zeigen
    line1: "UNILIGA", line2: "COUNTER-STRIKE",
    font: "Rajdhani", fontFile: "", bold: true,
    selection: {
      brandImage: {
        "Wortmarke mit Icon": "media/themes/uniliga-wordmark.png"
      }
    }
  }
};
