/* Clinician-authored journey records. All displayed patient data comes from authenticated APIs. */
(() => {
  "use strict";

  const words = {
    title: ["Patient journey and reports", "రోగి ప్రయాణం మరియు నివేదికలు"],
    subtitle: ["Track diagnostic investigations, treatment progress, specialist escalation and independent clinical review.", "నిర్ధారణ పరీక్షలు, చికిత్స పురోగతి, నిపుణుల సంప్రదింపు మరియు స్వతంత్ర వైద్య సమీక్షను నమోదు చేయండి."],
    safety: ["Hackathon demonstration: AI output is advisory only and must not be used for clinical decision-making. Record clinician-authored demonstration details only.", "హ్యాకథాన్ ప్రదర్శన: AI ఫలితం సలహా మాత్రమే; వైద్య నిర్ణయాలకు ఉపయోగించకూడదు. వైద్యుడు నమోదు చేసిన ప్రదర్శన వివరాలను మాత్రమే నమోదు చేయండి."],
    patient: ["Patient", "రోగి"], choosePatient: ["Select a patient", "రోగిని ఎంచుకోండి"],
    refresh: ["Refresh records", "రికార్డులను నవీకరించండి"], print: ["Print patient summary", "రోగి సారాంశాన్ని ముద్రించండి"],
    loading: ["Loading patient records…", "రోగి రికార్డులు లోడ్ అవుతున్నాయి…"],
    chooseHelp: ["Select a patient to see their recorded care journey.", "నమోదైన చికిత్స ప్రయాణాన్ని చూడటానికి రోగిని ఎంచుకోండి."],
    noPatients: ["No accessible patients. Register a patient in Patients first.", "అందుబాటులో రోగులు లేరు. ముందుగా రోగుల విభాగంలో నమోదు చేయండి."],
    readOnly: ["Health workers can view records they are authorized to access. Only clinical staff can add clinical progress or AI review records.", "ఆరోగ్య కార్యకర్తలు అనుమతించిన రికార్డులను చూడవచ్చు. వైద్య సిబ్బంది మాత్రమే చికిత్స పురోగతి లేదా AI సమీక్షలను నమోదు చేయగలరు."],
    stages: ["Recorded journey stages", "నమోదైన ప్రయాణ దశలు"], stageHelp: ["These statuses reflect saved records; they do not establish a diagnosis or prove treatment effectiveness.", "ఈ స్థితులు సేవ్ చేసిన రికార్డులను సూచిస్తాయి; ఇవి రోగ నిర్ధారణ లేదా చికిత్స ఫలితానికి రుజువు కావు."],
    screening: ["Screening", "ప్రాథమిక పరీక్ష"], clinical_review: ["Clinical review", "వైద్య సమీక్ష"],
    diagnostics: ["Diagnostics and biopsy", "నిర్ధారణ పరీక్షలు మరియు బయాప్సీ"], treatment: ["Treatment", "చికిత్స"],
    specialist: ["Specialist escalation", "నిపుణుల సంప్రదింపు"], treatments: ["Treatment progress", "చికిత్స పురోగతి"],
    escalations: ["Specialist escalation", "నిపుణుల సంప్రదింపు"], ai_reviews: ["AI review and override", "AI సమీక్ష మరియు సవరణ"],
    addDiagnostic: ["Record diagnostic progress", "నిర్ధారణ పరీక్ష పురోగతిని నమోదు చేయండి"],
    addTreatment: ["Record treatment progress", "చికిత్స పురోగతిని నమోదు చేయండి"],
    addEscalation: ["Record specialist escalation", "నిపుణుల సంప్రదింపును నమోదు చేయండి"],
    addAiReview: ["Record independent AI review", "స్వతంత్ర AI సమీక్షను నమోదు చేయండి"],
    test_type: ["Test type", "పరీక్ష రకం"], status: ["Status", "స్థితి"], ordered_at: ["Ordered date", "పరీక్ష సూచించిన తేదీ"],
    facility: ["Facility / laboratory", "ఆసుపత్రి / ప్రయోగశాల"], result_summary: ["Clinician-entered result summary", "వైద్యుడు నమోదు చేసిన ఫలిత సారాంశం"],
    report_note: ["Report reference or note", "నివేదిక సూచన లేదా గమనిక"], plan: ["Clinician-authored plan", "వైద్యుడు రూపొందించిన ప్రణాళిక"],
    stage: ["Care stage", "చికిత్స దశ"], next_review_date: ["Next review date", "తదుపరి సమీక్ష తేదీ"], notes: ["Progress notes", "పురోగతి గమనికలు"],
    specialty: ["Specialty / receiving service", "నిపుణుల విభాగం / సేవ"], reason: ["Reason", "కారణం"], priority: ["Priority", "ప్రాధాన్యత"],
    screening_id: ["Screening being reviewed", "సమీక్షిస్తున్న పరీక్ష"], chooseScreening: ["Select a screening (optional for independent assessment)", "పరీక్షను ఎంచుకోండి (స్వతంత్ర సమీక్షకు ఐచ్ఛికం)"],
    disposition: ["Clinician's disposition", "వైద్యుని సమీక్ష నిర్ణయం"], assessment: ["Independent clinician assessment", "స్వతంత్ర వైద్య అంచనా"],
    aiHelp: ["To agree with, override or mark AI observations insufficient, generate genuine experimental observations for the selected screening first. The server verifies inference evidence. An independent assessment makes no claim that AI was used.", "AI పరిశీలనలతో ఏకీభవించడానికి, సవరించడానికి లేదా సరిపోవని నమోదు చేయడానికి ముందుగా ఎంచుకున్న పరీక్షపై నిజమైన ప్రయోగాత్మక విశ్లేషణ చేయండి. సర్వర్ విశ్లేషణ ఆధారాన్ని తనిఖీ చేస్తుంది. స్వతంత్ర సమీక్ష AI వాడినట్లు సూచించదు."],
    openScreening: ["Open oral screening", "నోటి పరీక్ష విభాగాన్ని తెరవండి"],
    inferenceRun: ["Saved AI run to review", "సమీక్షించాల్సిన సేవ్ చేసిన AI విశ్లేషణ"],
    latestInference: ["Latest verified inference (server checks evidence)", "తాజా ధృవీకరించిన విశ్లేషణ (సర్వర్ ఆధారాన్ని తనిఖీ చేస్తుంది)"],
    savedOutput: ["Saved advisory AI output", "సేవ్ చేసిన సలహా AI ఫలితం"],
    noSavedOutput: ["No saved AI text is available for this screening. A historical inference audit may exist; the server will verify it when a review is submitted. Independent assessment is always separate from AI use.", "ఈ పరీక్షకు సేవ్ చేసిన AI వచనం అందుబాటులో లేదు. పాత విశ్లేషణ ఆడిట్ ఉండవచ్చు; సమీక్షను పంపినప్పుడు సర్వర్ తనిఖీ చేస్తుంది. స్వతంత్ర అంచనా AI వినియోగానికి వేరుగా ఉంటుంది."],
    historicalOutput: ["Historical inference text is unavailable; this review retains its audit reference.", "పాత విశ్లేషణ వచనం అందుబాటులో లేదు; ఈ సమీక్షలో ఆడిట్ సూచన ఉంది."],
    save: ["Save record", "రికార్డును సేవ్ చేయండి"], saving: ["Saving…", "సేవ్ అవుతోంది…"], saved: ["Record saved. Journey refreshed.", "రికార్డు సేవ్ అయింది. ప్రయాణ వివరాలు నవీకరించబడ్డాయి."],
    progress: ["Record progress", "పురోగతిని నమోదు చేయండి"], cancelProgress: ["Cancel progress update", "పురోగతి నమోదు రద్దు చేయండి"],
    progressHelp: ["Recording progress for an existing item. The earlier record will remain in its history.", "ఇప్పటికే ఉన్న అంశానికి పురోగతిని నమోదు చేస్తున్నారు. పాత రికార్డు చరిత్రలో అలాగే ఉంటుంది."],
    history: ["Saved history", "సేవ్ చేసిన చరిత్ర"], noRecords: ["No records saved in this section.", "ఈ విభాగంలో రికార్డులు సేవ్ కాలేదు."],
    earlier: ["Earlier update", "మునుపటి నమోదు"], latest: ["Latest update", "తాజా నమోదు"], recordedBy: ["Recorded by", "నమోదు చేసినవారు"],
    recordedAt: ["Recorded at", "నమోదు సమయం"], created_at: ["Recorded at", "నమోదు సమయం"], inference: ["Inference audit reference", "AI విశ్లేషణ ఆడిట్ సూచన"],
    reportedRequired: ["A reported result needs a result summary or report note.", "ఫలితం నివేదించబడితే ఫలిత సారాంశం లేదా నివేదిక గమనిక ఇవ్వాలి."],
    printWarning: ["This summary contains patient information. Print or save it only for an authorized demonstration and keep the copy secure. Continue?", "ఈ సారాంశంలో రోగి సమాచారం ఉంది. అనుమతించిన ప్రదర్శన కోసం మాత్రమే ముద్రించండి లేదా సేవ్ చేయండి. ప్రతిని సురక్షితంగా ఉంచండి. కొనసాగించాలా?"],
    reportTitle: ["Aarogya Drishti patient summary", "ఆరోగ్య దృష్టి రోగి సారాంశం"], generatedAt: ["Summary generated", "సారాంశం రూపొందించిన సమయం"],
    reportNotice: ["Prototype demonstration. AI output is advisory only and must not be used for clinical decision-making. This report reproduces recorded information; it does not certify a diagnosis or outcome.", "నమూనా ప్రదర్శన. AI ఫలితం సలహా మాత్రమే; వైద్య నిర్ణయాలకు ఉపయోగించకూడదు. ఈ నివేదిక నమోదైన సమాచారాన్ని చూపుతుంది; రోగ నిర్ధారణ లేదా ఫలితాన్ని ధృవీకరించదు."],
    name: ["Name", "పేరు"], patient_code: ["Patient ID", "రోగి సంఖ్య"], age: ["Age", "వయస్సు"], gender: ["Gender", "లింగం"],
    village: ["Village", "గ్రామం"], district: ["District", "జిల్లా"], phone: ["Contact", "సంప్రదింపు"],
    historyLabel: ["Recorded medical history", "నమోదైన వైద్య చరిత్ర"], symptoms: ["Recorded symptoms", "నమోదైన లక్షణాలు"],
    screenings: ["Screening records", "ప్రాథమిక పరీక్ష రికార్డులు"], reviews: ["Medical officer reviews", "వైద్య అధికారి సమీక్షలు"],
    referrals: ["Referrals", "రిఫరల్స్"], followups: ["Follow-ups", "తదుపరి పరీక్షలు"], consultations: ["Consultations", "సంప్రదింపులు"],
    location: ["Area observed", "పరిశీలించిన ప్రదేశం"], duration: ["Symptom duration", "లక్షణాల వ్యవధి"], worker: ["Health worker", "ఆరోగ్య కార్యకర్త"],
    reviewer: ["Reviewer", "సమీక్షకుడు"], observations: ["Clinical observations", "వైద్య పరిశీలనలు"], department: ["Department", "విభాగం"],
    appointment_date: ["Appointment date", "అపాయింట్మెంట్ తేదీ"], due_date: ["Due date", "నిర్దేశిత తేదీ"], scheduled_at: ["Scheduled time", "నిర్దేశిత సమయం"],
    noValue: ["Not recorded", "నమోదు కాలేదు"], unavailable: ["Unavailable", "అందుబాటులో లేదు"],
    biopsy: ["Biopsy", "బయాప్సీ"], histopathology: ["Histopathology", "కణజాల పరీక్ష"], blood_test: ["Blood test", "రక్త పరీక్ష"], imaging: ["Imaging", "ఇమేజింగ్ పరీక్ష"], other: ["Other", "ఇతర"],
    ordered: ["Ordered", "సూచించారు"], scheduled: ["Scheduled", "తేదీ నిర్ణయించారు"], collected: ["Sample collected", "నమూనా సేకరించారు"],
    processing: ["Processing", "పరీక్ష జరుగుతోంది"], reported: ["Reported", "ఫలితం నివేదించారు"], cancelled: ["Cancelled", "రద్దు చేశారు"],
    assessmentStage: ["Assessment", "అంచనా"], investigation: ["Investigation", "పరీక్షల దశ"], recovery: ["Recovery", "కోలుకునే దశ"], surveillance: ["Surveillance", "పర్యవేక్షణ"],
    planned: ["Planned", "ప్రణాళికలో ఉంది"], active: ["Active", "కొనసాగుతోంది"], completed: ["Completed", "పూర్తయింది"], paused: ["Paused", "తాత్కాలికంగా నిలిపారు"], stopped: ["Stopped", "నిలిపారు"],
    routine: ["Routine", "సాధారణ"], urgent: ["Urgent", "అత్యవసరం"], requested: ["Requested", "అభ్యర్థించారు"], accepted: ["Accepted", "అంగీకరించారు"],
    in_review: ["In review", "సమీక్షలో ఉంది"], resolved: ["Resolved", "పరిష్కరించారు"],
    aiAccepted: ["Agrees with advisory observations", "సలహా పరిశీలనలతో ఏకీభవిస్తున్నారు"],
    disagreed: ["Overrides / disagrees with AI observations", "AI పరిశీలనలను సవరిస్తున్నారు / విభేదిస్తున్నారు"],
    insufficient: ["Image or AI observations insufficient", "చిత్రం లేదా AI పరిశీలనలు సరిపోవు"],
    independent: ["Independent assessment without AI reliance", "AI మీద ఆధారపడని స్వతంత్ర అంచనా"],
    not_recorded: ["Not recorded", "నమోదు కాలేదు"], recorded: ["Recorded", "నమోదైంది"], reviewed: ["Reviewed", "సమీక్షించారు"],
    awaiting_clinical_review: ["Awaiting clinical review", "వైద్య సమీక్ష కోసం వేచి ఉంది"],
    aiInconsistent: ["Possible inconsistency in this generated AI text. Review the original photograph independently before recording an assessment.", "ఈ AI వచనంలో పరస్పర విరుద్ధమైన వివరాలు ఉండవచ్చు. అభిప్రాయం నమోదు చేసే ముందు అసలు ఫోటోను స్వతంత్రంగా పరిశీలించండి."]
  };
  const definitions = {
    diagnostics: { endpoint: "/api/diagnostics", add: "addDiagnostic", fields: [
      ["test_type", "select", ["biopsy", "histopathology", "blood_test", "imaging", "other"], true],
      ["status", "select", ["ordered", "scheduled", "collected", "processing", "reported", "cancelled"], true],
      ["ordered_at", "date", null, true], ["facility", "text", 180], ["result_summary", "textarea", 4000], ["report_note", "textarea", 4000]
    ] },
    treatments: { endpoint: "/api/treatments", add: "addTreatment", fields: [
      ["plan", "textarea", 4000, true], ["stage", "select", ["assessment", "investigation", "treatment", "recovery", "surveillance"], true],
      ["status", "select", ["planned", "active", "completed", "paused", "stopped"], true], ["next_review_date", "date"], ["notes", "textarea", 4000]
    ] },
    escalations: { endpoint: "/api/escalations", add: "addEscalation", fields: [
      ["specialty", "text", 120, true], ["reason", "textarea", 3000, true], ["priority", "select", ["routine", "urgent"], true],
      ["status", "select", ["requested", "accepted", "in_review", "resolved", "cancelled"], true]
    ] },
    ai_reviews: { endpoint: "/api/ai-reviews", add: "addAiReview", fields: [
      ["screening_id", "select", []], ["disposition", "select", ["independent", "accepted", "disagreed", "insufficient"], true],
      ["reason", "textarea", 3000, true], ["assessment", "textarea", 5000, true]
    ] }
  };

  function app() { return typeof state === "undefined" ? null : state; }
  function userKey() { const user = app()?.user; return user ? `${user.id || user.username}:${user.role}` : ""; }
  function language() { return app()?.language === "te" ? 1 : 0; }
  function tr(key) { return words[key]?.[language()] ?? String(key ?? ""); }
  function appendInferenceWarning(target, inference) {
    if (inference?.inconsistent === true || inference?.output_warning) target.append(label("p", "aiInconsistent", { class: "care-ai-warning", role: "alert" }));
  }
  function valueLabel(value, field) {
    if (value == null || value === "") return tr("noValue");
    if (field === "disposition" && value === "accepted") return tr("aiAccepted");
    if (field === "stage" && value === "assessment") return tr("assessmentStage");
    const key = String(value).toLowerCase().replaceAll(" ", "_");
    return words[key] ? tr(key) : String(value);
  }
  function el(tag, attributes = {}, text) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== false && value != null) node.setAttribute(name, value === true ? "" : String(value));
    }
    if (text != null) node.textContent = text;
    return node;
  }
  function label(tag, key, attributes = {}) { return el(tag, { ...attributes, "data-care-i18n": key }, tr(key)); }
  function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
  function dateText(value) {
    if (!value) return tr("noValue");
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(language() ? "te-IN" : "en-IN", value.length === 10 ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" });
  }

  function init() {
    const page = document.getElementById("page-care");
    const appView = document.getElementById("appView");
    if (!page || !appView || typeof api !== "function" || document.getElementById("careJourney")) return;
    const panel = el("section", { id: "careJourney", class: "care-journey", "aria-labelledby": "careJourneyHeading" });
    const heading = el("div", { class: "care-journey-heading" });
    const headingCopy = el("div");
    headingCopy.append(label("h2", "title", { id: "careJourneyHeading" }), label("p", "subtitle", { class: "muted" }));
    const printButton = label("button", "print", { type: "button", class: "button secondary" });
    heading.append(headingCopy, printButton);
    const safety = label("p", "safety", { class: "care-advisory" });
    const toolbar = el("div", { class: "care-journey-toolbar" });
    const selectWrap = el("div", { class: "care-field" });
    const patientSelect = el("select", { id: "careJourneyPatient" });
    selectWrap.append(label("label", "patient", { for: patientSelect.id }), patientSelect);
    const refreshButton = label("button", "refresh", { type: "button", class: "button secondary" });
    toolbar.append(selectWrap, refreshButton);
    const feedback = el("p", { class: "care-feedback", role: "status", "aria-live": "polite" });
    const readOnly = label("p", "readOnly", { class: "care-readonly" });
    const content = el("div", { hidden: true });
    const stageHeading = label("h3", "stages");
    const stageHelp = label("p", "stageHelp", { class: "muted" });
    const stageList = el("ol", { class: "care-stage-list", "aria-labelledby": "careJourneyStages" });
    stageHeading.id = "careJourneyStages";
    const grid = el("div", { class: "care-record-grid" });
    content.append(stageHeading, stageHelp, stageList, grid);
    panel.append(heading, safety, toolbar, feedback, readOnly, content);
    page.insertBefore(panel, page.querySelector(".workflow-grid"));

    const editors = {};
    let auth = "", request = 0, selectedId = "", detail = null, journey = null;
    let patients = [], busy = false, saving = false, saveSequence = 0, inferenceSequence = 0, wasActive = false, previousLanguage = language();

    function clinician() { return ["admin", "medical_officer", "specialist"].includes(app()?.user?.role); }
    function online() { return Boolean(app()?.user && !app().offlineMode && !appView.hidden); }
    function setFeedback(key, error = false, literal = false) {
      feedback.textContent = literal ? key : tr(key);
      feedback.classList.toggle("care-feedback-error", error);
    }
    function updateAccess() {
      const writable = online() && clinician() && Boolean(selectedId && detail && journey) && !busy && !saving;
      readOnly.hidden = clinician();
      patientSelect.disabled = !online() || saving;
      refreshButton.disabled = !online() || busy || saving;
      printButton.disabled = !online() || !detail || !journey || busy || saving;
      for (const editor of Object.values(editors)) {
        editor.fieldset.disabled = !writable;
        editor.details.hidden = !clinician();
      }
    }
    function clearReport() { document.getElementById("carePrintReport")?.remove(); }
    function resetEditor(editor) {
      editor.form.reset();
      editor.previousId = null;
      editor.progressNote.hidden = true;
      editor.cancel.hidden = true;
      if (editor.controls.ordered_at) editor.controls.ordered_at.value = localDate();
      if (editor.controls.result_summary) editor.controls.result_summary.setCustomValidity("");
      if (editor.controls.screening_id) editor.controls.screening_id.required = false;
      if (editor.inferenceSelect) {
        inferenceSequence++;
        editor.inferences = [];
        editor.inferenceSelect.replaceChildren(label("option", "latestInference", { value: "" }));
        editor.output.replaceChildren(); editor.saveButton.disabled = false;
      }
    }
    function clearPatient() {
      detail = null; journey = null; content.hidden = true;
      stageList.replaceChildren();
      for (const editor of Object.values(editors)) { resetEditor(editor); editor.history.replaceChildren(); }
      inferenceSequence++;
      const aiEditor = editors.ai_reviews;
      aiEditor.inferences = [];
      aiEditor.inferenceSelect.replaceChildren(label("option", "latestInference", { value: "" }));
      aiEditor.output.textContent = "";
      clearReport();
      updateAccess();
    }
    function resetAll() {
      request++; saveSequence++; selectedId = ""; patients = []; busy = false; saving = false;
      patientSelect.replaceChildren(label("option", "choosePatient", { value: "" }));
      clearPatient();
      setFeedback("chooseHelp");
    }
    function makeEditor(kind, definition) {
      const card = el("section", { class: "panel care-record-panel", "aria-labelledby": `care-${kind}-heading` });
      card.append(label("h3", kind, { id: `care-${kind}-heading` }));
      const details = el("details", { class: "care-editor" });
      details.append(label("summary", definition.add));
      const form = el("form", { id: `care-${kind}-form`, class: "care-record-form" });
      const fieldset = el("fieldset", { disabled: true });
      const controls = {};
      const progressNote = label("p", "progressHelp", { class: "care-progress-note", hidden: true });
      fieldset.append(progressNote);
      if (kind === "ai_reviews") {
        fieldset.append(label("p", "aiHelp", { class: "care-form-help" }));
        const open = label("button", "openScreening", { type: "button", class: "text-button" });
        open.addEventListener("click", () => { if (typeof goPage === "function") goPage("screening"); });
        fieldset.append(open);
      }
      for (const [name, type, values, required] of definition.fields) {
        const wrap = el("div", { class: "care-field" });
        const id = `care-${kind}-${name}`;
        const control = el(type === "textarea" ? "textarea" : type === "select" ? "select" : "input", {
          id, name, type: ["textarea", "select"].includes(type) ? null : type, required: Boolean(required),
          maxlength: typeof values === "number" ? values : null, rows: type === "textarea" ? 3 : null
        });
        if (type === "select") for (const value of values) {
          const key = name === "stage" && value === "assessment" ? "assessmentStage" : name === "disposition" && value === "accepted" ? "aiAccepted" : value;
          control.append(label("option", key, { value }));
        }
        wrap.append(label("label", name, { for: id }), control);
        controls[name] = control;
        fieldset.append(wrap);
      }
      let inferenceSelect = null, output = null;
      if (kind === "ai_reviews") {
        inferenceSelect = el("select", { id: "care-ai-inference" });
        const inferenceField = el("div", { class: "care-field" });
        inferenceSelect.append(label("option", "latestInference", { value: "" }));
        inferenceField.append(label("label", "inferenceRun", { for: inferenceSelect.id }), inferenceSelect);
        output = el("div", { class: "care-ai-source", role: "status", "aria-live": "polite" });
        fieldset.append(inferenceField, output);
      }
      const actions = el("div", { class: "care-form-actions" });
      const saveButton = label("button", "save", { type: "submit", class: "button primary" });
      const cancel = label("button", "cancelProgress", { type: "button", class: "button secondary", hidden: true });
      actions.append(saveButton, cancel);
      fieldset.append(actions); form.append(fieldset); details.append(form);
      const historyHeading = label("h4", "history", { class: "care-history-heading" });
      const history = el("div", { class: "care-record-history" });
      card.append(details, historyHeading, history); grid.append(card);
      const editor = { kind, definition, card, details, form, fieldset, controls, history, previousId: null, progressNote, cancel, saveButton, inferenceSelect, output, inferences: [] };
      cancel.addEventListener("click", () => resetEditor(editor));
      if (controls.disposition) controls.disposition.addEventListener("change", () => { controls.screening_id.required = controls.disposition.value !== "independent"; });
      if (controls.screening_id) {
        controls.screening_id.addEventListener("change", loadInferences);
        inferenceSelect.addEventListener("change", renderInference);
      }
      if (controls.result_summary) {
        for (const field of [controls.status, controls.result_summary, controls.report_note]) field.addEventListener("input", () => controls.result_summary.setCustomValidity(""));
      }
      form.addEventListener("submit", event => submitRecord(event, editor));
      editors[kind] = editor;
      resetEditor(editor);
    }
    for (const [kind, definition] of Object.entries(definitions)) makeEditor(kind, definition);

    function renderInference() {
      const editor = editors.ai_reviews;
      editor.output.replaceChildren();
      if (!editor.controls.screening_id.value) return;
      const record = editor.inferences.find(row => String(row.inference_audit_id) === editor.inferenceSelect.value) || editor.inferences[0];
      if (!record) { editor.output.append(label("p", "noSavedOutput", { class: "care-form-help" })); return; }
      editor.output.append(label("h4", "savedOutput"), el("p", { class: "care-record-provenance" }, `${record.model || ""} · ${dateText(record.created_at)} · ${tr("inference")}: ${record.inference_audit_id}`));
      if (record.notice) editor.output.append(el("p", { class: "care-form-help" }, record.notice));
      appendInferenceWarning(editor.output, record);
      editor.output.append(el("pre", {}, record.text || tr("historicalOutput")));
    }
    async function loadInferences() {
      const editor = editors.ai_reviews, screeningId = editor.controls.screening_id.value;
      const ticket = ++inferenceSequence, owner = userKey();
      editor.inferences = [];
      editor.inferenceSelect.replaceChildren(label("option", "latestInference", { value: "" }));
      editor.output.textContent = "";
      if (!screeningId || !clinician()) return;
      editor.output.textContent = tr("loading");
      editor.saveButton.disabled = true;
      try {
        const data = await api(`/api/ai/results/${encodeURIComponent(screeningId)}`);
        if (ticket !== inferenceSequence || owner !== userKey() || screeningId !== editor.controls.screening_id.value) return;
        editor.inferences = Array.isArray(data.inferences) ? data.inferences : [];
        for (const row of editor.inferences) editor.inferenceSelect.append(el("option", { value: row.inference_audit_id }, `${dateText(row.created_at)} · ${row.model || "AI"} · #${row.inference_audit_id}`));
        if (editor.inferences[0]) editor.inferenceSelect.value = String(editor.inferences[0].inference_audit_id);
        renderInference();
      } catch (error) {
        if (ticket === inferenceSequence && owner === userKey()) editor.output.textContent = error.message;
      } finally { if (ticket === inferenceSequence) editor.saveButton.disabled = false; }
    }

    function populateScreenings() {
      const select = editors.ai_reviews.controls.screening_id;
      const oldValue = select.value;
      select.replaceChildren(label("option", "chooseScreening", { value: "" }));
      for (const screening of detail?.screenings || []) {
        select.append(el("option", { value: screening.id }, `${screening.location || tr("screening")} · ${dateText(screening.created_at)} · ${screening.id.slice(0, 8)}`));
      }
      if ([...select.options].some(option => option.value === oldValue)) select.value = oldValue;
    }
    function stageView() {
      stageList.replaceChildren();
      for (const key of ["screening", "clinical_review", "diagnostics", "treatment", "specialist"]) {
        const stage = journey?.stages?.[key];
        const item = el("li", { class: "care-stage" });
        item.append(label("b", key), el("span", { class: "care-stage-status" }, stage ? valueLabel(stage.status) : tr("unavailable")));
        if (stage && Number.isFinite(stage.count)) item.append(el("small", {}, `${tr("history")}: ${stage.count}`));
        if (stage?.stage) item.append(el("small", {}, valueLabel(stage.stage, "stage")));
        stageList.append(item);
      }
    }
    function appendFields(container, record, fields) {
      const list = el("dl", { class: "care-record-fields" });
      for (const key of fields) {
        if (record[key] == null || record[key] === "") continue;
        const item = el("div");
        const isDate = ["ordered_at", "next_review_date", "appointment_date", "due_date", "scheduled_at", "created_at"].includes(key);
        const value = isDate ? dateText(record[key]) : ["status", "stage", "test_type", "priority", "disposition"].includes(key) ? valueLabel(record[key], key) : String(record[key]);
        item.append(label("dt", key), el("dd", {}, value)); list.append(item);
      }
      container.append(list);
    }
    function beginProgress(editor, record) {
      if (!clinician() || saving || busy) return;
      resetEditor(editor);
      editor.previousId = record.id;
      for (const [key, control] of Object.entries(editor.controls)) control.value = key.endsWith("_date") || key === "ordered_at" ? (record[key] || "").slice(0, 10) : record[key] || "";
      editor.progressNote.hidden = false; editor.cancel.hidden = false; editor.details.open = true;
      editor.details.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const first = Object.values(editor.controls)[0]; first?.focus({ preventScroll: true });
    }
    function recordHistory(kind) {
      const editor = editors[kind];
      const records = Array.isArray(journey?.[kind]) ? journey[kind] : [];
      editor.history.replaceChildren();
      if (!records.length) { editor.history.append(label("p", "noRecords", { class: "care-empty" })); return; }
      const superseded = new Set(records.map(record => record.previous_id).filter(Boolean));
      for (const record of records) {
        const row = el("article", { class: "care-record-row" });
        const head = el("div", { class: "care-record-row-heading" });
        const title = kind === "diagnostics" ? valueLabel(record.test_type, "test_type") : kind === "treatments" ? valueLabel(record.stage, "stage") : kind === "escalations" ? record.specialty : valueLabel(record.disposition, "disposition");
        head.append(el("h4", {}, title), el("span", { class: "care-record-status" }, valueLabel(record.status || record.disposition, kind === "ai_reviews" ? "disposition" : "status")));
        row.append(head);
        appendFields(row, record, definitions[kind].fields.map(field => field[0]).filter(key => !["status", "test_type", "screening_id", "disposition"].includes(key)));
        if (record.screening_id) row.append(el("p", { class: "care-record-provenance" }, `${tr("screening")}: ${record.screening_id}`));
        if (record.inference_audit_id) row.append(el("p", { class: "care-record-provenance" }, `${tr("inference")}: ${record.inference_audit_id}`));
        if (kind === "ai_reviews" && record.inference) {
          const source = el("details", { class: "care-ai-source" });
          source.append(label("summary", "savedOutput"));
          if (record.inference.notice) source.append(el("p", { class: "care-form-help" }, record.inference.notice));
          appendInferenceWarning(source, record.inference);
          source.append(el("pre", {}, record.inference.text || tr("historicalOutput"))); row.append(source);
        } else if (kind === "ai_reviews" && record.source_status === "historical_text_unavailable") row.append(label("p", "historicalOutput", { class: "care-form-help" }));
        row.append(el("p", { class: "care-record-meta" }, `${tr("recordedBy")}: ${record.clinician_name || tr("unavailable")} · ${dateText(record.created_at)}`));
        if (kind !== "ai_reviews") {
          const older = superseded.has(record.id);
          const footer = el("div", { class: "care-record-row-footer" });
          footer.append(label("small", older ? "earlier" : "latest"));
          if (!older && clinician()) {
            const progress = label("button", "progress", { type: "button", class: "button secondary" });
            progress.disabled = busy || saving;
            progress.addEventListener("click", () => beginProgress(editor, record)); footer.append(progress);
          }
          row.append(footer);
        }
        editor.history.append(row);
      }
    }
    function renderRecords() {
      if (!detail || !journey) return;
      content.hidden = false; stageView(); populateScreenings();
      for (const kind of Object.keys(editors)) recordHistory(kind);
    }
    async function loadPatient(id) {
      const ticket = ++request, owner = userKey();
      const changingPatient = detail?.patient?.id !== id;
      selectedId = id;
      if (changingPatient) clearPatient();
      if (!id) { busy = false; setFeedback(patients.length ? "chooseHelp" : "noPatients"); updateAccess(); return; }
      busy = true; setFeedback("loading"); updateAccess();
      try {
        const [patientDetail, journeyData] = await Promise.all([api(`/api/patients/${encodeURIComponent(id)}`), api(`/api/patients/${encodeURIComponent(id)}/journey`)]);
        if (ticket !== request || owner !== userKey() || !online()) return;
        if (journeyData.patient_id !== id || patientDetail.patient?.id !== id) throw new Error(tr("unavailable"));
        detail = patientDetail; journey = journeyData;
        renderRecords(); feedback.textContent = "";
      } catch (error) {
        if (ticket === request && owner === userKey()) setFeedback(error.message, true, true);
      } finally { if (ticket === request) { busy = false; updateAccess(); } }
    }
    async function refresh(preferredId) {
      if (!online() || saving) return;
      const ticket = ++request, owner = userKey();
      busy = true; setFeedback("loading"); updateAccess();
      try {
        const data = await api("/api/patients");
        if (ticket !== request || owner !== userKey() || !online()) return;
        patients = Array.isArray(data.patients) ? data.patients : [];
        const prior = typeof preferredId === "string" ? preferredId : selectedId;
        patientSelect.replaceChildren(label("option", "choosePatient", { value: "" }));
        for (const patient of patients) patientSelect.append(el("option", { value: patient.id }, `${patient.patient_code} · ${patient.name}`));
        const nextId = patients.some(patient => patient.id === prior) ? prior : "";
        patientSelect.value = nextId;
        await loadPatient(nextId);
      } catch (error) {
        if (ticket === request && owner === userKey()) { busy = false; clearPatient(); setFeedback(error.message, true, true); updateAccess(); }
      }
    }
    async function submitRecord(event, editor) {
      event.preventDefault();
      if (!clinician() || !online() || !selectedId || saving || busy) return;
      if (editor.kind === "diagnostics" && editor.controls.status.value === "reported" && !editor.controls.result_summary.value.trim() && !editor.controls.report_note.value.trim()) {
        editor.controls.result_summary.setCustomValidity(tr("reportedRequired")); editor.controls.result_summary.reportValidity(); return;
      }
      const patientId = selectedId, owner = userKey(), saveTicket = ++saveSequence;
      const body = { patient_id: patientId };
      for (const [key, control] of Object.entries(editor.controls)) body[key] = control.value.trim();
      if (editor.previousId) body.previous_id = editor.previousId;
      if (editor.kind === "ai_reviews" && editor.inferenceSelect.value && body.disposition !== "independent") body.inference_audit_id = Number(editor.inferenceSelect.value);
      saving = true; setFeedback("saving"); updateAccess();
      try {
        await api(editor.definition.endpoint, { method: "POST", body: JSON.stringify(body) });
        if (saveTicket !== saveSequence || owner !== userKey() || !online()) return;
        resetEditor(editor);
        saving = false;
        await loadPatient(patientId);
        if (selectedId === patientId && journey) setFeedback("saved");
      } catch (error) {
        if (owner === userKey()) setFeedback(error.message, true, true);
      } finally { if (saveTicket === saveSequence) { saving = false; updateAccess(); } }
    }
    function reportSection(report, titleKey, records, fields) {
      const section = el("section", { class: "care-print-section" });
      section.append(label("h2", titleKey));
      if (!records?.length) section.append(label("p", "noRecords"));
      for (const record of records || []) {
        const article = el("article", { class: "care-print-entry" });
        appendFields(article, record, fields);
        if (record.clinician_name) article.append(el("p", {}, `${tr("recordedBy")}: ${record.clinician_name}`));
        if (record.inference_audit_id) article.append(el("p", {}, `${tr("inference")}: ${record.inference_audit_id}`));
        if (record.inference?.text) { article.append(label("h3", "savedOutput")); appendInferenceWarning(article, record.inference); article.append(el("pre", {}, record.inference.text)); }
        else if (record.source_status === "historical_text_unavailable") article.append(label("p", "historicalOutput"));
        section.append(article);
      }
      report.append(section);
    }
    function printSummary() {
      if (!detail || !journey || busy || !online() || !window.confirm(tr("printWarning"))) return;
      clearReport();
      const report = el("section", { id: "carePrintReport", class: "care-print-report", "aria-label": tr("reportTitle") });
      report.append(label("h1", "reportTitle"), el("p", {}, `${tr("generatedAt")}: ${dateText(new Date().toISOString())}`), label("p", "reportNotice"));
      appendFields(report, detail.patient, ["name", "patient_code", "age", "gender", "village", "district", "phone"]);
      report.append(label("h2", "historyLabel"), el("p", {}, detail.patient.history || tr("noValue")), label("h2", "symptoms"), el("p", {}, detail.patient.symptoms || tr("noValue")));
      reportSection(report, "screenings", detail.screenings, ["location", "duration", "notes", "worker", "status", "created_at"]);
      reportSection(report, "reviews", detail.reviews, ["reviewer", "status", "observations", "created_at"]);
      for (const kind of Object.keys(definitions)) reportSection(report, kind, journey[kind], [...definitions[kind].fields.map(field => field[0]).filter(key => key !== "screening_id"), "created_at"]);
      reportSection(report, "referrals", detail.referrals, ["facility", "department", "reason", "status", "appointment_date", "created_at"]);
      reportSection(report, "followups", detail.followups, ["notes", "status", "due_date", "created_at"]);
      if (detail.consultations) reportSection(report, "consultations", detail.consultations, ["status", "scheduled_at"]);
      document.body.append(report);
      window.print();
    }
    function translateLocal() {
      for (const node of panel.querySelectorAll("[data-care-i18n]")) node.textContent = tr(node.dataset.careI18n);
      if (detail && journey) renderRecords();
      else if (!busy) setFeedback(patients.length ? "chooseHelp" : "noPatients");
      renderInference();
    }
    function observeApp() {
      const nextAuth = online() ? userKey() : "";
      const active = online() && page.classList.contains("active");
      if (auth !== nextAuth) { auth = nextAuth; resetAll(); wasActive = false; }
      if (previousLanguage !== language()) { previousLanguage = language(); translateLocal(); }
      updateAccess();
      if (active && !wasActive) refresh();
      wasActive = active;
    }
    patientSelect.addEventListener("change", () => loadPatient(patientSelect.value));
    refreshButton.addEventListener("click", () => refresh());
    printButton.addEventListener("click", printSummary);
    window.addEventListener("afterprint", clearReport);
    const observer = new MutationObserver(observeApp);
    observer.observe(page, { attributes: true, attributeFilter: ["class"] });
    observer.observe(appView, { attributes: true, attributeFilter: ["hidden"] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    window.CareRecords = Object.freeze({
      refresh: () => refresh(),
      openPatient: async id => { if (!online()) return; selectedId = String(id); if (typeof goPage === "function") goPage("care"); await refresh(String(id)); }
    });
    resetAll(); observeApp();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
