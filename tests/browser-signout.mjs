import assert from 'node:assert/strict';
const {chromium}=await import(process.env.ZENVYRA_PLAYWRIGHT_MODULE ?? 'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const sizes=[[1440,900],[1440,600],[1280,720],[1024,768],[900,600],[390,844],[390,600]];
try {
 for(const [width,height] of sizes) {
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.ZENVYRA_TEST_URL ?? 'http://localhost:3021/',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Belépek regisztráció nélkül',exact:true}).click();
  await page.getByText('Az itt látható értékek próbaadatok.',{exact:true}).waitFor();
  const menu=page.getByRole('button',{name:'Menü megnyitása',exact:true});
  if(await menu.isVisible()) await menu.click();
  const signout=page.getByRole('button',{name:'Kilépés',exact:true});
  assert.equal(await signout.isVisible(),true,`${width}x${height}: signout hidden`);
  const layout=await signout.evaluate(button=>{
   const b=button.getBoundingClientRect(), sidebar=button.closest('aside').getBoundingClientRect(), style=getComputedStyle(button);
   return {top:b.top,bottom:b.bottom,sidebarTop:sidebar.top,sidebarBottom:sidebar.bottom,viewport:innerHeight,color:style.color,background:style.backgroundColor};
  });
  assert.ok(layout.top>=0&&layout.bottom<=layout.viewport+1,`${width}x${height}: signout outside viewport ${JSON.stringify(layout)}`);
  assert.ok(layout.top>=layout.sidebarTop&&layout.bottom<=layout.sidebarBottom+1,`${width}x${height}: signout outside sidebar`);
  assert.equal(layout.color,'rgb(67, 45, 98)');assert.equal(layout.background,'rgb(255, 255, 255)');
  if(width===1440&&height===600)await page.screenshot({path:'.next/signout-desktop.png'});
  if(width===390&&height===600)await page.screenshot({path:'.next/signout-mobile.png'});
  await signout.click();
  await page.getByRole('button',{name:'Belépés vagy regisztráció',exact:true}).waitFor();
  await page.getByRole('button',{name:'Belépés vagy regisztráció',exact:true}).click();
  await page.locator('.login-form').waitFor();
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}x${height}: látható, kontrasztos, képernyőn belüli kilépés; visszatérés a belépési űrlaphoz.`);
  await page.close();
 }
} finally {await browser.close();}
