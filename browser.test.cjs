'use strict';
// Real Chromium + service workers + a local HTTP server. All positions are synthetic.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const root=__dirname;const state={release:2,fault:null,requests:[]};const results=[];let browser,server;
const point=(name='Existing',lat=56.13)=>({id:name,name,tag:'Test',lat,lng:12.94,date:'2026-01-01T00:00:00.000Z',source:'center',accuracy:null});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.geojson':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
async function run(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function start(){server=http.createServer((req,res)=>{
 state.requests.push(req.url);const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/app/')){res.writeHead(404).end();return;}
 const rel=url.pathname.slice(5)||'index.html';if(rel.includes('..')){res.writeHead(400).end();return;}
 let bytes;try{bytes=fs.readFileSync(path.join(root,rel));}catch{res.writeHead(404).end();return;}
 if(rel==='sw.js')bytes=Buffer.from(bytes.toString().replace('faltpunkter-v20261107-2',`faltpunkter-v20261107-${state.release}`));
 if(rel==='index.html')bytes=Buffer.from(bytes.toString().replace('<body>',`<body data-test-release="${state.release}">`));
 const headers={'Content-Type':mime[path.extname(rel)]||'text/plain','Cache-Control':'no-store'};
 if(state.fault==='503'){res.writeHead(503,headers).end('unavailable');return;}
 if(state.fault==='slowbody'&&rel==='import.js'){res.writeHead(200,headers);res.flushHeaders();setTimeout(()=>{if(!res.destroyed)res.end(bytes);},12000).unref();return;}
 if(state.fault==='delay'){setTimeout(()=>{if(!res.destroyed){res.writeHead(200,headers).end(bytes);}},12000).unref();return;}
 res.writeHead(200,headers).end(bytes);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}/app/`;}
async function ready(page){await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offlineStatus').textContent.includes('sparad'),null,{timeout:20000});}
async function db(page){return page.evaluate(()=>localStorage.getItem('faltpunkter_db'));}
async function fixture(base,width=390,height=844,seed=[]){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'allow'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){if(seed.length)localStorage.setItem('faltpunkter_db',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},seed);
 await page.goto(base);await ready(page);return {context,page,errors};
}
async function choose(page,text){
 if(!await page.locator('#listDrawer').evaluate(e=>e.classList.contains('open')))await page.locator('[onclick="openDrawer()"]').click();
 await page.locator('[onclick="openImport()"]').click();await page.locator('#importFile').setInputFiles({name:'positions.tsv',mimeType:'text/tab-separated-values',buffer:Buffer.from(text)});
 await page.waitForFunction(()=>!document.getElementById('importSummary').textContent.includes('Läser'));
}
const tsv=points=>require('./import.js').exportTSV(points);
(async()=>{const base=await start();browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{} )});
const f=await fixture(base);const {page,context}=f;
await run('first install caches a complete app without external requests or automatic GPS',async()=>{
 assert.equal(await page.locator('#copyButton').isDisabled(),true);assert.equal(await page.evaluate(()=>gpsOn),false);
 const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name));assert.ok(resources.every(u=>u.startsWith(base)));
 assert.equal(await page.evaluate(async()=>{const c=await caches.open('faltpunkter-v20261107-2');return (await c.keys()).length;}),11);
});
await run('offline reload with query opens app and known boundary, without forwarding query',async()=>{
 state.requests=[];await context.setOffline(true);await page.goto(base+'?lat=56.123&lng=12.456');await page.locator('[data-mode="center"]').click();await page.waitForFunction(()=>boundaryState==='ready');
 assert.match(await page.locator('#astorpBadge').innerText(),/innanför|utanför|Osäkert/);assert.equal(await page.locator('#copyButton').isEnabled(),true);
 assert.equal(await page.url(),base);assert.ok(state.requests.every(u=>!u.includes('lat=')));const keys=await page.evaluate(async()=>{const c=await caches.open('faltpunkter-v20261107-2');return (await c.keys()).map(r=>r.url);});assert.ok(keys.every(u=>!u.includes('?')));await context.setOffline(false);
});
await run('503 and stalled network do not delay cached startup',async()=>{
 for(const fault of ['503','delay']){state.fault=fault;const start=Date.now();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>boundaryState==='ready');assert.ok(Date.now()-start<4500,'cached app must not await network');}state.fault=null;
});
await run('failed update leaves current complete release active',async()=>{
 state.release=3;state.fault='slowbody';await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();window.failedInstall=false;r.addEventListener('updatefound',()=>{const w=r.installing;const check=()=>{if(w.state==='redundant')window.failedInstall=true;};w.addEventListener('statechange',check);check();},{once:true});await r.update();});await page.waitForFunction(()=>window.failedInstall,null,{timeout:15000});
 assert.equal(await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return r.waiting===null;}),true);
 assert.equal(await page.locator('body').getAttribute('data-test-release'),'2');assert.equal(await page.evaluate(()=>caches.has('faltpunkter-v20261107-3')),false);state.release=2;state.fault=null;
});
await run('successful update waits, preserves data and another tab’s open save dialog',async()=>{
 await page.evaluate(p=>{localStorage.setItem('faltpunkter_db',JSON.stringify([p]));loadPoints();},point());
 const second=await context.newPage();await second.goto(base);await ready(second);await second.locator('[data-mode="center"]').click();await second.locator('#saveButton').click();await second.locator('#ptName').fill('Unsaved draft');
 state.release=4;await page.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));await page.waitForFunction(()=>!document.getElementById('updateButton').hidden,null,{timeout:20000});
 await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r.waiting&&await caches.has('faltpunkter-v20261107-4');});await second.waitForFunction(()=>!document.getElementById('updateButton').hidden);assert.equal(await page.locator('body').getAttribute('data-test-release'),'2');
 await page.locator('.privacy').last().locator('summary').click();await page.locator('#updateButton').click();await page.waitForFunction(()=>document.body.dataset.testRelease==='4');
 assert.equal(JSON.parse(await db(page))[0].name,'Existing');assert.equal(await second.locator('#ptName').inputValue(),'Unsaved draft');assert.equal(await second.locator('#saveModalOverlay').isVisible(),true);assert.equal(await second.locator('body').getAttribute('data-test-release'),'2');
 await second.getByRole('button',{name:'Avbryt',exact:true}).click();await second.locator('.privacy').last().locator('summary').click();await second.locator('#updateButton').click();await second.waitForFunction(()=>document.body.dataset.testRelease==='4');await second.close();
});
await run('missing new asset falls back on 503 and full-body timeout to earlier cached release',async()=>{
 for(const fault of ['503','slowbody']){await page.evaluate(async()=>{const c=await caches.open('faltpunkter-v20261107-4');await c.delete(new URL('import.js',location.href));});state.fault=fault;const start=Date.now();await page.reload();await page.waitForFunction(()=>typeof FaltImport==='object');assert.ok(Date.now()-start<10000);}state.fault=null;
});
assert.deepEqual(f.errors,[]);await context.close();state.release=2;
const q=await fixture(base,390,844,[point()]);const p=q.page;
await run('TSV preview distinguishes new, duplicate and malformed rows without writing',async()=>{
 const before=await db(p);await choose(p,tsv([point(),point('New',56.14),point('New',56.14)]));assert.match(await p.locator('#importSummary').innerText(),/1 nya punkter · 2 dubbletter · 0 fel/);assert.equal(await db(p),before);await p.getByRole('button',{name:'Avbryt import'}).click();
 await choose(p,'Namn\tTagg\tLatitud\tLongitud\tDatum\nInvalid\t\t\t13\t2026-01-01T00:00:00Z');assert.equal(await p.locator('#commitImportButton').isDisabled(),true);assert.equal(await db(p),before);await p.getByRole('button',{name:'Avbryt import'}).click();
});
await run('confirmed import adds only new points and undo restores byte-identical original',async()=>{
 const before=await db(p);await choose(p,tsv([point(),point('New',56.14)]));await p.locator('#commitImportButton').click();await p.waitForFunction(()=>points.length===2);assert.ok(JSON.parse(await db(p)).some(x=>x.name==='Existing'));p.once('dialog',d=>d.accept());await p.locator('#restoreImportButton').click();await p.waitForFunction(()=>points.length===1);assert.equal(await db(p),before);
});
await run('undo to empty clears memory and storage, then save does not resurrect imported points',async()=>{
 await p.evaluate(()=>{localStorage.removeItem('faltpunkter_db');loadPoints();});await choose(p,tsv([point('Only import')]));await p.locator('#commitImportButton').click();await p.waitForFunction(()=>points.length===1);p.once('dialog',d=>d.accept());await p.locator('#restoreImportButton').click();await p.waitForFunction(()=>points.length===0);assert.equal(await db(p),null);
 await p.locator('[onclick="closeDrawer()"]').click();await p.locator('[data-mode="center"]').click();await p.locator('#saveButton').click();await p.locator('#ptName').fill('Manual after undo');await p.getByRole('button',{name:'Spara punkt',exact:true}).click();await p.waitForFunction(()=>points.length===1);assert.deepEqual(JSON.parse(await db(p)).map(x=>x.name),['Manual after undo']);await p.evaluate(()=>{localStorage.removeItem('faltpunkter_db');loadPoints();});
});
await run('failed second import preserves the previous working recovery point',async()=>{
 await choose(p,tsv([point('First import')]));await p.locator('#commitImportButton').click();await p.waitForFunction(()=>points.length===1);const before=await db(p);
 await choose(p,tsv([point('Second import',56.15)]));await p.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='faltpunkter_db')throw new DOMException('Full','QuotaExceededError');return window.originalSet.call(this,k,v);};});
 await p.locator('#commitImportButton').click();await p.waitForFunction(()=>!importBusy);assert.equal(await db(p),before);await p.evaluate(()=>{Storage.prototype.setItem=window.originalSet;});await p.getByRole('button',{name:'Avbryt import'}).click();p.once('dialog',d=>d.accept());await p.locator('#restoreImportButton').click();await p.waitForFunction(()=>points.length===0);assert.equal(await db(p),null);
});
await run('import freezes approved file while waiting for a lock',async()=>{
 await choose(p,tsv([point('Approved A')]));await p.evaluate(()=>{window.lockAcquired=false;navigator.locks.request('faltpunkter-points',()=>new Promise(resolve=>{window.releaseTestLock=resolve;window.lockAcquired=true;}));});await p.waitForFunction(()=>window.lockAcquired);await p.locator('#commitImportButton').click();assert.equal(await p.locator('#importFile').isDisabled(),true);
 await p.evaluate(async text=>{await previewImport(new File([text],'B.tsv'));window.releaseTestLock();},tsv([point('Unapproved B')]));await p.waitForFunction(()=>!importBusy);assert.equal(JSON.parse(await db(p))[0].name,'Approved A');
});
await run('later edits and malformed backup never get overwritten by undo',async()=>{
 await p.evaluate(()=>{const a=JSON.parse(localStorage.getItem('faltpunkter_db'));a.push({id:'later',name:'Later',lat:56,lng:13,tag:'',date:'2026-01-02T00:00:00Z'});localStorage.setItem('faltpunkter_db',JSON.stringify(a));loadPoints();});const before=await db(p);p.once('dialog',d=>d.accept());await p.evaluate(()=>restoreImport());assert.equal(await db(p),before);
 await p.evaluate(()=>{localStorage.setItem('faltpunkter_import_backup',JSON.stringify([{version:1,before:'{bad',after:localStorage.getItem('faltpunkter_db'),added:1}]));});p.once('dialog',d=>d.accept());await p.evaluate(()=>restoreImport());assert.equal(await db(p),before);
});
await run('a post-write render error does not turn a durable save into a rollback',async()=>{
 await p.locator('[onclick="closeDrawer()"]').click();await p.locator('[data-mode="center"]').click();await p.locator('#saveButton').click();await p.locator('#ptName').fill('Survives render failure');await p.evaluate(()=>{window.realUpdateUI=updateUI;updateUI=()=>{throw Error('test rendering failure');};});await p.getByRole('button',{name:'Spara punkt',exact:true}).click();await p.waitForFunction(()=>points.some(p=>p.name==='Survives render failure'));await p.evaluate(()=>{updateUI=window.realUpdateUI;});const names=JSON.parse(await db(p)).map(x=>x.name);assert.ok(names.includes('Survives render failure'));
});
await run('new export is a reversible local download',async()=>{
 await p.locator('[onclick="openDrawer()"]').click();const download=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Exportera TSV',exact:true}).click()]).then(x=>x[0]);const filename=await download.path();const parsed=require('./import.js').parseTSV(fs.readFileSync(filename,'utf8'));assert.equal(parsed.errors.length,0);assert.equal(parsed.rows.length,JSON.parse(await db(p)).length);
});
assert.deepEqual(q.errors,[]);await q.context.close();
for(const size of [[320,568],[390,844],[844,390],[1440,900]])await run(`real viewport ${size[0]}x${size[1]} has no horizontal overflow`,async()=>{const f=await fixture(base,...size);assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await f.page.locator('#copyButton').scrollIntoViewIfNeeded();fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await f.page.screenshot({path:path.join(root,`test-results/${size[0]}x${size[1]}.png`),fullPage:true});assert.deepEqual(f.errors,[]);await f.context.close();});
console.log(JSON.stringify({passed:results.length,tests:results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server){server.closeAllConnections();server.close();}});
