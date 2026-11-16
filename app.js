/* NEBØA DJ Studio frontend, zero dependencies. All private music metadata stays in
   the browser memory, never sent to a service. No native Rekordbox/Pioneer writes. */
(function () {
  "use strict";
  const E=window.DJStudioEngine;
  const U=window.DJStudioUSB;
  const T=window.DJStudioTags;
  if(!E||!U||!T)throw new Error("Motor musical, explorador USB o lector ID3/FLAC no disponible");
  const byId=id=>document.getElementById(id);
  const state={
    library:[],playlists:[],original:[],order:[],name:"",
    source:"none",selectedId:null,selectedMix:null,tab:"set",
    measurements:new Map(),libraryVersion:null,demo:false,usb:null,usbMatch:null,usbIndex:null,
    usbTags:new Map(),usbTagBusy:false,usbTagToken:null,usbTagText:"",usbHealth:null,
    undoStack:[],redoStack:[]
  };
  const HISTORY_LIMIT=30;
  function rememberOrder(){
    if(!state.order.length)return;
    state.undoStack.push(state.order.slice());
    if(state.undoStack.length>HISTORY_LIMIT)state.undoStack.shift();
    state.redoStack.length=0;
  }
  function restoreOrderHistory(source,target){
    if(!source.length)return;
    target.push(state.order.slice());
    if(target.length>HISTORY_LIMIT)target.shift();
    state.order=source.pop();
    if(!state.order.some(t=>t.id===state.selectedId))state.selectedId=state.order[0]?.id||null;
    state.selectedMix=null;
    update();
  }
  const RECOMMENDATION_WARNING="Las propuestas requieren escuchar el audio y revisar beatgrids, cues y niveles.";

  function dom(tag,className="",text=null) {
    const x=document.createElement(tag);
    if(className)x.className=className;
    if(text!==null)x.textContent=String(text);
    return x;
  }
  function feedback(message,type=""){
    const target=byId("importFeedback");
    target.textContent=message;target.className="feedback"+(type?" "+type:"");
  }
  function setSource(parsed,displayName,demo=false){
    if(!parsed.library.length)throw new Error("No se encontraron pistas con título.");
    state.library=parsed.library;
    state.playlists=parsed.playlists||[];
    state.source=displayName;
    state.libraryVersion=parsed.version||null;
    state.demo=demo;
    state.measurements.clear();
    const select=byId("playlistSelect");
    select.replaceChildren();
    const all=dom("option","","Toda la colección ("+parsed.library.length+")");
    all.value="__all";select.appendChild(all);
    for(let i=0;i<state.playlists.length;i++){
      const p=state.playlists[i],o=dom("option","",p.name+" ("+p.tracks.length+")");
      o.value=String(i);select.appendChild(o);
    }
    select.disabled=false;
    if(state.playlists.length){
      // Prefer a usable playlist instead of a 20k+ track entire library.
      const index=state.playlists.findIndex(p=>p.tracks.length>=2&&p.tracks.length<=500);
      if(index>=0)select.value=String(index);
      else select.value="__all";
    }else select.value="__all";
    onPlaylistChange();
    byId("modeTag").textContent=demo?"DEMO FICTICIA":"ARCHIVO LOCAL";
    feedback(displayName+" · "+parsed.library.length+" pistas cargadas. No se ha subido ningún archivo.","success");
  }
  function onPlaylistChange(){
    const value=byId("playlistSelect").value;
    const selected=value==="__all"?state.library:state.playlists[Number(value)]?.tracks||[];
    // Preserve each reference and its source position but avoid duplicate ids.
    state.original=selected.slice(0,10000);
    state.order=state.original.slice();
    state.undoStack.length=0;state.redoStack.length=0;
    state.name=value==="__all"?"Toda la colección":state.playlists[Number(value)]?.name||"Sesión";
    state.selectedId=state.order[0]?.id||null;
    state.selectedMix=null;
    state.measurements.clear();
    byId("searchInput").value="";
    byId("sortMode").value="harmonic";
    byId("librarySummary").textContent=state.library.length+" pistas · "+state.playlists.length+" playlists";
    byId("activePlaylistName").textContent=state.name;
    update();
  }
  function update(){
    const tracks=state.order;
    byId("applySort").disabled=!tracks.length;
    byId("resetOrder").disabled=!tracks.length;
    byId("undoOrder").disabled=!state.undoStack.length;
    byId("redoOrder").disabled=!state.redoStack.length;
    for(const name of ["exportCSV","exportJSON","exportCues"])byId(name).disabled=!tracks.length;
    const bpm=tracks.map(t=>t.bpm).filter(x=>x!==null);
    const cues=tracks.reduce((n,t)=>n+t.cues.length,0);
    const transitions=allTransitions();
    const risk=transitions.filter(x=>x.harmony==="Tonalidad desconocida"||x.score<70||x.deltaBpm===null||Math.abs(x.deltaBpm)>6).length;
    byId("kpiTracks").textContent=String(tracks.length).padStart(2,"0");
    byId("kpiBpm").textContent=bpm.length?Math.round(Math.min(...bpm))+"—"+Math.round(Math.max(...bpm)):"—";
    byId("kpiCues").textContent=String(cues).padStart(2,"0");
    byId("kpiRisks").textContent=String(risk).padStart(2,"0");
    byId("tableCount").textContent=tracks.length+" pistas · "+state.source;
    byId("footerState").textContent=state.demo?"Datos ficticios de demostración":state.source==="none"?"Importa una biblioteca para comenzar":"Datos procesados en este navegador";
    renderTracks();renderInspector();renderMix();renderLevels();renderUSB();
  }
  function allTransitions(){
    const out=[];
    for(let i=1;i<state.order.length;i++)out.push(E.transition(state.order[i-1],state.order[i],state.measurements));
    return out;
  }
  function td(row,text,className=""){
    const x=dom("td",className,text);row.appendChild(x);return x;
  }
  function renderTracks(){
    const holder=byId("tracksBody");holder.replaceChildren();
    const q=byId("searchInput").value.trim().toLowerCase();
    const matches=state.order.filter(t=>(t.title+" "+t.artist).toLowerCase().includes(q));
    if(!matches.length){
      const tr=dom("tr"),cell=td(tr,state.order.length?"No hay coincidencias.":"Importa tu primera playlist.");
      cell.colSpan=6;holder.appendChild(tr);return;
    }
    const frag=document.createDocumentFragment();
    matches.slice(0,1500).forEach(t=>{
      const pos=state.order.indexOf(t),tr=dom("tr","track-row"+(t.id===state.selectedId?" selected":""));
      tr.tabIndex=0;tr.setAttribute("aria-label",(pos+1)+". "+t.artist+" "+t.title);
      tr.addEventListener("click",()=>{state.selectedId=t.id;renderTracks();renderInspector();renderLevels();});
      tr.addEventListener("keydown",ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();tr.click();}});
      td(tr,String(pos+1).padStart(2,"0"));
      const cell=dom("td");
      cell.appendChild(dom("div","track-title",t.title));cell.appendChild(dom("div","track-artist",t.artist||"Artista no indicado"));
      tr.appendChild(cell);
      td(tr,t.bpm===null?"—":t.bpm.toFixed(1));
      const key=td(tr,"");key.appendChild(dom("span","camelot-chip",t.camelot||"?"));
      td(tr,t.energy===null?"—":String(t.energy));
      const prev=pos?state.order[pos-1]:null;
      const dt=prev?E.transition(prev,t,state.measurements):null;
      const status=dt?(dt.harmony==="Tonalidad desconocida"||dt.score<70||dt.deltaBpm===null||Math.abs(dt.deltaBpm)>6)?"REVISAR":"OK":"INICIO";
      td(tr,status,status==="REVISAR"?"cell-risk":status==="OK"?"cell-ok":"");
      frag.appendChild(tr);
    });
    holder.appendChild(frag);
    if(matches.length>1500){
      const tr=dom("tr");const cell=td(tr,"Vista limitada a 1.500 pistas; filtra o selecciona una playlist.");
      cell.colSpan=6;holder.appendChild(tr);
    }
  }
  function detailFact(label,value){
    const div=dom("div","detail-fact");div.appendChild(dom("small","",label));div.appendChild(dom("strong","",value));return div;
  }
  function renderInspector(){
    const box=byId("trackDetail");box.replaceChildren();
    box.appendChild(dom("div","inspector-label","INSPECTOR DE PISTA"));
    const t=state.order.find(t=>t.id===state.selectedId);
    if(!t){box.appendChild(dom("p","inspector-note","Selecciona una pista."));return;}
    const pos=state.order.indexOf(t);
    box.appendChild(dom("h3","detail-name",t.title));
    box.appendChild(dom("div","detail-artist",t.artist||"Artista no indicado"));
    const facts=dom("div","detail-facts");
    for(const [k,v] of [["BPM",t.bpm??"—"],["CAMELOT",t.camelot||"?"],["DURACIÓN",E.fmtTime(t.duration)],["ENERGÍA",t.energy??"—"]])facts.appendChild(detailFact(k,v));
    box.appendChild(facts);
    box.appendChild(dom("div","detail-heading","CUES EXISTENTES"));
    const list=dom("div","cue-list");
    if(t.cues.length){
      for(const c of t.cues.slice(0,20))list.appendChild(dom("span","cue",c.slot+" · "+E.fmtTime(c.seconds)));
    }else list.appendChild(dom("p","inspector-note","No hay cues documentados en el archivo importado."));
    box.appendChild(list);
    box.appendChild(dom("div","detail-heading","IDEAS POR COMPASES (NO VALIDADO)"));
    const suggested=E.cueIdeas(t),ideaList=dom("div","cue-list");
    if(suggested.length)for(const c of suggested)ideaList.appendChild(dom("span","cue draft",c.slot+" "+E.fmtTime(c.seconds)));
    else ideaList.appendChild(dom("span","inspector-note","Necesita BPM y duración."));
    box.appendChild(ideaList);
    box.appendChild(dom("p","inspector-note","Los marcadores estimados asumen 4 tiempos por compás. No determinan downbeat, drop, beatgrid ni entrada perfecta. Confirma todo de oído."));
    const actions=dom("div","inspector-actions");
    const up=dom("button","mini-btn","↑ Anterior");up.type="button";up.disabled=pos===0;
    up.addEventListener("click",()=>moveTrack(pos,-1));actions.appendChild(up);
    const down=dom("button","mini-btn","↓ Siguiente");down.type="button";down.disabled=pos>=state.order.length-1;
    down.addEventListener("click",()=>moveTrack(pos,1));actions.appendChild(down);box.appendChild(actions);
  }
  function moveTrack(pos,step){
    const other=pos+step;if(other<0||other>=state.order.length)return;
    rememberOrder();
    [state.order[pos],state.order[other]]=[state.order[other],state.order[pos]];
    state.selectedMix=null;
    update();
  }
  function renderMix(){
    const transitions=allTransitions(),list=byId("mixRows");
    list.replaceChildren();byId("mixCount").textContent=transitions.length+" TRANSICIONES";
    const frag=document.createDocumentFragment();
    transitions.slice(0,700).forEach((t,i)=>{
      const btn=dom("button","mix-row"+(state.selectedMix===i?" active":""));
      btn.type="button";
      const index=dom("span","mix-index",String(i+1).padStart(2,"0")+"→"+String(i+2).padStart(2,"0"));
      const names=dom("div","");
      names.appendChild(dom("div","mix-to",t.toTitle));
      names.appendChild(dom("div","mix-from",t.fromTitle));
      const risk=t.score<70||t.deltaBpm===null||Math.abs(t.deltaBpm)>6;
      const chip=dom("span","mix-badge"+(risk?" risk":""),risk?"REVISAR":"ARMÓNICO");
      btn.append(index,names,chip);
      btn.addEventListener("click",()=>{state.selectedMix=i;renderMix();});
      frag.appendChild(btn);
    });
    list.appendChild(frag);
    const detail=byId("mixDetail");detail.replaceChildren();detail.appendChild(dom("div","inspector-label","MIX COACH"));
    if(state.selectedMix===null||!transitions[state.selectedMix]){
      detail.appendChild(dom("p","inspector-note","Selecciona un enlace para ver la técnica recomendada."));
      return;
    }
    const t=transitions[state.selectedMix];
    detail.appendChild(dom("h3","detail-name",t.fromTitle+" → "+t.toTitle));
    const facts=dom("div","detail-facts");
    facts.appendChild(detailFact("CAMELOT",(t.fromCamelot||"?")+" → "+(t.toCamelot||"?")));
    facts.appendChild(detailFact("BPM Δ",t.deltaBpm===null?"?":(t.deltaBpm>=0?"+":"")+t.deltaBpm));
    facts.appendChild(detailFact("COMPATIBILIDAD",t.harmony));
    facts.appendChild(detailFact("RMS Δ",t.rmsDelta===null?"PENDIENTE":t.rmsDelta+" dB"));
    detail.appendChild(facts);
    detail.appendChild(dom("div","detail-heading","TÉCNICA PROPUESTA"));
    detail.appendChild(dom("div","technique",t.technique));
    const notes=dom("ul","notes");for(const item of t.notes)notes.appendChild(dom("li","",item));
    detail.appendChild(notes);
    detail.appendChild(dom("p","inspector-note","Antes de mezclar verifica frases, voces, EQ, beatgrid, ganancia y salida por auriculares."));
  }
  function renderLevels(){
    const usbEntry=usbEntryForSelected();
    byId("audioFromUSB").disabled=!usbEntry||usbEntry.size>40*1024*1024;
    byId("audioCount").textContent=state.measurements.size+" MEDICIONES";
    const t=state.order.find(t=>t.id===state.selectedId);
    byId("audioTrackName").textContent=t?(t.artist?t.artist+" — ":"")+t.title:"Selecciona una pista en Sesión";
    const result=byId("audioResults");result.replaceChildren();
    const stats=t?state.measurements.get(t.id):null;
    if(stats)for(const [k,v] of [["RMS APROX.",stats.rmsDbfs+" dBFS"],
      ["PICO MUESTRA",stats.samplePeakDbfs+" dBFS"],
      ["DURACIÓN",E.fmtTime(stats.duration)],["CREST APROX.",stats.crestDb+" dB"]]){
      const metric=dom("div","audio-metric");metric.appendChild(dom("small","",k));metric.appendChild(dom("strong","",v));result.appendChild(metric);
    }
  }
  async function processAudio(file){
    const t=state.order.find(t=>t.id===state.selectedId);
    if(!t)throw new Error("Primero selecciona una pista en Sesión.");
    if(file.size>40*1024*1024)throw new Error("Audio >40 MB; para archivos grandes usa el motor de escritorio.");
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error("Este navegador no soporta decodificación Web Audio.");
    const status=byId("audioStatus");status.className="feedback";
    status.textContent="Decodificando audio localmente. No se envía a ningún servidor…";
    const context=new AC();
    try{
      const buffer=await context.decodeAudioData(await file.arrayBuffer());
      if(!buffer.numberOfChannels||!buffer.length)throw new Error("Archivo sin muestras audibles.");
      let sum=0,peak=0,count=0;
      // Lightweight subsampled RMS + SAMPLE PEAK estimate; not LUFS or intersample TP.
      for(let channel=0;channel<buffer.numberOfChannels;channel++){
        const pcm=buffer.getChannelData(channel);
        for(let i=0;i<pcm.length;i+=4){
          const amp=Math.abs(pcm[i]);sum+=amp*amp;peak=Math.max(peak,amp);count++;
        }
      }
      if(!count)throw new Error("No se pudieron calcular muestras.");
      const rms=Math.sqrt(sum/count);
      const rmsDbfs=+(20*Math.log10(Math.max(rms,1e-9))).toFixed(1);
      const samplePeakDbfs=+(20*Math.log10(Math.max(peak,1e-9))).toFixed(1);
      const stats={rmsDbfs,samplePeakDbfs,crestDb:+(samplePeakDbfs-rmsDbfs).toFixed(1),duration:buffer.duration};
      state.measurements.set(t.id,stats);
      status.textContent="Medición aproximada completada de "+file.name+". No son LUFS ni true peak.";
      status.className="feedback success";
      update();
    }finally{await context.close();}
  }
  function download(name,content,type){
    const data=new Blob([content],{type});
    const url=URL.createObjectURL(data);
    const a=dom("a");a.href=url;a.download=name;
    a.hidden=true;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2500);
  }
  function slug(input){return String(input||"dj").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,42)||"dj";}
  function exportCuePlan(){
    const rows=[["orden","artista","titulo","tipo","slot","segundos","confianza"]];
    state.order.forEach((t,i)=>{
      for(const c of t.cues)rows.push([i+1,t.artist,t.title,"EXISTENTE",c.slot,c.seconds,"XML"]);
      for(const c of E.cueIdeas(t))rows.push([i+1,t.artist,t.title,"PROPUESTA",c.slot,c.seconds,c.confidence]);
    });
    return "\uFEFF"+rows.map(r=>r.map(E.csvCell).join(";")).join("\r\n");
  }
  async function importFile(file){
    if(!file) return;
    if(file.size>40*1024*1024)throw new Error("Máximo 40 MB para XML/CSV en esta beta.");
    const data=await file.text();
    let parsed;
    if(file.name.toLowerCase().endsWith(".xml")){
      if(/<!DOCTYPE|<!ENTITY/i.test(data))throw new Error("Por seguridad no se aceptan DTD ni entidades XML.");
      const document=new DOMParser().parseFromString(data,"application/xml");
      if(document.getElementsByTagName("parsererror").length)throw new Error("El XML no es válido.");
      parsed=E.parseXML(document);
    }else if(file.name.toLowerCase().endsWith(".json")){
      const doc=JSON.parse(data);
      if(doc.format!=="dj-studio-set"||!Array.isArray(doc.tracks))throw new Error("JSON de sesión DJ Studio no válido");
      const tracks=E.cleanList(doc.tracks);parsed={library:tracks,playlists:[],version:null};
      if(doc.dj)byId("djName").value=String(doc.dj).slice(0,80);
    }else{
      const tracks=E.csvRows(data);parsed={library:tracks,playlists:[],version:null};
    }
    setSource(parsed,file.name);
  }
  function usbEntryForSelected() {
    if(!state.usb || !state.usbIndex)return null;
    const selected=state.order.find(x=>x.id===state.selectedId);
    if(!selected)return null;
    const found=U.findMatches(selected,state.usbIndex);
    return found.length===1 ? found[0] : null;
  }
  function renderUSB() {
    const inventory=state.usb;
    const exists=Boolean(inventory);
    const xmlSelect=byId("usbXmlSelect");
    byId("usbNoDrive").hidden=exists;
    byId("usbMountedView").hidden=!exists;
    byId("usbVolumeName").textContent=exists?inventory.volume:"—";
    byId("usbLibraryKind").textContent=exists?inventory.format:"—";
    byId("usbAudioCount").textContent=exists?inventory.audioCount.toLocaleString("es-ES"):"0";
    byId("usbAudioSize").textContent=exists?(inventory.totalAudioBytes/1024/1024/1024).toFixed(2)+" GB de archivos detectados":"Sin analizar";
    byId("usbMode").textContent=exists?"CARPETA SELECCIONADA · LECTURA":"USB NO SELECCIONADO";
    byId("usbCreatePlaylist").disabled=!exists||inventory.audioCount===0||inventory.audioCount>3000;
    byId("usbReadTags").disabled=!exists||state.usbTagBusy||state.usbTags.size===inventory.audioCount;
    byId("usbCancelTags").disabled=!state.usbTagBusy;
    byId("usbExportAudit").disabled=!exists;
    byId("usbTagProgress").textContent=!exists ?
      "Selecciona una carpeta para leer etiquetas." :
      (state.usbTagText || state.usbTags.size+"/"+inventory.audioCount+
      " audios inspeccionados · lectura voluntaria, sin modificación");
    byId("usbForget").disabled=!exists;
    byId("usbSidebarStatus").textContent=exists ?
      inventory.volume+" · "+inventory.format+" · "+inventory.audioCount+" audios":
      "Sin USB seleccionado.";
    byId("usbFileCount").textContent=exists?inventory.audioCount+" archivos de audio":"0";
    const list=byId("usbFileRows");list.replaceChildren();
    const warnings=byId("usbWarnings");warnings.replaceChildren();
    const healthList=byId("usbHealthWarnings");healthList.replaceChildren();
    const healthSummary=byId("usbHealthSummary");healthSummary.replaceChildren();
    if(exists){
      const health=state.usbHealth||U.health(inventory,state.usbTags);
      state.usbHealth=health;
      const labels=[
        ["etiquetas",health.tagged+"/"+health.audioCount],
        ["0 bytes",health.zeroBytes],
        ["posibles duplicados",health.possibleDuplicateGroups],
        ["URLs en nombres",health.promotionalNames],
        ["álbumes con contenido",health.tagAlbumNonempty]
      ];
      for(const [label,value] of labels){
        const stat=dom("div","usb-health-stat");
        stat.appendChild(dom("strong","",value));
        stat.appendChild(dom("small","",label));
        healthSummary.appendChild(stat);
      }
      for(const item of health.items.slice(0,8))
        healthList.appendChild(dom("p","usb-warning",
          item.severity+" · "+item.code+": "+item.count+". "+item.note));
    }
    xmlSelect.replaceChildren();
    if(!exists){
      const option=dom("option","","Sin XML compatible");option.value="";
      xmlSelect.appendChild(option);
      xmlSelect.disabled=true;
      byId("usbLoadXML").disabled=true;
      byId("usbMatchCount").textContent="—";
      byId("usbMatchStatus").textContent="Selecciona una sesión y un USB";
      state.usbMatch=null;
      byId("audioFromUSB").disabled=true;
      return;
    }
    byId("usbReadOnlyState").textContent="Seleccionado en el navegador · "
      +inventory.fileCount+" entradas · No se ha escrito ni abierto OneLibrary.";
    inventory.warnings.forEach(w=>warnings.appendChild(dom("p","usb-warning",w)));
    if(inventory.xml.length){
      inventory.xml.slice(0,25).forEach((item,i)=>{
        const option=dom("option","",item.relativePath);option.value=String(i);
        xmlSelect.appendChild(option);
      });
      xmlSelect.disabled=false;
      byId("usbLoadXML").disabled=false;
    } else {
      const option=dom("option","","No se encontró XML de Rekordbox");option.value="";
      xmlSelect.appendChild(option);xmlSelect.disabled=true;byId("usbLoadXML").disabled=true;
    }
    const sample=inventory.audio.slice(0,45);
    for(const item of sample){
      const line=dom("div","usb-file-row");
      const tag=state.usbTags.get(item.relativePath);
      const name=tag?.title ? item.relativePath+" · ["+tag.source+": "+
        (tag.artist||"—")+" — "+tag.title+"]" : item.relativePath;
      line.appendChild(dom("span","usb-file-name",name));
      line.appendChild(dom("span","usb-file-size",(item.size/1024/1024).toFixed(1)+" MB"));
      list.appendChild(line);
    }
    if(inventory.audio.length>sample.length)
      list.appendChild(dom("p","usb-more","Mostrando "+sample.length+" de "+inventory.audioCount+" audios. No se han leído sus bytes."));
    if(state.order.length){
      state.usbMatch=U.matchPlaylist(state.order,inventory,state.usbTags);
      byId("usbMatchCount").textContent=state.usbMatch.matched+"/"+state.usbMatch.total;
      byId("usbMatchStatus").textContent=state.usbMatch.missing+" no encontradas · "
        +state.usbMatch.possible+" posibles versiones · "
        +state.usbMatch.ambiguous+" ambiguas (por nombre)";
      const matchLines=dom("div","usb-match-summary");
      matchLines.appendChild(dom("strong","","Comparación con "+state.name));
      const missing=state.usbMatch.rows.filter(x=>x.status!=="EN_USB"&&x.status!=="ETIQUETA_EN_USB").slice(0,12);
      if(missing.length){
        for(const row of missing)
          matchLines.appendChild(dom("p","usb-match-line",
            "#"+row.position+" "+row.title+" — "+row.status));
      }else matchLines.appendChild(dom("p","usb-match-line","Todos los títulos tienen coincidencia única por etiqueta o nombre. No valida audio ni OneLibrary."));
      warnings.appendChild(matchLines);
    }else{
      byId("usbMatchCount").textContent="—";
      byId("usbMatchStatus").textContent="Importa o crea una sesión para comparar";
      state.usbMatch=null;
    }
    const entry=usbEntryForSelected();
    byId("audioFromUSB").disabled=!entry||entry.size>40*1024*1024;
  }
  async function readUSBMetadataBatch(){
    if(!state.usb||state.usbTagBusy)return;
    const inventory=state.usb;
    const pending=inventory.audio.filter(x=>!state.usbTags.has(x.relativePath)).slice(0,300);
    if(!pending.length){
      state.usbTagText="Todas las etiquetas disponibles fueron inspeccionadas.";
      renderUSB();return;
    }
    const token={cancelled:false};
    state.usbTagToken=token;
    state.usbTagBusy=true;
    state.usbTagText="Leyendo etiquetas locales: 0/"+pending.length+" de este lote...";
    renderUSB();
    let read=0;
    try{
      for(const item of pending){
        if(token.cancelled||state.usb!==inventory)break;
        const tag=await T.readTags(item.file);
        if(token.cancelled||state.usb!==inventory)break;
        state.usbTags.set(item.relativePath,tag);
        read++;
        if(read%5===0||read===pending.length){
          state.usbTagText="Leyendo: "+read+"/"+pending.length+
            " del lote · "+state.usbTags.size+"/"+inventory.audioCount+" totales";
          byId("usbTagProgress").textContent=state.usbTagText;
        }
        if(read%10===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
    }finally{
      if(state.usbTagToken===token&&state.usb===inventory){
        state.usbTagBusy=false;
        state.usbTagToken=null;
        state.usbIndex=U.candidates(inventory,state.usbTags);
        state.usbHealth=U.health(inventory,state.usbTags);
        const remaining=inventory.audio.length-state.usbTags.size;
        state.usbTagText=(token.cancelled?"Lectura interrumpida. ":"Lectura completada. ")+
          state.usbTags.size+"/"+inventory.audioCount+" etiquetas revisadas."+
          (remaining>0?" Pulsa de nuevo para examinar el siguiente lote (máx. 300).":"")+
          " Para actualizar una lista provisional pulsa «Crear lista» otra vez.";
        renderUSB();
        renderLevels();
      }
    }
  }
  function exportUSBMetadataReport(){
    if(!state.usb)return;
    // Explicit user download to local Downloads directory. Never writes to USB.
    const csv=U.auditCSV(state.usb,state.usbTags,E);
    download("dj-studio-"+slug(state.usb.volume)+"-auditoria.csv",
      csv,"text/csv;charset=utf-8");
  }
  function scanUSBFiles(files) {
    const scan=U.scan(files);
    if(state.usbTagToken)state.usbTagToken.cancelled=true;
    state.usbTags=new Map();
    state.usbTagBusy=false;
    state.usbTagToken=null;
    state.usbTagText="";
    state.usbHealth=null;
    state.usb=scan;
    state.usbIndex=U.candidates(scan);
    renderUSB();
    renderLevels();
    setTab("usb");
  }
  function clearUSB() {
    if(state.usbTagToken)state.usbTagToken.cancelled=true;
    state.usbTagToken=null;
    state.usbTagBusy=false;
    state.usbTags=new Map();
    state.usbTagText="";
    state.usbHealth=null;
    state.usb=null;
    state.usbIndex=null;
    state.usbMatch=null;
    byId("usbFolderInput").value="";
    renderUSB();
    renderLevels();
  }
  function provisionalUSBPlaylist(){
    if(!state.usb)throw new Error("No hay USB seleccionado.");
    const tracks=U.provisionalTracks(state.usb,E,3000,state.usbTags);
    if(!tracks.length)throw new Error("No hay audios reconocibles en esa carpeta.");
    setSource({library:tracks,playlists:[],version:null}, "Audio del USB (etiquetas si están disponibles)");
    byId("modeTag").textContent="USB / FICHEROS";
    setTab("set");
  }
  async function importUSBXML(){
    if(!state.usb||!state.usb.xml.length)throw new Error("No se ha encontrado un XML de Rekordbox en la carpeta del USB.");
    const selected=Number(byId("usbXmlSelect").value);
    const entry=state.usb.xml[selected];
    if(!entry)throw new Error("Selecciona un XML compatible.");
    await importFile(entry.file);
    setTab("set");
  }
  function setTab(tab){
    state.tab=tab;
    for(const btn of document.querySelectorAll(".tab")){
      const chosen=btn.dataset.tab===tab;btn.classList.toggle("active",chosen);btn.setAttribute("aria-selected",chosen?"true":"false");
    }
    for(const name of ["set","mix","levels","normalize","usb","export"])byId("panel-"+name).hidden=name!==tab;
  }
  function importDemo(){
    const bases=[
      ["Low Orbit","Demo Artist 01",122,"Fm",3],["Sidewalk Echo","Demo Artist 02",124,"Fm",4],
      ["Inner Current","Demo Artist 03",125,"Ab",4],["Signal Room","Demo Artist 04",126,"Cm",5],
      ["Night Transit","Demo Artist 05",126,"Gm",6],["Sequence Bloom","Demo Artist 06",127,"Dm",7],
      ["Glass Circuit","Demo Artist 07",128,"Am",7],["Drift Logic","Demo Artist 08",130,"Em",8],
      ["After Light","Demo Artist 09",126,"Am",6],["Soft Landing","Demo Artist 10",124,"Dm",4]
    ];
    const library=bases.map((row,i)=>E.normalizeTrack({
      id:"demo-"+i,title:row[0],artist:row[1],bpm:row[2],key:row[3],
      energy:row[4],duration:310+i*12,cues:[{slot:"A",seconds:0},{slot:"B",seconds:32}]
    },i));
    setSource({library,playlists:[],version:null},"Demostración ficticia",true);
  }
  function bind(){
    byId("demoBtn").addEventListener("click",importDemo);
    byId("usbPanelShortcut").addEventListener("click",()=>setTab("usb"));
    byId("usbFolderInput").addEventListener("change",e=>{
      if(!e.target.files?.length)return;
      try{scanUSBFiles(e.target.files);}
      catch(error){
        const status=byId("usbSidebarStatus");
        status.textContent=error.message;status.className="feedback error";
      }
      e.target.value="";
    });
    byId("usbForget").addEventListener("click",clearUSB);
    byId("usbReadTags").addEventListener("click",async()=>{
      try{await readUSBMetadataBatch();}
      catch(error){
        state.usbTagText="Error al leer etiquetas: "+error.message;
        byId("usbTagProgress").textContent=state.usbTagText;
      }
    });
    byId("usbCancelTags").addEventListener("click",()=>{
      if(state.usbTagToken)state.usbTagToken.cancelled=true;
    });
    byId("usbExportAudit").addEventListener("click",exportUSBMetadataReport);
    byId("usbCreatePlaylist").addEventListener("click",()=>{
      try{provisionalUSBPlaylist();}
      catch(error){byId("usbSidebarStatus").textContent=error.message;}
    });
    byId("usbLoadXML").addEventListener("click",async()=>{
      try{await importUSBXML();}
      catch(error){byId("usbSidebarStatus").textContent=error.message;}
    });
    byId("audioFromUSB").addEventListener("click",async()=>{
      const entry=usbEntryForSelected();
      if(!entry)return;
      try{await processAudio(entry.file);}
      catch(error){
        const status=byId("audioStatus");
        status.textContent=error.message;status.className="feedback error";
      }
    });
    byId("fileInput").addEventListener("change",async e=>{
      try{await importFile(e.target.files?.[0]);}catch(error){feedback(error.message,"error");}
      e.target.value="";
    });
    const drop=byId("dropzone");
    drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("dragover");});
    drop.addEventListener("dragleave",()=>drop.classList.remove("dragover"));
    drop.addEventListener("drop",async e=>{
      e.preventDefault();drop.classList.remove("dragover");
      try{await importFile(e.dataTransfer.files?.[0]);}catch(error){feedback(error.message,"error");}
    });
    byId("playlistSelect").addEventListener("change",onPlaylistChange);
    byId("searchInput").addEventListener("input",renderTracks);
    byId("applySort").addEventListener("click",()=>{
      const mode=byId("sortMode").value;
      let proposed;
      if(mode==="original")proposed=state.original.slice();
      else if(mode==="harmonic"){
        if(state.original.length>500){feedback("El orden armónico automático se limita a 500 pistas. Selecciona una playlist más pequeña para evitar un bloqueo del navegador.","error");return;}
        proposed=E.recommendOrder(state.original,state.measurements,byId("preserveFirst").checked);
      }else{
        const field=mode==="energy-desc"?"energy":"bpm";
        const descending=mode==="bpm-desc"||mode==="energy-desc";
        const have=state.original.filter(t=>t[field]!==null);
        const missing=state.original.filter(t=>t[field]===null);
        have.sort((a,b)=>(descending?b[field]-a[field]:a[field]-b[field])||a.sourcePosition-b.sourcePosition);
        proposed=[...have,...missing];
      }
      if(proposed.every((t,i)=>t===state.order[i]))return; // no-op: do not waste an undo step
      rememberOrder();
      state.order=proposed;
      state.selectedId=state.order[0]?.id||null;state.selectedMix=null;update();
    });
    byId("resetOrder").addEventListener("click",()=>{
      if(state.order.every((t,i)=>t===state.original[i]))return;
      rememberOrder();
      state.order=state.original.slice();
      state.selectedMix=null;update();
    });
    byId("undoOrder").addEventListener("click",()=>restoreOrderHistory(state.undoStack,state.redoStack));
    byId("redoOrder").addEventListener("click",()=>restoreOrderHistory(state.redoStack,state.undoStack));
    for(const btn of document.querySelectorAll(".tab"))btn.addEventListener("click",()=>setTab(btn.dataset.tab));
    byId("audioInput").addEventListener("change",async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{await processAudio(file);}
      catch(error){const st=byId("audioStatus");st.textContent=error.message;st.className="feedback error";}
      e.target.value="";
    });
    byId("exportCSV").addEventListener("click",()=>{
      download(slug(byId("djName").value)+"-set.csv",E.csvExport(state.order,state.measurements),"text/csv;charset=utf-8");
    });
    byId("exportJSON").addEventListener("click",()=>{
      download(slug(byId("djName").value)+"-session.json",E.exportJSON(state.order,byId("djName").value,state.measurements),"application/json;charset=utf-8");
    });
    byId("exportCues").addEventListener("click",()=>{
      download(slug(byId("djName").value)+"-cues-plan.csv",exportCuePlan(),"text/csv;charset=utf-8");
    });
    update();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);
  else bind();
})();
