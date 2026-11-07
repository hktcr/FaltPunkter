const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
let passed=[];
async function setup({width=390,height=844,boundaryFailure=false,storageFailure=false,storageValue}={}){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});const page=await context.newPage();const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 if(boundaryFailure)await page.route('**/astorp.geojson',r=>r.fulfill({status:503,body:'error'}));
 await page.addInitScript(({storageFailure,storageValue})=>{
   window.mockGps={success:null,error:null,starts:0,stops:0};
   Object.defineProperty(navigator,'geolocation',{value:{watchPosition(ok,err){mockGps.success=ok;mockGps.error=err;mockGps.starts++;return mockGps.starts;},clearWatch(){mockGps.stops++;}}});
   Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.copied=t;}}});
   if(storageValue) localStorage.setItem('faltpunkter_db',storageValue);
   if(storageFailure)Storage.prototype.setItem=function(){throw new Error('full');};
 },{storageFailure,storageValue});
 await page.goto('http://127.0.0.1:8765/');await page.waitForFunction(()=>boundaryState!=='loading');return {context,page,errors,requests};
}
async function locate(page,lat=56.135,lng=12.945,accuracy=5){await page.evaluate(({lat,lng,accuracy})=>mockGps.success({coords:{latitude:lat,longitude:lng,accuracy},timestamp:Date.now()}),{lat,lng,accuracy});}
{
 const {context,page,errors,requests}=await setup();
 assert.equal(await page.evaluate(()=>mockGps.starts),0);assert.equal(await page.locator('#copyButton').isDisabled(),true);assert.equal(await page.locator('#saveButton').isDisabled(),true);assert.match(await page.locator('#astorpBadge').innerText(),/saknas/);passed.push('No implicit GPS, no fake coordinates');
 assert.equal(requests.filter(u=>!u.startsWith('http://127.0.0.1')).length,0);passed.push('No third-party requests in private view');
 await page.getByRole('button',{name:'Hämta min position',exact:true}).click();await page.getByRole('button',{name:'Hämta min position',exact:true}).click();assert.equal(await page.evaluate(()=>mockGps.starts),1);passed.push('Repeated GPS activation creates only one watch');
 await locate(page);assert.match(await page.locator('#astorpBadge').innerText(),/innanför/);await page.locator('#copyButton').click();assert.equal(await page.evaluate(()=>copied),'56.135000, 12.945000');passed.push('Inside + precision copy');
 await page.locator('#saveButton').click();await page.locator('#ptName').fill('<img src=x onerror=alert(1)>');await locate(page,56.12,12.99,7);await page.getByRole('button',{name:'Spara punkt',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('faltpunkter_db')));assert.equal(saved[0].lat,56.135);assert.equal(saved[0].accuracy,5);passed.push('Save freezes coordinates and accuracy at dialog opening');
 await page.getByRole('button',{name:/Visa sparade positioner/}).click();assert.equal(await page.locator('.pt-name').innerText(),'<img src=x onerror=alert(1)>');assert.equal(await page.locator('.pt-name img').count(),0);await page.keyboard.press('Escape');assert.equal(await page.locator('#listDrawer').evaluate(e=>e.inert),true);passed.push('Saved-name escaping, drawer Escape and inert');
 await page.evaluate(()=>{gpsTimestamp=Date.now()-31000;updateDisplay();});assert.equal(await page.locator('#copyButton').isDisabled(),true);assert.match(await page.locator('#astorpBadge').innerText(),/gammal/);passed.push('Stale GPS prevents current position copying and verdict');
 await locate(page,56.05,12.7,10);assert.match(await page.locator('#astorpBadge').innerText(),/utanför/);passed.push('Outside GPS verdict');
 const vertex=await page.evaluate(()=>astorpBoundary.geometry.coordinates[0][0]);await locate(page,vertex[1],vertex[0],10);assert.match(await page.locator('#astorpBadge').innerText(),/Osäkert/);passed.push('Boundary GPS returns uncertain');
 await page.evaluate(()=>mockGps.error({code:1}));assert.equal(await page.locator('#copyButton').isDisabled(),true);assert.match(await page.locator('#sourceNote').innerText(),/nekades/);assert.equal(await page.evaluate(()=>gpsOn),false);passed.push('GPS permission error clears position with useful message');
 await page.getByRole('button',{name:'Hämta min position',exact:true}).click();await locate(page);await page.locator('#gpsBadge').click();assert.equal(await page.evaluate(()=>gpsOn),false);assert.equal(await page.locator('#copyButton').isDisabled(),true);passed.push('GPS stop clears fix and controls');
 await page.getByRole('button',{name:'⊕ Karta',exact:true}).click();assert.match(await page.locator('#sourceNote').innerText(),/inte din GPS/);assert.equal(await page.locator('#copyButton').isEnabled(),true);passed.push('Map source explicitly separated');
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied');}}});});await page.locator('#copyButton').click();assert.equal(await page.locator('#copyValue').evaluate(e=>e.selectionStart===0&&e.selectionEnd===e.value.length),true);passed.push('Clipboard fallback selects visible text');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/falt-mobile.png',fullPage:true});assert.deepEqual(errors,[]);passed.push('390px layout has no overflow and no JS errors');await context.close();
}
{
 const {context,page}=await setup({boundaryFailure:true});await page.getByRole('button',{name:'Hämta min position',exact:true}).click();await locate(page);assert.match(await page.locator('#astorpBadge').innerText(),/saknas/);assert.doesNotMatch(await page.locator('#astorpBadge').innerText(),/utanför/);assert.equal(await page.locator('#copyButton').isEnabled(),true);passed.push('Failed boundary stays unknown while coordinate copy works');await context.close();
}
{
 const {context,page}=await setup({storageFailure:true});await page.getByRole('button',{name:'⊕ Karta',exact:true}).click();await page.locator('#saveButton').click();await page.getByRole('button',{name:'Spara punkt',exact:true}).click();assert.equal(await page.evaluate(()=>points.length),0);assert.equal(await page.locator('#saveModalOverlay').evaluate(e=>e.classList.contains('visible')),true);passed.push('Storage failure never claims save success');await context.close();
}
{
 const raw='{"bad":"existing data"}',{context,page}=await setup({storageValue:raw});await page.getByRole('button',{name:'⊕ Karta',exact:true}).click();assert.equal(await page.locator('#saveButton').isDisabled(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('faltpunkter_db')),raw);passed.push('Malformed existing storage preserved, no overwrite');await context.close();
}
for(const size of [{width:320,height:568},{width:1440,height:900},{width:844,height:390}]){
 const {context,page,errors}=await setup(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#copyButton').scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/falt-${size.width}.png`,fullPage:true});assert.deepEqual(errors,[]);passed.push(`${size.width}x${size.height} viewport no overflow/errors`);await context.close();
}
await browser.close();console.log(JSON.stringify({passed:passed.length,tests:passed},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
