"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const base="https://neboamusic.github.io/neboa-dj-studio/";
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

test("Public pages have correct canonical URLs and independent NEBOA metadata",()=>{
  const pages=[["index.html",base],["artist.html",base+"artist.html"]];
  for(const [file,uri] of pages){
    const html=read(file);
    assert.ok(html.includes('<link rel="canonical" href="'+uri+'">'),file+" canonical");
    assert.ok(html.includes('<meta property="og:url" content="'+uri+'">'),file+" OpenGraph URL");
    assert.ok(html.includes('<link rel="manifest" href="site.webmanifest">'),file+" manifest");
    assert.ok(html.includes('<meta name="twitter:card" content="summary">'),file+" card");
    assert.ok(!html.includes("Findspo-Corp")&&!html.includes("Leanspots"),"NEBOA must not inherit corporate accounts");
  }
});

test("Sitemap points only to existing published public HTML",()=>{
  const xml=read("sitemap.xml");
  const urls=Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g),m=>m[1]);
  assert.deepEqual(urls,[base,base+"artist.html"]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  for(const url of urls){
    assert.ok(url.startsWith(base));
    const rel=url.slice(base.length)||"index.html";
    assert.ok(fs.existsSync(path.join(root,rel)),rel+" missing");
  }
});

test("Manifest is local-only and uses the project-owned artist mark",()=>{
  const manifest=JSON.parse(read("site.webmanifest"));
  assert.equal(manifest.display,"browser");
  assert.equal(manifest.start_url,"./");
  assert.equal(manifest.scope,"./");
  assert.equal(manifest.icons.length,1);
  assert.equal(manifest.icons[0].src,"assets/neboa-avatar.jpg");
  assert.equal(manifest.icons[0].sizes,"192x192");
  assert.ok(fs.existsSync(path.join(root,manifest.icons[0].src)));
});
