"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"normalizer-ui.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");

class N {
  constructor(){this.textContent="";this.className="";this.hidden=false;
    this.value="";this.disabled=false;this.children=[];this.listeners={};this.files=[];}
  replaceChildren(...nodes){this.children=nodes;}
  append(...args){this.children.push(...args);}
  appendChild(node){this.children.push(node);}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  fire(type,event={}){return Promise.all((this.listeners[type]||[]).map(fn=>fn(event)));}
}
async function flush(){await new Promise(resolve=>setImmediate(resolve));}
function fixture({local=true}={}){
  const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),m=>m[1]);
  const map=new Map(ids.map(id=>[id,new N()]));
  map.get("normTarget").value="-11";
  map.get("normFormat").value="flac";
  const opts=[];
  let csvBlob=null;
  const downloads=[];
  const plan={
    target_lufs:-11,ceiling_dbtp:-1.5,requested_gain_db:-3.0,
    applied_gain_db:-3.0,predicted_lufs:-11,predicted_true_peak_dbtp:-3.2,
    output_format:"flac",exact_target_possible:true,method:"GAIN_ONLY_NO_COMPRESSOR_NO_LIMITER",warnings:[]
  };
  const measurements={
    integrated_lufs:-8,true_peak_dbtp:-0.2,lra_lu:4.0,duration_seconds:185,
    bytes:9000000,filename:"track.mp3",source_sha256:"synthetic-fingerprint"
  };
  const fetchMock=async(url,config={})=>{
    opts.push({url,config});
    if(url==="/api/session")return {ok:true,async json(){return {
      active:true,version:"0.4.1",token:"secret-test-token",
      output_dir:"/home/testuser/DJStudio-Normalized",max_upload_bytes:128*1024*1024}}};
    if(url==="/api/analyze")return {ok:true,async json(){return {filename:"track.mp3",measurements,plan,staging_id:"synthetic-stage-123"}}};
    if(url==="/api/plan")return {ok:true,async json(){return {plan}}};
    if(url==="/api/render")return {ok:true,async json(){return {
      status:"VERIFIED_NEW_COPY",output_path:"/home/testuser/DJStudio-Normalized/track__NORMALIZED_11LUFS_flac.flac",
      output_bytes:12000000,after:{integrated_lufs:-11.1,true_peak_dbtp:-3.4},
      original_unchanged:true}}};
    throw Error("Unexpected request "+url);
  };
  const document={readyState:"complete",getElementById(id){
    assert.ok(map.has(id),"Missing id "+id);return map.get(id);},
    createElement(tag){
      const n=new N();
      if(tag==="a"){
        n.click=()=>downloads.push({filename:n.download,url:n.href});
        n.remove=()=>{};
      }
      return n;
    },body:{appendChild(){}},addEventListener(){}};
  const origin=local?{protocol:"http:",hostname:"127.0.0.1",port:"18766"}
    :{protocol:"file:",hostname:"",port:""};
  vm.runInNewContext(source,{window:{location:origin,confirm(){return true;}},document,navigator:{
    clipboard:{async writeText(){}}
  },fetch:fetchMock,console,Blob,URL:{
    createObjectURL(blob){csvBlob=blob;return "blob:local-csv-test";},
    revokeObjectURL(){}
  },setTimeout(fn){fn();}});
  return {map,opts,measurements,downloads,csvBlob:()=>csvBlob};
}

