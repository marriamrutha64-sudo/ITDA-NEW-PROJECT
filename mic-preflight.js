/* A local, temporary microphone level check. Audio is never recorded or uploaded. */
(() => {
  "use strict";

  const root = document.getElementById("micPreflight");
  if (!root) return;
  const get = id => document.getElementById(id);
  const startButton = get("micPreflightStart");
  const stopButton = get("micPreflightStop");
  const deviceSelect = get("micPreflightDevice");
  const status = get("micPreflightStatus");
  const meter = get("micPreflightMeter");
  const copy = {
    en: {
      eyebrow: "BEFORE THE CALL", title: "Check the doctor's microphone",
      intro: "Run this check before opening Jitsi. Stay quiet for 2 seconds, then speak toward the screen as on a normal call for 6 seconds.",
      device: "Microphone", defaultDevice: "System default microphone",
      start: "Start microphone check", stop: "Stop check",
      idle: "The check starts only when you press the button. No audio is saved.",
      privacy: "This checks the microphone on this laptop. The patient must still confirm that they can hear you in Jitsi.",
      requesting: "Allow microphone access in this browser to start the check.",
      quiet: "Stay quiet for 2 seconds while the room level is measured.",
      speak: "Speak toward the screen as on a normal call now.",
      good: "The input level rose while you spoke. Open Jitsi and confirm the patient can hear a short phrase.",
      weak: "The microphone level barely changed when you spoke. Try another input device or a USB headset before the call.",
      uncertain: "Some sound reached the microphone, but the voice change was small. Try again closer to the mic or choose another device.",
      stopped: "Check stopped. The microphone has been released.",
      denied: "Microphone access was blocked. Allow it for this site in the browser, then try again.",
      missing: "No microphone is available. Connect a microphone or headset, then try again.",
      busy: "The microphone is unavailable. Close another app using it and try again.",
      unsupported: "This browser cannot run the microphone check. Check the microphone in Windows or Jitsi.",
      failed: "The microphone check could not start. Try another input device or browser.",
      numberedDevice: "Microphone {number}"
    },
    te: {
      eyebrow: "కాల్‌కు ముందు", title: "వైద్యుని మైక్రోఫోన్‌ను తనిఖీ చేయండి",
      intro: "Jitsi తెరవడానికి ముందు పరీక్షించండి. 2 సెకన్లు మౌనంగా ఉండి, తరువాత 6 సెకన్లు సాధారణ కాల్‌లోలాగా స్క్రీన్ వైపు మాట్లాడండి.",
      device: "మైక్రోఫోన్", defaultDevice: "సిస్టమ్ డిఫాల్ట్ మైక్రోఫోన్",
      start: "మైక్రోఫోన్ పరీక్ష ప్రారంభించండి", stop: "పరీక్ష ఆపండి",
      idle: "బటన్ నొక్కినప్పుడే పరీక్ష మొదలవుతుంది. ఆడియో సేవ్ చేయబడదు.",
      privacy: "ఈ ల్యాప్‌టాప్ మైక్రోఫోన్‌ను మాత్రమే పరీక్షిస్తుంది. Jitsiలో రోగికి మీ మాట వినిపిస్తుందో నిర్ధారించుకోండి.",
      requesting: "పరీక్ష కోసం ఈ బ్రౌజర్‌లో మైక్రోఫోన్ అనుమతి ఇవ్వండి.",
      quiet: "గది శబ్దాన్ని కొలిచే వరకు 2 సెకన్లు మౌనంగా ఉండండి.",
      speak: "ఇప్పుడు సాధారణ కాల్‌లోలాగా స్క్రీన్ వైపు మాట్లాడండి.",
      good: "మీరు మాట్లాడినప్పుడు ఇన్‌పుట్ స్థాయి పెరిగింది. Jitsiలో రోగికి చిన్న వాక్యం వినిపిస్తుందో నిర్ధారించుకోండి.",
      weak: "మాట్లాడినప్పుడు మైక్రోఫోన్ స్థాయి దాదాపు మారలేదు. కాల్‌కు ముందు మరో మైక్రోఫోన్ లేదా USB హెడ్‌సెట్ ప్రయత్నించండి.",
      uncertain: "కొంత శబ్దం అందింది, కానీ మాటల స్థాయి తక్కువగా ఉంది. మైక్రోఫోన్‌కు దగ్గరగా మళ్లీ ప్రయత్నించండి.",
      stopped: "పరీక్ష ఆగింది. మైక్రోఫోన్ విడుదల చేయబడింది.",
      denied: "మైక్రోఫోన్ అనుమతి నిరాకరించబడింది. ఈ సైట్‌కు బ్రౌజర్‌లో అనుమతి ఇచ్చి మళ్లీ ప్రయత్నించండి.",
      missing: "మైక్రోఫోన్ అందుబాటులో లేదు. మైక్రోఫోన్ లేదా హెడ్‌సెట్ కలిపి మళ్లీ ప్రయత్నించండి.",
      busy: "మైక్రోఫోన్ అందుబాటులో లేదు. దానిని వాడుతున్న మరో యాప్‌ను మూసి మళ్లీ ప్రయత్నించండి.",
      unsupported: "ఈ బ్రౌజర్‌లో పరీక్ష సాధ్యం కాదు. Windows లేదా Jitsiలో మైక్రోఫోన్‌ను తనిఖీ చేయండి.",
      failed: "మైక్రోఫోన్ పరీక్ష ప్రారంభం కాలేదు. మరో ఇన్‌పుట్ పరికరం లేదా బ్రౌజర్ ప్రయత్నించండి.",
      numberedDevice: "మైక్రోఫోన్ {number}"
    }
  };
  const lang = () => document.documentElement.lang?.toLowerCase().startsWith("te") ? "te" : "en";
  const tr = key => copy[lang()][key];
  let messageKey = "idle";
  let stream = null;
  let context = null;
  let timer = null;
  let runId = 0;

  function setStatus(key, result = false) {
    messageKey = key;
    status.textContent = tr(key);
    root.dataset.micResult = result ? key : "";
  }

  function localize() {
    for (const [id, key] of [
      ["micPreflightEyebrow", "eyebrow"], ["micPreflightTitle", "title"],
      ["micPreflightIntro", "intro"], ["micPreflightDeviceLabel", "device"],
      ["micPreflightPrivacy", "privacy"]
    ]) get(id).textContent = tr(key);
    startButton.textContent = tr("start");
    stopButton.textContent = tr("stop");
    deviceSelect.options[0].textContent = tr("defaultDevice");
    status.textContent = tr(messageKey);
  }

  async function release() {
    if (timer) clearInterval(timer);
    timer = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    const oldContext = context;
    context = null;
    if (oldContext) {
      try { await oldContext.close(); } catch (_) { /* Already closed. */ }
    }
    startButton.disabled = false;
    stopButton.hidden = true;
    deviceSelect.disabled = false;
    meter.style.width = "0%";
  }

  async function stop(key = "stopped") {
    runId += 1;
    await release();
    setStatus(key, key === "good" || key === "weak" || key === "uncertain");
  }

  async function listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const selected = deviceSelect.value;
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput" && device.deviceId && device.deviceId !== "default");
      deviceSelect.replaceChildren(new Option(tr("defaultDevice"), ""));
      inputs.forEach((device, index) => {
        deviceSelect.add(new Option(device.label || tr("numberedDevice").replace("{number}", String(index + 1)), device.deviceId));
      });
      if ([...deviceSelect.options].some(option => option.value === selected)) deviceSelect.value = selected;
    } catch (_) { /* Device labels are optional; the default input still works. */ }
  }

  function percentile(values, fraction) {
    if (!values.length) return -100;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * fraction)];
  }

  async function start() {
    if (startButton.disabled) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setStatus("unsupported");
      return;
    }
    const thisRun = ++runId;
    startButton.disabled = true;
    stopButton.hidden = false;
    deviceSelect.disabled = true;
    setStatus("requesting");
    const selectedDevice = deviceSelect.value;
    try {
      context = new AudioContext();
      const constraints = selectedDevice ? { deviceId: { exact: selectedDevice } } : true;
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
      if (thisRun !== runId) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      stream = acquired;
      await context.resume();
      if (thisRun !== runId) return;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // Do not connect to speakers or a recorder.
      const samples = new Float32Array(analyser.fftSize);
      const baseline = [];
      const speech = [];
      await listDevices();
      if (thisRun !== runId) return;
      const began = performance.now();
      setStatus("quiet");
      timer = setInterval(() => {
        if (thisRun !== runId) return;
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const db = 20 * Math.log10(Math.max(Math.sqrt(energy / samples.length), 1e-7));
        const elapsed = performance.now() - began;
        meter.style.width = `${Math.max(0, Math.min(100, (db + 80) * 1.5))}%`;
        if (elapsed >= 300 && elapsed < 2000) baseline.push(db);
        if (elapsed >= 2500 && elapsed < 8500) speech.push(db);
        if (elapsed >= 2000 && messageKey === "quiet") setStatus("speak");
        if (elapsed >= 8500) {
          const rise = percentile(speech, 0.9) - percentile(baseline, 0.5);
          const result = baseline.length < 5 || speech.length < 10 ? "uncertain" : rise >= 8 ? "good" : rise >= 4 ? "uncertain" : "weak";
          void stop(result);
        }
      }, 100);
    } catch (error) {
      if (thisRun !== runId) return;
      const key = error?.name === "NotAllowedError" || error?.name === "SecurityError" ? "denied" :
        error?.name === "NotFoundError" || error?.name === "OverconstrainedError" ? "missing" :
          error?.name === "NotReadableError" ? "busy" : "failed";
      await stop(key);
    }
  }

  startButton.addEventListener("click", () => { void start(); });
  stopButton.addEventListener("click", () => { void stop(); });
  deviceSelect.addEventListener("change", () => setStatus("idle"));
  document.addEventListener("visibilitychange", () => { if (document.hidden && startButton.disabled) void stop(); });
  const consultationPage = get("page-consultations");
  if (consultationPage) new MutationObserver(() => {
    if (!consultationPage.classList.contains("active") && startButton.disabled) void stop();
  }).observe(consultationPage, { attributes: true, attributeFilter: ["class"] });
  get("consultationExternalLink")?.addEventListener("click", () => { if (startButton.disabled) void stop(); });
  new MutationObserver(localize).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  localize();
})();
