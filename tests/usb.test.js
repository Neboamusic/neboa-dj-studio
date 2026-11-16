"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const U=require("../usb.js");
const E=require("../core.js");

function f(path,size=12345) {
  return {
    name:path.split("/").at(-1),
    webkitRelativePath:path,
    size,
    text(){throw new Error("Nunca leer bytes durante inventario USB")},
    arrayBuffer(){throw new Error("Nunca leer audio durante inventario USB")}
  };
}
function fixture() {
  return [
    f("TESTPEN/PIONEER/rekordbox/exportLibrary.db",125000),
    f("TESTPEN/PIONEER/rekordbox/export.pdb",100000),
    f("TESTPEN/PIONEER/rekordbox/collection.xml",1800),
    f("TESTPEN/Music/01. Artist One - Opening (Extended Mix).mp3",12345678),
    f("TESTPEN/Music/02. Artist Two - Closing [www.site.net].flac",23456789),
    f("TESTPEN/Music/03. R U Happy (Instrumental Version).mp3",1000000),
    f("TESTPEN/.Trashes/._sample.mp3",12500),
  ];
}
test("recognizes OneLibrary and Device Library without parsing their databases or audio",()=>{
  const d=U.scan(fixture());
  assert.equal(d.volume,"TESTPEN");
  assert.equal(d.format,"OneLibrary + Device Library");
  assert.equal(d.fileCount,7);
  assert.equal(d.oneLibrary.length,1);
  assert.equal(d.legacy.length,1);
  assert.equal(d.xml.length,1);
  assert.equal(d.audioCount,3);
  assert.equal(d.warnings.some(x=>x.includes("NO se han leído")),true);
  assert.equal(d.audio.every(x=>x.file?.text),true);
});
test("only legacy device and ordinary folder without DB are detected accurately",()=>{
  assert.equal(U.scan([f("USB/PIONEER/rekordbox/export.pdb")]).format,"Device Library clásica");
  const naked=U.scan([f("USB/Audio/One.mp3")]);
  assert.equal(naked.format,"Sin biblioteca Pioneer detectada");
  assert.equal(naked.oneLibrary.length,0);
});
test("does not mistake unrelated exportLibrary.db or names for OneLibrary",()=>{
  assert.equal(U.scan([f("USB/music/exportLibrary.db")]).oneLibrary.length,0);
  assert.equal(U.scan([f("USB/randomPIONEER/rekordbox/exportLibrary.db")]).oneLibrary.length,0);
  assert.equal(U.scan([f("USB/PIONEER/rekordbox/exportLibrary.db")]).oneLibrary.length,1);
});
test("browser USB folder picker path sanitization",()=>{
  assert.equal(U.tidyPath("\\TESTPEN\\PIONEER\\rekordbox\\exportLibrary.db"),
    "TESTPEN/PIONEER/rekordbox/exportLibrary.db");
  assert.throws(()=>U.tidyPath("TESTPEN/../other/path.mp3"),/ruta no válida/);
  assert.throws(()=>U.tidyPath("TESTPEN/./other.mp3"),/ruta no válida/);
});
test("audio file names yield only title and artist when clearly named",()=>{
  assert.deepEqual(U.audioName("01. Artist - Title (Extended Mix).mp3"),
    {artist:"Artist",title:"Title (Extended Mix)"});
  assert.deepEqual(U.audioName("048_Euphoric Dreams (KiNK Remix).mp3"),
    {artist:"",title:"Euphoric Dreams (KiNK Remix)"});
  assert.notEqual(U.canonical("08. Song (Extended Mix)"),
    U.canonical("Song (Original Mix)"));
  assert.equal(U.looseCanonical("08. Song (Extended Mix)"),
    U.looseCanonical("Song (Original Mix)"));
});
test("playlist USB match reports found / missing / ambiguity based on names, never invents cues",()=>{
  const inventory=U.scan(fixture());
  const tracks=[
    E.normalizeTrack({title:"Opening (Extended Mix)",artist:"Artist One",bpm:126,key:"8A"},0),
    E.normalizeTrack({title:"Closing",artist:"Artist Two"},1),
    E.normalizeTrack({title:"Not Here",artist:"Someone"},2)
  ];
  const report=U.matchPlaylist(tracks,inventory);
  assert.equal(report.total,3);
  assert.equal(report.matched,2);
  assert.equal(report.missing,1);
  assert.equal(report.ambiguous,0);
  assert.equal(report.rows[0].status,"EN_USB");
  assert.equal(report.rows[2].status,"NO_LOCALIZADA");
});
test("different Original/Extended versions are only possible candidates, never exact matches",()=>{
  const inventory=U.scan([f("USB/Music/DJ - Song (Original Mix).mp3")]);
  const list=[E.normalizeTrack({title:"Song (Extended Mix)",artist:"DJ"},0)];
  const comparison=U.matchPlaylist(list,inventory);
  assert.equal(comparison.matched,0);
  assert.equal(comparison.possible,1);
  assert.equal(comparison.rows[0].status,"POSIBLE_VARIANTE");
  assert.equal(U.findMatches(list[0],U.candidates(inventory)).length,0);
});
test("playlist ambiguous filenames are flagged rather than assumed correct",()=>{
  const inventory=U.scan([f("USB/A/Song.mp3"),f("USB/B/Song.flac")]);
  const report=U.matchPlaylist([E.normalizeTrack({title:"Song"},0)],inventory);
  assert.equal(report.ambiguous,1);
  assert.equal(report.matched,0);
});
test("provisional playlist has unknown BPM/key/duration/cues, preserving original source files",()=>{
  const inventory=U.scan(fixture());
  const list=U.provisionalTracks(inventory,E);
  assert.equal(list.length,3);
  assert.equal(list[0].bpm,null);
  assert.equal(list[0].camelot,null);
  assert.equal(list[0].duration,null);
  assert.deepEqual(list[0].cues,[]);
  assert.ok(list[0].artist.includes("Artist One"));
  assert.ok(!JSON.stringify(list).includes("TESTPEN/Music"));
  assert.ok(!JSON.stringify(list).includes("12345678"));
});
test("no file or too many file objects raise bounded error",()=>{
  assert.throws(()=>U.scan([]),/seleccionado/);
  assert.throws(()=>U.scan(new Array(120001).fill(f("USB/A/song.mp3"))),/demasiados archivos/);
});
test("large USB can be inventoried but cannot generate an oversized session",()=>{
  const files=Array.from({length:3001},(_,i)=>f("USB/Audio/"+i+" Title.mp3"));
  const inventory=U.scan(files);
  assert.equal(inventory.audioCount,3001);
  assert.ok(inventory.warnings.some(x=>x.includes("3.000")));
  assert.throws(()=>U.provisionalTracks(inventory,E),/Demasiadas pistas/);
});
test("scanner can select an internal PIONEER folder and still detect OneLibrary",()=>{
  assert.equal(U.scan([f("PIONEER/rekordbox/exportLibrary.db")]).oneLibrary.length,1);
});