test("Normalizer HTML has expected controls and no arbitrary network endpoint",()=>{
  const expected=["normMode","normInput","normAnalyze","normRender","normFormat","normTarget",
    "normBatchInput","normBatchAnalyze","normBatchRender","normBatchCancel","normBatchCsv","normBatchRows","normBatchStatus",
    "normMeasurements","normPlan","normOutput","normWarnings","normSetup","normStatus",
    "normCopyPath","normOutputPath","normFileName"];
  for(const id of expected)assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(source.includes('window.location.port==="18766"'));
  assert.ok(!source.includes("innerHTML"));
  assert.ok(!/https?:\/\/(?!127.0.0.1|localhost)/.test(source));
});
test("static file mode never attempts remote/local upload, requests or normalization",async()=>{
  const {map,opts}=fixture({local:false});
  await flush();
  assert.equal(opts.length,0);
  assert.equal(map.get("normMode").textContent,"NECESITA MOTOR LOCAL");
  assert.equal(map.get("normAnalyze").disabled,true);
  assert.equal(map.get("normRender").disabled,true);
});
test("loopback-only file -> LUFS analysis -> human preview -> new copy",async()=>{
  const {map,opts}=fixture();
  await flush();
  assert.equal(opts[0].url,"/api/session");
  assert.equal(map.get("normMode").textContent,"FFMPEG LOCAL CONECTADO");
  assert.equal(map.get("normSetup").hidden,true);
  const file={name:"track.mp3",size:9000000};
  await map.get("normInput").fire("change",{target:{files:[file]}});
  assert.equal(map.get("normAnalyze").disabled,false);
  assert.equal(map.get("normRender").disabled,true);
  assert.equal(opts.length,1,"No uploads when merely choosing a file");
  await map.get("normAnalyze").fire("click");
  await flush();
  assert.equal(opts[1].url,"/api/analyze");
  assert.equal(opts[1].config.body,file);
  assert.equal(opts[1].config.headers["X-DJ-Token"],"secret-test-token");
  assert.equal(map.get("normMeasurements").children.length,4);
  assert.equal(map.get("normRender").disabled,false);
  await map.get("normRender").fire("click");
  await flush();
  assert.ok(opts.some(x=>x.url==="/api/render"));
  assert.equal(map.get("normOutput").hidden,false);
  assert.ok(map.get("normOutputPath").textContent.includes("NORMALIZED"));
  assert.equal(map.get("normRender").disabled,true);
  assert.ok(map.get("normStatus").textContent.includes("creada"));
});
test("target switching sends trusted plan API and does not re-upload audio",async()=>{
  const {map,opts}=fixture();
  await flush();
  const file={name:"track.mp3",size:90000};
  await map.get("normInput").fire("change",{target:{files:[file]}});
  await map.get("normAnalyze").fire("click");
  map.get("normTarget").value="-12";
  await map.get("normTarget").fire("change");
  const requests=opts.filter(x=>x.url==="/api/plan");
  assert.ok(requests.length>=1);
  assert.equal(JSON.parse(requests.at(-1).config.body).target,-12);
  assert.equal(opts.filter(x=>x.url==="/api/analyze").length,1);
});
test("batch preview never creates copies; explicit confirmation renders only selected 2 files",async()=>{
  const {map,opts}=fixture();
  await flush();
  const files=[{name:"DJ Alpha.mp3",size:60000},{name:"DJ Beta.flac",size:64000}];
  await map.get("normBatchInput").fire("change",{target:{files}});
  assert.equal(map.get("normBatchAnalyze").disabled,false);
  assert.equal(map.get("normBatchRender").disabled,true);
  await map.get("normBatchAnalyze").fire("click");
  await flush();
  assert.equal(opts.filter(x=>x.url==="/api/analyze").length,2);
  assert.equal(opts.filter(x=>x.url==="/api/render").length,0);
  assert.equal(map.get("normBatchRows").children.length,2);
  assert.equal(map.get("normBatchRender").disabled,false);
  await map.get("normBatchRender").fire("click");
  assert.equal(opts.filter(x=>x.url==="/api/render").length,2);
  assert.equal(map.get("normBatchRows").children[0].children[1].textContent,"VERIFICADO");
  assert.equal(map.get("normBatchRows").children[1].children[1].textContent,"VERIFICADO");
  assert.equal(map.get("normBatchRender").disabled,true);
});
test("changing LUFS target invalidates existing batch plan until reanalysis",async()=>{
  const {map,opts}=fixture();
  await flush();
  await map.get("normBatchInput").fire("change",{target:{files:[{name:"One.wav",size:10000}]}});
  await map.get("normBatchAnalyze").fire("click");
  assert.equal(map.get("normBatchRender").disabled,false);
  map.get("normTarget").value="-14";
  await map.get("normTarget").fire("change");
  assert.equal(map.get("normBatchRender").disabled,true);
  await map.get("normBatchRender").fire("click");
  assert.equal(opts.filter(x=>x.url==="/api/render").length,0);
});
test("batch rejects more than 20 or oversized files, without uploads",async()=>{
  const {map,opts}=fixture();
  await flush();
  await map.get("normBatchInput").fire("change",{target:{
    files:Array.from({length:21},(_,i)=>({name:"song"+i+".mp3",size:12000}))}});
  assert.equal(map.get("normBatchAnalyze").disabled,true);
  await map.get("normBatchAnalyze").fire("click");
  assert.equal(opts.filter(x=>x.url==="/api/analyze").length,0);
});

test("batch CSV escapes spreadsheet formulas and excludes private output paths",async()=>{
  const {map,downloads,csvBlob}=fixture();
  await flush();
  const files=[{name:"=HYPERLINK(A1).mp3",size:60000}];
  await map.get("normBatchInput").fire("change",{target:{files}});
  await map.get("normBatchAnalyze").fire("click");
  assert.equal(map.get("normBatchCsv").disabled,false);
  await map.get("normBatchCsv").fire("click");
  assert.equal(downloads.length,1);
  assert.ok(downloads[0].filename.endsWith(".csv"));
  const analysisCsv=await csvBlob().text();
  assert.ok(analysisCsv.includes("'=HYPERLINK(A1).mp3"),"Unsafe spreadsheet formula");
  assert.ok(analysisCsv.includes("sha256_original"));
  assert.ok(!analysisCsv.includes("/home/testuser/"));
  await map.get("normBatchRender").fire("click");
  await map.get("normBatchCsv").fire("click");
  const finalCsv=await csvBlob().text();
  assert.ok(finalCsv.includes("-11.1"),"Final LUFS should be exported");
  assert.ok(finalCsv.includes("synthetic-fingerprint"));
  assert.ok(!finalCsv.includes("/home/testuser/"));
});

test("large files are rejected before upload and copy generation remains disabled",async()=>{
  const {map,opts}=fixture();await flush();
  const file={name:"huge.flac",size:140*1024*1024};
  await map.get("normInput").fire("change",{target:{files:[file]}});
  assert.equal(map.get("normAnalyze").disabled,true);
  await map.get("normAnalyze").fire("click");
  assert.ok(map.get("normStatus").textContent.includes("128 MiB"));
  assert.equal(opts.filter(x=>x.url==="/api/analyze").length,0);
});
