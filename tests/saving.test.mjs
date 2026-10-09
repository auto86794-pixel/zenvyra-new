import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function setup(names, extra = {}, file = "components/dashboard/Dashboard.tsx") {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile('Dashboard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) functions.push(node.getText(ast).replace(/^export\s+/, ""));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let water = 0, message = '';
  const context = vm.createContext({ exports: {}, Map, Date, guestMode: false, session: {user:{id:'test-user'}},
    setCloudMessage: value => {message=value;}, setWater: update => {water=update(water);}, ...extra });
  const lock = fs.readFileSync('lib/saving/save-lock.ts','utf8').replace('export function','function');
  const code = lock + '\nconst saveLock = {current:createSaveLock()}; const wellbeingSaveQueue = {current:Promise.resolve()}; const savedWellbeing = {current:null};\n' + functions.join('\n');
  vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {context, water:()=>water, message:()=>message};
}
test('double click sends one insert and updates water once', async()=>{
  let resolve, calls=0;
  const pending=new Promise(r=>{resolve=r;});
  const s=setup(['addWater'],{supabase:{from:()=>({insert:()=>{calls++;return pending;}})}});
  const first=s.context.addWater(250); await s.context.addWater(250);
  assert.equal(calls,1); assert.equal(s.water(),0);
  resolve({error:null}); await first; assert.equal(s.water(),250);
});
test('database error leaves local water unchanged and reports failure',async()=>{
 const s=setup(['addWater'],{supabase:{from:()=>({insert:async()=>({error:{code:'42501'}})})}});
 await s.context.addWater(250); assert.equal(s.water(),0); assert.match(s.message(),/nem sikerült/);
});
test('network exception is reported and lock permits later retry',async()=>{
 let fail=true;
 const s=setup(['addWater'],{supabase:{from:()=>({insert:async()=>{if(fail)throw Error('offline');return {error:null};}})}});
 await s.context.addWater(250); assert.match(s.message(),/kapcsolatot/);
 await new Promise(r=>setTimeout(r,420)); fail=false; await s.context.addWater(250);
 assert.equal(s.water(),250); assert.equal(s.message(),'');
});
test('guest double click also records only once',async()=>{
 const s=setup(['addWater'],{guestMode:true});
 await s.context.addWater(250); await s.context.addWater(250); assert.equal(s.water(),250);
});
test('invalid weight reports validation feedback without an insert',async()=>{
 const s=setup(['saveQuickWeight'],{quickWeight:'abc'});
 await s.context.saveQuickWeight(); assert.match(s.message(),/30 és 250/);
});
test('failed wellbeing lookup preserves the previously displayed values',async()=>{
 let changes=0;
 const chain={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,maybeSingle:async()=>({error:{code:'42501'}})};
 const s=setup(['saveWellbeingSnapshot', 'persistWellbeingSnapshot'],{mood:3,energyLevel:null,stressLevel:null,wellbeingNote:'',localDateKey:()=> '2026-10-09',supabase:{from:()=>chain},setMood:()=>changes++,setEnergyLevel:()=>changes++,setStressLevel:()=>changes++,setWellbeingNote:()=>changes++});
 await s.context.saveWellbeingSnapshot({mood:5}); assert.equal(changes,0); assert.match(s.message(),/nem sikerült/);
});

const wellbeingMethods=['saveWellbeingSnapshot','persistWellbeingSnapshot','energyToNumber','stressToNumber'];
function wellbeingStore({failFirst=false}={}) {
 let row=null, writes=0, lookups=0;
 const chain={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,
 maybeSingle:async()=>{lookups++;if(failFirst&&lookups===1)return {error:{code:'42501'}};return {data:row?{id:'wellbeing-1'}:null,error:null};},
 insert:async payload=>{writes++;await new Promise(r=>setTimeout(r,10));row=payload;return {error:null};},
 update:payload=>{writes++;row={...row,...payload};return chain;},
 single:async()=>({data:{id:'wellbeing-1'},error:null})};
 return {chain,row:()=>row,writes:()=>writes};
}
function wellbeingState(store) {
 return {mood:3,energyLevel:null,stressLevel:null,wellbeingNote:'',localDateKey:()=> '2026-10-09',supabase:{from:()=>store.chain},setMood:()=>{},setEnergyLevel:()=>{},setStressLevel:()=>{},setWellbeingNote:()=>{}};
}
test('rapid mood, energy and stress edits are all persisted in order with one row',async()=>{
 const store=wellbeingStore(), s=setup(wellbeingMethods,wellbeingState(store));
 await Promise.all([s.context.saveWellbeingSnapshot({mood:5}),s.context.saveWellbeingSnapshot({energyLevel:'Jó'}),s.context.saveWellbeingSnapshot({stressLevel:'Magas'})]);
 assert.equal(store.row().mood,5);assert.equal(store.row().energy,5);assert.equal(store.row().stress,5);assert.equal(store.writes(),3);
});
test('failed first wellbeing save does not block the next edit',async()=>{
 const store=wellbeingStore({failFirst:true}), s=setup(wellbeingMethods,wellbeingState(store));
 await Promise.all([s.context.saveWellbeingSnapshot({mood:5}),s.context.saveWellbeingSnapshot({energyLevel:'Jó'})]);
 assert.equal(store.row().mood,3);assert.equal(store.row().energy,5);assert.equal(store.writes(),1);
});
test('different water amounts are not mistaken for duplicate clicks',async()=>{
 let calls=0;
 const s=setup(['addWater'],{supabase:{from:()=>({insert:async()=>{calls++;return {error:null};}})}});
 await Promise.all([s.context.addWater(250),s.context.addWater(500)]);assert.equal(calls,2);assert.equal(s.water(),750);
});
function mealState(extra={}) {
 return {foodName:'Teszt étel',kcal:'200',protein:'12',carbs:'25',fat:'6',mealType:'Ebéd',setMeals:()=>{},setMealModalOpen:()=>{},...extra};
}
test('non-numeric macronutrients are rejected before database access',async()=>{
 const s=setup(['addMeal'],mealState({protein:'abc'}));await s.context.addMeal({preventDefault(){}});assert.match(s.message(),/tápértékek/);
});
test('negative macronutrients are rejected',async()=>{
 const s=setup(['addMeal'],mealState({carbs:'-1'}));await s.context.addMeal({preventDefault(){}});assert.match(s.message(),/tápértékek/);
});
test('meal double submit inserts once and closes the form only after success',async()=>{
 let resolve,calls=0,meals=[],closed=0;
 const chain={insert:()=>{calls++;return chain;},select:()=>chain,single:()=>new Promise(r=>{resolve=r;})};
 const s=setup(['addMeal'],mealState({supabase:{from:()=>chain},setMeals:fn=>{meals=fn(meals);},setMealModalOpen:()=>closed++}));
 const first=s.context.addMeal({preventDefault(){}});await s.context.addMeal({preventDefault(){}});
 assert.equal(calls,1);assert.equal(closed,0);resolve({data:{id:'meal-1'},error:null});await first;assert.equal(meals.length,1);assert.equal(closed,1);
});
test('failed meal insert keeps the form and existing meals unchanged',async()=>{
 let changes=0;
 const chain={insert:()=>chain,select:()=>chain,single:async()=>({error:{code:'42501'},data:null})};
 const s=setup(['addMeal'],mealState({supabase:{from:()=>chain},setMeals:()=>changes++,setMealModalOpen:()=>changes++}));
 await s.context.addMeal({preventDefault(){}});assert.equal(changes,0);assert.match(s.message(),/nem sikerült/);
});
function preferenceState(extra={}) {
 return {dietType:'omnivore',allergens:[],disliked:'',workoutMinutes:20,fitnessLevel:'beginner',movementLimitations:'',setBusy:()=>{},setMessage:()=>{},onChange:()=>{},...extra};
}
test('profile update with zero returned rows cannot report success',async()=>{
 let message='',changed=0,busy=true;
 const chain={update:()=>chain,eq:()=>chain,select:()=>chain,single:async()=>({data:null,error:null})};
 const s=setup(['save','splitList'],preferenceState({supabase:{from:()=>chain},setMessage:v=>{message=v;},setBusy:v=>{busy=v;},onChange:()=>changed++}),'components/dashboard/PreferencesPanel.tsx');
 await s.context.save({preventDefault(){}});assert.equal(changed,0);assert.equal(busy,false);assert.match(message,/nem sikerült/);
});
test('profile storage exception releases busy state and preserves callback state',async()=>{
 let message='',busy=true,changed=0;
 const s=setup(['save','splitList'],preferenceState({guestMode:true,window:{localStorage:{setItem(){throw Error('QuotaExceeded');}}},setMessage:v=>{message=v;},setBusy:v=>{busy=v;},onChange:()=>changed++}),'components/dashboard/PreferencesPanel.tsx');
 await s.context.save({preventDefault(){}});assert.equal(busy,false);assert.equal(changed,0);assert.match(message,/nem sikerült/);
});
function recipeState(extra={}) {
 return {name:'Saját tesztrecept',servings:'2',kcal:'400',protein:'20',carbs:'50',fat:'10',ingredientLines:'Zab - 100 g',dietStyle:'vegan',recipeAllergens:[],recipes:[],storageKey:'test-recipes',auditRecipeAllergens:v=>v,setRecipes:()=>{},setSelectedPortions:()=>{},setMessage:()=>{},resetForm:()=>{},...extra};
}
test('recipe storage failure keeps the form and recipe list unchanged',()=>{
 let message='',changes=0;
 const s=setup(['saveRecipe','numberValue'],recipeState({window:{localStorage:{setItem(){throw Error('QuotaExceeded');}}},setMessage:v=>{message=v;},setRecipes:()=>changes++,resetForm:()=>changes++}),'components/dashboard/RecipesView.tsx');
 s.context.saveRecipe({preventDefault(){}});assert.equal(changes,0);assert.match(message,/űrlap adatai megmaradtak/);
});
test('recipe double submit persists one recipe',()=>{
 let writes=0,stored;
 const s=setup(['saveRecipe','numberValue'],recipeState({window:{localStorage:{setItem(k,v){writes++;stored=JSON.parse(v);}}}}),'components/dashboard/RecipesView.tsx');
 s.context.saveRecipe({preventDefault(){}});s.context.saveRecipe({preventDefault(){}});assert.equal(writes,1);assert.equal(stored.length,1);
});
test('read-only storage does not hide previously saved custom recipes',()=>{
 const custom={id:'recipe-custom',name:'Meglévő saját recept'};
 const s=setup(['ensureStarterRecipes'],{window:{localStorage:{getItem:key=>key.endsWith('starter-v10-curated-library')?'1':JSON.stringify([custom]),setItem(){throw Error('QuotaExceeded');}}},starterRecipes:[],auditRecipeAllergens:v=>v},'components/dashboard/RecipesView.tsx');
 const recipes=s.context.ensureStarterRecipes('test-recipes');assert.equal(recipes.length,1);assert.equal(recipes[0].id,'recipe-custom');
});
test('blocked recipe storage is not retried from the error handler',()=>{
 let writes=0;
 const s=setup(['ensureStarterRecipes'],{window:{localStorage:{getItem(){throw Error('SecurityError');},setItem(){writes++;throw Error('SecurityError');}}},starterRecipes:[],auditRecipeAllergens:v=>v},'components/dashboard/RecipesView.tsx');
 s.context.ensureStarterRecipes('test-recipes');assert.equal(writes,0);
});
test('meal update affecting zero rows keeps the local meal unconsumed',async()=>{
 let changes=0;
 const chain={update:()=>chain,eq:()=>chain,select:()=>chain,single:async()=>({data:null,error:{code:'PGRST116'}})};
 const s=setup(['markMealConsumed'],{meals:[{id:'meal-1',consumed:false}],supabase:{from:()=>chain},setMeals:()=>changes++});
 await s.context.markMealConsumed('meal-1');assert.equal(changes,0);assert.match(s.message(),/nem sikerült/);
});
test('failed delete does not remove the local meal',async()=>{
 let changes=0;
 const chain={delete:()=>chain,eq:()=>chain,select:()=>chain,single:async()=>({data:null,error:{code:'42501'}})};
 const s=setup(['deleteMeal'],{supabase:{from:()=>chain},setMeals:()=>changes++});await s.context.deleteMeal('meal-1');assert.equal(changes,0);assert.match(s.message(),/nem sikerült/);
});
test('different meal records can be marked consumed concurrently',async()=>{
 let calls=0,changes=0;
 const chain={update:()=>{calls++;return chain;},eq:()=>chain,select:()=>chain,single:async()=>({data:{id:'ok'},error:null})};
 const s=setup(['markMealConsumed'],{meals:[{id:'meal-1',consumed:false},{id:'meal-2',consumed:false}],supabase:{from:()=>chain},setMeals:()=>changes++});
 await Promise.all([s.context.markMealConsumed('meal-1'),s.context.markMealConsumed('meal-2')]);assert.equal(calls,2);assert.equal(changes,2);
});
