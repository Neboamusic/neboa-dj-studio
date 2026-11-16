"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"app.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const engine=require("../core.js");
const usb=require("../usb.js");
const tags=require("../tags.js");

class FakeNode {
  constructor(tag="div") {
    this.tagName=tag;
    this.children=[];this.handlers={};this.className="";
    this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};
    this.textContent="";this.disabled=false;this.hidden=false;this.value="";
    this.dataset={};this.attributes={};this.checked=false;this.parent=null;
  }
  addEventListener(type,handler){(this.handlers[type]??=[]).push(handler);}
  appendChild(child){if(child.tagName==="fragment"){this.children.push(...child.children);child.children=[];}else this.children.push(child);return child;}
  append(...children){this.children.push(...children);return this;}
  replaceChildren(...nodes){this.children=nodes;return this;}
  setAttribute(k,v){this.attributes[k]=v;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  click(){for(const fn of this.handlers.click||[])fn({preventDefault(){}});}
  fire(type,payload={}){return Promise.all((this.handlers[type]||[]).map(fn=>fn(payload)));}
}

function setup(){
  const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),x=>x[1]);
  const map=new Map(ids.map(id=>[id,new FakeNode(id)]));
  const tabbuttons=["set","mix","levels","normalize","usb","export"].map(name=>{
    const btn=new FakeNode("button");btn.dataset.tab=name;return btn;
  });
  const body=new FakeNode("body"),downloads=[],blobs=new Map();
  map.get("sortMode").value="harmonic";
  map.get("preserveFirst").checked=true;
  map.get("playlistSelect").value="__all";
  const document={
    readyState:"complete",body,
    getElementById(id){if(!map.has(id))throw new Error("HTML ID missing: "+id);return map.get(id);},
    createDocumentFragment(){return new FakeNode("fragment");},
    createElement(tag){const element=new FakeNode(tag);
      if(tag==="a")element.click=function(){downloads.push({href:this.href,filename:this.download});};
      return element;},
    querySelectorAll(query){
      if(query===".tab")return tabbuttons;
      throw new Error("Unexpected selector "+query);
    }
  };
  const context={
    window:{DJStudioEngine:engine,DJStudioUSB:usb,DJStudioTags:tags},
    document,console, Blob,
    URL:{createObjectURL(data){const uri="blob:fake-"+blobs.size;blobs.set(uri,data);return uri;},
      revokeObjectURL(){}},
    setTimeout(fn){/* blob cleanup deferred in browser; no timer needed here */}
  };
  vm.runInNewContext(source,context,{filename:"app.js"});
  return {map,tabbuttons,downloads,blobs};
}

test("All app JS ID references are defined in public HTML",()=>{
  const ids=new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g),x=>x[1]));
  const calls=Array.from(source.matchAll(/\bbyId\("([^"]+)"\)/g),x=>x[1]);
  assert.ok(calls.length>25);
  for(const id of calls)assert.ok(ids.has(id),"Unmatched "+id);
});

test("UI loads with no personal data and every action disabled",()=>{
  const {map}=setup();
  assert.equal(map.get("kpiTracks").textContent,"00");
  assert.equal(map.get("applySort").disabled,true);
  assert.equal(map.get("exportCSV").disabled,true);
  assert.equal(map.get("kpiCues").textContent,"00");
});

test("Demo launches and exercises set -> mix -> levels -> export, no network",async()=>{
  const {map,tabbuttons,downloads,blobs}=setup();
  map.get("demoBtn").click();
  assert.equal(map.get("kpiTracks").textContent,"10");
  assert.equal(map.get("applySort").disabled,false);
  assert.equal(map.get("exportCSV").disabled,false);
  assert.equal(map.get("activePlaylistName").textContent,"Toda la colección");
  assert.equal(map.get("modeTag").textContent,"DEMO FICTICIA");
  assert.equal(map.get("tracksBody").children.length,10);
  map.get("applySort").click();
  assert.equal(map.get("tracksBody").children.length,10);
  tabbuttons[1].click();
  assert.equal(map.get("panel-mix").hidden,false);
  assert.equal(map.get("panel-set").hidden,true);
  assert.equal(map.get("mixRows").children.length,9);
  const row=map.get("mixRows").children[0];
  row.click();
  assert.ok(map.get("mixDetail").children.length>3);
  tabbuttons[2].click();
  assert.equal(map.get("panel-levels").hidden,false);
  assert.ok(map.get("audioTrackName").textContent.length>2);
  tabbuttons[5].click();
  assert.equal(map.get("panel-export").hidden,false);
  map.get("exportCSV").click();
  assert.equal(downloads.length,1);
  const csv=await blobs.get(downloads[0].href).text();
  assert.ok(csv.includes("Demo Artist"));
  assert.ok(!csv.includes("/Volumes/"));
  map.get("exportJSON").click();
  const payload=JSON.parse(await blobs.get(downloads[1].href).text());
  assert.equal(payload.tracks.length,10);
  assert.equal(payload.privacy,"NO_PATHS_NO_AUDIO");
  assert.ok(!JSON.stringify(payload).includes("/Users/"));
});

