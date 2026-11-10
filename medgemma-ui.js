// Experimental observations are saved separately from clinician decisions.
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const list = document.getElementById("screeningList");
  if (!list) return;
  let available = false, busy = false, activeJob = null, activeRun = null, owner = null;
  const controls = new Set();
  const isClinician = user => ["admin","medical_officer","specialist"].includes(user?.role);
  const label = (en,te) => state.language === "te" ? te : en;
  const text = (node,value) => { if(node.textContent!==value)node.textContent=value; };
  async function request(path,options) {
    const response=await fetch(path,{credentials:"same-origin",...options});
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error||"Request failed.");error.status=response.status;throw error;}
    return data;
  }
  function refreshControls() {
    const allowed=isClinician(state.user);
    for(const control of controls) {
      if(!control.row.isConnected){controls.delete(control);continue;}
      control.button.hidden=!allowed;
      control.button.disabled=!available||busy||Boolean(activeJob);
      text(control.button,!available?label("MedGemma setup required","MedGemma సెటప్ అవసరం"):busy||activeJob?label("MedGemma is processing one request…","MedGemma ఒక అభ్యర్థనను పరిశీలిస్తోంది…"):label("Experimental MedGemma observations","ప్రయోగాత్మక MedGemma పరిశీలనలు"));
      text(control.access,allowed?label("Advisory only. Do not use AI output for clinical decision-making in this demonstration.","సూచన కోసం మాత్రమే. ఈ డెమోలో AI ఫలితంతో వైద్య నిర్ణయాలు తీసుకోకండి."):label("Experimental AI observations require a doctor, specialist or administrator account.","ప్రయోగాత్మక AI పరిశీలనలకు వైద్యుడు, నిపుణుడు లేదా అడ్మిన్ ఖాతా అవసరం."));
    }
  }
  function showResult(control,result) { control.resultRevision=(control.resultRevision||0)+1; text(control.output,`${result.notice}\n\n${result.text}`); }
  async function savedResult(control) {
    if(!isClinician(state.user)||control.loadedFor===state.user.id)return;
    const expected=state.user.id, resultRevision=control.resultRevision||0;control.loadedFor=expected;
    try {
      const data=await request(`/api/ai/results/${encodeURIComponent(control.sid)}`);
      if(state.user?.id===expected&&isClinician(state.user)&&control.row.isConnected&&(control.resultRevision||0)===resultRevision&&data.inferences?.length)showResult(control,data.inferences[0]);
    } catch(error) { if(error.status!==403&&error.status!==401)control.loadedFor=null; }
  }
  async function run(control) {
    if(activeRun)return;
    const expected=state.user?.id, role=state.user?.role;
    if(!expected||!isClinician(state.user))return;
    control.resultRevision=(control.resultRevision||0)+1;
    const token={};activeRun=token;activeJob="checking";refreshControls();
    const current=()=>activeRun===token&&state.user?.id===expected&&state.user?.role===role&&control.row.isConnected;
    try {
      const session=await request("/api/session");
      if(!current())return;
      if(!session.authenticated){showLogin();return;}
      if(session.user.id!==expected||session.user.role!==role) {
        showApp(session.user);
        showToast(label("The browser account changed. Open Oral screening again with the intended clinician account.","బ్రౌజర్ ఖాతా మారింది. సరైన వైద్యుని ఖాతాతో నోటి పరీక్షను మళ్ళీ తెరవండి."));return;
      }
      if(!confirm(label("MedGemma is unvalidated for oral screening. Its observations may be incorrect and must not guide clinical decisions during this demonstration. Continue for research review?","MedGemma నోటి పరీక్ష కోసం ధృవీకరించలేదు. ఫలితాలు తప్పు కావచ్చు; ఈ డెమోలో వైద్య నిర్ణయాలకు వాడకండి. పరిశోధన పరిశీలన కోసం కొనసాగించాలా?")))return;
      if(!current())return;
      text(control.output,label("Starting local analysis. CPU processing can take up to five minutes. You can keep this page open.","స్థానిక పరిశీలన ప్రారంభమవుతోంది. ఐదు నిమిషాలు పట్టవచ్చు. ఈ పేజీని తెరిచి ఉంచండి."));
      const start=await request("/api/ai/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({screening_id:control.sid,acknowledge_experimental:true})});
      if(!current())return;
      activeJob=start.job.id;
      for(let attempts=0;attempts<185;attempts++) {
        if(!current())return;
        const data=await request(`/api/ai/jobs/${encodeURIComponent(activeJob)}`);
        if(!current())return;
        if(data.job.status==="succeeded"){showResult(control,data.job.result);window.dispatchEvent(new Event("aarogya-ai-saved"));return;}
        if(["failed","interrupted"].includes(data.job.status))throw new Error(data.job.error||"Analysis did not complete. No new result was saved.");
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(current())text(control.output,label("The analysis is still pending. Reopen this screening later to load any saved result.","పరిశీలన ఇంకా పెండింగ్‌లో ఉంది. సేవ్ చేసిన ఫలితం కోసం తరువాత ఈ పరీక్షను తెరవండి."));
    } catch(error) { if(current())text(control.output,error.message); }
    finally {if(activeRun===token){activeRun=null;activeJob=null;busy=false;refreshControls();}}
  }
  function enhance() {
    const nextOwner=state.user?`${state.user.id}:${state.user.role}`:null;
    if(owner!==nextOwner){owner=nextOwner;activeRun=null;activeJob=null;for(const c of controls){text(c.output,"");c.loadedFor=null;}}
    for(const link of list.querySelectorAll('a[href^="/api/images/"]')) {
      const row=link.closest(".record-copy");
      if(!row||row.querySelector(".medgemma-action"))continue;
      const button=document.createElement("button"),output=document.createElement("pre"),access=document.createElement("p");
      button.className="button secondary medgemma-action";button.type="button";
      output.className="ai-observations";output.style.whiteSpace="pre-wrap";output.setAttribute("role","status");access.className="muted";
      const control={row,button,output,access,sid:decodeURIComponent(link.getAttribute("href").split("/").pop()),loadedFor:null};
      button.addEventListener("click",()=>run(control));
      controls.add(control);row.append(button,access,output);savedResult(control);
    }
    refreshControls();
    for(const control of controls)savedResult(control);
  }
  async function health() {
    try {
      const data=await request("/api/health");available=Boolean(data.ai?.available);busy=Boolean(data.ai?.busy);
      const status=document.getElementById("modelStatus");
      if(status)text(status,available?(busy?label("Processing","పరిశీలిస్తోంది"):label("Installed · unvalidated","ఇన్‌స్టాల్ అయింది · ధృవీకరించలేదు")):label("Unavailable","అందుబాటులో లేదు"));
      if(available) {
        Object.assign(translations.en,{notConfigured:"Local MedGemma installed · unvalidated",modelCopy:"MedGemma produces experimental observations. Oral screening performance has not been validated. AI output is advisory only and must not be used for clinical decision-making during this demonstration.",experimentalOnly:"Unvalidated research observations"});
        Object.assign(translations.te,{notConfigured:"స్థానిక MedGemma ఉంది · ధృవీకరించలేదు",modelCopy:"MedGemma ప్రయోగాత్మక పరిశీలనలను అందిస్తుంది. నోటి పరీక్ష ఖచ్చితత్వం ధృవీకరించలేదు. ఈ డెమోలో AI ఫలితంతో వైద్య నిర్ణయాలు తీసుకోకండి.",experimentalOnly:"ధృవీకరించని పరిశోధన పరిశీలనలు"});translate();
      }
    } catch {}
    enhance();
  }
  new MutationObserver(enhance).observe(list,{childList:true,subtree:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)health();});
  document.getElementById("languageButton")?.addEventListener("click",refreshControls);
  const appView=document.getElementById("appView");
  if(appView)new MutationObserver(enhance).observe(appView,{attributes:true,attributeFilter:["hidden"]});
  health();
  setInterval(()=>{if(!document.hidden&&state.user&&state.page==="screening")health();},10000);
});
