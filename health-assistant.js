document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const page=document.getElementById("page-assistant");
  if(!page)return;
  Object.assign(translations.en,{healthAssistant:"Health AI",contextAssistant:"Ask a health question or understand a medical report."});
  Object.assign(translations.te,{healthAssistant:"ఆరోగ్య AI",contextAssistant:"ఆరోగ్య ప్రశ్నలు అడగండి లేదా వైద్య నివేదికను అర్థం చేసుకోండి."});
  page.innerHTML=`<div class="page-heading"><div><p class="eyebrow" data-ha="eyebrow"></p><h1 data-ha="title"></h1><p class="muted" data-ha="intro"></p></div></div>
  <div class="ha-modes" role="group" aria-label="AI task"><button class="button secondary" type="button" id="haOral" data-ha="oral"></button><button class="button primary" type="button" id="haQuestion" data-ha="questions" aria-pressed="true"></button><button class="button secondary" type="button" id="haReport" data-ha="reports" aria-pressed="false"></button></div>
  <div class="workflow-grid"><section class="panel form-panel"><h2 id="haFormTitle"></h2><form id="haForm">
  <label for="haText" data-ha="questionLabel"></label><textarea id="haText" rows="5" maxlength="6000"></textarea>
  <div id="haReportFields" hidden><label for="haReportText" data-ha="reportLabel"></label><textarea id="haReportText" rows="7" maxlength="25000"></textarea><label for="haFile" data-ha="fileLabel"></label><input id="haFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><p class="muted" data-ha="fileHelp"></p></div>
  <label class="ha-consent"><input id="haConsent" type="checkbox" required><span data-ha="consent"></span></label>
  <div class="button-row"><button class="button primary" id="haSubmit" type="submit" data-ha="submit"></button><button class="button secondary" id="haClear" type="button" data-ha="clear"></button></div>
  <p id="haError" role="alert" class="ha-error"></p><p id="haStatus" role="status"></p></form></section>
  <aside class="panel guide-panel"><p class="eyebrow" data-ha="guideTitle"></p><h2 data-ha="guideHeading"></h2><p data-ha="guide"></p><p class="safety-note" data-ha="safety"></p><p class="muted" data-ha="storage"></p></aside></div>
  <section class="panel recent-panel" id="haResultPanel" hidden><div class="panel-heading"><h2 data-ha="resultTitle"></h2></div><p id="haMeta" class="muted"></p><p id="haNotice" class="safety-note"></p><pre id="haResult" class="ha-result"></pre></section>`;
  const words={
    en:{eyebrow:"GEMINI HEALTH ASSISTANT",title:"A clearer next step",intro:"Choose oral-photo review, health questions or medical-report explanation.",oral:"Oral photos",questions:"Health questions",reports:"Medical reports",questionLabel:"Question or symptoms (optional for a report)",reportLabel:"Paste report text",fileLabel:"Or upload a report",fileHelp:"PDF, JPG, PNG or WebP · up to 4 MB. Use a readable report; raw scans are not supported. You can add a question above.",consent:"I agree to send this entered text and selected file to Google Gemini. I am using synthetic/public demo information. Free-tier content may be used to improve Google products.",submit:"Ask Gemini",clear:"Clear input and result",guideTitle:"HOW TO USE",guideHeading:"Useful guidance, with limits",guide:"For symptoms, include age range, duration, changes and relevant history without names or identifying details. For reports, include the units and reference ranges. Each request is independent; include needed context again.",safety:"Experimental information, not a diagnosis. Results need clinician review. For severe symptoms or an emergency, seek immediate local care rather than waiting for AI.",storage:"Questions, uploaded reports and answers are not saved to the patient record or browser storage. They are sent to Google after your confirmation and remain visible until cleared or signed out.",resultTitle:"Gemini response"},
    te:{eyebrow:"GEMINI ఆరోగ్య సహాయకుడు",title:"తదుపరి అడుగును తెలుసుకోండి",intro:"నోటి ఫోటోలు, ఆరోగ్య ప్రశ్నలు లేదా వైద్య నివేదిక వివరణను ఎంచుకోండి.",oral:"నోటి ఫోటోలు",questions:"ఆరోగ్య ప్రశ్నలు",reports:"వైద్య నివేదికలు",questionLabel:"ప్రశ్న లేదా లక్షణాలు (నివేదికకు ఐచ్ఛికం)",reportLabel:"నివేదిక వచనాన్ని అతికించండి",fileLabel:"లేదా నివేదికను అప్‌లోడ్ చేయండి",fileHelp:"PDF, JPG, PNG లేదా WebP · గరిష్ఠంగా 4 MB. చదవగల నివేదిక ఇవ్వండి; ముడి స్కాన్ చిత్రాలకు మద్దతు లేదు.",consent:"ఈ వచనం మరియు ఫైలును Google Geminiకి పంపడానికి అంగీకరిస్తున్నాను. కృత్రిమ లేదా పబ్లిక్ డెమో సమాచారం మాత్రమే వాడుతున్నాను. ఉచిత సేవలో సమాచారం Google ఉత్పత్తుల మెరుగుదలకు వాడవచ్చు.",submit:"Geminiని అడగండి",clear:"వివరాలు, ఫలితం తొలగించండి",guideTitle:"ఎలా ఉపయోగించాలి",guideHeading:"పరిమితులతో ఉపయోగకరమైన సూచనలు",guide:"లక్షణాల వ్యవధి, వయస్సు పరిధి, మార్పులు, సంబంధిత చరిత్రను పేర్లు లేకుండా ఇవ్వండి. నివేదికలో యూనిట్లు, పరిమితులు చేర్చండి. ప్రతి ప్రశ్న స్వతంత్రమైనది.",safety:"ప్రయోగాత్మక సమాచారం మాత్రమే; నిర్ధారణ కాదు. వైద్య సమీక్ష అవసరం. అత్యవసర లక్షణాలకు AI కోసం వేచి ఉండకుండా తక్షణ వైద్యం పొందండి.",storage:"ప్రశ్నలు, నివేదికలు, సమాధానాలు రోగి రికార్డు లేదా బ్రౌజర్ నిల్వలో సేవ్ కావు. నిర్ధారణ తర్వాత Googleకి పంపబడతాయి. క్లియర్ లేదా సైన్ అవుట్ చేసే వరకు కనిపిస్తాయి.",resultTitle:"Gemini సమాధానం"}
  };
  const $=id=>document.getElementById(id), say=(en,te)=>state.language==="te"?te:en;
  let mode="question",pending=false,revision=0,owner=state.user?.id||null;
  function labels(){
    const dict=words[state.language]||words.en;
    page.querySelectorAll("[data-ha]").forEach(el=>{el.textContent=dict[el.dataset.ha];});
    $("haFormTitle").textContent=mode==="report"?dict.reports:dict.questions;
    $("haReportFields").hidden=mode!=="report";
    $("haText").required=mode==="question";
    for(const [id,value] of [["haQuestion","question"],["haReport","report"]]){
      $(id).setAttribute("aria-pressed",String(mode===value));$(id).className="button "+(mode===value?"primary":"secondary");
    }
    $("haSubmit").disabled=pending||!state.user||state.offlineMode;
    $("haQuestion").disabled=$("haReport").disabled=pending;
  }
  function clear(){revision++;pending=false;$("haForm").reset();$("haResult").textContent=$("haNotice").textContent=$("haMeta").textContent=$("haError").textContent=$("haStatus").textContent="";$("haResultPanel").hidden=true;labels();}
  function session(){const next=state.user?.id||null;if(next!==owner){owner=next;clear();}labels();}
  $("haOral").addEventListener("click",()=>goPage("screening"));
  $("haQuestion").addEventListener("click",()=>{mode="question";clear();});
  $("haReport").addEventListener("click",()=>{mode="report";clear();});
  $("haClear").addEventListener("click",clear);
  $("languageButton")?.addEventListener("click",labels);
  $("logoutButton")?.addEventListener("click",clear);
  const appView=$("appView");if(appView)new MutationObserver(session).observe(appView,{attributes:true,attributeFilter:["hidden"]});
  async function attachment(file){
    if(file.size>4*1024*1024||file.size===0)throw new Error(say("Choose a nonempty file up to 4 MB.","ఖాళీ కాని ఫైలు, గరిష్ఠంగా 4 MB ఎంచుకోండి."));
    const mime=file.type||({pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"}[file.name.split(".").pop().toLowerCase()]);
    if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(mime))throw new Error(say("Choose a PDF, JPG, PNG or WebP report.","PDF, JPG, PNG లేదా WebP నివేదిక ఎంచుకోండి."));
    const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(new Error(say("The file could not be read. Choose it again.","ఫైలు చదవలేకపోయాం. మళ్లీ ఎంచుకోండి.")));reader.readAsDataURL(file);});
    return {mime_type:mime,data:encoded};
  }
  $("haForm").addEventListener("submit",async event=>{
    event.preventDefault();session();if(pending||!state.user||state.offlineMode)return;
    const token=++revision, userId=state.user.id,current=()=>token===revision&&state.user?.id===userId;
    $("haError").textContent="";$("haResultPanel").hidden=true;
    if(!$("haConsent").checked){$("haError").textContent=say("Confirm the Google data-transfer notice first.","ముందుగా Googleకి పంపడానికి అంగీకరించండి.");return;}
    pending=true;labels();$("haForm").setAttribute("aria-busy","true");
    $("haStatus").textContent=say("Gemini is processing. Keep this page open; do not send the request again.","Gemini పరిశీలిస్తోంది. ఈ పేజీ తెరిచి ఉంచండి; మళ్లీ పంపవద్దు.");
    try{
      const payload={mode,question:$("haText").value.trim(),language:state.language,acknowledge_google_transfer:true};
      if(mode==="report"){
        payload.report_text=$("haReportText").value.trim();
        const file=$("haFile").files[0];if(file)payload.attachment=await attachment(file);
        if(!payload.report_text&&!payload.attachment)throw new Error(say("Paste report text or choose a report file.","నివేదిక వచనం లేదా ఫైలును ఇవ్వండి."));
      }
      if(!current())return;
      const response=await fetch("/api/ai/assistant",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json();if(!current())return;
      if(!response.ok)throw new Error(data.error||say("Request failed. Check your connection and try again.","అభ్యర్థన విఫలమైంది. కనెక్షన్ తనిఖీ చేయండి."));
      $("haResult").textContent=data.result.text;$("haNotice").textContent=data.result.notice;
      $("haMeta").textContent=`${data.result.model} · ${Math.round(data.result.execution.total_seconds)}s · `+say("Not saved to a patient record","రోగి రికార్డులో సేవ్ కాలేదు");
      $("haResultPanel").hidden=false;$("haStatus").textContent=say("Response ready. Review the source report and consult a clinician.","సమాధానం సిద్ధం. అసలు నివేదికను తనిఖీ చేసి వైద్యుని సంప్రదించండి.");
    }catch(error){if(current()){$("haError").textContent=error.message;$("haStatus").textContent="";}}
    finally{if(current()){pending=false;$("haForm").setAttribute("aria-busy","false");labels();}}
  });
  session();translate();
});