test("CSV UI import works for other DJ, does not use NEBØA data",async()=>{
  const {map}=setup();
  const csv="artist,title,bpm,key\nDJ Jane,Opening,125,8A\nDJ John,Closer,127,8B";
  const event={target:{files:[{name:"myset.csv",size:csv.length,async text(){return csv;}}],value:""}};
  await map.get("fileInput").fire("change",event);
  assert.equal(map.get("kpiTracks").textContent,"02");
  assert.equal(map.get("tracksBody").children.length,2);
  assert.equal(map.get("importFeedback").className,"feedback success");
  assert.equal(map.get("modeTag").textContent,"ARCHIVO LOCAL");
});


test("USB folder picker imports OneLibrary inventory read-only, then creates a provisional session",async()=>{
  const {map}=setup();
  const dummy=[
    {name:"exportLibrary.db",webkitRelativePath:"TESTPEN/PIONEER/rekordbox/exportLibrary.db",size:56000,
      text(){throw Error("No se debe abrir SQLite")}},
    {name:"Opening (Extended Mix).mp3",webkitRelativePath:"TESTPEN/Music/01. DJ One - Opening (Extended Mix).mp3",size:20000,
      arrayBuffer(){throw Error("Nunca cargar audio al escanear")}},
    {name:"Closer.mp3",webkitRelativePath:"TESTPEN/Music/02. DJ Two - Closer.mp3",size:21000,
      arrayBuffer(){throw Error("Nunca cargar audio al escanear")}},
  ];
  const input=map.get("usbFolderInput");
  await input.fire("change",{target:{files:dummy,value:"fakepath"}});
  assert.equal(map.get("panel-usb").hidden,false);
  assert.equal(map.get("usbVolumeName").textContent,"TESTPEN");
  assert.equal(map.get("usbLibraryKind").textContent,"OneLibrary");
  assert.equal(map.get("usbAudioCount").textContent,"2");
  assert.equal(map.get("usbMode").textContent,"CARPETA SELECCIONADA · LECTURA");
  assert.equal(map.get("usbNoDrive").hidden,true);
  assert.equal(map.get("usbMountedView").hidden,false);
  assert.equal(map.get("usbFileRows").children.length,2);
  assert.equal(map.get("usbCreatePlaylist").disabled,false);
  assert.equal(map.get("usbLoadXML").disabled,true);
  map.get("usbCreatePlaylist").click();
  assert.equal(map.get("kpiTracks").textContent,"02");
  assert.equal(map.get("kpiCues").textContent,"00");
  assert.equal(map.get("modeTag").textContent,"USB / FICHEROS");
  assert.equal(map.get("panel-set").hidden,false);
  assert.equal(map.get("usbMatchCount").textContent,"2/2");
  map.get("usbPanelShortcut").click();
  assert.equal(map.get("panel-usb").hidden,false);
  map.get("usbForget").click();
  assert.equal(map.get("usbVolumeName").textContent,"—");
  assert.equal(map.get("usbNoDrive").hidden,false);
  assert.equal(map.get("usbCreatePlaylist").disabled,true);
  // Forgetting the device never deletes the user's in-memory session.
  assert.equal(map.get("kpiTracks").textContent,"02");
});

