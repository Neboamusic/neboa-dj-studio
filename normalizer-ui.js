/* DJ Studio Normalizer UX — connects ONLY to this browser's same-origin
 * loopback companion (127.0.0.1:18766). A static hosted page NEVER uploads audio
 * to any public service. Only POST on explicit user clicks. */
(function() {
  "use strict";
  const byId=id=>document.getElementById(id);
  const state={token:null,file:null,measurement:null,plan:null,stagingId:null,busy:false,rendered:false,requestVersion:0,
    batchFiles:[],batchResults:[],batchCancelled:false,batchRunning:false,batchConfig:null};
  const PROTOCOL_OK=typeof window!=="undefined" &&
    window.location.protocol==="http:" &&
    ["127.0.0.1","localhost"].includes(window.location.hostname) &&
    window.location.port==="18766";

  function node(tag,klass="",content=""){
    const n=document.createElement(tag);
    n.className=klass;
    n.textContent=String(content);
    return n;
  }
  function note(message,kind=""){
    const status=byId("normStatus");
    status.textContent=message;
    status.className="feedback"+(kind?" "+kind:"");
  }
  function number(value,digits=1) {
    return typeof value==="number"&&Number.isFinite(value)?value.toFixed(digits):"—";
  }
  function metric(label,value,unit=""){
    const box=node("div","normalize-metric");
    box.appendChild(node("small","",label));
    box.appendChild(node("strong","",value+(unit?" "+unit:"")));
    return box;
  }
  function safeName(file) {
    return String(file?.name||"sin nombre").slice(0,160);
  }
  function toggle() {
    const enabled=Boolean(state.token)&&!state.busy;
    byId("normAnalyze").disabled=!enabled||!state.file||state.file.size>128*1024*1024;
    byId("normRender").disabled=!enabled||!state.measurement||!state.plan||state.rendered;
    byId("normInput").disabled=state.busy;
    byId("normTarget").disabled=state.busy;
    byId("normFormat").disabled=state.busy;
    byId("normBatchInput").disabled=state.busy;
    byId("normBatchAnalyze").disabled=!enabled||!state.batchFiles.length||state.batchFiles.length>20;
    byId("normBatchRender").disabled=!enabled||!state.batchResults.some(x=>x.status==="ANALIZADO")||
      !state.batchConfig||state.batchConfig.target!==Number(byId("normTarget").value)||
      state.batchConfig.format!==byId("normFormat").value;
    byId("normBatchCancel").disabled=!state.batchRunning;
    byId("normBatchCsv").disabled=state.busy||!state.batchResults.length;
  }
  function renderMeasurements(){
    const el=byId("normMeasurements");
    el.replaceChildren();
    if(!state.measurement)return;
    const m=state.measurement;
    el.append(
      metric("LUFS INTEGRADO",number(m.integrated_lufs,2),"LUFS"),
      metric("TRUE PEAK",number(m.true_peak_dbtp,2),"dBTP"),
      metric("RANGO",number(m.lra_lu,1),"LU"),
      metric("DURACIÓN",number(m.duration_seconds,1),"s")
    );
  }
  function renderPlan(){
    const el=byId("normPlan");
    const warnings=byId("normWarnings");
    el.replaceChildren();warnings.replaceChildren();
    if(!state.plan)return;
    const p=state.plan;
    const signed= p.applied_gain_db>=0?"+":"";
    el.append(
      metric("GANANCIA",signed+number(p.applied_gain_db,2),"dB"),
      metric("LUFS PREVISTOS",number(p.predicted_lufs,2),"LUFS"),
      metric("PICO PREVISTO",number(p.predicted_true_peak_dbtp,2),"dBTP")
    );
    if(!p.exact_target_possible) {
      warnings.appendChild(node("p","normalize-warning",
        "El objetivo exacto no es posible con la ganancia segura. Se respeta la dinámica."));
    }
    for(const warning of p.warnings||[])
      warnings.appendChild(node("p","normalize-warning",warning));
    toggle();
  }
  function showOutput(response){
    state.rendered=true;
    state.measurement=null;
    state.plan=null;
    state.stagingId=null;
    state.file=null;
    const out=byId("normOutput");
    out.hidden=false;
    const m=response.after||{};
    byId("normOutputMetrics").textContent="LUFS final: "+
      number(m.integrated_lufs,2)+" · True peak final: "+
      number(m.true_peak_dbtp,2)+" dBTP · Archivo: "+
      number((response.output_bytes||0)/1024/1024,2)+" MiB. Original intacto.";
    byId("normOutputPath").textContent=response.output_path||"";
    note("Copia normalizada creada y medida de nuevo. No se ha tocado el archivo original.","success");
    toggle();
  }
  async function call(path,body=null,headers={}){
    const opts={method:body===null?"GET":"POST",headers:{"X-DJ-Token":state.token,...headers},
      credentials:"omit",cache:"no-store"};
    if(body!==null)opts.body=body;
    let response;
    try {response=await fetch(path,opts);}
    catch(_){throw new Error("El motor local no responde. Comprueba que siga abierto en el Mac.");}
    let data;
    try{data=await response.json();}
    catch(_){throw new Error("Respuesta inesperada del motor FFmpeg local");}
    if(!response.ok)throw new Error(data.error||"Operación rechazada por el motor local");
    return data;
  }
  async function connect() {
    if(!PROTOCOL_OK) {
      byId("normMode").textContent="NECESITA MOTOR LOCAL";
      note("La web está en modo estático. Para normalizar, abre el iniciador local FFmpeg que se describe abajo.");
      toggle();return;
    }
    try {
      const result=await call("/api/session");
      if(!result.active||!result.token||result.version!=="0.4.1")
        throw new Error("La versión del motor local no coincide con la interfaz");
      state.token=result.token;
      byId("normMode").textContent="FFMPEG LOCAL CONECTADO";
      byId("normSetup").hidden=true;
      note("Motor FFmpeg conectado. Selecciona un audio; las copias se guardarán en: "+result.output_dir,"success");
    }catch(error){
      state.token=null;
      byId("normMode").textContent="MOTOR NO DISPONIBLE";
      note(error.message,"error");
    }
    toggle();
  }
  async function refreshPlan() {
    if(!state.measurement||!state.token||state.busy)return;
    const ticket=++state.requestVersion;
    state.plan=null;
    renderPlan();
    toggle();
    try{
      const result=await call("/api/plan",JSON.stringify({
        target:Number(byId("normTarget").value),
        format:byId("normFormat").value,staging_id:state.stagingId
      }),{"Content-Type":"application/json"});
      if(ticket!==state.requestVersion)return;
      state.plan=result.plan;
      renderPlan();
    }catch(error){
      if(ticket!==state.requestVersion)return;
      state.plan=null;
      note(error.message,"error");
      renderPlan();
    }
  }
  async function analyze(){
    if(!state.file||!state.token||state.busy)return;
    const file=state.file;
    if(file.size>128*1024*1024){
      note("El motor acepta hasta 128 MiB por pista. Para archivos mayores usa el CLI local.","error");
      return;
    }
    state.busy=true;state.measurement=null;state.plan=null;state.stagingId=null;state.rendered=false;
    state.batchResults=[];state.batchConfig=null;renderBatchRows();
    byId("normOutput").hidden=true;
    renderMeasurements();renderPlan();toggle();
    note("Transfiriendo únicamente al motor 127.0.0.1 y midiendo LUFS y true peak reales…");
    try{
      const result=await call("/api/analyze",file,{
        "Content-Type":"application/octet-stream",
        "X-File-Name":encodeURIComponent(file.name)
      });
      state.measurement=result.measurements;
      state.stagingId=result.staging_id;
      state.plan=result.plan;
      renderMeasurements();renderPlan();
      note("Medición EBU R128 finalizada; el original sigue sin cambios.","success");
      state.busy=false;
      toggle();
      await refreshPlan();
    }catch(error){
      state.measurement=null;state.plan=null;
      state.busy=false;renderMeasurements();renderPlan();
      note(error.message,"error");toggle();
    }
  }
  async function renderCopy(){
    if(!state.measurement||!state.plan||!state.token||state.busy||state.rendered)return;
    state.busy=true;toggle();
    note("Generando una copia nueva, comprobando duración, LUFS y true peak…");
    try{
      const result=await call("/api/render",JSON.stringify({
        target:Number(byId("normTarget").value),
        format:byId("normFormat").value,staging_id:state.stagingId
      }),{"Content-Type":"application/json"});
      if(result.status!=="VERIFIED_NEW_COPY"||!result.original_unchanged)
        throw new Error("El motor no ha verificado la copia generada");
      showOutput(result);
    }catch(error){
      note(error.message,"error");
    }finally{
      state.busy=false;
      toggle();
    }
  }
  async function copyOutputPath(){
    const value=byId("normOutputPath").textContent;
    if(!value)return;
    try{
      await navigator.clipboard.writeText(value);
      note("Ruta de la copia copiada al portapapeles.","success");
    }catch{
      note("No se pudo copiar: selecciona la ruta mostrada para copiarla.","error");
    }
  }
  function batchStatus(message,kind=""){
    const status=byId("normBatchStatus");
    status.textContent=message;
    status.className="feedback"+(kind?" "+kind:"");
  }
  function renderBatchRows(){
    const holder=byId("normBatchRows");
    holder.replaceChildren();
    for(const entry of state.batchResults){
      const line=node("div","normalize-batch-row");
      const name=node("div","normalize-batch-name",safeName(entry.file));
      const detail=entry.measurements ?
        number(entry.measurements.integrated_lufs,2)+" LUFS · "+
        number(entry.measurements.true_peak_dbtp,2)+" dBTP · "+
        (entry.plan?((entry.plan.applied_gain_db>=0?"+":"")+number(entry.plan.applied_gain_db,2)+" dB"):"")+
        (entry.after?" · FINAL "+number(entry.after.integrated_lufs,2)+" LUFS / "+
          number(entry.after.true_peak_dbtp,2)+" dBTP":"") :
        (entry.error||"Pendiente");
      name.appendChild(node("small","",detail));
      line.appendChild(name);
      line.appendChild(node("span","normalize-batch-state"+
        (entry.status==="ERROR"?" bad":entry.status==="VERIFICADO"?" good":""),
        entry.status));
      if(entry.output_path)line.appendChild(node("code","normalize-batch-output",entry.output_path));
      holder.appendChild(line);
    }
  }
  function batchValid(files) {
    const allowed=new Set(["mp3","flac","wav","aif","aiff","m4a","aac"]);
    return files.length>0&&files.length<=20&&files.every(file=>{
      const ext=String(file.name||"").toLowerCase().split(".").pop();
      return allowed.has(ext)&&file.size>0&&file.size<=128*1024*1024;
    });
  }
  async function stageAndPlan(file,config) {
    const measurements=await call("/api/analyze",file,{
      "Content-Type":"application/octet-stream",
      "X-File-Name":encodeURIComponent(file.name)
    });
    if(!measurements.staging_id)throw new Error("No hay identificador de pista analizada");
    const payload={
      target:config.target,
      format:config.format,
      staging_id:measurements.staging_id
    };
    const proposal=await call("/api/plan",JSON.stringify(payload),
      {"Content-Type":"application/json"});
    return {measurements:measurements.measurements,plan:proposal.plan,stagingId:measurements.staging_id};
  }
  async function batchAnalyze(){
    if(!state.token||state.busy||!batchValid(state.batchFiles))return;
    const config={target:Number(byId("normTarget").value),format:byId("normFormat").value};
    state.busy=true;state.batchRunning=true;state.batchCancelled=false;
    state.measurement=null;state.plan=null;state.stagingId=null;state.file=null;
    state.batchResults=[];state.batchConfig=config;
    renderMeasurements();renderPlan();toggle();
    try{
      for(let i=0;i<state.batchFiles.length;i++){
        if(state.batchCancelled)break;
        const file=state.batchFiles[i];
        batchStatus("Midiendo "+(i+1)+"/"+state.batchFiles.length+
          " · "+safeName(file)+" · sin crear copias…");
        const item={file,status:"ANALIZANDO"};
        state.batchResults.push(item);renderBatchRows();
        try{
          const result=await stageAndPlan(file,config);
          Object.assign(item,result,{status:"ANALIZADO"});
        }catch(error){
          item.status="ERROR";item.error=error.message;
        }
        renderBatchRows();
      }
      const ok=state.batchResults.filter(x=>x.status==="ANALIZADO").length;
      batchStatus((state.batchCancelled?"Lectura detenida. ":"Lectura completada. ")+
        ok+" pistas medidas de "+state.batchFiles.length+
        ". Para crear copias nuevas es necesario confirmar la siguiente acción.",
        ok?"success":"error");
    }finally{
      state.busy=false;state.batchRunning=false;toggle();
    }
  }
  async function batchRender(){
    if(!state.token||state.busy||!state.batchResults.some(x=>x.status==="ANALIZADO"))return;
    const config=state.batchConfig;
    if(!config||config.target!==Number(byId("normTarget").value)||
      config.format!==byId("normFormat").value)return;
    const amount=state.batchResults.filter(x=>x.status==="ANALIZADO").length;
    if(!window.confirm("Se crearán "+amount+
      " COPIAS NUEVAS en la carpeta local de normalización. No se tocarán originales ni USB. ¿Continuar?"))return;
    state.busy=true;state.batchRunning=true;state.batchCancelled=false;toggle();
    try{
      const active=state.batchResults.filter(x=>x.status==="ANALIZADO");
      for(let i=0;i<active.length;i++){
        if(state.batchCancelled)break;
        const entry=active[i];
        entry.status="GENERANDO";renderBatchRows();
        batchStatus("Normalizando "+(i+1)+"/"+active.length+
          " · "+safeName(entry.file)+" · validando copia…");
        try{
          const staged=await stageAndPlan(entry.file,config);
          if(entry.measurements?.source_sha256 &&
             entry.measurements.source_sha256!==staged.measurements.source_sha256)
            throw new Error("El audio ha cambiado desde la medición del lote; copia rechazada.");
          entry.measurements=staged.measurements;
          entry.plan=staged.plan;
          const result=await call("/api/render",JSON.stringify({
            target:config.target,format:config.format,
            staging_id:staged.stagingId
          }),{"Content-Type":"application/json"});
          if(result.status!=="VERIFIED_NEW_COPY"||!result.original_unchanged)
            throw new Error("No se pudo verificar la copia");
          entry.status="VERIFICADO";
          entry.output_path=result.output_path;
          entry.after=result.after;
          entry.copy_sha256=result.copy_sha256||"";
        }catch(error){
          entry.status="ERROR";entry.error=error.message;
          if(/espacio insuficiente|no space|disk full|enospc/i.test(error.message)){
            state.batchCancelled=true;
            batchStatus("Lote detenido para proteger el disco: "+error.message,"error");
          }
        }
        renderBatchRows();
      }
      const verified=state.batchResults.filter(x=>x.status==="VERIFICADO").length;
      const failures=state.batchResults.filter(x=>x.status==="ERROR").length;
      batchStatus("Cierre de lote: "+verified+" copias verificadas, "+failures+
        " errores. "+(state.batchCancelled?"Proceso detenido; pendientes sin modificar.":"")+
        " Las copias no sustituyen audios en Rekordbox.",failures?"error":"success");
    }finally{
      state.busy=false;state.batchRunning=false;toggle();
    }
  }
  function csvCell(value) {
    const isUserText=typeof value==="string";
    let clean=String(value??"").replace(/[\r\n]/g," ");
    if(isUserText && /^[\t ]*[=+\-@]/.test(clean))clean="'"+clean;
    return '"'+clean.replace(/"/g,'""')+'"';
  }
  function exportBatchCsv(){
    if(state.busy||!state.batchResults.length)return;
    const cols=["archivo","estado","lufs_antes","pico_antes_dbtp",
      "lra_lu","ganancia_db","lufs_previstos","lufs_final","pico_final_dbtp",
      "formato","copia_nombre","sha256_original","sha256_copia","detalle"];
    const lines=[cols.map(csvCell).join(",")];
    for(const e of state.batchResults){
      const m=e.measurements||{},p=e.plan||{},a=e.after||{};
      const outName=e.output_path?String(e.output_path).split(/[\\/]/).pop():"";
      const fields=[safeName(e.file),e.status,m.integrated_lufs??"",m.true_peak_dbtp??"",
        m.lra_lu??"",p.applied_gain_db??"",p.predicted_lufs??"",
        a.integrated_lufs??"",a.true_peak_dbtp??"",
        state.batchConfig?.format||"",outName,m.source_sha256||"",
        e.copy_sha256||"",e.error||((p.warnings||[]).join(" | "))];
      lines.push(fields.map(csvCell).join(","));
    }
    const data=new Blob(["\uFEFF",lines.join("\r\n")+"\r\n"],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(data);
    try{
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download="DJStudio-NEBOA-auditoria-normalizacion.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }finally{
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    batchStatus("Auditoría CSV descargada. Contiene medidas y nombres, sin rutas privadas.","success");
  }

  function bind(){
    byId("normInput").addEventListener("change",event=>{
      const file=event.target.files?.[0]||null;
      state.file=file;state.measurement=null;state.plan=null;state.stagingId=null;state.rendered=false;
      state.batchResults=[];state.batchConfig=null;renderBatchRows();
      byId("normOutput").hidden=true;
      byId("normFileName").textContent=file ?
        safeName(file)+" · "+(file.size/1024/1024).toFixed(1)+" MiB":
        "Ninguna pista seleccionada.";
      renderMeasurements();renderPlan();toggle();
      note(file?"Audio seleccionado. Pulsa Medir LUFS para evaluar sin modificarlo.":"Ningún audio seleccionado.");
    });
    byId("normBatchInput").addEventListener("change",event=>{
      const files=Array.from(event.target.files||[]);
      state.batchFiles=files;
      state.batchResults=[];
      state.batchConfig=null;
      state.batchCancelled=false;
      renderBatchRows();
      if(!files.length)batchStatus("Sin lote seleccionado.");
      else if(!batchValid(files))batchStatus("Selecciona de 1 a 20 audios compatibles, cada uno de 0 a 128 MiB.","error");
      else batchStatus(files.length+" archivos seleccionados. Primero mide el lote; todavía no se modificará nada.");
      toggle();
    });
    byId("normBatchAnalyze").addEventListener("click",batchAnalyze);
    byId("normBatchCsv").addEventListener("click",exportBatchCsv);
    byId("normBatchRender").addEventListener("click",batchRender);
    byId("normBatchCancel").addEventListener("click",()=>{
      state.batchCancelled=true;
      batchStatus("Detención solicitada: se finalizará la pista que se procesa actualmente.");
    });
    byId("normAnalyze").addEventListener("click",analyze);
    byId("normRender").addEventListener("click",renderCopy);
    for(const control of ["normTarget","normFormat"])
      byId(control).addEventListener("change",()=>{
        if(state.batchResults.length){state.batchConfig=null;
          batchStatus("Objetivo cambiado. Vuelve a medir el lote antes de crear copias.");toggle();}
        refreshPlan();
      });
    byId("normCopyPath").addEventListener("click",copyOutputPath);
    connect();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);
  else bind();
})();
