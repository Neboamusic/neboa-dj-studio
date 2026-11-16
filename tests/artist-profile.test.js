"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=rel=>fs.readFileSync(path.join(root,rel),"utf8");

test("artist identity is consistent between the public page and artist profile",()=>{
  const page=read("artist.html"),profile=read("docs/ARTIST.md");
  for(const s of ["NEBØA","César López","Cesare il Galo","España"]){
    assert.ok(page.includes(s),"artist.html missing "+s);
    assert.ok(profile.includes(s),"ARTIST.md missing "+s);
  }
  assert.match(profile,/info@csarlopez\.com/);
  assert.match(page,/<html lang="es">/);
  assert.match(page,/<article lang="en">/);
});

test("artist page is static, navigable, and has no imports of private data",()=>{
  const page=read("artist.html");
  for(const rel of ["index.html","assets/neboa-avatar.jpg"]){
    assert.ok(page.includes(rel),"missing local asset "+rel);
    assert.ok(fs.existsSync(path.join(root,rel)),"local asset not found: "+rel);
  }
  assert.ok(page.includes('content="default-src \'self\';'),"CSP missing");
  assert.ok(!/<script\b/i.test(page),"artist page must not run scripts");
  for(const forbidden of ["/Users/","192.168.","Findspo-Corp","/Volumes/","api_key"]){
    assert.ok(!page.includes(forbidden),"private/internal value present: "+forbidden);
  }
});

test("DJ Studio remains generic for other DJs and links back to the artist",()=>{
  const app=read("index.html");
  assert.match(app,/id="djName"[^>]*value=""/);
  assert.ok(app.includes('href="artist.html"'),"artist link missing from DJ Studio");
  assert.ok(!/value="NEBØA"/.test(app),"do not prefill all DJs with the project owner's name");
});
