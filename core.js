/* DJ Studio core: platform-independent, no private data, zero dependencies.
 * All functions are pure except file parsing (the DOMDocument is supplied by the browser).
 * OneLibrary data must only be written via officially compatible DJ software, never by this tool.
 */
(function (root) {
  "use strict";
  const NOTEs = {
    C: 0, "B#": 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3,
    E: 4, FB: 4, "E#": 5, F: 5, "F#": 6, GB: 6, G: 7,
    "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11, CB: 11
  };
  const MAJOR = {11:1,6:2,1:3,8:4,3:5,10:6,5:7,0:8,7:9,2:10,9:11,4:12};
  const MINOR = {8:1,3:2,10:3,5:4,0:5,7:6,2:7,9:8,4:9,11:10,6:11,1:12};

  function cleanText(value) {
    const original = String(value ?? "");
    let s = original.normalize("NFKC").replace(/[\u200B-\u200F\uFEFF]/g, "");
    s = s.replace(/\s*[\[(]\s*(?:https?:\/\/|www\.)[^\])]+[\])]/gi, "");
    s = s.replace(/(?:https?:\/\/|www\.)[^\s\])}]+/gi, "");
    s = s.replace(/\s*[-|–]\s*[\w-]+\.(?:com|net|org|es|info|xyz|co|io|biz)(?:\/\S*)?/gi, "");
    return s.replace(/\s{2,}/g, " ").trim().replace(/^[-_| ]+|[-_| ]+$/g, "") || original;
  }
  function n(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const v = Number(String(value).replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }
  function camelot(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const explicit = raw.match(/^(1[0-2]|[1-9])([AB])$/i);
    if (explicit) return Number(explicit[1]) + explicit[2].toUpperCase();
    const s = raw.replace(/♯/g, "#").replace(/♭/g, "b").replace(/−/g, "-")
      .replace(/\s+/g, "");
    let match = s.match(/^([A-Ga-g])([#b]?)(minor|min|major|maj|m|M)?$/i);
    if (!match) return null;
    const note = match[1].toUpperCase() + match[2].toUpperCase();
    const pitch = NOTEs[note];
    if (pitch === undefined) return null;
    const suffix = (match[3] || "major");
    const isMinor = ["m","min","minor"].includes(suffix.toLowerCase()) &&
      !(suffix === "M");
    const wheel = (isMinor ? MINOR : MAJOR)[pitch];
    return wheel + (isMinor ? "A" : "B");
  }
  function harmony(a, b) {
    const ka = camelot(a), kb = camelot(b);
    if (!ka || !kb) return {score: null, label: "Tonalidad desconocida", compatible: null};
    if (ka === kb) return {score:100, label:"Misma tonalidad", compatible:true};
    const na = parseInt(ka,10), nb = parseInt(kb,10);
    const la = ka.slice(-1), lb = kb.slice(-1);
    if (na === nb && la !== lb) return {score:94,label:"Relativa mayor/menor",compatible:true};
    const delta = Math.min((na-nb+12)%12,(nb-na+12)%12);
    if (la === lb && delta === 1) return {score:91,label:"Vecina Camelot",compatible:true};
    if (la === lb && delta === 2) return {score:68,label:"Salto Camelot ±2",compatible:false};
    return {score:22,label:"Cruce armónico: escuchar",compatible:false};
  }
  function normalizeTrack(row, index) {
    const artist = cleanText(row.artist ?? row.Artist ?? row.ARTIST ?? "");
    const title = cleanText(row.title ?? row.Name ?? row.Title ?? row.TITLE ?? "");
    const rawKey = row.key ?? row.Tonality ?? row.Key ?? row.camelot ?? "";
    const duration = n(row.duration ?? row.TotalTime ?? row.Duration);
    const bpm = n(row.bpm ?? row.AverageBpm ?? row.BPM);
    const energy = n(row.energy ?? row.Energy);
    return {
      id: String(row.id ?? row.TrackID ?? "row-" + (index + 1)),
      sourcePosition: index + 1,
      title, artist, bpm: bpm !== null && bpm > 0 && bpm < 400 ? bpm : null,
      key: String(rawKey || ""), camelot: camelot(rawKey),
      duration: duration !== null && duration > 0 ? duration : null,
      energy: energy !== null && energy >= 0 && energy <= 10 ? energy : null,
      album: String(row.album ?? row.Album ?? ""),
      cues: Array.isArray(row.cues) ? row.cues.map(c=>({
        slot: c.slot ?? "-", seconds: n(c.seconds), kind: c.kind || "cue"
      })) : [],
      // Never copy absolute file paths into exported set summaries.
    };
  }
  function csvRows(source) {
    const text = String(source ?? "").replace(/^\uFEFF/,"");
    const firstLine = text.split(/\r?\n/,1)[0] ?? "";
    const delimiter = ["\t",";",","].map(d=>({d,c:firstLine.split(d).length})).sort((a,b)=>b.c-a.c)[0].d;
    const grid=[], current=[]; let cell="", quoted=false;
    for(let i=0; i<text.length; i++) {
      const ch=text[i];
      if (ch === '"') {
        if (quoted && text[i+1] === '"') {cell+='"';i++;}
        else quoted=!quoted;
      } else if (!quoted && ch === delimiter) {
        current.push(cell);cell="";
      } else if(!quoted && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && text[i+1] === "\n") i++;
        current.push(cell);grid.push(current.slice());current.length=0;cell="";
      } else {
        cell+=ch;
      }
    }
    if (quoted) throw new Error("CSV inválido: comillas sin cerrar");
    if (current.length || cell) {current.push(cell);grid.push(current.slice());}
    if (!grid.length) throw new Error("El CSV está vacío");
    const headers=grid[0].map(x=>x.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[_\s]+/g,""));
    const alias={
      title:["title","titulo","track","name","song","cancion"],
      artist:["artist","artista","interprete","performer"],
      bpm:["bpm","averagebpm","tempo"], key:["key","tonality","tonalidad","camelot"],
      energy:["energy","energia","intensity","intensidad"],album:["album"],
      duration:["duration","totaltime","duracion","seconds"],
    };
    const indices={};
    for (const [key,choices] of Object.entries(alias)) indices[key]=headers.findIndex(h=>choices.includes(h));
    if (indices.title<0) {
      // Accept plain one-column title lists; no fabricated metadata.
      if(grid[0].length===1) return grid.map((cells,i)=>normalizeTrack({title:cells[0]},i)).filter(t=>t.title);
      throw new Error("El CSV necesita una columna de título: title/titulo/track.");
    }
    return grid.slice(1).filter(c=>c.some(x=>String(x).trim())).map((cells,i)=>{
      const obj={};
      for(const [key,ix] of Object.entries(indices))if(ix>=0)obj[key]=cells[ix]??"";
      return normalizeTrack(obj,i);
    }).filter(t=>t.title);
  }
  function parseXML(document) {
    if (!document || !document.documentElement) throw new Error("XML no válido");
    const root=document.documentElement;
    if(root.nodeName !== "DJ_PLAYLISTS") throw new Error("El archivo debe ser una exportación XML oficial de Rekordbox.");
    const collection=Array.from(root.children).find(n=>n.tagName==="COLLECTION");
    if(!collection) throw new Error("XML de Rekordbox sin COLLECTION");
    const rawTracks=Array.from(collection.children).filter(n=>n.tagName==="TRACK");
    if(rawTracks.length>120000)throw new Error("Biblioteca demasiado grande para abrir en memoria: limita el XML.");
    const byId=new Map(),all=[];
    rawTracks.forEach((el,i)=>{
      const obj={};
      for(const attr of Array.from(el.attributes))obj[attr.name]=attr.value;
      obj.cues=Array.from(el.children).filter(x=>x.tagName==="POSITION_MARK").map(mark=>{
        const m=Number(mark.getAttribute("Num")??-1);
        return {slot:m>=0?String.fromCharCode(65+m):"MEM",seconds:n(mark.getAttribute("Start")),
          kind:m>=0?"HOT CUE":"MEMORY CUE"};
      });
      const track=normalizeTrack(obj,i);
      if (!track.title) return;
      const originalId=String(obj.TrackID || track.id);
      track.id=originalId;
      // Distinct duplicate IDs in a malformed XML are not silently fused.
      if(byId.has(originalId))return;
      byId.set(originalId,track);all.push(track);
    });
    const playlists=[];
    const roots=Array.from(root.children).find(n=>n.tagName==="PLAYLISTS");
    function walk(node,path=""){
      if(node.tagName !== "NODE")return;
      const name=node.getAttribute("Name")||"";
      const type=node.getAttribute("Type");
      const thisPath= name&&name!=="ROOT" ? (path?path+" / ":"")+name : path;
      if(type==="1"){
        const ids=Array.from(node.children).filter(x=>x.tagName==="TRACK")
          .map(x=>x.getAttribute("Key")).filter(Boolean);
        const tracks=ids.map(id=>byId.get(id)).filter(Boolean);
        if(tracks.length)playlists.push({name:thisPath||"Playlist",tracks,missing:ids.length-tracks.length});
      }
      for(const child of Array.from(node.children).filter(x=>x.tagName==="NODE"))walk(child,thisPath);
    }
    if(roots)for(const child of Array.from(roots.children))walk(child,"");
    return {library:all,playlists,source:"rekordbox XML",version:root.querySelector?.("PRODUCT")?.getAttribute("Version")||null};
  }
  function cleanList(list) {
    if(!Array.isArray(list)||list.length>120000)throw new Error("Lista inválida o demasiado grande");
    const used=new Map();
    return list.map((row,i)=>{
      const item=normalizeTrack(row,i);
      if (!item.title) return null;
      const original=String(row.id??item.id);
      const k=used.get(original)||0;
      used.set(original,k+1);
      item.id=k?original+"-"+k:original;
      return item;
    }).filter(Boolean);
  }
  function transition(a,b, measurements=new Map()) {
    const tonal=harmony(a.camelot||a.key,b.camelot||b.key);
    const delta=a.bpm !== null && b.bpm !== null ? +(b.bpm-a.bpm).toFixed(1):null;
    const ma=measurements.get(a.id),mb=measurements.get(b.id);
    const rmsDelta=ma?.rmsDbfs!=null && mb?.rmsDbfs!=null? +(mb.rmsDbfs-ma.rmsDbfs).toFixed(1):null;
    const reasons=[];
    if(tonal.compatible===false)reasons.push("Cruce armónico: evitar solapar melodías");
    if(tonal.compatible===null)reasons.push("Falta tonalidad verificada");
    if(delta === null)reasons.push("BPM desconocido");
    else if(Math.abs(delta)>6)reasons.push("Cambio de BPM superior a 6");
    if(rmsDelta!==null&&Math.abs(rmsDelta)>4)reasons.push("Diferencia RMS: comprobar TRIM");
    let technique=tonal.compatible===true&&delta!==null&&Math.abs(delta)<=6
      ?"Mezcla por frases de 16/32 compases"
      :"Transición percusiva / EQ, comprobar a oído";
    if(delta!==null&&Math.abs(delta)>6)technique="Bridge de tempo o cambio de sección";
    const penalty=(tonal.score===null?35:100-tonal.score)*0.52+(delta===null?12:Math.min(Math.abs(delta)*3,34))+(rmsDelta===null?0:Math.min(Math.abs(rmsDelta)*1.2,12));
    return {from:a.id,to:b.id,fromTitle:a.title,toTitle:b.title,harmony:tonal.label,
      fromCamelot:a.camelot,toCamelot:b.camelot,deltaBpm:delta,rmsDelta,
      score:Math.max(0,Math.round(100-penalty)),technique,
      notes:reasons.length?reasons:["Compatibilidad teórica: revisar fraseo y mezcla de graves"],
      requiresListening:true};
  }
  function recommendOrder(tracks, measurements=new Map(),preserveFirst=true) {
    if(tracks.length<2)return tracks.slice();
    const pool=tracks.slice(),result=[];
    const first=preserveFirst?pool[0]:pool.slice().sort((a,b)=>(a.bpm??999)-(b.bpm??999))[0];
    result.push(first);pool.splice(pool.indexOf(first),1);
    while(pool.length){
      const prev=result[result.length-1];
      const selected=pool.map(t=>{
        const tr=transition(prev,t,measurements);
        // Prefer progression but avoid inventing energy for unknown values.
        const energyDelta=prev.energy!==null&&t.energy!==null?t.energy-prev.energy:null;
        const penalty=energyDelta===null?0:(energyDelta<-2?8:Math.abs(energyDelta)*2);
        return {t,weight:tr.score-penalty};
      }).sort((a,b)=>b.weight-a.weight||a.t.sourcePosition-b.t.sourcePosition)[0].t;
      result.push(selected);pool.splice(pool.indexOf(selected),1);
    }
    return result;
  }
  function fmtTime(seconds) {
    if(seconds===null||seconds===undefined||!Number.isFinite(seconds))return "—";
    const total=Math.floor(seconds);
    return Math.floor(total/60)+":"+String(total%60).padStart(2,"0");
  }
  function cueIdeas(track) {
    if(!track.bpm || !track.duration)return [];
    const bar=240/track.bpm;
    const options=[["A","Inicio aproximado",0],["B","Entrada +16 compases",16*bar],
      ["C","Entrada +32 compases",32*bar],
      ["D","Desarrollo aproximado",Math.floor((track.duration/2)/(16*bar))*16*bar],
      ["E","Salida -32 compases",track.duration-32*bar],
      ["F","Salida -16 compases",track.duration-16*bar]];
    const used=new Set();
    return options.filter(([, ,x])=>x>=0&&x<track.duration-4)
      .filter(([, ,x])=>{const snap=Math.round(x*10);if(used.has(snap))return false;used.add(snap);return true;})
      .map(([slot,label,seconds])=>({slot,label,seconds:+seconds.toFixed(2),confidence:"BAJA - sin analizar beatgrid/estructura"}));
  }
  function csvCell(value) {
    let s=String(value??"");
    // Neutralize spreadsheet-formula injection from untrusted ID3/CSV metadata.
    if (/^\s*[=+@-]/.test(s)) s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function csvExport(tracks,measurements=new Map()) {
    const names=["orden","artista","titulo","bpm","camelot","energia","rms_dbfs_estimado","transicion","advertencias"];
    const out=[names];
    tracks.forEach((t,i)=>{
      const tr=i?transition(tracks[i-1],t,measurements):null;
      out.push([i+1,t.artist,t.title,t.bpm??"",t.camelot??"",t.energy??"",
        measurements.get(t.id)?.rmsDbfs??"",tr?.technique??"APERTURA",
        tr?.notes.join(" · ")??""]);
    });
    return "\uFEFF"+out.map(row=>row.map(csvCell).join(";")).join("\r\n");
  }
  function exportJSON(tracks,profile,measurements=new Map()) {
    return JSON.stringify({
      format:"dj-studio-set",version:1,exportedAt:new Date().toISOString(),
      dj:String(profile||"DJ"),privacy:"NO_PATHS_NO_AUDIO",
      disclaimer:"Recomendaciones, no playlist oficial OneLibrary. Exportar desde software DJ compatible.",
      tracks:tracks.map((t,i)=>({
        order:i+1,artist:t.artist,title:t.title,bpm:t.bpm,key:t.key,camelot:t.camelot,
        energy:t.energy,duration:t.duration,cues:t.cues,
        analysis:measurements.get(t.id)?{rmsDbfs:measurements.get(t.id).rmsDbfs,
          samplePeakDbfs:measurements.get(t.id).samplePeakDbfs}:null
      }))
    },null,2);
  }

  const engine={cleanText,n,camelot,harmony,normalizeTrack,csvRows,parseXML,cleanList,
    transition,recommendOrder,fmtTime,cueIdeas,csvCell,csvExport,exportJSON};
  root.DJStudioEngine=engine;
  if(typeof module!=="undefined"&&module.exports)module.exports=engine;
})(typeof window!=="undefined"?window:globalThis);
