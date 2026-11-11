const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","health-assistant.js"),"utf8");
class Element{
  constructor(){this.textContent="";this.value="";this.checked=false;this.files=[];this.listeners={};this.dataset={};this.hidden=false;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(name,value){this[name]=value;}
  querySelectorAll(){return [];}
  reset(){this.onreset?.();}
}
function harness(responder=async()=>({ok:true,json:async()=>({result:{text:"Synthetic response <script>untrusted</script>",notice:"Experimental",model:"gemini-test",execution:{total_seconds:1}}})})){
  const ids=[...source.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const elements=Object.fromEntries([...ids,"page-assistant","languageButton","logoutButton","appView"].map(id=>[id,new Element()]));
  const state={user:{id:"synthetic-worker"},language:"en",offlineMode:false},requests=[],events={};
  elements.haForm.onreset=()=>{for(const e of Object.values(elements)){e.value="";e.checked=false;e.files=[];}};
  vm.runInNewContext(source,{state,translations:{en:{},te:{}},translate(){},goPage(page){state.page=page;},
    document:{getElementById:id=>elements[id],addEventListener:(name,fn)=>events[name]=fn},
    MutationObserver:class{constructor(fn){this.fn=fn;}observe(){}},
    FileReader:class{readAsDataURL(file){this.result="data:"+file.type+";base64,c3ludGhldGlj";this.onload();}},
    fetch:async(url,opts)=>{requests.push({url,opts});return responder();}});
  events.DOMContentLoaded();
  return {elements,state,requests,submit:()=>elements.haForm.listeners.submit({preventDefault(){}})};
}
test("question requires explicit transfer consent and safely displays untrusted text",async()=>{
  const h=harness();h.elements.haText.value="What is blood pressure?";
  await h.submit();assert.equal(h.requests.length,0);assert.match(h.elements.haError.textContent,/Confirm/);
  h.elements.haConsent.checked=true;await h.submit();
  const payload=JSON.parse(h.requests[0].opts.body);
  assert.equal(payload.mode,"question");assert.equal(payload.acknowledge_google_transfer,true);
  assert.equal(h.elements.haResult.textContent,"Synthetic response <script>untrusted</script>");
  assert.equal(h.elements.haResultPanel.hidden,false);
});
test("report mode accepts text and a bounded attachment",async()=>{
  const h=harness();h.elements.haReport.listeners.click();h.elements.haReportText.value="Synthetic glucose result";
  h.elements.haFile.files=[{type:"application/pdf",name:"private-name.pdf",size:100}];h.elements.haConsent.checked=true;
  await h.submit();const payload=JSON.parse(h.requests[0].opts.body);
  assert.equal(payload.mode,"report");assert.equal(payload.attachment.mime_type,"application/pdf");
  assert.equal(payload.report_text,"Synthetic glucose result");assert.ok(!h.requests[0].opts.body.includes("private-name"));
});
test("oversized report remains local and exposes a useful error",async()=>{
  const h=harness();h.elements.haReport.listeners.click();h.elements.haConsent.checked=true;
  h.elements.haFile.files=[{type:"application/pdf",size:5*1024*1024}];await h.submit();
  assert.equal(h.requests.length,0);assert.match(h.elements.haError.textContent,/4 MB/);
});
test("late result cannot appear after sign-out or clear",async()=>{
  let resolve;const wait=new Promise(r=>resolve=r),h=harness(()=>wait);
  h.elements.haText.value="Synthetic health question";h.elements.haConsent.checked=true;
  const pending=h.submit();await Promise.resolve();
  h.elements.logoutButton.listeners.click();h.state.user=null;
  resolve({ok:true,json:async()=>({result:{text:"Private stale response",notice:"Experimental",execution:{total_seconds:1}}})});
  await pending;assert.equal(h.elements.haResult.textContent,"");assert.equal(h.elements.haResultPanel.hidden,true);
});
test("oral-photo shortcut keeps the existing saved-screening workflow",()=>{
  const h=harness();h.elements.haOral.listeners.click();assert.equal(h.state.page,"screening");
});
