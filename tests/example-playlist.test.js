"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const E=require("../core.js");

test("Public demo playlist imports cleanly and contains only synthetic data",()=>{
  const p=path.join(__dirname,"..","examples","fictional-hypnotic-techno.tsv");
  const data=fs.readFileSync(p,"utf8");
  const tracks=E.csvRows(data);
  assert.equal(tracks.length,10);
  assert.equal(new Set(tracks.map(x=>x.id)).size,10);
  assert.ok(tracks.every(x=>x.artist.startsWith("Synthetic Artist ")));
  assert.ok(tracks.every(x=>Number.isFinite(x.bpm)&&x.bpm>=140&&x.bpm<=145));
  assert.ok(tracks.every(x=>x.camelot!==null&&x.energy!==null));
  assert.ok(!data.includes("/Users/")&&!data.includes("/Volumes/")&&!data.includes("\\"));
  assert.ok(!data.includes("Cesare il Galo")&&!data.includes("NEBØA"),"Fictitious data must not represent the artist's real catalogue");
});

test("Synthetic demo can be used with Mix Coach transitions without external audio",()=>{
  const data=fs.readFileSync(path.join(__dirname,"..","examples","fictional-hypnotic-techno.tsv"),"utf8");
  const tracks=E.csvRows(data);
  const transitions=tracks.slice(1).map((t,i)=>E.transition(tracks[i],t,new Map()));
  assert.equal(transitions.length,9);
  assert.ok(transitions.every(t=>Number.isFinite(t.score)&&t.score>=0&&t.score<=100));
  assert.ok(transitions.every(t=>t.deltaBpm!==null));
});
