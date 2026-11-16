/* NEBØA DJ Studio — USB inventory, browser-only, zero dependencies.
 * Obtains files ONLY after a DJ selects a folder via the browser's own picker.
 * Never reads/mutates the OneLibrary database. Presence != playlist validation.
 * No network access, disk writes, raw file paths, or privileged device APIs.
 */
(function (root) {
  "use strict";

  const AUDIO_EXT = new Set(["mp3", "wav", "aif", "aiff", "flac", "m4a", "aac", "ogg", "opus", "alac"]);
  const MAX_FILES = 120000;
  const MAX_PROVISIONAL_TRACKS = 3000;
  const EXT_PATTERN = /\.([a-z0-9]{2,6})$/i;

  function tidyPath(raw) {
    // webkitRelativePath is browser-provided, not a trusted absolute disk path.
    const path = String(raw || "").replace(/\\/g, "/").replace(/^\/+/g, "");
    const parts = path.split("/").filter(Boolean);
    if (parts.some(x => x === ".." || x === "." || x.includes("\0"))) {
      throw new Error("El dispositivo contiene una ruta no válida.");
    }
    return parts.join("/");
  }
  function fileEntry(file) {
    const relativePath = tidyPath(file.webkitRelativePath || file.relativePath || file.name);
    const parts = relativePath.split("/");
    const basename = parts.at(-1) || "";
    const extension = basename.match(EXT_PATTERN)?.[1]?.toLowerCase() || "";
    const length = Number(file.size);
    return {
      file, relativePath, basename, extension,
      size: Number.isFinite(length) && length >= 0 ? length : 0,
      lower: relativePath.toLowerCase()
    };
  }
  function releaseLabel(entries) {
    const rooted = entries.map(x => x.relativePath.split("/")).filter(a => a.length >= 2);
    if (!rooted.length) return "Carpeta seleccionada";
    const first = rooted[0][0];
    return rooted.every(x => x[0] === first) ? first : "Carpeta seleccionada";
  }
  function audioName(filename) {
    const value = String(filename||"").replace(/\.[a-z0-9]{2,6}$/i, "")
      .replace(/^\s*\d{1,5}[\s._-]+/, "").trim();
    const split = value.indexOf(" - ");
    if (split > 0 && split < value.length - 3) {
      return {
        artist: value.slice(0, split).trim(),
        title: value.slice(split + 3).trim()
      };
    }
    return { artist: "", title: value };
  }
  function canonical(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
      .replace(/(?:https?:\/\/|www\.)[^\s)]+/g, " ")
      .replace(/\[[^\]]*(?:www\.|\.com|\.org|\.net|\.es|\.xyz)[^\]]*\]/gi, " ")
      .replace(/^\s*\d{1,5}[\s._-]+/, "")
      .replace(/[()[\]{}._\-–—]/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ").trim();
  }
  function isOneLibrary(entry) {
    const parts=entry.lower.split("/");
    return (parts.length >= 3 && parts.at(-3)==="pioneer" &&
      parts.at(-2)==="rekordbox" && parts.at(-1)==="exportlibrary.db") ||
      (parts.length===2 && parts[0]==="rekordbox" && parts[1]==="exportlibrary.db");
  }
  function isLegacy(entry) {
    const parts=entry.lower.split("/");
    return (parts.length >= 3 && parts.at(-3)==="pioneer" &&
      parts.at(-2)==="rekordbox" && parts.at(-1)==="export.pdb") ||
      (parts.length===2 && parts[0]==="rekordbox" && parts[1]==="export.pdb");
  }
  function isOfficialXML(entry) {
    const p=entry.lower;
    return entry.extension === "xml" &&
      (p.includes("rekordbox") || p.includes("collection") || p.includes("playlist"));
  }
  function scan(filesInput) {
    const input=Array.from(filesInput||[]);
    if (input.length===0) throw new Error("No se han seleccionado archivos del USB.");
    if(input.length>MAX_FILES)throw new Error("La carpeta contiene demasiados archivos para esta beta; selecciona una subcarpeta.");
    const entries=input.map(fileEntry);
    const audio=entries.filter(x=>AUDIO_EXT.has(x.extension) && !x.basename.startsWith("._") && !x.basename.startsWith("."));
    const oneLibrary=entries.filter(isOneLibrary);
    const legacy=entries.filter(isLegacy);
    const xml=entries.filter(isOfficialXML);
    const volume=releaseLabel(entries);
    const totalAudioBytes=audio.reduce((sum,x)=>sum+x.size,0);
    const fileCount=entries.length;
    const format=oneLibrary.length ? (legacy.length ? "OneLibrary + Device Library" : "OneLibrary"):
      legacy.length ? "Device Library clásica" : "Sin biblioteca Pioneer detectada";
    const warnings=[];
    if(oneLibrary.length===0)warnings.push("No se ha encontrado exportLibrary.db; no hay prueba de OneLibrary en la carpeta seleccionada.");
    if(audio.length===0)warnings.push("No se han encontrado archivos de audio reconocibles.");
    if(audio.length>MAX_PROVISIONAL_TRACKS)warnings.push("Más de 3.000 audios: para crear una lista provisional selecciona una carpeta de sesión más pequeña. El inventario completo puede seguir comparándose.");
    if(oneLibrary.length)warnings.push("OneLibrary detectado por su archivo: NO se han leído playlists ni Hot Cues de la base de datos.");
    if(fileCount===MAX_FILES)warnings.push("La carpeta puede estar incompleta; escanear el volumen raíz si es posible.");
    return {
      volume, fileCount, audio, audioCount:audio.length, totalAudioBytes, oneLibrary,
      legacy, xml, format, warnings,
      // No absolute disk paths, no audio contents, no database reads.
    };
  }
  function looseCanonical(value) {
    // For possible variants only. Never confirm match by a stripped mix name.
    return canonical(value)
      .replace(/\b(?:original|extended|club|radio|instrumental)\s+(?:mix|version)\b/gi," ")
      .replace(/\s+/g," ").trim();
  }
  function candidates(inventory,tags=new Map()) {
    const audio=inventory?.audio||[];
    const index=new Map(),variants=new Map(),sourceByPath=new Map(),artistByPath=new Map();
    for(const item of audio){
      const filename=audioName(item.basename);
      const tag=tags.get(item.relativePath);
      const tagTitle=tag&&tag.source!=="error"&&tag.title ? tag.title:null;
      const title=tagTitle||filename.title;
      const artist=tag?.artist||filename.artist;
      const names=[title,artist ? artist+" - "+title : ""];
      // If a valid tag exists, its title is the preferred source. The filename
      // still contributes only possible variants (never an exact match).
      const strictKeys=names.map(canonical).filter(Boolean);
      if(!tagTitle){
        strictKeys.push(canonical(item.basename.replace(EXT_PATTERN,"")));
      }
      for(const key of new Set(strictKeys)){
        const rows=index.get(key)||[];
        if(!rows.includes(item))rows.push(item);
        index.set(key,rows);
      }
      sourceByPath.set(item.relativePath,tagTitle?"ETIQUETA":"NOMBRE_ARCHIVO");
      artistByPath.set(item.relativePath,canonical(artist));
      for(const key of [...strictKeys,
          canonical(filename.title),
          canonical(item.basename.replace(EXT_PATTERN,""))]){
        const loose=looseCanonical(key);
        if(loose){
          const options=variants.get(loose)||[];
          if(!options.includes(item))options.push(item);
          variants.set(loose,options);
        }
      }
    }
    index.variants=variants;
    index.sourceByPath=sourceByPath;
    index.artistByPath=artistByPath;
    return index;
  }
  function findMatches(track, index) {
    const title=canonical(track.title);
    const artist=canonical(track.artist);
    if(!title)return [];
    if(!artist)return Array.from(new Set(index.get(title)||[]));
    const joined=canonical(track.artist+" - "+track.title);
    const exact=index.get(joined)||[];
    if(exact.length)return Array.from(new Set(exact));
    // If an audio file has an artist from its tag/name, it must match the
    // playlist artist. Otherwise a same-title different-artist song is falsely
    // considered ready for performance.
    return Array.from(new Set((index.get(title)||[]).filter(item=>
      !(index.artistByPath?.get(item.relativePath)||""))));
  }
  function matchPlaylist(tracks, inventory, tags=new Map()) {
    const index=candidates(inventory,tags);
    const rows=tracks.map((track,i)=>{
      const found=findMatches(track,index);
      const looseKey=looseCanonical(track.title);
      const potential=found.length ? [] : (index.variants.get(looseKey)||[]);
      const status=found.length>1?"AMBIGUA":
        found.length===1 && index.sourceByPath.get(found[0].relativePath)==="ETIQUETA"?"ETIQUETA_EN_USB":
        found.length===1?"EN_USB":
        potential.length?"POSIBLE_VARIANTE":"NO_LOCALIZADA";
      const results=found.length?found:potential;
      return {
        position:i+1, title:track.title, artist:track.artist,
        status, count:results.length,
        candidates:results.slice(0,4).map(x=>x.relativePath)
      };
    });
    return {
      total:rows.length,
      matched:rows.filter(x=>x.status==="EN_USB"||x.status==="ETIQUETA_EN_USB").length,
      tagMatched:rows.filter(x=>x.status==="ETIQUETA_EN_USB").length,
      missing:rows.filter(x=>x.status==="NO_LOCALIZADA").length,
      possible:rows.filter(x=>x.status==="POSIBLE_VARIANTE").length,
      ambiguous:rows.filter(x=>x.status==="AMBIGUA").length,
      rows,
      caveat:"Coincidencia por nombre o etiqueta, NO prueba identidad audio, cue ni OneLibrary."
    };
  }
  function provisionalTracks(inventory, engine, limit=MAX_PROVISIONAL_TRACKS,tags=new Map()) {
    const audio=inventory.audio||[];
    if(audio.length>limit)throw new Error("Demasiadas pistas para crear una playlist provisional en memoria.");
    return audio.map((item,i)=>{
      const name=audioName(item.basename);
      const tag=tags.get(item.relativePath);
      const trusted=tag&&tag.source!=="error"&&tag.source!=="unsupported"&&tag.source!=="none";
      return engine.normalizeTrack({
        id:"usb-"+i, artist:trusted&&tag.artist||name.artist,
        title:trusted&&tag.title||name.title,
        bpm:trusted?tag.bpm:null, key:trusted?tag.key:null,
        album:trusted&&tag.album||"",
        // No need to know private absolute path. Key/BPM are source tags, not
        // verified by listening; cues, duration and energy stay UNKNOWN.
      },i);
    }).filter(x=>x.title);
  }
  function health(inventory,tags=new Map()){
    const audio=inventory?.audio||[];
    const zero=audio.filter(x=>x.size===0);
    const tiny=audio.filter(x=>x.size>0&&x.size<32768);
    const promotional=audio.filter(x=>/(?:https?:\/\/|www\.|[[(][^\])]*\.(?:com|net|es|org|ru|xyz)[)\]])/i.test(x.basename));
    const groups=new Map();
    for(const item of audio){
      // Same normalized name + byte size, without reading hashes. Merely
      // potentially duplicated; never delete or edit without review.
      const key=canonical(item.basename.replace(EXT_PATTERN,""))+"|"+item.size;
      const g=groups.get(key)||[];g.push(item.relativePath);groups.set(key,g);
    }
    const possibleDuplicates=Array.from(groups.values()).filter(x=>x.length>1);
    const readResults=audio.map(x=>tags.get(x.relativePath)).filter(Boolean);
    const parsed=readResults.filter(x=>x.source!=="error"&&x.source!=="unsupported"&&x.source!=="none");
    const broken=readResults.filter(x=>x.source==="error"||x.source==="unsupported");
    const withoutBpm=parsed.filter(x=>x.bpm===null);
    const withoutKey=parsed.filter(x=>!x.key);
    const withAlbum=parsed.filter(x=>x.album);
    const items=[];
    if(zero.length)items.push({severity:"BLOCKER",code:"ZERO_BYTES",
      count:zero.length,note:"Audio de 0 bytes. No pinchar esas pistas."});
    if(tiny.length)items.push({severity:"REVIEW",code:"TINY_FILES",
      count:tiny.length,note:"Archivos menores de 32 KiB; verificar integridad (no implica corrupción necesariamente)."});
    if(possibleDuplicates.length)items.push({severity:"REVIEW",code:"POSSIBLE_DUPLICATES",
      count:possibleDuplicates.length,note:"Nombres y tamaños coincidentes; NO son duplicados confirmados por hash."});
    if(promotional.length)items.push({severity:"REVIEW",code:"PROMOTIONAL_FILENAMES",
      count:promotional.length,note:"URLs o dominios en nombres; solo propuesta de limpieza, sin renombrar."});
    if(broken.length)items.push({severity:"REVIEW",code:"UNREADABLE_TAGS",
      count:broken.length,note:"Etiquetas no compatibles o ilegibles; no demuestra que el audio esté dañado."});
    if(tags.size<audio.length)items.push({severity:"PENDING",code:"TAG_SCAN_INCOMPLETE",
      count:audio.length-tags.size,note:"Faltan pistas por inspeccionar; BPM y key no deben inferirse."});
    return {
      mode:"READ_ONLY_METADATA_AUDIT",volume:inventory?.volume||"",
      audioCount:audio.length, scanned:readResults.length, tagged:parsed.length,
      zeroBytes:zero.length,tinyFiles:tiny.length,
      possibleDuplicateGroups:possibleDuplicates.length,
      promotionalNames:promotional.length, unreadableTags:broken.length,
      noBpm:withoutBpm.length,noKey:withoutKey.length,tagAlbumNonempty:withAlbum.length,
      items,examples:{
        zero:zero.slice(0,8).map(x=>x.relativePath),
        tiny:tiny.slice(0,8).map(x=>x.relativePath),
        duplicateGroups:possibleDuplicates.slice(0,8),
        promo:promotional.slice(0,8).map(x=>x.relativePath)
      }
    };
  }
  function auditCSV(inventory,tags,engine){
    const rows=[["archivo_relativo","bytes","extension","fuente_tag",
      "artista","titulo","album","bpm_desde_tag","key_desde_tag",
      "riesgo_bytes","url_en_nombre"]];
    for(const item of inventory.audio||[]){
      const tag=tags.get(item.relativePath)||{};
      const invalid=item.size===0?"ZERO_BYTES":item.size<32768?"MENOR_32K":"";
      const promo=/(?:https?:\/\/|www\.|[[(][^\])]*\.(?:com|net|es|org|ru|xyz)[)\]])/i.test(item.basename);
      rows.push([item.relativePath,item.size,item.extension,tag.source||"NO_ANALIZADO",
        tag.artist||"",tag.title||"",tag.album||"",
        tag.bpm??"",tag.key||"",invalid,promo?"REVISAR_URL":""]);
    }
    return "\uFEFF"+rows.map(r=>r.map(engine.csvCell).join(";")).join("\r\n");
  }
  function toDisplay(inventory) {
    return {
      volume:inventory.volume, format:inventory.format, fileCount:inventory.fileCount,
      audioCount:inventory.audioCount,
      totalAudioBytes:inventory.totalAudioBytes,
      oneLibrary:inventory.oneLibrary.length>0,
      legacy:inventory.legacy.length>0,
      xmlCount:inventory.xml.length,
      warnings:inventory.warnings.slice()
    };
  }
  const API={AUDIO_EXT,scan,tidyPath,audioName,canonical,looseCanonical,isOneLibrary,isLegacy,
    matchPlaylist,provisionalTracks,toDisplay,findMatches,candidates,health,auditCSV};
  root.DJStudioUSB=API;
  if(typeof module!=="undefined" && module.exports)module.exports=API;
})(typeof window !== "undefined" ? window : globalThis);
