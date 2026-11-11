// Experimental observations are saved separately from clinician decisions.
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const list = document.getElementById("screeningList");
  if (!list) return;
  let available = false, busy = false, activeJob = null, activeRun = null, owner = null, provider = "local";
  const controls = new Set();
  const isClinician = user => ["admin","medical_officer","specialist"].includes(user?.role);
  const label = (en,te) => state.language === "te" ? te : en;
  const text = (node,value) => { if(node.textContent!==value)node.textContent=value; };
  const workspace = document.createElement("section");
  workspace.className = "panel ai-workspace";
  workspace.setAttribute("aria-label", "AI observations");
  const heading = document.createElement("h2"), summary = document.createElement("p"), connection = document.createElement("p"), check = document.createElement("button"), open = document.createElement("button");
  heading.textContent = "AI observations";
  summary.className = "muted";
  connection.className = "ai-connection"; connection.setAttribute("role", "status");
  check.type = open.type = "button"; check.className = "button secondary"; open.className = "button primary";
  workspace.append(heading, summary, connection, check, open);
  document.querySelector?.("#page-screening .page-story")?.after(workspace);
  check.addEventListener("click", () => health());
  open.addEventListener("click", () => list.scrollIntoView({behavior:"smooth", block:"start"}));
  function workspaceLabels() {
    text(heading,label("AI observations", "AI పరిశీలనలు"));
    text(summary,label("1. Save a screening photograph.  2. Open its record below.  3. Request observations or read the saved result. Local CPU analysis can take several minutes. Experimental text requires independent clinician review.", "1. పరీక్ష ఫోటోను సేవ్ చేయండి. 2. దిగువ రికార్డును తెరవండి. 3. పరిశీలనలను కోరండి లేదా సేవ్ చేసిన ఫలితాన్ని చదవండి. స్థానిక AIకి కొన్ని నిమిషాలు పట్టవచ్చు. వైద్యుని స్వతంత్ర సమీక్ష అవసరం."));
    text(check,label("Check AI connection", "AI కనెక్షన్ తనిఖీ"));
    text(open,label("View screening results", "పరీక్ష ఫలితాలు చూడండి"));
  }
  workspaceLabels();
  function contradictsOralObservation(value) {
    if(typeof value!=="string")return false;
    const unrelated=/(?:^|\n)\s*Unrelated\s*:\s*(?:the\s+|this\s+)?image\s+is\s+unrelated\b/i.test(value)
      || /\b(?:the|this)\s+image\s+(?:is|appears)\s+unrelated\b/i.test(value);
    if(/\b(?:no|not|without)\s+(?:(?:clearly|identifiable|visible)\s+)?(?:tongue|teeth|tooth|oral mucosa|inner cheek|gingiva|gums?|palate|mouth|lips?|lesion|ulcer)\b/i.test(value))return false;
    const oralObservation=/\b(?:tongue|oral mucosa|inner cheek|gingiva|gums?|palate|mouth|lips?|floor of mouth|lesion|ulcer)\b/i.test(value);
    return unrelated&&oralObservation;
  }
  function showOutputWarning(control,result) {
    const conflict=typeof result?.inconsistent==="boolean"?result.inconsistent:contradictsOralObservation(result?.text);
    const incomplete=result?.truncated===true||result?.runtime?.truncated===true;
    const flagged=incomplete||conflict||Boolean(result?.output_warning);
    control.warning.hidden=!flagged;
    text(control.warning,!flagged?"":incomplete?label("Incomplete saved AI output. Do not use this partial review; request a new analysis for the updated format.","???? ????? AI ????? ?????????. ?????? ?????????????; ????? ??????? ??????."):conflict?label(
      "Possible conflicting AI statements: this text calls the image unrelated while mentioning an oral finding. Treat the generated text as unreliable; review the photo and record your independent assessment.",
      "AI వచనంలో పరస్పర విరుద్ధమైన వాక్యాలు ఉండవచ్చు: నోటి గురించి పేర్కొంటూనే చిత్రాన్ని సంబంధం లేనిదిగా చెబుతోంది. ఈ ఫలితాన్ని నమ్మదగినదిగా పరిగణించవద్దు; ఫోటోను స్వయంగా పరిశీలించి మీ అభిప్రాయాన్ని నమోదు చేయండి."
    ):label(
      "An automatic consistency check flagged this generated text as potentially unreliable. Review the original photo independently before documenting any assessment.",
      "ఈ AI వచనం నమ్మదగనిదై ఉండవచ్చని స్వయంచాలక తనిఖీ సూచించింది. మీ అభిప్రాయాన్ని నమోదు చేసే ముందు అసలు ఫోటోను స్వయంగా పరిశీలించండి."
    ));
  }
  async function request(path,options) {
    const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options});
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
      if(control.currentResult)refreshResultDetails(control,control.currentResult);
      text(control.button,!available?label(provider==="gemini"?"Gemini API key required":"MedGemma setup required","MedGemma సెటప్ అవసరం"):busy||activeJob?label("MedGemma is processing one request…","MedGemma ఒక అభ్యర్థనను పరిశీలిస్తోంది…"):label(provider==="gemini"?"Gemini review: possible conditions":"Experimental MedGemma observations","ప్రయోగాత్మక MedGemma పరిశీలనలు"));
      text(control.access,allowed?label("Advisory only. Do not use AI output for clinical decision-making in this demonstration.","సూచన కోసం మాత్రమే. ఈ డెమోలో AI ఫలితంతో వైద్య నిర్ణయాలు తీసుకోకండి."):label("Experimental AI observations require a doctor, specialist or administrator account.","ప్రయోగాత్మక AI పరిశీలనలకు వైద్యుడు, నిపుణుడు లేదా అడ్మిన్ ఖాతా అవసరం."));
    }
  }
  function refreshResultDetails(control,result) {
    showOutputWarning(control,result);
    const seconds=(result.execution||result.runtime?.execution)?.total_seconds;
    const model=typeof result.model==="string"&&result.model.trim()?result.model.trim():null;
    const timing=typeof seconds==="number"&&Number.isFinite(seconds)&&seconds>=0?Math.round(seconds):null;
    const remote=["remote","gemini"].includes((result.execution||result.runtime?.execution)?.provider);
    const source=model?(remote?label(`Source: remote ${model}.`,`మూలం: రిమోట్ ${model}.`):label(`Source: local ${model}.`,`మూలం: స్థానిక ${model}.`)):label("Saved experimental AI output.","సేవ్ చేసిన ప్రయోగాత్మక AI ఫలితం.");
    const duration=timing===null?"":label(` Model processing time: ${timing}s.`,` మోడల్ సమయం: ${timing} సెకన్లు.`);
    text(control.meta,`${source}${duration} ${label("Saved result; reopening does not run the model again.","సేవ్ చేసిన ఫలితం; మళ్లీ తెరిచినప్పుడు మోడల్ తిరిగి అమలవదు.")}`);
    control.meta.hidden=false;
  }
  function showResult(control,result) {
    control.resultRevision=(control.resultRevision||0)+1;
    control.currentResult=result;
    refreshResultDetails(control,result);
    text(control.output,`${result.notice}\n\n${result.text}`);
  }
  async function savedResult(control) {
    if(!isClinician(state.user)||control.loadedFor===state.user.id)return;
    const expected=state.user.id, resultRevision=control.resultRevision||0;control.loadedFor=expected;
    try {
      const data=await request(`/api/ai/results/${encodeURIComponent(control.sid)}`);
      if(state.user?.id===expected&&isClinician(state.user)&&control.row.isConnected&&(control.resultRevision||0)===resultRevision&&data.inferences?.length)showResult(control,data.inferences[0]);
    } catch(error) { if(error.status!==403&&error.status!==401)control.loadedFor=null; }
  }
  async function pollJob(control,jobId,token) {
    const expected=token.userId,role=token.role;
    const current=()=>activeRun===token&&state.user?.id===expected&&state.user?.role===role&&control.row.isConnected;
    let submittedAt=null, failures=0;
    for(let attempts=0;attempts<185;attempts++) {
      if(!current())return;
      let data;
      try { data=await request(`/api/ai/jobs/${encodeURIComponent(jobId)}`); failures=0; }
      catch(error) {
        if(!current())return;
        if(error.status===401||error.status===403||error.status===404)throw error;
        if(++failures>=5) {
          control.resumeCheckedFor=null;
          throw new Error(label("Connection interrupted. The server job may still be running. Check AI connection to reconnect; do not submit another analysis.","కనెక్షన్ ఆగింది. సర్వర్ పని కొనసాగవచ్చు. మళ్లీ కనెక్ట్ చేయడానికి AI కనెక్షన్ తనిఖీ చేయండి."));
        }
        text(control.output,label("Reconnecting to the existing analysis… No duplicate request is being sent.","ప్రస్తుత పరిశీలనకు మళ్లీ కనెక్ట్ అవుతోంది…"));
        await new Promise(resolve=>setTimeout(resolve,2000));
        continue;
      }
      if(!current())return;
      if(submittedAt===null) {
        const recorded=Date.parse(data.job.started_at||data.job.created_at);
        submittedAt=Number.isFinite(recorded)?Math.min(recorded,Date.now()):Date.now();
      }
      if(data.job.status==="succeeded") {showResult(control,data.job.result);window.dispatchEvent(new Event("aarogya-ai-saved"));return;}
      if(["failed","interrupted"].includes(data.job.status))throw new Error(data.job.error||"Analysis did not complete. No new result was saved.");
      const elapsed=Math.max(0,Math.floor((Date.now()-submittedAt)/1000));
      text(control.output,label(
        `${provider==="gemini"?"Gemini":"MedGemma"} ${data.job.status === "queued" ? "queued" : "running"} · ${elapsed}s elapsed. You can continue other work; the result is saved automatically.`,
        `MedGemma పరిశీలన కొనసాగుతోంది · ${elapsed} సెకన్లు. ఫలితం స్వయంచాలకంగా సేవ్ అవుతుంది.`
      ));
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(current()) {
      control.resumeCheckedFor=null;
      text(control.output,label("The analysis is still pending. Reopen this screening later to load any saved result.","పరిశీలన ఇంకా పెండింగ్‌లో ఉంది. సేవ్ చేసిన ఫలితం కోసం తరువాత ఈ పరీక్షను తెరవండి."));
    }
  }
  async function resumeJob(control) {
    if(!isClinician(state.user)||control.resumePending||control.resumeCheckedFor===state.user.id)return;
    const expected=state.user.id,role=state.user.role;
    const lookup=request(`/api/ai/jobs?screening_id=${encodeURIComponent(control.sid)}`);
    control.resumePending=lookup;
    try {
      const data=await lookup;
      if(state.user?.id!==expected||state.user?.role!==role||!control.row.isConnected)return;
      control.resumeCheckedFor=expected;
      const job=data.job;
      if(!job||!["queued","running"].includes(job.status)||activeRun)return;
      const token={control,userId:expected,role};
      control.currentResult=null;control.warning.hidden=true;text(control.warning,"");control.meta.hidden=true;text(control.meta,"");
      activeRun=token;activeJob=job.id;refreshControls();
      try {await pollJob(control,job.id,token);}
      catch(error) {if(activeRun===token&&state.user?.id===expected&&control.row.isConnected)text(control.output,error.message);}
      finally {if(activeRun===token){activeRun=null;activeJob=null;refreshControls();}}
    } catch(error) {
      if(state.user?.id===expected&&control.row.isConnected&&error.status!==401&&error.status!==403)control.resumeCheckedFor=null;
    } finally {if(control.resumePending===lookup)control.resumePending=null;refreshControls();}
  }
  async function run(control) {
    if(control.resumePending)await control.resumePending.catch(()=>{});
    if(activeRun)return;
    const expected=state.user?.id, role=state.user?.role;
    if(!expected||!isClinician(state.user))return;
    control.resultRevision=(control.resultRevision||0)+1;
    control.currentResult=null;control.warning.hidden=true;text(control.warning,"");control.meta.hidden=true;text(control.meta,"");
    const token={control,userId:expected,role};activeRun=token;activeJob="checking";refreshControls();
    const current=()=>activeRun===token&&state.user?.id===expected&&state.user?.role===role&&control.row.isConnected;
    try {
      const session=await request("/api/session");
      if(!current())return;
      if(!session.authenticated){showLogin();return;}
      if(session.user.id!==expected||session.user.role!==role) {
        showApp(session.user);
        showToast(label("The browser account changed. Open Oral screening again with the intended clinician account.","బ్రౌజర్ ఖాతా మారింది. సరైన వైద్యుని ఖాతాతో నోటి పరీక్షను మళ్ళీ తెరవండి."));return;
      }
      if(provider==="gemini"&&!confirm(label("Send this screening photograph to Google Gemini for possible-condition review and next-step guidance? Use only synthetic or public reference images for the demo. Free-tier content may be used to improve Google products. No patient name or notes are sent. This is not a diagnosis.","? ?????? ??????????? ??????? ???? Google Gemini?? ??????? ?????? ??????? ???? ??????? ???????? ??????? ??????. ??? ???????? ????.")))return;
      if(provider!=="gemini"&&!confirm(label("MedGemma is unvalidated for oral screening. Its observations may be incorrect and must not guide clinical decisions during this demonstration. Continue for research review?","MedGemma నోటి పరీక్ష కోసం ధృవీకరించలేదు. ఫలితాలు తప్పు కావచ్చు; ఈ డెమోలో వైద్య నిర్ణయాలకు వాడకండి. పరిశోధన పరిశీలన కోసం కొనసాగించాలా?")))return;
      if(!current())return;
      text(control.output,label((provider==="gemini"?"Starting Gemini. ":"Starting MedGemma. ")+"Elapsed time will appear below. You can continue other work and reopen this screening for its saved result.","స్థానిక పరిశీలన ప్రారంభమవుతోంది. ఐదు నిమిషాలు పట్టవచ్చు. ఈ పేజీని తెరిచి ఉంచండి."));
      const start=await request("/api/ai/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({screening_id:control.sid,acknowledge_experimental:true,...(provider==="gemini"?{acknowledge_google_transfer:true}:{})})});
      if(!current())return;
      activeJob=start.job.id;
      await pollJob(control,activeJob,token);
    } catch(error) { if(current())text(control.output,error.message); }
    finally {if(activeRun===token){activeRun=null;activeJob=null;busy=false;refreshControls();}}
  }
  function enhance() {
    if(activeRun&&!activeRun.control.row.isConnected){activeRun=null;activeJob=null;}
    const nextOwner=state.user?`${state.user.id}:${state.user.role}`:null;
    if(owner!==nextOwner){owner=nextOwner;activeRun=null;activeJob=null;for(const c of controls){text(c.output,"");text(c.warning,"");text(c.meta,"");c.warning.hidden=true;c.meta.hidden=true;c.currentResult=null;c.loadedFor=null;c.resumePending=null;c.resumeCheckedFor=null;}}
    for(const link of list.querySelectorAll('a[href^="/api/images/"]')) {
      const row=link.closest(".record-copy");
      if(!row||row.querySelector(".medgemma-action"))continue;
      const button=document.createElement("button"),output=document.createElement("pre"),access=document.createElement("p"),warning=document.createElement("p"),meta=document.createElement("p");
      button.className="button secondary medgemma-action";button.type="button";
      output.className="ai-observations";output.style.whiteSpace="pre-wrap";output.setAttribute("role","status");access.className="muted";
      warning.className="ai-conflict-note";warning.setAttribute("role","alert");warning.hidden=true;
      meta.className="ai-source-meta";meta.hidden=true;
      const control={row,button,output,access,warning,meta,sid:decodeURIComponent(link.getAttribute("href").split("/").pop()),loadedFor:null};
      button.addEventListener("click",()=>run(control));
      controls.add(control);row.append(button,access,warning,meta,output);savedResult(control);resumeJob(control);
    }
    refreshControls();
    for(const control of controls){savedResult(control);resumeJob(control);}
  }
  async function health() {
    workspaceLabels();check.disabled=true;
    try {
      const data=await request("/api/health");available=Boolean(data.ai?.available);busy=Boolean(data.ai?.busy);provider=data.ai?.provider||"local";
      const status=document.getElementById("modelStatus");
      text(connection,available?(busy?label("Local MedGemma · processing a request", "స్థానిక MedGemma · పని కొనసాగుతోంది"):label("Local MedGemma · ready · unvalidated", "స్థానిక MedGemma · సిద్ధం · ధృవీకరించలేదు")):label("AI unavailable. Check the local runtime and model installation. Saved results remain accessible.","AI అందుబాటులో లేదు. స్థానిక మోడల్ సెటప్ తనిఖీ చేయండి. సేవ్ చేసిన ఫలితాలు చూడవచ్చు."));
      workspace.dataset && (workspace.dataset.status=available?"ready":"unavailable");
      if(status)text(status,available?(busy?label("Processing","పరిశీలిస్తోంది"):label("Installed · unvalidated","ఇన్‌స్టాల్ అయింది · ధృవీకరించలేదు")):label("Unavailable","అందుబాటులో లేదు"));
      if(available) {
        Object.assign(translations.en,{notConfigured:"Local MedGemma installed · unvalidated",modelCopy:"MedGemma produces experimental observations. Oral screening performance has not been validated. AI output is advisory only and must not be used for clinical decision-making during this demonstration.",experimentalOnly:"Unvalidated research observations"});
        Object.assign(translations.te,{notConfigured:"స్థానిక MedGemma ఉంది · ధృవీకరించలేదు",modelCopy:"MedGemma ప్రయోగాత్మక పరిశీలనలను అందిస్తుంది. నోటి పరీక్ష ఖచ్చితత్వం ధృవీకరించలేదు. ఈ డెమోలో AI ఫలితంతో వైద్య నిర్ణయాలు తీసుకోకండి.",experimentalOnly:"ధృవీకరించని పరిశోధన పరిశీలనలు"});translate();
      }
      if(data.ai?.provider==="remote") {
        text(connection,available?label("Remote MedGemma endpoint configured · connection checked when analysis starts", "రిమోట్ MedGemma సెటప్ ఉంది · పరిశీలన ప్రారంభంలో కనెక్షన్ తనిఖీ అవుతుంది"):label("Remote MedGemma setup incomplete. Ask the server operator to configure the approved endpoint.","రిమోట్ MedGemma సెటప్ పూర్తి కాలేదు."));
        Object.assign(translations.en,{notConfigured:"Remote MedGemma · unvalidated",modelCopy:"Screening photographs are sent to the operator-configured GPU endpoint when you request observations. Availability and the served model are checked during analysis. Independent clinician review is required."});
        Object.assign(translations.te,{notConfigured:"రిమోట్ MedGemma · ధృవీకరించలేదు",modelCopy:"పరిశీలన కోరినప్పుడు ఫోటో ఆపరేటర్ అమర్చిన GPU సర్వర్‌కు పంపబడుతుంది. స్వతంత్ర వైద్య సమీక్ష అవసరం."});
        translate();
      }
      if(provider==="gemini") {
        text(connection,available?label("Gemini configured ? internet required ? API access checked on request","Gemini ????? ???? ? ????????? ?????"):label("Gemini API key required. Start the app with START GEMINI DEMO.cmd.","Gemini API ?? ?????. START GEMINI DEMO.cmd ?????????????."));
        if(status)text(status,available?label("Gemini configured","Gemini ????? ????"):label("Gemini key required","Gemini ?? ?????"));
        text(summary,label("Save a screening, then request possible conditions, review priority and next steps from its record below. A photo cannot establish disease severity. The selected photo is sent to Google after confirmation. Use synthetic or public reference images only in this demo. Saved results reopen without another API request.","???????? ???? ???? ????? ?????????? Gemini ????????? ??????. ???????? ?????? ???? Google?? ???????????. ?????? ??????? ???? ??????? ???????? ??????? ??????."));
        Object.assign(translations.en,{notConfigured:"Google Gemini ? experimental",modelCopy:"Selected photos are sent to Google's API after confirmation. No patient name or notes are included. Use synthetic/public images for this demo. Outputs require independent clinician review."});
        Object.assign(translations.te,{notConfigured:"Google Gemini ? ????????????",modelCopy:"???????? ?????? ???? Google API?? ???????????. ???????? ????? ?????? ?????."});
        translate();
      }
    } catch {
      available=false;busy=false;
      text(connection,label("Cannot reach the local AI server. Reconnect, then check again. Existing server jobs and saved results are retained.","స్థానిక AI సర్వర్ కనెక్ట్ కాలేదు. కనెక్షన్ వచ్చిన తర్వాత మళ్లీ తనిఖీ చేయండి."));
      const status=document.getElementById("modelStatus");if(status)text(status,label("Connection lost","కనెక్షన్ లేదు"));
    } finally {check.disabled=false;}
    enhance();
  }
  new MutationObserver(enhance).observe(list,{childList:true,subtree:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)health();});
  document.getElementById("languageButton")?.addEventListener("click",()=>{refreshControls();health();});
  const appView=document.getElementById("appView");
  if(appView)new MutationObserver(enhance).observe(appView,{attributes:true,attributeFilter:["hidden"]});
  health();
  setInterval(()=>{if(!document.hidden&&state.user&&state.page==="screening")health();},10000);
});
