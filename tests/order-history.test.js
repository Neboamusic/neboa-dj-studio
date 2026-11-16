"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const engine=require("../core.js"),usb=require("../usb.js"),tags=require("../tags.js");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");

class Node {
  constructor(tag="div"){
    this.tagName=tag;this.children=[];this.handlers={};this.className="";this.textContent="";
    this.classList={toggle(){},add(){},remove(){}};
    this.disabled=false;this.hidden=false;this.value="";this.checked=false;this.dataset={};this.attributes={};
  }
  addEventListener(type,callback){(this.handlers[type]??=[]).push(callback);}
  appendChild(child){if(child.tagName==="fragment")this.children.push(...child.children);else this.children.push(child);return child;}
  append(...children){this.children.push(...children);return this;}
  replaceChildren(...children){this.children=children;return this;}
  setAttribute(k,v){this.attributes[k]=v;}
  click(){for(const h of this.handlers.click||[])h({preventDefault(){}});}
  async fire(type,event){for(const h of this.handlers[type]||[])await h(event);}
  remove(){}
}
function createApp(){
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]),m=new Map(ids.map(id=>[id,new Node(id)]));
  const tabs=["set","mix","levels","normalize","usb","export"].map(tab=>{const btn=new Node("button");btn.dataset.tab=tab;return btn;});
  m.get("sortMode").value="harmonic";m.get("playlistSelect").value="__all";m.get("preserveFirst").checked=true;
  const document={
    readyState:"complete",body:new Node("body"),
    getElementById(id){const n=m.get(id);assert.ok(n,"missing UI node "+id);return n;},
    createElement(tag){return new Node(tag);},createDocumentFragment(){return new Node("fragment");},
    querySelectorAll(selector){assert.equal(selector,".tab");return tabs;}
  };
  vm.runInNewContext(app,{window:{DJStudioEngine:engine,DJStudioUSB:usb,DJStudioTags:tags},document,console,Blob,
    URL:{createObjectURL(){return "blob:test";},revokeObjectURL(){}},setTimeout(){}},{filename:"app.js"});
  const order=()=>m.get("tracksBody").children.filter(x=>x.tagName==="tr")
    .map(row=>row.children[1]?.children[0]?.textContent).filter(Boolean);
  return {m,order};
}
function clickSort(m,mode){m.get("sortMode").value=mode;m.get("applySort").click();}

test("history controls have accessible labels and begin disabled",()=>{
  assert.match(html,/id="undoOrder"/);
  assert.match(html,/id="redoOrder"/);
  assert.match(html,/aria-label="Historial de cambios de la sesión"/);
  const {m}=createApp();
  assert.equal(m.get("undoOrder").disabled,true);
  assert.equal(m.get("redoOrder").disabled,true);
});
test("proposed order can be undone and redone without touching sources",()=>{
  const {m,order}=createApp();m.get("demoBtn").click();
  const original=order();assert.equal(original.length,10);
  clickSort(m,"bpm-desc");
  const sorted=order();assert.notDeepEqual(sorted,original);
  assert.equal(m.get("undoOrder").disabled,false);
  assert.equal(m.get("redoOrder").disabled,true);
  m.get("undoOrder").click();
  assert.deepEqual(order(),original);
  assert.equal(m.get("redoOrder").disabled,false);
  m.get("redoOrder").click();assert.deepEqual(order(),sorted);
  // Restoring the original is also a reversible local operation.
  m.get("resetOrder").click();assert.deepEqual(order(),original);
  m.get("undoOrder").click();assert.deepEqual(order(),sorted);
});
test("manual reorder creates history and a new edit clears redo",()=>{
  const {m,order}=createApp();m.get("demoBtn").click();
  const baseline=order();
  const controls=m.get("trackDetail").children.find(n=>n.className==="inspector-actions");
  assert.ok(controls);controls.children[1].click(); // move the selected first track down
  const moved=order();assert.notDeepEqual(moved,baseline);
  m.get("undoOrder").click();assert.deepEqual(order(),baseline);
  m.get("redoOrder").click();assert.deepEqual(order(),moved);
  m.get("undoOrder").click();assert.deepEqual(order(),baseline);
  clickSort(m,"bpm-desc");
  assert.equal(m.get("redoOrder").disabled,true,"new edits must invalidate redo");
});
test("new imports clear history and no-op sorting does not add a history step",async()=>{
  const {m,order}=createApp();m.get("demoBtn").click();
  clickSort(m,"original");assert.equal(m.get("undoOrder").disabled,true);
  clickSort(m,"bpm-desc");assert.equal(m.get("undoOrder").disabled,false);
  const csv="artist,title,bpm,key\nSynthetic X,New A,142,8A\nSynthetic Y,New B,143,8B";
  await m.get("fileInput").fire("change",{target:{files:[{name:"other-dj.csv",size:csv.length,async text(){return csv;}}],value:""}});
  assert.deepEqual(order(),["New A","New B"]);
  assert.equal(m.get("undoOrder").disabled,true);
  assert.equal(m.get("redoOrder").disabled,true);
});
test("undo history is bounded to 30 changes",()=>{
  const {m}=createApp();m.get("demoBtn").click();
  for(let i=0;i<36;i++)clickSort(m,i%2===0?"bpm-desc":"bpm-asc");
  for(let i=0;i<30;i++)assert.equal(m.get("undoOrder").disabled,false,"expected history at "+i),m.get("undoOrder").click();
  assert.equal(m.get("undoOrder").disabled,true);
  assert.equal(m.get("redoOrder").disabled,false);
});
