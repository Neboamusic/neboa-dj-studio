"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const T=require("../tags.js");

function file(name,content){
  const body=Uint8Array.from(content);
  return {name,size:body.length,slice(start,end){
    return {async arrayBuffer(){return body.slice(start,end).buffer;}};
  }};
}
const ascii=s=>Array.from(Buffer.from(s,"latin1"));
const utf8=s=>Array.from(Buffer.from(s,"utf8"));
const be32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const le32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
const syncsafe=n=>[(n>>>21)&127,(n>>>14)&127,(n>>>7)&127,n&127];
function frame(id,text,version=3){
  const bytes=[3,...utf8(text)],size=version===4?syncsafe(bytes.length):be32(bytes.length);
  return [...ascii(id),...size,0,0,...bytes];
}
function mp3(body,version=3,flags=0){
  return [...ascii("ID3"),version,0,flags,...syncsafe(body.length),...body,0xFF,0xFB,0x90];
}
function flac(tags,{pictureBytes=12}={}){
  const comments=Object.entries(tags).map(([k,v])=>utf8(k+"="+v));
  const vorbis=[...le32(4),...ascii("test"),...le32(comments.length),
    ...comments.flatMap(c=>[...le32(c.length),...c])];
  function block(type,b,last){return [(type|(last?128:0)),(b.length>>>16)&255,(b.length>>>8)&255,b.length&255,...b];}
  return [...ascii("fLaC"),...block(0,new Array(34).fill(0),false),
    ...block(6,new Array(pictureBytes).fill(65),false),...block(4,vorbis,true)];
}
test("ID3v2.3 extracts artist, title, album, BPM and Camelot source value",async()=>{
  const frames=[frame("TIT2","Song (Extended Mix)"),frame("TPE1","Artist One"),
    frame("TBPM","127.5"),frame("TKEY","8A"),frame("TALB","Original Release")].flat();
  const out=await T.readTags(file("song.mp3",mp3(frames)));
  assert.equal(out.source,"ID3v2.3");
  assert.equal(out.title,"Song (Extended Mix)");
  assert.equal(out.artist,"Artist One");
  assert.equal(out.bpm,127.5);
  assert.equal(out.key,"8A");
  assert.equal(out.album,"Original Release");
  assert.equal(out.hasAny,true);
});
test("ID3v2.4 syncsafe sizes and UTF8 text",async()=>{
  const text=frame("TIT2","Música Ø",4);
  const out=await T.readTags(file("song.mp3",mp3(text,4)));
  assert.equal(out.title,"Música Ø");
  assert.equal(out.source,"ID3v2.4");
});
test("ID3v2.3 TXXX can carry INITIALKEY and BPM",async()=>{
  const extras=[
    ...ascii("TXXX"),...be32(1+("INITIALKEY".length+1+2)),0,0,
    3,...ascii("INITIALKEY"),0,...ascii("9B")
  ];
  const out=await T.readTags(file("song.mp3",mp3([...extras,...frame("TBPM","126")])));
  assert.equal(out.key,"9B");
  assert.equal(out.bpm,126);
});
test("ID3v2.3 UTF16LE with BOM supported",async()=>{
  const body=Array.from(Buffer.from("Àlbum", "utf16le"));
  const frameBytes=[...ascii("TALB"),...be32(3+body.length),0,0,1,0xff,0xfe,...body];
  const result=await T.readTags(file("utf16.mp3",mp3(frameBytes)));
  assert.equal(result.album,"Àlbum");
});
test("ID3 global unsynchronisation safely refuses unsupported tag",async()=>{
  const out=await T.readTags(file("x.mp3",mp3(frame("TIT2","Fake"),3,0x80)));
  assert.equal(out.source,"unsupported");
  assert.equal(out.hasAny,false);
});
test("Compressed, encrypted frames not treated as valid text",async()=>{
  const body=[...ascii("TIT2"),...be32(5),0,0x80,3,...ascii("Fake")];
  const parsed=T.parseID3(mp3(body),mp3(body).length);
  assert.equal(parsed.fields.title,undefined);
});
test("Invalid ID3 declared size and huge tag never fully read",async()=>{
  const content=[...ascii("ID3"),3,0,0,...syncsafe(3*1024*1024)];
  let reads=0;
  const f={name:"x.mp3",size:4*1024*1024,slice(a,b){reads++;if(reads>1)throw Error("overread");return {async arrayBuffer(){return Uint8Array.from(content).buffer;}}}};
  const result=await T.readTags(f);
  assert.equal(result.source,"unsupported");
  assert.equal(reads,1);
});
test("ID3v1 fallback reads title/artist/album but never fabricates BPM/key",async()=>{
  const body=[...new Array(400).fill(0),...ascii("TAG"),
    ...ascii("Old Song".padEnd(30,"\0")),...ascii("Old Artist".padEnd(30,"\0")),
    ...ascii("Old Album".padEnd(30,"\0")),...new Array(35).fill(0)];
  const out=await T.readTags(file("legacy.mp3",body));
  assert.equal(out.source,"ID3v1");
  assert.equal(out.title,"Old Song");
  assert.equal(out.artist,"Old Artist");
  assert.equal(out.bpm,null);
  assert.equal(out.key,null);
});
test("FLAC Vorbis comments read without decoding STREAMINFO, picture or audio frames",async()=>{
  const data=flac({TITLE:"FLAC Track",ARTIST:"DJ Two",BPM:"132",INITIALKEY:"6A",ALBUM:"B-Sides"}, {pictureBytes:1200});
  const out=await T.readTags(file("lossless.flac",data));
  assert.equal(out.source,"FLAC Vorbis");
  assert.equal(out.title,"FLAC Track");
  assert.equal(out.artist,"DJ Two");
  assert.equal(out.bpm,132);
  assert.equal(out.key,"6A");
  assert.equal(out.album,"B-Sides");
});
test("FLAC with malformed comment size fails conservatively",async()=>{
  const out=T.parseVorbis(Uint8Array.from([...le32(400),...ascii("a")]));
  assert.equal(out.source,"unsupported");
});
test("Lossless no Vorbis comments never invents tags",async()=>{
  const block=[0x80,0,0,34,...new Array(34).fill(0)];
  const out=await T.readTags(file("blank.flac",[...ascii("fLaC"),...block]));
  assert.equal(out.source,"none");
  assert.equal(out.title,null);
});
test("Unsupported audio formats report no parsed tags",async()=>{
  const out=await T.readTags(file("song.m4a",[0,0,0]));
  assert.equal(out.source,"unsupported");
  assert.equal(out.bpm,null);
});
test("Reject nan, invalid and absurd BPM",async()=>{
  const out=await T.readTags(file("bad.mp3",mp3(frame("TBPM","999"))));
  assert.equal(out.bpm,null);
  assert.equal(out.fields.bpm_raw,"999");
});
test("File reads bounded and read-only",async()=>{
  const result=await T.readTags(file("none.mp3",[0,1,2,3]));
  assert.equal(result.source,"none");
  assert.equal(result.title,null);
});
