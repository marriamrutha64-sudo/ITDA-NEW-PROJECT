/* Public synthetic call landing page; no patient identifiers or authentication tokens. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.hash.slice(1));
  const room = params.get("room") || "";
  let api = null, diagnostics = null, generation = 0, scriptPromise = null;
  const valid = /^[a-f0-9]{48}$/.test(room);
  const direct = `https://meet.jit.si/${room}#config.startSilent=false&config.startWithAudioMuted=true&config.p2p.enabled=false`;
  $("patientJoin").disabled = !valid;
  $("patientCallStatus").textContent = valid ? "Ready. The clinician must already be in the room." : "This invitation is incomplete. Ask the clinician to copy a new patient link.";
  if (valid) { $("patientExternal").href = direct; $("patientExternal").hidden = false; }
  function loadScript() {
    if (window.JitsiMeetExternalAPI) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => { script.remove(); scriptPromise=null; reject(new Error("Jitsi took too long to load. Try the direct link.")); }, 20000);
      script.src = "https://meet.jit.si/external_api.js";
      script.onload = () => { clearTimeout(timer); if(window.JitsiMeetExternalAPI)resolve();else{scriptPromise=null;reject(new Error("Video service unavailable. Use the direct link."));} };
      script.onerror = () => { clearTimeout(timer); script.remove();scriptPromise=null;reject(new Error("Could not load Jitsi. Check your connection or use the direct link.")); };
      document.head.appendChild(script);
    });
    return scriptPromise;
  }
  function leave() {
    generation++;
    diagnostics?.detach(); diagnostics=null;
    const previous=api;api=null;
    try { previous?.executeCommand("hangup"); } catch {}
    try { previous?.dispose(); } catch {}
    $("patientVideo").replaceChildren();$("patientDiagnostics").replaceChildren();
    $("patientJoin").disabled=!valid;$("patientLeave").hidden=true;
  }
  async function join() {
    if(!valid)return;
    leave();const revision=generation;
    $("patientJoin").disabled=true;$("patientLeave").hidden=false;
    $("patientCallStatus").textContent="Loading video… Allow audio playback and use Join meeting.";
    try {
      await loadScript();if(revision!==generation)return;
      const current=new window.JitsiMeetExternalAPI("meet.jit.si",{
        roomName:room,parentNode:$("patientVideo"),userInfo:{displayName:"Demo participant"},
        configOverwrite:{startSilent:false,startWithAudioMuted:true,startWithVideoMuted:true,p2p:{enabled:false},prejoinConfig:{enabled:true},
          fileRecordingsEnabled:false,localRecording:{disable:true},liveStreaming:{enabled:false},
          toolbarButtons:["microphone","camera","settings","hangup","tileview","raisehand","videoquality"]}
      });
      api=current;
      const currentEvent=fn=>(...args)=>{if(api===current&&revision===generation)fn(...args);};
      current.addListener("videoConferenceJoined",currentEvent(()=>{$("patientCallStatus").textContent="Connected. If the clinician is silent, run Check audio stream while they speak.";}));
      current.addListener("videoConferenceLeft",currentEvent(()=>{leave();$("patientCallStatus").textContent="You left the call.";}));
      current.addListener("micError",currentEvent(()=>{$("patientCallStatus").textContent="Microphone access failed. You can still listen; allow microphone access to speak.";}));
      current.addListener("errorOccurred",currentEvent(()=>{$("patientCallStatus").textContent="Jitsi reported a connection error. Try the direct link or rejoin.";}));
      diagnostics=window.CallDiagnostics?.attach(current,{container:$("patientDiagnostics"),role:"patient",onRelayRetry:async()=>{if(confirm("Leave and rejoin using the Jitsi bridge? Ask the clinician to rejoin too."))await join();}});
    } catch(error) { if(revision===generation){leave();$("patientCallStatus").textContent=error.message;} }
  }
  $("patientJoin").addEventListener("click",join);
  $("patientLeave").addEventListener("click",()=>{leave();$("patientCallStatus").textContent="You left the call.";});
  window.addEventListener("pagehide",leave);
})();
