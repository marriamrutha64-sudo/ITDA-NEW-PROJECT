/* Health-worker capture uses only the unlocked encrypted vault until explicit sync. */
document.addEventListener("DOMContentLoaded",()=>{
  "use strict";
  if(!window.OfflineScreening)return;
  const page=document.getElementById("page-patients"),panel=document.createElement("section");
  panel.className="panel offline-capture-panel";panel.hidden=true;panel.id="offlineCapturePanel";
  panel.innerHTML=`<h2 id="offlineCaptureTitle"></h2><p id="offlineCaptureHelp" class="muted"></p><form id="offlineCaptureForm"><div class="form-grid"><div class="form-span"><label for="offlineCapturePatient" id="offlineCapturePatientLabel"></label><select id="offlineCapturePatient" required></select></div><div><label for="offlineCaptureWorker" id="offlineCaptureWorkerLabel"></label><input id="offlineCaptureWorker" required maxlength="120"></div><div><label for="offlineCaptureArea" id="offlineCaptureAreaLabel"></label><input id="offlineCaptureArea" maxlength="80"></div><div><label for="offlineCaptureDuration" id="offlineCaptureDurationLabel"></label><input id="offlineCaptureDuration" maxlength="120"></div><div><label for="offlineCapturePhoto" id="offlineCapturePhotoLabel"></label><input id="offlineCapturePhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required></div><div class="form-span"><label for="offlineCaptureNotes" id="offlineCaptureNotesLabel"></label><textarea id="offlineCaptureNotes" maxlength="2000" rows="2"></textarea></div></div><label class="consent-check"><input type="checkbox" id="offlineCaptureConsent" required><span id="offlineCaptureConsentLabel"></span></label><p id="offlineCaptureStatus" role="status" aria-live="polite"></p><button id="offlineCaptureSave" class="button secondary" type="submit"></button></form><div class="section-heading"><h3 id="offlineCaptureQueueTitle"></h3><button id="offlineCaptureSync" type="button" class="button primary"></button></div><div id="offlineCaptureQueue"></div>`;
  page.appendChild(panel);
  const $=id=>document.getElementById(id),lang=(en,te)=>state.language==="te"?te:en;
  const context=()=>({ownerUsername:state.vaultOwner,isCurrentUser:owner=>state.user?.role==="health_worker"&&vaultUnlockedForCurrentUser()&&state.user?.username.toLowerCase()===owner});
  let revision=0,working=false,owner=null;
  const unlocked=()=>state.user?.role==="health_worker"&&vaultUnlockedForCurrentUser();
  function labels(){
    const values={offlineCaptureTitle:["Encrypted offline oral-photo capture","ఎన్‌క్రిప్ట్ చేసిన ఆఫ్‌లైన్ నోటి ఫోటో"],offlineCaptureHelp:["Load your patients online once, or register an offline patient draft first. Photos and notes stay encrypted on this device until you sign in online and sync. Use a clear, well-lit photograph; a clinician must assess it. Browser storage can be cleared, so sync promptly.","రోగుల జాబితాను ఆన్‌లైన్‌లో ఒకసారి తెరవండి లేదా ముందుగా ఆఫ్‌లైన్ రోగి డ్రాఫ్ట్ నమోదు చేయండి. ఆన్‌లైన్‌లో సైన్ ఇన్ చేసి సింక్ చేసే వరకు ఫోటోలు, గమనికలు ఈ పరికరంలో ఎన్‌క్రిప్ట్ అవుతాయి. స్పష్టమైన వెలుతురు ఉన్న ఫోటో తీయండి; వైద్యుని పరిశీలన అవసరం. త్వరగా సింక్ చేయండి."],offlineCapturePatientLabel:["Consented patient or pending registration","సమ్మతించిన రోగి లేదా పెండింగ్ నమోదు"],offlineCaptureWorkerLabel:["Health worker","ఆరోగ్య కార్యకర్త"],offlineCaptureAreaLabel:["Area observed","గమనించిన ప్రాంతం"],offlineCaptureDurationLabel:["Symptom duration","లక్షణాల వ్యవధి"],offlineCapturePhotoLabel:["Photograph (JPEG, PNG, WebP · under 7 MB)","ఫోటో (JPEG, PNG, WebP · 7 MB లోపు)"],offlineCaptureNotesLabel:["Screening notes","పరీక్ష గమనికలు"],offlineCaptureConsentLabel:["Patient consent covers this photograph and its later synchronization.","ఈ ఫోటో మరియు తరువాత సింక్ చేయడానికి రోగి సమ్మతి ఉంది."],offlineCaptureSave:["Save encrypted photo draft","ఎన్‌క్రిప్ట్ చేసిన ఫోటో డ్రాఫ్ట్ సేవ్ చేయండి"],offlineCaptureQueueTitle:["Pending encrypted photographs","పెండింగ్ ఎన్‌క్రిప్ట్ ఫోటోలు"],offlineCaptureSync:["Sync registrations, then photographs","ముందు నమోదులు, తరువాత ఫోటోలు సింక్ చేయండి"]};
    for(const [id,value]of Object.entries(values))$(id).textContent=lang(...value);
  }
  async function refresh(){
    const current=++revision;labels();panel.hidden=!unlocked();if(panel.hidden){$("offlineCaptureQueue").replaceChildren();return;}
    if(owner!==state.vaultOwner){owner=state.vaultOwner;$("offlineCaptureForm").reset();$("offlineCaptureStatus").textContent="";}
    const opts=context();
    try{
      const [choices,queued]=await Promise.all([window.OfflineScreening.listPatientChoices(opts),window.OfflineScreening.listQueued(opts)]);
      if(current!==revision||!unlocked()||owner!==state.vaultOwner)return;
      const previous=$("offlineCapturePatient").value;
      $("offlineCapturePatient").replaceChildren();
      for(const choice of [{value:"",label:lang("Select patient","రోగిని ఎంచుకోండి")},...choices]){const option=document.createElement("option");option.value=choice.value;option.textContent=choice.label;$("offlineCapturePatient").appendChild(option);}
      if(choices.some(c=>c.value===previous))$("offlineCapturePatient").value=previous;
      if(!$("offlineCaptureWorker").value)$("offlineCaptureWorker").value=state.user.display_name||state.user.username;
      $("offlineCaptureQueue").replaceChildren();
      if(!queued.length)$("offlineCaptureQueue").textContent=lang("No photo drafts pending.","పెండింగ్ ఫోటో డ్రాఫ్ట్‌లు లేవు.");
      for(const entry of queued){
        const row=document.createElement("article"),copy=document.createElement("p"),discard=document.createElement("button");row.className="record-row";
        copy.textContent=`${entry.operation.location||lang("Oral photograph","నోటి ఫోటో")} · ${dateTimeLabel(entry.operation.captured_at)} · ${Math.ceil(entry.operation.image.bytes/1024)} KB`;
        discard.type="button";discard.className="text-button danger-text";discard.textContent=lang("Discard draft","డ్రాఫ్ట్ తొలగించండి");discard.disabled=working;
        discard.addEventListener("click",async()=>{if(!working&&confirm(lang("Discard this unsynchronized photo? This cannot be undone.","సింక్ చేయని ఫోటోను తొలగించాలా? తిరిగి పొందలేరు."))){try{if(!opts.isCurrentUser(opts.ownerUsername))return;await window.OfflineVault.discardOperation(entry.id);await refresh();}catch(e){$("offlineCaptureStatus").textContent=e.message;}}});
        row.append(copy,discard);$("offlineCaptureQueue").appendChild(row);
      }
      $("offlineCaptureSave").disabled=working||!choices.length;
      $("offlineCaptureSync").disabled=working||state.offlineMode||navigator.onLine===false;
    }catch(error){if(current===revision)$("offlineCaptureStatus").textContent=error.message;}
  }
  $("offlineCaptureForm").addEventListener("submit",async event=>{
    event.preventDefault();if(working||!unlocked())return;
    working=true;$("offlineCaptureSave").disabled=true;const expected=state.vaultOwner;
    try{
      const [kind,value]=$("offlineCapturePatient").value.split(":");
      await window.OfflineScreening.queueCapture({file:$("offlineCapturePhoto").files[0],patientId:kind==="patient"?value:"",patientOperationId:kind==="draft"?value:"",worker:$("offlineCaptureWorker").value,location:$("offlineCaptureArea").value,duration:$("offlineCaptureDuration").value,notes:$("offlineCaptureNotes").value},context());
      if(expected!==state.vaultOwner)return;
      $("offlineCaptureForm").reset();$("offlineCaptureStatus").textContent=lang("Photo draft encrypted on this device. It has not been sent to the server.","ఫోటో డ్రాఫ్ట్ ఈ పరికరంలో ఎన్‌క్రిప్ట్ అయింది. సర్వర్‌కు పంపలేదు.");
    }catch(error){if(expected===state.vaultOwner)$("offlineCaptureStatus").textContent=error.message;}
    finally{working=false;await refresh();}
  });
  $("offlineCaptureSync").addEventListener("click",async()=>{
    if(working||!unlocked()||state.offlineMode)return;
    const opts=context();working=true;$("offlineCaptureSync").disabled=true;
    try{
      await syncOfflineDrafts();if(!opts.isCurrentUser(opts.ownerUsername))return;
      const result=await window.OfflineScreening.syncQueued({...opts,api});
      if(!opts.isCurrentUser(opts.ownerUsername))return;
      $("offlineCaptureStatus").textContent=lang(`${result.synced} photographs synced; ${result.pending} pending.`,`${result.synced} ఫోటోలు సింక్ అయ్యాయి; ${result.pending} పెండింగ్.`)+(result.errors.length?" "+result.errors.map(e=>e.message).join(" "):"");
      if(result.synced){await loadPatients();await loadDashboard();}
    }catch(error){if(opts.isCurrentUser(opts.ownerUsername))$("offlineCaptureStatus").textContent=error.message;}
    finally{working=false;await refresh();}
  });
  const observe=(node,options)=>node&&new MutationObserver(()=>{refresh();}).observe(node,options);
  observe($("offlineDraftList"),{childList:true});observe($("appView"),{attributes:true,attributeFilter:["hidden"]});observe(page,{attributes:true,attributeFilter:["class"]});
  $("languageButton").addEventListener("click",refresh);window.addEventListener("online",refresh);window.addEventListener("offline",refresh);
  window.addEventListener("aarogya-patients-loaded",refresh);
  refresh();
});