test("Metadata labels improve proposed playlist without inventing cues/energy/duration",()=>{
  const inventory=U.scan([f("USB/Music/010_Track.mp3",128000)]);
  const tags=new Map([[inventory.audio[0].relativePath,{
    source:"ID3v2.3",title:"Real Song (Extended Mix)",artist:"DJ Verified",
    bpm:127.5,key:"8A",album:"Original Single"
  }]]);
  const result=U.provisionalTracks(inventory,E,3000,tags);
  assert.equal(result.length,1);
  assert.equal(result[0].title,"Real Song (Extended Mix)");
  assert.equal(result[0].artist,"DJ Verified");
  assert.equal(result[0].bpm,127.5);
  assert.equal(result[0].camelot,"8A");
  assert.equal(result[0].album,"Original Single");
  assert.equal(result[0].energy,null);
  assert.equal(result[0].duration,null);
  assert.deepEqual(result[0].cues,[]);
});
test("Matching tags cannot confuse identically titled tracks by different artists",()=>{
  const inventory=U.scan([f("USB/Music/file00042.mp3",234567)]);
  const tags=new Map([[inventory.audio[0].relativePath,{
    source:"ID3v2.4",title:"Sunrise",artist:"Artist A"
  }]]);
  const wrong=U.matchPlaylist([E.normalizeTrack({title:"Sunrise",artist:"Artist B"},0)],inventory,tags);
  assert.equal(wrong.matched,0);
  assert.equal(wrong.rows[0].status,"POSIBLE_VARIANTE");
  const right=U.matchPlaylist([E.normalizeTrack({title:"Sunrise",artist:"Artist A"},0)],inventory,tags);
  assert.equal(right.matched,1);
  assert.equal(right.tagMatched,1);
  assert.equal(right.rows[0].status,"ETIQUETA_EN_USB");
});
test("Metadata may not turn a differently titled file into a false match",()=>{
  const inventory=U.scan([f("USB/Music/Another Track.mp3",234567)]);
  const tags=new Map([[inventory.audio[0].relativePath,{
    source:"ID3v2.3",title:"This One",artist:"A"
  }]]);
  const report=U.matchPlaylist([E.normalizeTrack({title:"Another Track",artist:"B"},0)],inventory,tags);
  assert.equal(report.matched,0);
});
test("USB quality review flags 0 bytes, possible duplicates, promo names and album data, without writes",()=>{
  const inventory=U.scan([
    f("USB/Set/01 - Empty.mp3",0),
    f("USB/Set/A/02 - Duplicate.mp3",505000),
    f("USB/Set/B/02 - Duplicate.mp3",505000),
    f("USB/Set/03 - Song [www.illegal.example.com].mp3",200000),
    f("USB/Set/04 - Tiny.mp3",8000)
  ]);
  const tag=new Map([[inventory.audio[3].relativePath,{
    source:"ID3v2.3",title:"Song",artist:"A",bpm:null,key:null,album:"Various Artists"
  }]]);
  const audit=U.health(inventory,tag);
  assert.equal(audit.zeroBytes,1);
  assert.equal(audit.tinyFiles,1);
  assert.equal(audit.possibleDuplicateGroups,1);
  assert.equal(audit.promotionalNames,1);
  assert.equal(audit.tagAlbumNonempty,1);
  assert.equal(audit.scanned,1);
  assert.ok(audit.items.some(i=>i.code==="TAG_SCAN_INCOMPLETE"));
  const csv=U.auditCSV(inventory,tag,E);
  assert.ok(csv.includes("NO_ANALIZADO"));
  assert.ok(csv.includes("ZERO_BYTES"));
  assert.ok(csv.includes("Various Artists"));
});
test("Quality export neutralizes spreadsheet-injection from malicious filename and title",()=>{
  const inventory=U.scan([f("USB/Music/=HYPERLINK(abc).mp3",101000)]);
  const tag=new Map([[inventory.audio[0].relativePath,
    {source:"ID3v2.3",artist:"=1+1",title:"+cmd"}]]);
  const csv=U.auditCSV(inventory,tag,E);
  assert.ok(csv.includes("\"'=1+1\""));
  assert.ok(csv.includes("\"'+cmd\""));
});

test("display is summarized, no binary contents or private paths",()=>{
  const d=U.scan(fixture());
  const summary=U.toDisplay(d);
  assert.equal(summary.oneLibrary,true);
  assert.equal(summary.audioCount,3);
  assert.ok(!("audio" in summary));
  assert.ok(!JSON.stringify(summary).includes("exportLibrary.db"));
});
