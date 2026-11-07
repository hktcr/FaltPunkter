'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const imp=require('./import.js');
const h5='Namn\tTagg\tLatitud\tLongitud\tDatum';
const h7=h5+'\tKälla\tNoggrannhet m';
const date='2026-11-07T12:34:56.123Z';
const point=(more={})=>({name:'Åstorp',tag:'Test',lat:56.123456789,lng:12.123456789,date,source:'gps',accuracy:3.25,...more});
const row=(more={})=>{const p=point(more);return [p.name,p.tag,p.lat,p.lng,p.date,p.source,p.accuracy].join('\t');};
test('browser global and CommonJS API, no side effects',()=>{
 const sandbox={TextEncoder};vm.runInNewContext(fs.readFileSync(__dirname+'/import.js','utf8'),sandbox);
 assert.equal(typeof sandbox.FaltImport.parseTSV,'function');
 assert.deepEqual(Object.keys(imp).sort(),['LIMITS','exportTSV','parseTSV','planImport'].sort());
});
test('legacy five and seven column exports; BOM and CRLF',()=>{
 for(const text of [h5+'\nÅstorp\tTest\t56.123456789\t12.123456789\t'+date,'\uFEFF'+h7+'\r\n'+row()+'\r\n']){
  const p=imp.parseTSV(text);assert.deepEqual(p.errors,[]);assert.equal(p.rows.length,1);assert.equal(p.rows[0].point.lat,56.123456789);assert.equal(p.rows[0].row,2);
 }
 const old=imp.parseTSV(h5+"\nTest\t\t'-55\t'-12\t"+date);
 assert.equal(old.rows[0].point.lat,-55);assert.equal(old.rows[0].point.accuracy,null);
});
test('exact round trip, including apostrophes, formulas, CRLF, tabs, quotes and precision',()=>{
 const names=['=SUM(1,2)','+cmd','-name','@SUM(A1)',"'=literal","'hello",'  =SUM(1)', '\t=SUM(1)', 'He said "hej"\nnext\r\nrow\tÅäö'];
 const original=names.map((name,i)=>point({name,tag:name,lat:-56.123456789+i,source:i%2?'tap':'center',accuracy:i%2?null:0}));
 const text=imp.exportTSV(original),p=imp.parseTSV(text);
 assert.equal(p.fatal,false);assert.deepEqual(p.errors,[]);assert.deepEqual(p.rows.map(r=>r.point),original);
 const plan=imp.planImport(p,[]);assert.deepEqual(plan.additions,original);assert.ok(plan.additions.every(p=>!('id' in p)));
 assert.ok(text.includes("'=SUM(1,2)"));assert.ok(text.includes("''=literal"));
});
test('quoted TSV fields, multiline physical row numbers, and escaped quotes',()=>{
 const p=imp.parseTSV(h7+'\n"Å\n""B"""\tTagg\t56\t12\t'+date+'\tgps\t1\n'+row({lat:''}));
 assert.equal(p.rows[0].point.name,'Å\n"B"');assert.equal(p.errors[0].row,4);
});
test('strict coordinates reject blanks, infinities, hex, commas, formulas and range errors',()=>{
 for(const [field,value] of [['lat',''],['lng',' '],['lat','NaN'],['lng','Infinity'],['lat','0x10'],['lng','=1+1'],['lat','56,1'],['lat',91],['lng',-181]]){
  const p=imp.parseTSV(h7+'\n'+row({[field]:value}));assert.equal(p.rows.length,0,field+':'+value);assert.ok(p.errors.length);
 }
 for(const [lat,lng] of [[0,0],[-90,-180],[90,180]])assert.equal(imp.parseTSV(h7+'\n'+row({lat,lng})).errors.length,0);
});
test('strict dates, sources and accuracy',()=>{
 for(const changes of [{date:''},{date:'2026-02-30'},{date:'2025-02-29'},{date:'2026-13-01'},{date:'2026-11-07T24:00:00Z'},{date:'yesterday'},{date:'2026-11-07T12:00:00'},{source:'<script>'},{accuracy:-1},{accuracy:'NaN'},{accuracy:'1m'}]){
  assert.ok(imp.parseTSV(h7+'\n'+row(changes)).errors.length,JSON.stringify(changes));
 }
 for(const changes of [{date:'2024-02-29'},{date:'2026-11-07T12:00:00+01:00'},{source:''},{source:'tap'},{accuracy:0},{accuracy:''}])assert.equal(imp.parseTSV(h7+'\n'+row(changes)).errors.length,0);
});
test('duplicates use full precision, name, tag and date, not coordinates alone',()=>{
 const existing=[{id:'keep',...point()}],before=JSON.stringify(existing);
 const input=[point(),point({name:'Another'}),point({tag:'Other'}),point({date:'2026-11-08'}),point({lat:56.123456788}),point({name:'Another'})];
 const parsed=imp.parseTSV(imp.exportTSV(input));const snapshot=JSON.stringify(parsed);
 const plan=imp.planImport(parsed,existing);
 assert.equal(plan.additions.length,4);assert.deepEqual(plan.duplicates.map(d=>d.reason),['existing','file']);
 assert.equal(JSON.stringify(existing),before);assert.equal(JSON.stringify(parsed),snapshot);
 plan.additions[0].name='Changed';assert.equal(JSON.stringify(parsed),snapshot);
 const equivalent=imp.parseTSV(imp.exportTSV([point({date:'2026-11-07T13:34:56.123+01:00'})]));
 assert.equal(imp.planImport(equivalent,existing).duplicates.length,1);
});
test('row errors remain visible, valid rows remain previewable',()=>{
 const parsed=imp.parseTSV(h7+'\n'+row()+'\n'+row({lat:''})+'\nx\ty');
 assert.equal(parsed.fatal,false);assert.equal(parsed.rows.length,1);assert.equal(parsed.errors.length,2);
 const plan=imp.planImport(parsed,[]);assert.equal(plan.additions.length,1);assert.deepEqual(plan.errors,parsed.errors);
});
test('malformed quoting and header are fatal and cannot plan additions',()=>{
 for(const text of ['',row(),h7+'\n"broken',h7+'\n"foo"bar\tX',h7+'\nfoo"bar']){
  const parsed=imp.parseTSV(text);assert.equal(parsed.fatal,true);assert.equal(imp.planImport(parsed,[]).additions.length,0);
 }
});
test('limits reject excessive UTF8 bytes, row count, field length and controls',()=>{
 assert.equal(imp.parseTSV('Å'.repeat(imp.LIMITS.bytes/2+1)).fatal,true);
 assert.equal(imp.parseTSV(h7+'\n'+(row()+'\n').repeat(imp.LIMITS.rows+1)).fatal,true);
 for(const name of ['x'.repeat(imp.LIMITS.text+1),'abc\u0000def'])assert.ok(imp.parseTSV(h7+'\n'+row({name})).errors.length);
 assert.throws(()=>imp.exportTSV([point({lat:null})]));assert.throws(()=>imp.exportTSV([point({source:'unknown'})]));
});
test('legacy apostrophes are preserved without guessing their origin',()=>{
 const p=imp.parseTSV(h7+'\n'+row({name:"'=SUM(1)"}));assert.equal(p.rows[0].point.name,"'=SUM(1)");
});
