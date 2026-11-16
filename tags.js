/* DJ Studio — read-only, bounded ID3v2/ID3v1 and FLAC Vorbis tags.
   No libraries, no network, no disk writes. Only user-selected browser File objects.
   BPM and key are used ONLY if the source tag provides them. */
(function(root) {
  "use strict";
  const MAX_TAG_BYTES=2*1024*1024;
  const MAX_COMMENT_BYTES=256*1024;
  const decoderUtf8=new TextDecoder("utf-8",{fatal:false});
  const decoderLatin1=new TextDecoder("iso-8859-1",{fatal:false});
  const decoderUtf16LE=new TextDecoder("utf-16le",{fatal:false});
  const decoderUtf16BE=new TextDecoder("utf-16be",{fatal:false});
  function bytesToAscii(buf){return Array.from(buf,x=>String.fromCharCode(x)).join("");}
  function big32(b,o){return ((b[o]*16777216)+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3])>>>0;}
  function le32(b,o){return ((b[o])+(b[o+1]<<8)+(b[o+2]<<16)+(b[o+3]*16777216))>>>0;}
  function syncsafe(b,o){return (b[o]<<21)+(b[o+1]<<14)+(b[o+2]<<7)+b[o+3];}
  function textBytes(data,encoding){
    if(!data||!data.length)return "";
    let decoded="";
    try{
      if(encoding===0)decoded=decoderLatin1.decode(data);
      else if(encoding===3)decoded=decoderUtf8.decode(data);
      else if(encoding===2)decoded=decoderUtf16BE.decode(data);
      else if(encoding===1){
        if(data.length>=2&&data[0]===0xFE&&data[1]===0xFF)decoded=decoderUtf16BE.decode(data.subarray(2));
        else if(data.length>=2&&data[0]===0xFF&&data[1]===0xFE)decoded=decoderUtf16LE.decode(data.subarray(2));
        else decoded=decoderUtf16LE.decode(data);
      }else return "";
    }catch{return "";}
    return decoded.replace(/\u0000/g,"\n").split("\n").map(x=>x.trim()).filter(Boolean).join("; ").slice(0,1024);
  }
  function textFrame(data){return data.length?textBytes(data.subarray(1),data[0]):"";}
  function put(metadata,field,val){
    const value=String(val||"").replace(/[\u0000-\u001f]+/g," ").trim();
    if(value&&!metadata[field])metadata[field]=value.slice(0,500);
  }
  function applyTag(metadata,frame,val){
    const tags={
      TIT2:"title",TT2:"title",TPE1:"artist",TP1:"artist",
      TBPM:"bpm_raw",TBP:"bpm_raw",TKEY:"key",TKE:"key",
      TALB:"album",TAL:"album",TPE2:"album_artist",
      TDRC:"year",TYER:"year",TLEN:"duration_ms",
    };
    const fld=tags[frame];if(fld)put(metadata,fld,val);
  }
  function txxx(data){
    if(!data.length)return null;
    const encoding=data[0],raw=data.subarray(1);
    // Decode TXXX as a single stream and split into description + value.
    let decoded="";
    if(encoding===0)decoded=decoderLatin1.decode(raw);
    else if(encoding===3)decoded=decoderUtf8.decode(raw);
    else if(encoding===1||encoding===2){
      let mode=encoding===2?decoderUtf16BE:decoderUtf16LE,chunk=raw;
      if(encoding===1&&raw.length>=2&&raw[0]===0xFE&&raw[1]===0xFF){mode=decoderUtf16BE;chunk=raw.subarray(2);}
      if(encoding===1&&raw.length>=2&&raw[0]===0xFF&&raw[1]===0xFE)chunk=raw.subarray(2);
      decoded=mode.decode(chunk);
    }else return null;
    const delim=decoded.indexOf("\u0000");
    if(delim<0)return null;
    return [decoded.slice(0,delim).trim().toUpperCase(),decoded.slice(delim+1).replace(/\u0000/g,"").trim()];
  }
  function parseID3(buf,fileSize){
    const b=new Uint8Array(buf);
    if(b.length<10||bytesToAscii(b.subarray(0,3))!=="ID3")
      return {source:"none",fields:{},warnings:["Sin cabecera ID3v2"]};
    const version=b[3],flags=b[5],tagSize=syncsafe(b,6);
    const warnings=[],fields={};
    if(version!==3&&version!==4)return {source:"unsupported",fields,warnings:["ID3v2."+version+" no implementado"]};
    if(flags&0x80)return {source:"unsupported",fields,warnings:["ID3 con desincronización global no implementado: no se inventan etiquetas"]};
    if(flags&0x40)return {source:"unsupported",fields,warnings:["ID3 con cabecera extendida: pendiente de soporte"]};
    if(tagSize>MAX_TAG_BYTES||tagSize+10>fileSize)return {source:"unsupported",fields,warnings:["ID3 declara tamaño inválido o superior a 2 MiB"]};
    if(b.length<tagSize+10)return {source:"unsupported",fields,warnings:["ID3 incompleto: no se usará metadata parcial"]};
    let p=10,seen=0;
    while(p+10<=tagSize+10&&seen<1000){
      const id=bytesToAscii(b.subarray(p,p+4));
      if(id==="\u0000\u0000\u0000\u0000")break;
      if(!/^[A-Z0-9]{4}$/.test(id)){warnings.push("Frame ID3 no reconocido; análisis interrumpido");break;}
      const len=version===4?syncsafe(b,p+4):big32(b,p+4);
      const flag=(b[p+8]<<8)|b[p+9];p+=10;seen++;
      if(len===0)continue;
      if(len>tagSize+10-p){warnings.push("Frame ID3 truncado");break;}
      const encryptedOrCompressed=version===3?(flag&0x00c0):(flag&0x000c);
      const unsyncFrame=version===4&&(flag&0x0002);
      if(!encryptedOrCompressed&&!unsyncFrame&&len<MAX_COMMENT_BYTES){
        const raw=b.subarray(p,p+len);
        if(id==="TXXX"){
          const pair=txxx(raw);
          if(pair){
            if(["INITIALKEY","INITIAL KEY","KEY","TONALITY"].includes(pair[0]))put(fields,"key",pair[1]);
            if(["BPM","TEMPO"].includes(pair[0]))put(fields,"bpm_raw",pair[1]);
          }
        }else if(id[0]==="T")applyTag(fields,id,textFrame(raw));
      }
      p+=len;
    }
    return {source:"ID3v2."+version,fields,warnings};
  }
  function parseID3v1(buf){
    const b=new Uint8Array(buf);
    if(b.length!==128||bytesToAscii(b.subarray(0,3))!=="TAG")return null;
    const fields={};
    put(fields,"title",decoderLatin1.decode(b.subarray(3,33)).split("\u0000")[0]);
    put(fields,"artist",decoderLatin1.decode(b.subarray(33,63)).split("\u0000")[0]);
    put(fields,"album",decoderLatin1.decode(b.subarray(63,93)).split("\u0000")[0]);
    return {source:"ID3v1",fields,warnings:["ID3v1 no proporciona BPM ni tonalidad"]};
  }
  function parseVorbis(data){
    const b=new Uint8Array(data),fields={},warnings=[];
    if(b.length<8)return {source:"unsupported",fields,warnings:["Comentario Vorbis truncado"]};
    let p=0;
    const vendorLength=le32(b,p);p+=4;
    if(vendorLength>b.length-p)return {source:"unsupported",fields,warnings:["Proveedor Vorbis malformado"]};
    p+=vendorLength;
    if(p+4>b.length)return {source:"unsupported",fields,warnings:["Lista Vorbis truncada"]};
    const count=le32(b,p);p+=4;
    if(count>10000)return {source:"unsupported",fields,warnings:["Número Vorbis de comentarios inverosímil"]};
    for(let i=0;i<count;i++){
      if(p+4>b.length){warnings.push("Comentario Vorbis truncado");break;}
      const length=le32(b,p);p+=4;
      if(length>b.length-p){warnings.push("Comentario Vorbis fuera de límites");break;}
      const comment=decoderUtf8.decode(b.subarray(p,p+length));p+=length;
      const split=comment.indexOf("=");if(split<0)continue;
      const key=comment.slice(0,split).trim().toUpperCase(),value=comment.slice(split+1);
      const aliases={TITLE:"title",ARTIST:"artist",ALBUM:"album",
        ALBUMARTIST:"album_artist",BPM:"bpm_raw",TEMPO:"bpm_raw",
        INITIALKEY:"key",KEY:"key",TONALITY:"key",DATE:"year"};
      if(aliases[key])put(fields,aliases[key],value);
    }
    return {source:"FLAC Vorbis",fields,warnings};
  }
  async function readSlice(file,start,length) {
    // File/Blob.slice grants read-only access. Bounds prevent large audio reads.
    if(length<0||length>MAX_TAG_BYTES+20)throw new Error("Lectura de etiquetas fuera de límite");
    const part=file.slice(start,start+length);
    const buffer=await part.arrayBuffer();
    return new Uint8Array(buffer);
  }
  async function readMP3(file){
    const header=await readSlice(file,0,10);
    if(header.length>=10&&bytesToAscii(header.subarray(0,3))==="ID3"){
      const declared=syncsafe(header,6);
      if(declared>MAX_TAG_BYTES||10+declared>file.size)
        return {source:"unsupported",fields:{},warnings:["Etiqueta ID3 demasiado grande o truncada"]};
      const bytes=await readSlice(file,0,declared+10);
      return parseID3(bytes,file.size);
    }
    if(file.size>=128){
      const tail=await readSlice(file,file.size-128,128);
      const tag=parseID3v1(tail);if(tag)return tag;
    }
    return {source:"none",fields:{},warnings:["MP3 sin etiquetas ID3 reconocidas"]};
  }
  async function readFLAC(file){
    const first=await readSlice(file,0,4);
    const fields={},warnings=[];
    if(bytesToAscii(first)!=="fLaC")return {source:"unsupported",fields,warnings:["No contiene cabecera FLAC"]};
    let p=4,blocks=0;
    while(p+4<=file.size&&blocks++<64&&p<32*1024*1024){
      const header=await readSlice(file,p,4);
      if(header.length<4)break;
      const last=Boolean(header[0]&0x80),kind=header[0]&0x7f;
      const size=(header[1]<<16)|(header[2]<<8)|header[3];
      p+=4;
      if(p+size>file.size)return {source:"unsupported",fields,warnings:["Bloque FLAC truncado"]};
      if(kind===4){
        if(size>MAX_COMMENT_BYTES)return {source:"unsupported",fields,warnings:["Comentarios Vorbis demasiado extensos"]};
        const data=await readSlice(file,p,size);
        return parseVorbis(data);
      }
      p+=size;
      if(last)break;
    }
    return {source:"none",fields,warnings:["FLAC sin comentarios Vorbis"]};
  }
  function enrich(parsed){
    const fields=parsed.fields||{};
    const b=Number(String(fields.bpm_raw||"").replace(",","."));
    const bpm=Number.isFinite(b)&&b>=40&&b<=250?b:null;
    const key=String(fields.key||"").trim();
    return {...parsed,title:fields.title||null,artist:fields.artist||null,
      album:fields.album||null,bpm,key:key||null,hasAny:Boolean(fields.title||fields.artist||fields.bpm_raw||fields.key),
      // Beware these values are source metadata, NOT verified by audio analysis.
      provenance:"ETIQUETA DEL ARCHIVO; NO COMPROBADA AUDITIVAMENTE"};
  }
  async function readTags(file){
    if(!file||typeof file.slice!=="function"||!Number.isFinite(file.size))
      throw new TypeError("Archivo no válido para lectura local");
    const name=String(file.name||"").toLowerCase();
    let parsed;
    try{
      if(name.endsWith(".mp3"))parsed=await readMP3(file);
      else if(name.endsWith(".flac"))parsed=await readFLAC(file);
      else parsed={source:"unsupported",fields:{},warnings:["Este formato no tiene lector de etiquetas aún"]};
      return enrich(parsed);
    }catch(error){
      return enrich({source:"error",fields:{},warnings:["No se pudieron leer etiquetas: "+(error?.message||"fallo local")]});
    }
  }
  const API={readTags,parseID3,parseID3v1,parseVorbis,enrich,MAX_TAG_BYTES};
  root.DJStudioTags=API;
  if(typeof module!=="undefined"&&module.exports)module.exports=API;
})(typeof window!=="undefined"?window:globalThis);
