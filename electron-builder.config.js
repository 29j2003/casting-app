// Bauanleitung für electron-builder: Windows (Installer + portable), Linux (AppImage), macOS (dmg + zip, Intel + Apple Silicon)
//   node tools/bauen.js [win|linux|mac]   → dist/
// macOS: ohne Apple-Konto ad-hoc signiert (startet nach Rechtsklick → Öffnen).
// Notarisierung ist vorbereitet, aber aus. Einschalten mit CAST_NOTARISIEREN=1 und
//   CSC_LINK / CSC_KEY_PASSWORD (Developer-ID-Zertifikat) sowie APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID.
"use strict";
const notarisieren = process.env.CAST_NOTARISIEREN === "1";

module.exports = {
  appId: "de.casting-app.desktop",
  productName: "Casting-App",
  copyright: "© 29_THE_P4TCH3R",
  directories: { output: "dist", buildResources: "build" },
  // nur, was die App zur Laufzeit braucht (Tests, Werkzeuge, Doku bleiben draußen)
  files: ["package.json", "server.js", "geheimnisse.js", "electron/**/*", "web/**/*"],
  asar: true,
  publish: null,
  electronLanguages: ["de", "en-US"],

  win: {
    target: [{ target: "nsis", arch: ["x64"] }, { target: "portable", arch: ["x64"] }],
    icon: "build/icon.ico",
    legalTrademarks: "Casting-App"
  },
  nsis: {
    oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: "Casting-App",
    installerIcon: "build/icon.ico", uninstallerIcon: "build/icon.ico", installerLanguages: ["de_DE"], language: "1031",
    artifactName: "Casting-App-Setup-${version}.${ext}"
  },
  portable: { artifactName: "Casting-App-${version}-portable.${ext}" },

  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
    icon: "build/icon.png", category: "AudioVideo", synopsis: "Steuerung und Overlays für CS2-Casts in OBS", syncDesktopName: true,
    artifactName: "Casting-App-${version}-linux-${arch}.${ext}"
  },

  mac: {
    target: [{ target: "dmg", arch: ["x64", "arm64"] }, { target: "zip", arch: ["x64", "arm64"] }],
    icon: "build/icon.png", category: "public.app-category.video",
    artifactName: "Casting-App-${version}-mac-${arch}.${ext}",
    // ohne Notarisierung: Ad-hoc-Signatur („-“), damit Apple Silicon die App überhaupt startet
    identity: notarisieren ? undefined : "-",
    hardenedRuntime: notarisieren,
    gatekeeperAssess: false,
    entitlements: notarisieren ? "build/entitlements.mac.plist" : undefined,
    entitlementsInherit: notarisieren ? "build/entitlements.mac.plist" : undefined,
    notarize: notarisieren,
    extendInfo: {
      NSCameraUsageDescription: "Die Casting-App zeigt Kameras und Aufnahmegeräte in der Vorschau.",
      NSMicrophoneUsageDescription: "Die Casting-App kann den Ton von Aufnahmegeräten in der Vorschau abspielen."
    }
  },
  dmg: { artifactName: "Casting-App-${version}-mac-${arch}.${ext}" }
};