test("USB XML shows the import option without reading exportLibrary.db",async()=>{
  const {map}=setup();
  const xml='<?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION Entries="1">'
    +'<TRACK TrackID="52" Name="From USB XML" Artist="Artist" AverageBpm="129.0" Tonality="Fm"/>'
    +'</COLLECTION></DJ_PLAYLISTS>';
  const file={name:"rekordbox.xml",size:xml.length,webkitRelativePath:"USB/rekordbox.xml",async text(){return xml;}};
  await map.get("usbFolderInput").fire("change",{target:{files:[
    {name:"exportLibrary.db",webkitRelativePath:"USB/PIONEER/rekordbox/exportLibrary.db",size:200},
    file
  ],value:""}});
  assert.equal(map.get("usbLoadXML").disabled,false);
  assert.equal(map.get("usbXmlSelect").children.length,1);
  assert.equal(map.get("usbLibraryKind").textContent,"OneLibrary");
});


test("USB ID3 read enriches a provisional playlist and exports its quality report without changing source bytes",async()=>{
  const {map,downloads,blobs}=setup();
  function frame(id,text){
    const data=Buffer.from("\x03"+text,"utf8");
    const size=data.length;
    return Buffer.concat([Buffer.from(id,"latin1"),
      Buffer.from([(size>>>24)&255,(size>>>16)&255,(size>>>8)&255,size&255,0,0]),data]);
  }
  const data=Buffer.concat([frame("TIT2","Real Tagged Track"),
    frame("TPE1","DJ Source"),frame("TBPM","128"),
    frame("TKEY","9A"),frame("TALB","Demo Release")]);
  const len=data.length;
  const header=Buffer.from(["I".charCodeAt(0),68,51,3,0,0,
    (len>>>21)&127,(len>>>14)&127,(len>>>7)&127,len&127]);
  const original=Buffer.concat([header,data,Buffer.from([255,251,1,2,3])]);
  const untouched=Buffer.from(original);
  const f={name:"track0001.mp3",size:original.length,
    webkitRelativePath:"USB-DJ/Music/track0001.mp3",
    slice(start,end){return {async arrayBuffer(){
      return Uint8Array.from(original.subarray(start,end)).buffer;}}},
    text(){throw Error("Audio metadata only, never text()");}};
  await map.get("usbFolderInput").fire("change",{target:{files:[f],value:""}});
  assert.equal(map.get("usbReadTags").disabled,false);
  assert.equal(map.get("usbHealthSummary").children.length,5);
  await map.get("usbReadTags").fire("click");
  assert.equal(map.get("usbReadTags").disabled,true);
  assert.ok(map.get("usbTagProgress").textContent.includes("1/1"));
  assert.equal(map.get("usbHealthSummary").children[0].children[0].textContent,"1/1");
  map.get("usbCreatePlaylist").click();
  assert.equal(map.get("kpiTracks").textContent,"01");
  const first=map.get("tracksBody").children[0];
  assert.equal(first.children[1].children[0].textContent,"Real Tagged Track");
  assert.equal(first.children[1].children[1].textContent,"DJ Source");
  assert.equal(first.children[2].textContent,"128.0");
  assert.equal(first.children[3].children[0].textContent,"9A");
  map.get("usbExportAudit").click();
  assert.equal(downloads.length,1);
  const csv=await blobs.get(downloads[0].href).text();
  assert.ok(csv.includes("Demo Release"));
  assert.ok(csv.includes("Real Tagged Track"));
  assert.ok(csv.includes("ID3v2.3"));
  assert.ok(original.equals(untouched), "Browser File backing bytes must be immutable");
});
test("USB metadata read does not falsely call unsupported formats analysed",async()=>{
  const {map}=setup();
  const f={name:"track.m4a",size:3333,webkitRelativePath:"DEMO/Music/track.m4a",
    slice(){throw Error("No tag byte read for unsupported formats");}};
  await map.get("usbFolderInput").fire("change",{target:{files:[f],value:""}});
  await map.get("usbReadTags").fire("click");
  assert.equal(map.get("usbHealthSummary").children[0].children[0].textContent,"0/1");
  assert.equal(map.get("usbReadTags").disabled,true);
  assert.ok(map.get("usbHealthWarnings").children.length>=1);
});

test("CSV export formula injection protection",()=>{
  assert.equal(engine.csvCell("=HYPERLINK(\"https://example.com\")"),
    "\"'=HYPERLINK(\"\"https://example.com\"\")\"");
  assert.equal(engine.csvCell("+CMD"),"\"'+CMD\"");
  assert.equal(engine.csvCell("@SUM"),"\"'@SUM\"");
  assert.equal(engine.csvCell("Ordinary title"),"\"Ordinary title\"");
});
