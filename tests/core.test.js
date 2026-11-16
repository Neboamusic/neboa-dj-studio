"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const DJ=require("../core.js");

test("Camelot: 24 keys with circle matches",()=>{
  for (const [k,v] of Object.entries({
    "C":"8B","C#":"3B","D":"10B","Eb":"5B","E":"12B","F":"7B",
    "F#":"2B","G":"9B","Ab":"4B","A":"11B","Bb":"6B","B":"1B",
    "Cm":"5A","C#m":"12A","Dm":"7A","Ebm":"2A","Em":"9A","Fm":"4A",
    "F#m":"11A","Gm":"6A","Abm":"1A","Am":"8A","Bbm":"3A","Bm":"10A"
  }))assert.equal(DJ.camelot(k),v,k);
  assert.equal(DJ.camelot("8b"),"8B");
  assert.equal(DJ.camelot("C major"),"8B");
  assert.equal(DJ.camelot("C minor"),"5A");
  assert.equal(DJ.camelot("No Key"),null);
});
test("Camelot transition: modulo wrap, related, mismatch, unknown",()=>{
  assert.deepEqual(DJ.harmony("8A","8A").compatible,true);
  assert.equal(DJ.harmony("8A","8B").score,94);
  assert.equal(DJ.harmony("12A","1A").score,91);
  assert.equal(DJ.harmony("8A","9A").score,91);
  assert.equal(DJ.harmony("8A","2B").compatible,false);
  assert.equal(DJ.harmony(null,"8B").score,null);
});
test("No promotional URLs, preserve version information and credits",()=>{
  assert.equal(DJ.cleanText("Metamorphosis [www.slider.kz]"),"Metamorphosis");
  assert.equal(DJ.cleanText("Track (Extended Mix) [https://example.org/file]"),"Track (Extended Mix)");
  assert.equal(DJ.cleanText("First - www.somewhere.com"),"First");
  assert.equal(DJ.cleanText("Crazy (Original Mix)"),"Crazy (Original Mix)");
});
test("CSV quoted separators, Spanish headings, unknown values",()=>{
  const rows=DJ.csvRows('artista;titulo;bpm;tonalidad;energia\n"DJ, Z";"Tune; One";126;8A;7\nB;Other;;;');
  assert.equal(rows.length,2);
  assert.equal(rows[0].artist,"DJ, Z");
  assert.equal(rows[0].title,"Tune; One");
  assert.equal(rows[0].bpm,126);
  assert.equal(rows[0].camelot,"8A");
  assert.equal(rows[0].energy,7);
  assert.equal(rows[1].bpm,null);
  assert.equal(rows[1].camelot,null);
  assert.equal(rows[1].energy,null);
});
test("CSV accepts plain list but never invents metadata",()=>{
  const rows=DJ.csvRows("Sunrise\nNightshift");
  assert.equal(rows.length,2);
  assert.equal(rows[0].title,"Sunrise");
  assert.equal(rows[0].bpm,null);
});
test("Broken CSV cannot be imported",()=>{
  assert.throws(()=>DJ.csvRows('title;artist\n"Broken;X'),/comillas sin cerrar/);
});
test("Imported CSV with newline quotes preserved",()=>{
  const rows=DJ.csvRows('title,artist\n"Song\nOne",Producer\n"Other",Other');
  assert.equal(rows.length,2);
  assert.equal(rows[0].title,"Song\nOne");
});
test("Recommendations are deterministic and do not mutate input",()=>{
  const tracks=[
    DJ.normalizeTrack({id:"a",title:"A",artist:"DJ",bpm:124,key:"Fm",energy:4},0),
    DJ.normalizeTrack({id:"b",title:"B",artist:"DJ",bpm:128,key:"Am",energy:8},1),
    DJ.normalizeTrack({id:"c",title:"C",artist:"DJ",bpm:125,key:"Fm",energy:5},2)
  ];
  const snapshot=JSON.stringify(tracks);
  const ordered=DJ.recommendOrder(tracks);
  assert.deepEqual(ordered.map(x=>x.id),["a","c","b"]);
  assert.equal(JSON.stringify(tracks),snapshot);
  assert.deepEqual(DJ.recommendOrder(tracks).map(x=>x.id),ordered.map(x=>x.id));
});
test("Transition contains measured RMS only when both sources have actual measurement",()=>{
  const tracks=[
    DJ.normalizeTrack({id:"a",title:"A",bpm:127,key:"8A"},0),
    DJ.normalizeTrack({id:"b",title:"B",bpm:129,key:"8B"},1)
  ];
  const unmeasured=DJ.transition(tracks[0],tracks[1]);
  assert.equal(unmeasured.rmsDelta,null);
  const measures=new Map([
    ["a",{rmsDbfs:-12}],["b",{rmsDbfs:-7}]
  ]);
  assert.equal(DJ.transition(tracks[0],tracks[1],measures).rmsDelta,5);
  assert.equal(unmeasured.deltaBpm,2);
});
test("Cue ideas need BPM + duration, are provisional, and within audio",()=>{
  const t=DJ.normalizeTrack({title:"Test",bpm:128,duration:360},0);
  const cues=DJ.cueIdeas(t);
  assert.ok(cues.length>2);
  assert.ok(cues.every(c=>c.seconds>=0&&c.seconds<360));
  assert.ok(cues.every(c=>c.confidence.includes("BAJA")));
  assert.deepEqual(DJ.cueIdeas(DJ.normalizeTrack({title:"No BPM",duration:120},0)),[]);
});
test("Exports exclude disk paths and audio from JSON and CSV",()=>{
  const track=DJ.normalizeTrack({id:"x",title:"Track",artist:"DJ",key:"8A",bpm:127},0);
  track.path="/Volumes/private/DJ/secret-track.mp3";
  const json=DJ.exportJSON([track],"DJ Name");
  assert.equal(json.includes("/Volumes"),false);
  assert.equal(json.includes("secret-track"),false);
  assert.equal(JSON.parse(json).dj,"DJ Name");
  assert.equal(DJ.csvExport([track]).includes("/Volumes"),false);
});
test("XML extractor handles nested named playlists and marks without duplicate imported collection tracks",()=>{
  // Minimal XML DOM shape as produced by DOMParser; no external dependencies.
  function e(tag,atts={},children=[]) {
    return {tagName:tag,nodeName:tag,children,attributes:Object.entries(atts).map(([name,value])=>({name,value:String(value)})),
      getAttribute(k){return atts[k]===undefined?null:String(atts[k]);},
      querySelector(tag){return this.children.find(x=>x.tagName===tag)||null;}};
  }
  const coll=e("COLLECTION",{},[
    e("TRACK",{TrackID:"10",Name:"Original",Artist:"DJ One",AverageBpm:"128",Tonality:"Fm",Album:"Test"},[
      e("POSITION_MARK",{Num:"0",Start:"30.0"}),e("POSITION_MARK",{Num:"-1",Start:"60"})
    ]),
    e("TRACK",{TrackID:"11",Name:"Second [www.bad.xyz]",Artist:"DJ Two",AverageBpm:"130",Tonality:"5A"})
  ]);
  const folder=e("NODE",{Name:"House",Type:"0"},[
    e("NODE",{Name:"My Set",Type:"1"},[e("TRACK",{Key:"11"}),e("TRACK",{Key:"10"})])
  ]);
  const root=e("DJ_PLAYLISTS",{},[e("PRODUCT",{Version:"7.2"}),coll,e("PLAYLISTS",{},[folder])]);
  const data=DJ.parseXML({documentElement:root});
  assert.equal(data.library.length,2);
  assert.equal(data.playlists.length,1);
  assert.equal(data.playlists[0].name,"House / My Set");
  assert.deepEqual(data.playlists[0].tracks.map(x=>x.title),["Second","Original"]);
  assert.equal(data.library[0].cues.length,2);
  assert.equal(data.library[0].cues[0].slot,"A");
  assert.equal(data.library[0].cues[1].slot,"MEM");
});
test("Reject invalid root",()=>{
  assert.throws(()=>DJ.parseXML({documentElement:{nodeName:"html"}}),/Rekordbox/);
});
test("No explicit private paths, actual artist collection, network connections or external JS dependencies shipped",()=>{
  const root=path.join(__dirname,"..");
  for(const filename of ["index.html","styles.css","app.js","core.js"]) {
    const data=fs.readFileSync(path.join(root,filename),"utf8");
    assert.ok(!/\/Users\/[a-z0-9._-]+\//i.test(data),filename);
    assert.ok(!/\/Volumes\/[a-z0-9._-]+\//i.test(data),filename);
    assert.ok(!/TERMINAL[_ -]?ZERO/i.test(data),filename);
    assert.ok(!/https?:\/\/(?:cdn|unpkg|jsdelivr|fonts.googleapis)\./i.test(data),filename);
    if(filename==="app.js")assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|localStorage\.setItem/.test(data));
  }
});
