/* Pure, local TSV parsing/planning. No storage, DOM, network, or ID generation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FaltImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({bytes: 2 * 1024 * 1024, rows: 10000, text: 1000});
  const VERSION = '# FaltPunkter TSV 2';
  const HEADER = ['Namn','Tagg','Latitud','Longitud','Datum','Källa','Noggrannhet m'];
  const err = (row, message) => ({row, message});
  const numeric = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
  function number(value) {
    // Old exports prefixed negative values with an apostrophe.
    const s = String(value).trim().replace(/^'(?=-)/, '');
    return numeric.test(s) && Number.isFinite(Number(s)) ? Number(s) : NaN;
  }
  function validDate(s) {
    // ISO dates only; reject rollover dates such as February 30.
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/.exec(s);
    if (!m || !Number.isFinite(Date.parse(s))) return false;
    const y=+m[1], mo=+m[2], d=+m[3];
    const days = [31,(y%4===0 && (y%100!==0 || y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];
    if(mo<1 || mo>12 || d<1 || d>days[mo-1]) return false;
    if(m[4] && (+m[4]>23 || +m[5]>59 || +m[6]>59)) return false;
    if(m[7] && m[7]!=='Z' && (+m[7].slice(1,3)>23 || +m[7].slice(4)>59)) return false;
    return true;
  }
  function validate(c, row, versioned) {
    const errors=[];
    const decode=s=>versioned && s.startsWith("'") ? s.slice(1) : s;
    const name=decode(c[0]),tag=decode(c[1]);
    for(const [label,s] of [['Namn',name],['Tagg',tag]]) {
      if(s.length>LIMITS.text || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)) errors.push(err(row,label+' är för långt eller innehåller otillåtna kontrolltecken.'));
    }
    if(!name.trim()) errors.push(err(row,'Namn saknas.'));
    const lat=number(c[2]),lng=number(c[3]);
    if(!Number.isFinite(lat)||Math.abs(lat)>90) errors.push(err(row,'Ogiltig latitud.'));
    if(!Number.isFinite(lng)||Math.abs(lng)>180) errors.push(err(row,'Ogiltig longitud.'));
    const date=c[4].trim();
    if(!validDate(date)) errors.push(err(row,'Ogiltigt datum. Använd ISO-datum.'));
    const source=(c[5]||'').trim();
    if(!['','gps','center','tap'].includes(source)) errors.push(err(row,'Okänd källa. Tillåtna värden: gps, center, tap eller tomt.'));
    const accuracy=c.length===5 || !c[6].trim() ? null : number(c[6]);
    if(accuracy!==null && (!Number.isFinite(accuracy)||accuracy<0)) errors.push(err(row,'Ogiltig noggrannhet. Ange ett icke-negativt tal eller lämna tomt.'));
    return {point:{name,tag,lat,lng,date,source,accuracy},errors};
  }
  function parseTSV(text) {
    const result={rows:[],errors:[],fatal:false};
    const fail=(row,message)=>{result.errors.push(err(row,message));result.fatal=true;return result;};
    if(typeof text!=='string') return fail(0,'Importen måste vara text.');
    if(text.length>LIMITS.bytes || new TextEncoder().encode(text).length>LIMITS.bytes) return fail(0,'Filen är för stor (högst 2 MiB).');
    text=text.replace(/^\uFEFF/,'');
    const records=[];
    let cells=[],cell='',quoted=false,closed=false,line=1,start=1;
    const pushCell=()=>{cells.push(cell);cell='';closed=false;};
    const pushRow=()=>{pushCell();records.push({cells,row:start});cells=[];start=line+1;};
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted) {
        if(c==='"') {if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}
        else {cell+=c;if(c==='\n' || (c==='\r' && text[i+1]!=='\n'))line++;}
      } else if(c==='\t') pushCell();
      else if(c==='\n'||c==='\r') {pushRow();if(c==='\r'&&text[i+1]==='\n')i++;line++;start=line;}
      else if(c==='"' && cell===''&&!closed) quoted=true;
      else if(c==='"'||closed) return fail(line,'Felaktiga citattecken i TSV. Inget kan importeras.');
      else cell+=c;
      if(records.length>LIMITS.rows+2) return fail(line,'För många rader (högst 10 000 punkter).');
    }
    if(quoted) return fail(start,'Avslutande citattecken saknas. Inget kan importeras.');
    if(cell!==''||cells.length||closed) pushRow();
    while(records.length && records[records.length-1].cells.every(v=>v==='')) records.pop();
    const versioned=records[0]?.cells.length===1&&records[0].cells[0]===VERSION;
    if(versioned) records.shift();
    const header=records.shift();
    if(!header || ![5,7].includes(header.cells.length) || header.cells.some((v,i)=>v.trim()!==HEADER[i])) return fail(header?.row||1,'Rubrikerna måste vara Namn, Tagg, Latitud, Longitud, Datum och valfritt Källa, Noggrannhet m.');
    if(records.length>LIMITS.rows) return fail(0,'För många rader (högst 10 000 punkter).');
    for(const record of records) {
      if(record.cells.length!==header.cells.length) {result.errors.push(err(record.row,'Fel antal kolumner.'));continue;}
      const checked=validate(record.cells,record.row,versioned);
      result.errors.push(...checked.errors);
      if(!checked.errors.length)result.rows.push({row:record.row,point:checked.point});
    }
    return result;
  }
  function key(p) {return JSON.stringify([p.lat,p.lng,p.name,p.tag||'',Number.isFinite(Date.parse(p.date))?Date.parse(p.date):p.date]);}
  function planImport(parsed, existing) {
    const result={additions:[],duplicates:[],errors:parsed.errors.slice(),fatal:!!parsed.fatal};
    if(result.fatal)return result;
    const seen=new Map(existing.map(p=>[key(p),'existing']));
    for(const {row,point} of parsed.rows) {
      const k=key(point);
      if(seen.has(k)) result.duplicates.push({row,point:{...point},reason:seen.get(k)});
      else {seen.set(k,'file');result.additions.push({...point});}
    }
    return result;
  }
  function exportTSV(points) {
    if(!Array.isArray(points)||points.length>LIMITS.rows) throw new Error('För många punkter eller ogiltig lista.');
    const quote=s=>/[\t\r\n"]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
    // Prefix ALL textual name/tag cells, not just formula-like values. The version
    // marker disambiguates literal apostrophes and makes this fully reversible.
    const rows=points.map((p,i)=>{
      const c=[String(p.name??''),String(p.tag??''),String(p.lat??''),String(p.lng??''),String(p.date??''),String(p.source??''),String(p.accuracy??'')];
      const check=validate(c,i+3,false);
      if(check.errors.length) throw new Error('Punkt '+(i+1)+': '+check.errors.map(e=>e.message).join(' '));
      c[0]="'"+c[0];c[1]="'"+c[1];return c.map(quote).join('\t');
    });
    const text='\uFEFF'+[VERSION,HEADER.join('\t'),...rows].join('\r\n');
    if(new TextEncoder().encode(text).length>LIMITS.bytes)throw new Error('Exporten är för stor (högst 2 MiB).');
    return text;
  }
  return Object.freeze({LIMITS,parseTSV,planImport,exportTSV});
});
