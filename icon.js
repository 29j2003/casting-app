// Setzt Symbol und Versionsinfo der Windows-Basisdatei (vor dem Packen)
const fs = require("fs"), ResEdit = require("resedit"), PE = require("pe-library");
const [quelle, ziel, ico, version] = process.argv.slice(2);
const exe = PE.NtExecutable.from(fs.readFileSync(quelle), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);
const gruppen = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const id = gruppen.length ? gruppen[0].id : 1, lang = gruppen.length ? gruppen[0].lang : 1033;
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, icon.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = version.split(".").map(Number);
vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  ProductName: "Casting-App", FileDescription: "Casting-App", CompanyName: "29_THE_P4TCH3R",
  OriginalFilename: "Casting-App.exe", InternalName: "Casting-App", LegalCopyright: "29_THE_P4TCH3R", FileVersion: version, ProductVersion: version
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(ziel, Buffer.from(exe.generate()));
console.log("Symbol gesetzt:", ziel, "(Gruppe", id + ")");
