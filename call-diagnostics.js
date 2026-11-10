/* Local Jitsi connection measurements only. No media capture or recording. */
(() => {
  "use strict";

  const mounts = new WeakMap();
  const SAMPLE_COUNT = 3;
  const SAMPLE_INTERVAL_MS = 3000;
  const API_TIMEOUT_MS = 3000;
  let nextId = 0;

  function attach(api, { container, role = "doctor", onRelayRetry } = {}) {
    if (!container || typeof container.appendChild !== "function") {
      throw new TypeError("Call diagnostics needs a container element.");
    }
    if (mounts.has(container)) mounts.get(container).detach();

    const doc = container.ownerDocument || document;
    const isPatient = role === "patient";
    const pending = new Set();
    const localized = new Map();
    const tr = (en, te) => String(doc.documentElement?.lang || "en").toLowerCase().split("-")[0] === "te" ? te : en;
    function setText(node, en, te) {
      const value = typeof en === "function" ? en : () => tr(en, te);
      localized.set(node, value);
      node.textContent = value();
    }
    let active = true;
    let checking = false;
    let checkRevision = 0;
    let relayPending = false;

    function element(tag, text, attributes = {}) {
      const node = doc.createElement(tag);
      if (text !== undefined) node.textContent = text;
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      return node;
    }

    const wrapper = element("section", undefined, {
      class: "call-diagnostics consultation-notice",
      "aria-labelledby": `call-diagnostics-title-${++nextId}`
    });
    const title = element("h3", "Audio stream check", { id: `call-diagnostics-title-${nextId}` });
    setText(title, "Audio stream check", "ఆడియో ప్రసార తనిఖీ");
    const instructions = element("p", isPatient
      ? "Ask the clinician to keep speaking for 6 seconds during the incoming audio check on this device."
      : "Speak for 6 seconds while checking. Ask the patient to speak too if checking incoming audio.");
    setText(instructions,
      isPatient ? "Ask the clinician to keep speaking for 6 seconds during the incoming audio check on this device." : "Speak for 6 seconds while checking. Ask the patient to speak too if checking incoming audio.",
      isPatient ? "ఈ పరికరంలో వచ్చే ఆడియోను తనిఖీ చేస్తున్నప్పుడు వైద్యుని 6 సెకన్లు మాట్లాడమని అడగండి." : "తనిఖీ సమయంలో 6 సెకన్లు మాట్లాడండి. వచ్చే ఆడియోను కూడా తనిఖీ చేయాలంటే రోగిని మాట్లాడమని అడగండి.");
    const measurements = element("dl", undefined, { class: "call-diagnostics-measurements" });
    const fields = {};
    for (const [key, label] of [
      ["sent", "Audio sent from this device"],
      ["received", "Audio received by this device"],
      ["ice", "ICE connection"],
      ["route", "Media route"],
      ["silent", "Incoming playback disabled (view-only)"],
      ["microphone", "Local microphone"]
    ]) {
      const legend = element("dt", label);
      setText(legend, label, {
        sent: "ఈ పరికరం పంపుతున్న ఆడియో", received: "ఈ పరికరం అందుకుంటున్న ఆడియో",
        ice: "ICE కనెక్షన్", route: "మీడియా మార్గం",
        silent: "వచ్చే ఆడియో వినిపించడం నిలిపివేయబడిందా (వీక్షణ మాత్రమే)", microphone: "ఈ పరికరంలోని మైక్రోఫోన్"
      }[key]);
      measurements.appendChild(legend);
      const value = element("dd", "Unavailable", { "data-diagnostic": key });
      fields[key] = value;
      measurements.appendChild(value);
    }
    const status = element("p", "No stream check has run yet.", {
      role: "status", "aria-live": "polite", "aria-atomic": "true", "data-diagnostic": "status"
    });
    setText(status, "No stream check has run yet.", "ఇంకా ఆడియో ప్రసార తనిఖీ జరగలేదు.");
    const checkButton = element("button", "Check audio stream", {
      type: "button", class: "button secondary", "data-diagnostic-action": "check"
    });
    setText(checkButton, "Check audio stream", "ఆడియో ప్రసారాన్ని తనిఖీ చేయండి");
    const limitation = element("p", "Measurements cover this device only. Audio traffic can contain silence and does not confirm that either participant hears speech. This check does not record audio or activate a microphone.", { class: "muted" });
    setText(limitation,
      "Measurements cover this device only. Audio traffic can contain silence and does not confirm that either participant hears speech. This check does not record audio or activate a microphone.",
      "ఈ తనిఖీ ఈ పరికరం వివరాలను మాత్రమే చూపిస్తుంది. ఆడియో డేటాలో నిశ్శబ్దం కూడా ఉండవచ్చు; మాటలు వినిపిస్తున్నాయని ఇది నిర్ధారించదు. ఆడియోను రికార్డ్ చేయదు, మైక్రోఫోన్‌ను ప్రారంభించదు.");
    for (const node of [title, instructions, measurements, status, checkButton, limitation]) wrapper.appendChild(node);

    let relayButton;
    if (typeof onRelayRetry === "function") {
      const relayNotice = element("p", undefined, { class: "muted" });
      setText(relayNotice, "Bridge retry leaves and rejoins this call. Both participants must use bridge mode for the comparison.", "బ్రిడ్జ్ ద్వారా మళ్లీ చేరితే ఈ కాల్ నుంచి బయటకు వచ్చి తిరిగి చేరతారు. పోల్చడానికి ఇద్దరూ బ్రిడ్జ్ మార్గంలో చేరాలి.");
      wrapper.appendChild(relayNotice);
      relayButton = element("button", "Retry using Jitsi bridge", {
        type: "button", class: "button secondary", "data-diagnostic-action": "relay"
      });
      setText(relayButton, "Retry using Jitsi bridge", "Jitsi బ్రిడ్జ్ ద్వారా మళ్లీ చేరండి");
      wrapper.appendChild(relayButton);
    }
    container.appendChild(wrapper);

    function read(name) {
      if (!active || !api || typeof api[name] !== "function") {
        return Promise.resolve({ ok: false });
      }
      return new Promise(resolve => {
        let finished = false;
        let timer;
        const finish = result => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          pending.delete(cancel);
          resolve(result);
        };
        const cancel = () => finish({ ok: false });
        pending.add(cancel);
        timer = setTimeout(() => finish({ ok: false }), API_TIMEOUT_MS);
        try {
          Promise.resolve(api[name]()).then(
            value => finish({ ok: true, value }),
            () => finish({ ok: false })
          );
        } catch (_) {
          finish({ ok: false });
        }
      });
    }

    function wait(delay) {
      return new Promise(resolve => {
        let timer;
        let finished = false;
        const finish = value => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          pending.delete(cancel);
          resolve(value);
        };
        const cancel = () => finish(false);
        pending.add(cancel);
        timer = setTimeout(() => finish(active), delay);
      });
    }

    function boolean(result) {
      return result.ok && typeof result.value === "boolean" ? result.value : null;
    }
    function bitrate(value) {
      return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    }
    function rateLabel(value) {
      return value === null ? "Unavailable" : `${Math.round(value * 10) / 10} Kbps`;
    }
    async function sample() {
      const [stats, p2p, silent, muted, available] = await Promise.all([
        read("getConnectionStats"), read("isP2pActive"), read("isStartSilent"),
        read("isAudioMuted"), read("isAudioAvailable")
      ]);
      const data = stats.ok && stats.value && typeof stats.value === "object" ? stats.value : {};
      // Retain only these anonymous scalar measurements, never raw stats or candidate addresses.
      return {
        sent: bitrate(data.bitrate?.audio?.upload),
        received: bitrate(data.bitrate?.audio?.download),
        ice: typeof data.iceConnected === "boolean" ? data.iceConnected : null,
        p2p: boolean(p2p), silent: boolean(silent), muted: boolean(muted), available: boolean(available)
      };
    }
    function renderSample(value) {
      fields.sent.textContent = rateLabel(value.sent);
      fields.received.textContent = rateLabel(value.received);
      fields.ice.textContent = value.ice === null ? "Unavailable" : (value.ice ? "Connected" : "Not connected");
      fields.route.textContent = value.p2p === null ? "Unavailable" : (value.p2p ? "Direct peer-to-peer" : "Jitsi bridge");
      fields.silent.textContent = value.silent === null ? "Unavailable" : (value.silent ? "Yes" : "No");
      fields.microphone.textContent = value.available === false ? "Unavailable" :
        value.muted === null ? "Unavailable" :
          `${value.muted ? "Muted" : "Unmuted"}${value.available === null ? " (availability unknown)" : ""}`;
    }
    function directionSummary(samples, key, name) {
      const outgoing = key === "sent";
      if (samples.some(value => value[key] !== null && value[key] > 0)) return tr(`${name} audio traffic detected.`, outgoing ? "పంపుతున్న ఆడియో డేటా గుర్తించబడింది." : "అందుకుంటున్న ఆడియో డేటా గుర్తించబడింది.");
      if (samples.every(value => value[key] === 0)) return tr(`No ${name.toLowerCase()} audio traffic detected in these 3 samples.`, outgoing ? "ఈ 3 నమూనాల్లో పంపుతున్న ఆడియో డేటా కనిపించలేదు." : "ఈ 3 నమూనాల్లో అందుకుంటున్న ఆడియో డేటా కనిపించలేదు.");
      return tr(`${name} audio measurements are unavailable or incomplete.`, outgoing ? "పంపుతున్న ఆడియో కొలతలు అందుబాటులో లేవు లేదా అసంపూర్ణంగా ఉన్నాయి." : "అందుకుంటున్న ఆడియో కొలతలు అందుబాటులో లేవు లేదా అసంపూర్ణంగా ఉన్నాయి.");
    }
    function summary(samples) {
      const latest = samples[samples.length - 1];
      let help;
      if (isPatient && latest.silent === true) {
        help = tr("Incoming playback is disabled. Leave and rejoin with normal audio.", "వచ్చే ఆడియో వినిపించడం నిలిపివేయబడింది. బయటకు వచ్చి సాధారణ ఆడియోతో మళ్లీ చేరండి.");
      } else if (isPatient) {
        help = samples.every(value => value.received === null)
          ? tr("This meeting did not provide incoming audio measurements. Compare Jitsi's connection information or another browser.", "ఈ సమావేశం వచ్చే ఆడియో కొలతలను అందించలేదు. Jitsi కనెక్షన్ వివరాలు చూడండి లేదా మరో బ్రౌజర్‌లో పోల్చండి.")
          : samples.some(value => value.received !== null && value.received > 0)
          ? tr("If the clinician is still silent, compare playback on another browser or device. Incoming traffic alone does not confirm audible speech.", "వైద్యుని మాటలు ఇంకా వినిపించకపోతే మరో బ్రౌజర్ లేదా పరికరంలో పోల్చండి. ఆడియో డేటా అందుకోవడం మాత్రమే మాటలు వినిపిస్తున్నాయని నిర్ధారించదు.")
          : tr("Ask the clinician to check outgoing audio while speaking. A bridge retry or another network can help compare the media path.", "వైద్యుని మాట్లాడుతూనే పంపుతున్న ఆడియోను తనిఖీ చేయమని అడగండి. బ్రిడ్జ్ ద్వారా లేదా మరో నెట్‌వర్క్‌లో మళ్లీ చేరి పోల్చవచ్చు.");
      } else {
        help = samples.every(value => value.sent === null)
          ? tr("This meeting did not provide outgoing audio measurements. Compare Jitsi's connection information or another browser.", "ఈ సమావేశం పంపుతున్న ఆడియో కొలతలను అందించలేదు. Jitsi కనెక్షన్ వివరాలు చూడండి లేదా మరో బ్రౌజర్‌లో పోల్చండి.")
          : samples.some(value => value.sent !== null && value.sent > 0)
          ? tr("This does not confirm patient reception or hearing. Check the incoming stream on the patient's device.", "రోగికి ఆడియో అందుతోందని లేదా మాటలు వినిపిస్తున్నాయని ఇది నిర్ధారించదు. రోగి పరికరంలో వచ్చే ఆడియోను తనిఖీ చేయండి.")
          : tr("Speak during another check. If outgoing audio remains zero, compare a different microphone or browser.", "మళ్లీ తనిఖీ చేస్తున్నప్పుడు మాట్లాడండి. పంపుతున్న ఆడియో సున్నాగానే ఉంటే మరో మైక్రోఫోన్ లేదా బ్రౌజర్‌తో పోల్చండి.");
      }
      return `${directionSummary(samples, "sent", "Outgoing")} ${directionSummary(samples, "received", "Incoming")} ${help}`;
    }

    async function check() {
      if (!active || checking || relayPending) return;
      checking = true;
      checkButton.disabled = true;
      if (relayButton) relayButton.disabled = true;
      setText(checkButton, "Checking audio stream…", "ఆడియోను తనిఖీ చేస్తున్నాం…");
      const revision = ++checkRevision;
      setText(status, "Checking 3 samples over about 6 seconds. Keep speaking; a slow API may take longer.", "సుమారు 6 సెకన్లలో 3 నమూనాలను తనిఖీ చేస్తున్నాం. మాట్లాడుతూనే ఉండండి; API నెమ్మదిగా ఉంటే మరింత సమయం పట్టవచ్చు.");
      const results = new Array(SAMPLE_COUNT);
      try {
        await Promise.all(Array.from({ length: SAMPLE_COUNT }, async (_, index) => {
          if (index && !await wait(index * SAMPLE_INTERVAL_MS)) return;
          if (!active || revision !== checkRevision) return;
          const result = await sample();
          if (!active || revision !== checkRevision) return;
          results[index] = result;
          // Older, slow samples must not replace a newer reading.
          if (results.slice(index + 1).every(value => value === undefined)) renderSample(result);
        }));
        if (active && revision === checkRevision) setText(status, () => summary(results));
      } finally {
        if (active && revision === checkRevision) {
          checking = false;
          checkButton.disabled = false;
          if (relayButton) relayButton.disabled = relayPending;
          setText(checkButton, "Check audio stream again", "ఆడియోను మళ్లీ తనిఖీ చేయండి");
        }
      }
    }
    async function retry() {
      if (!active || checking || relayPending || typeof onRelayRetry !== "function") return;
      relayPending = true;
      relayButton.disabled = true;
      checkButton.disabled = true;
      setText(status, "Requesting a bridge retry. Audio hearing still needs to be checked by both participants.", "బ్రిడ్జ్ ద్వారా మళ్లీ చేరమని అభ్యర్థిస్తున్నాం. మాటలు వినిపిస్తున్నాయో ఇద్దరూ నిర్ధారించాలి.");
      try {
        await onRelayRetry();
      } catch (_) {
        if (active) setText(status, "Could not retry this call. Use the meeting controls to leave and rejoin, or compare another network.", "ఈ కాల్‌లో మళ్లీ చేరలేకపోయాం. కాల్ నియంత్రణలతో బయటకు వచ్చి తిరిగి చేరండి లేదా మరో నెట్‌వర్క్‌లో ప్రయత్నించండి.");
      } finally {
        if (active) {
          relayPending = false;
          relayButton.disabled = false;
          checkButton.disabled = checking;
        }
      }
    }
    checkButton.addEventListener("click", check);
    if (relayButton) relayButton.addEventListener("click", retry);

    const localeObserver = doc.documentElement && typeof MutationObserver === "function"
      ? new MutationObserver(() => { if (active) for (const [node, value] of localized) node.textContent = value(); }) : null;
    localeObserver?.observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });

    const controller = {
      detach() {
        if (!active) return;
        active = false;
        checkRevision++;
        for (const cancel of [...pending]) cancel();
        checkButton.removeEventListener("click", check);
        if (relayButton) relayButton.removeEventListener("click", retry);
        localeObserver?.disconnect();
        localized.clear();
        wrapper.remove();
        if (mounts.get(container) === controller) mounts.delete(container);
      }
    };
    mounts.set(container, controller);
    return controller;
  }

  window.CallDiagnostics = Object.freeze({ attach });
})();
