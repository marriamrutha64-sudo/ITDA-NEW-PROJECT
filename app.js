const $ = (id) => document.getElementById(id);
const state = { user: null, page: "home", patients: [], language: localStorage.getItem("adLanguage") || "en", imageUrl: null, toastTimer: 0, consultationsConfigured: false, jitsiApi: null, jitsiScriptPromise: null, offlineMode: false, vaultOwner: null, syncErrors: {}, syncingDrafts: false };
Object.assign(state, {videoProvider:"private",callGeneration:0,activeConsultation:null});
state.callAudio={joined:false,muted:null,available:null,pending:false};

const translations = {
  en: { secureAccess:"SECURE ACCESS", signIn:"Sign in to your workspace", loginHelp:"Use your assigned account to access patient records.", username:"Username", password:"Password", localOnly:"Local demonstration. Do not enter real patient data until your deployment has been security-reviewed.", districtCare:"DISTRICT CARE", overview:"Overview", patients:"Patients", screening:"Oral screening", clinicalReview:"Clinical review", careCoordination:"Care coordination", connecting:"Connecting…", workspace:"Workspace", fieldWorkspace:"FIELD WORKSPACE", goodDay:"Good day", overviewSubtitle:"A clear view of patients moving through care.", registerPatient:"Register patient", researchNotice:"Research and screening support only", safetyCopy:"This application does not diagnose disease. A qualified clinician makes every clinical decision.", registeredPatients:"Registered patients", allRecords:"All records in this workspace", screeningsInQueue:"Screenings in queue", awaitingReview:"Awaiting clinical review", followUpsDue:"Follow-ups due", nextSevenDays:"Scheduled in the next 7 days", referralsOpen:"Open referrals", careInMotion:"Care coordination in motion", carePathway:"CARE PATHWAY", journeyTitle:"Patient journey", viewPatients:"View patients", registration:"Registration", identityHistory:"Identity and history", photoAssessment:"Photo and assessment", clinician:"Clinician", medicalReview:"Medical review", followUp:"Follow-up", continuityCare:"Continuity of care", journeyEmpty:"Register a patient to begin their care pathway.", modelReadiness:"MODEL READINESS", imageAnalysis:"Image analysis", notConfigured:"Not configured", modelCopy:"No validated model is installed. No predictions will be generated.", experimentalOnly:"Experimental research only", latestActivity:"LATEST ACTIVITY", recentPatients:"Recent patients", seeAll:"See all", patient:"PATIENT", patientId:"PATIENT ID", village:"VILLAGE", registered:"REGISTERED", noPatients:"No patients yet", noPatientsCopy:"Your registered patients will appear here.", registerFirst:"Register your first patient", careRecords:"CARE RECORDS", patientsSubtitle:"Register people and keep their care journey organized.", searchPatients:"Search patient name or ID", ageGender:"AGE / GENDER", patientsEmptyCopy:"Add a patient to start their screening and care record.", oralHealth:"ORAL HEALTH", screeningSubtitle:"Capture a photograph and document screening observations.", newScreening:"New screening", selectPatient:"Patient", healthWorker:"Health worker", areaObserved:"Area observed", selectArea:"Select area", symptomDuration:"Symptom duration", durationPlaceholder:"e.g. 2 weeks", screenNotes:"Screening notes", oralPhoto:"Oral photograph", photoQualityPrompt:"Choose a clear, well-lit image. Quality checks will appear here.", saveScreening:"Save screening", photoGuide:"PHOTO GUIDE", betterPhoto:"A better photo helps review", goodLight:"Use good light", goodLightCopy:"Bright, even light helps show the area clearly.", steadyFocus:"Hold steady and focus", steadyFocusCopy:"Keep the camera close enough to see details.", wholeArea:"Show the whole area", wholeAreaCopy:"Avoid fingers, shadows, blur and unrelated objects.", consentFirst:"Get consent first", consentCopy:"Explain the photograph and obtain patient consent.", noDiagnosis:"No automatic diagnosis", noDiagnosisCopy:"A qualified clinician must assess every finding. Image quality checks do not identify disease.", screeningRecords:"Screening records", clinicalOversight:"CLINICAL OVERSIGHT", reviewSubtitle:"Qualified medical officers document their independent assessment.", recordReview:"Record a review", medicalOfficer:"Medical officer", reviewStatus:"Review status", clinicalObservations:"Clinical observations", saveReview:"Save review", decisionSupport:"DECISION SUPPORT", clinicianAuthority:"Clinical decisions stay with the clinician", clinicianCopy:"This workspace records human review. It does not interpret images or recommend a diagnosis, biopsy, or treatment.", researchReminder:"Any experimental model output must be separately validated and must never replace professional judgment.", reviewRecords:"Review records", careSubtitle:"Track referrals, appointments and follow-up actions.", newReferral:"New referral", hospital:"Hospital / facility", department:"Department", referralReason:"Reason for referral", appointmentDate:"Appointment date", saveReferral:"Save referral", newFollowup:"Schedule follow-up", followupDate:"Follow-up date", followupNotes:"Notes", saveFollowup:"Schedule follow-up", careRecordsTitle:"Referrals and follow-ups", fullName:"Full name", age:"Age", gender:"Gender", mobile:"Mobile number", district:"District", medicalHistory:"Relevant medical history", currentSymptoms:"Current symptoms", consentRecord:"I confirm the patient has been informed about this record and consents to its use for this demonstration.", cancel:"Cancel", savePatient:"Save patient", localPrototype:"Local prototype • NOT FOR CLINICAL USE", noScreenings:"No screening records yet.", noReviews:"No clinical reviews recorded yet.", noCareRecords:"No referrals or follow-ups yet.", patientSaved:"Patient record saved.", screeningSaved:"Screening saved for clinician review.", reviewSaved:"Clinical review saved.", referralSaved:"Referral saved.", followupSaved:"Follow-up scheduled.", serverUnavailable:"Server unavailable. Your information was not confirmed as saved.", signInRequired:"Sign in to continue.", patientRequired:"Register a patient before continuing.", imageDimensions:"Image is too small to assess. Use a clear image at least 240 × 240 pixels.", imageNotUsable:"This file could not be read as a supported image.", imageReady:"Image format and dimensions look suitable. A person must still check focus, lighting and relevance.", imageCaution:"Image quality looks limited. Consider retaking it in better light and focus.", imageSizeLimit:"Choose an image smaller than 7 MB.", loadError:"Could not load this information.", serverOnline:"Local server connected", serverOffline:"Local server unavailable", syncing:"Loading workspace…", ageYears:"years", viewRecord:"Open", screeningCount:"screenings", reviewCount:"reviews", referralCount:"referrals", followupCount:"follow-ups", imageChecksOnly:"Format and dimensions checked • clinical quality needs a person’s review", signOut:"Sign out"
  },
  te: { secureAccess:"సురక్షిత ప్రవేశం", signIn:"మీ కార్యస్థలంలోకి ప్రవేశించండి", loginHelp:"రోగి వివరాలను చూడటానికి మీ ఖాతాను ఉపయోగించండి.", username:"వినియోగదారు పేరు", password:"పాస్‌వర్డ్", localOnly:"స్థానిక ప్రదర్శన. భద్రతా సమీక్ష పూర్తయ్యే వరకు నిజమైన రోగి వివరాలను నమోదు చేయవద్దు.", districtCare:"జిల్లా ఆరోగ్య సేవలు", overview:"సారాంశం", patients:"రోగులు", screening:"నోటి పరీక్ష", clinicalReview:"వైద్య సమీక్ష", careCoordination:"చికిత్స సమన్వయం", connecting:"కనెక్ట్ అవుతోంది…", workspace:"కార్యస్థలం", fieldWorkspace:"క్షేత్ర కార్యస్థలం", goodDay:"నమస్కారం", overviewSubtitle:"చికిత్స పొందుతున్న రోగుల స్పష్టమైన వివరాలు.", registerPatient:"రోగిని నమోదు చేయండి", researchNotice:"పరిశోధన మరియు పరీక్ష సహాయం మాత్రమే", safetyCopy:"ఈ అప్లికేషన్ వ్యాధిని నిర్ధారించదు. అన్ని వైద్య నిర్ణయాలను అర్హత కలిగిన వైద్యుడు తీసుకుంటారు.", registeredPatients:"నమోదైన రోగులు", allRecords:"ఈ కార్యస్థలంలోని అన్ని రికార్డులు", screeningsInQueue:"సమీక్ష కోసం పరీక్షలు", awaitingReview:"వైద్య సమీక్ష కోసం వేచి ఉన్నాయి", followUpsDue:"తదుపరి పరీక్షలు", nextSevenDays:"తదుపరి 7 రోజుల్లో షెడ్యూల్", referralsOpen:"తెరిచి ఉన్న రిఫరల్స్", careInMotion:"చికిత్స సమన్వయం కొనసాగుతోంది", carePathway:"చికిత్స మార్గం", journeyTitle:"రోగి ప్రయాణం", viewPatients:"రోగులను చూడండి", registration:"నమోదు", identityHistory:"వివరాలు మరియు చరిత్ర", photoAssessment:"ఫోటో మరియు పరీక్ష", clinician:"వైద్యుడు", medicalReview:"వైద్య సమీక్ష", followUp:"తదుపరి పరీక్ష", continuityCare:"నిరంతర చికిత్స", journeyEmpty:"చికిత్స మార్గాన్ని ప్రారంభించడానికి రోగిని నమోదు చేయండి.", modelReadiness:"మోడల్ స్థితి", imageAnalysis:"చిత్ర విశ్లేషణ", notConfigured:"అమర్చలేదు", modelCopy:"ధృవీకరించిన మోడల్ ఇన్‌స్టాల్ కాలేదు. అంచనాలు రూపొందించబడవు.", experimentalOnly:"ప్రయోగాత్మక పరిశోధన మాత్రమే", latestActivity:"ఇటీవలి కార్యాచరణ", recentPatients:"ఇటీవల నమోదు చేసిన రోగులు", seeAll:"అన్నీ చూడండి", patient:"రోగి", patientId:"రోగి సంఖ్య", village:"గ్రామం", registered:"నమోదు తేదీ", noPatients:"ఇంకా రోగులు లేరు", noPatientsCopy:"నమోదైన రోగులు ఇక్కడ కనిపిస్తారు.", registerFirst:"మొదటి రోగిని నమోదు చేయండి", careRecords:"చికిత్స రికార్డులు", patientsSubtitle:"రోగులను నమోదు చేసి వారి చికిత్స వివరాలను నిర్వహించండి.", searchPatients:"రోగి పేరు లేదా సంఖ్యతో వెతకండి", ageGender:"వయస్సు / లింగం", patientsEmptyCopy:"పరీక్ష మరియు చికిత్స రికార్డు ప్రారంభించడానికి రోగిని జోడించండి.", oralHealth:"నోటి ఆరోగ్యం", screeningSubtitle:"ఫోటో తీసి పరీక్ష వివరాలను నమోదు చేయండి.", newScreening:"కొత్త పరీక్ష", selectPatient:"రోగి", healthWorker:"ఆరోగ్య కార్యకర్త", areaObserved:"గమనించిన ప్రాంతం", selectArea:"ప్రాంతాన్ని ఎంచుకోండి", symptomDuration:"లక్షణాల వ్యవధి", durationPlaceholder:"ఉదా. 2 వారాలు", screenNotes:"పరీక్ష గమనికలు", oralPhoto:"నోటి ఫోటో", photoQualityPrompt:"స్పష్టమైన, వెలుతురు ఉన్న చిత్రాన్ని ఎంచుకోండి. నాణ్యత తనిఖీలు ఇక్కడ కనిపిస్తాయి.", saveScreening:"పరీక్షను సేవ్ చేయండి", photoGuide:"ఫోటో మార్గదర్శకం", betterPhoto:"మంచి ఫోటో సమీక్షకు సహాయపడుతుంది", goodLight:"మంచి వెలుతురు వాడండి", goodLightCopy:"ప్రకాశవంతమైన వెలుతురు ప్రాంతాన్ని స్పష్టంగా చూపిస్తుంది.", steadyFocus:"కెమెరాను స్థిరంగా ఉంచండి", steadyFocusCopy:"వివరాలు కనిపించేంత దగ్గరగా కెమెరాను ఉంచండి.", wholeArea:"మొత్తం ప్రాంతాన్ని చూపండి", wholeAreaCopy:"వేళ్లు, నీడలు, అస్పష్టత మరియు సంబంధం లేని వస్తువులను నివారించండి.", consentFirst:"ముందుగా సమ్మతి పొందండి", consentCopy:"ఫోటో గురించి వివరించి రోగి సమ్మతి పొందండి.", noDiagnosis:"ఆటోమేటిక్ నిర్ధారణ లేదు", noDiagnosisCopy:"ప్రతి ఫలితాన్ని అర్హత కలిగిన వైద్యుడు అంచనా వేయాలి. చిత్ర నాణ్యత తనిఖీ వ్యాధిని గుర్తించదు.", screeningRecords:"పరీక్ష రికార్డులు", clinicalOversight:"వైద్య పర్యవేక్షణ", reviewSubtitle:"వైద్య అధికారులు తమ స్వతంత్ర అంచనాను నమోదు చేస్తారు.", recordReview:"సమీక్షను నమోదు చేయండి", medicalOfficer:"వైద్య అధికారి", reviewStatus:"సమీక్ష స్థితి", clinicalObservations:"వైద్య పరిశీలనలు", saveReview:"సమీక్షను సేవ్ చేయండి", decisionSupport:"నిర్ణయ సహాయం", clinicianAuthority:"వైద్య నిర్ణయాలు వైద్యుడివే", clinicianCopy:"ఈ కార్యస్థలం మానవ సమీక్షను నమోదు చేస్తుంది. ఇది చిత్రాలను విశ్లేషించదు లేదా నిర్ధారణ, బయాప్సీ లేదా చికిత్సను సూచించదు.", researchReminder:"ప్రయోగాత్మక మోడల్ ఫలితాలు విడిగా ధృవీకరించాలి. అవి వైద్యుల తీర్పుకు బదులుగా ఉండకూడదు.", reviewRecords:"సమీక్ష రికార్డులు", careSubtitle:"రిఫరల్స్, అపాయింట్‌మెంట్లు మరియు తదుపరి చర్యలను ట్రాక్ చేయండి.", newReferral:"కొత్త రిఫరల్", hospital:"ఆసుపత్రి / కేంద్రం", department:"విభాగం", referralReason:"రిఫరల్ కారణం", appointmentDate:"అపాయింట్‌మెంట్ తేదీ", saveReferral:"రిఫరల్ సేవ్ చేయండి", newFollowup:"తదుపరి పరీక్ష షెడ్యూల్", followupDate:"తదుపరి పరీక్ష తేదీ", followupNotes:"గమనికలు", saveFollowup:"తదుపరి పరీక్ష షెడ్యూల్ చేయండి", careRecordsTitle:"రిఫరల్స్ మరియు తదుపరి పరీక్షలు", fullName:"పూర్తి పేరు", age:"వయస్సు", gender:"లింగం", mobile:"మొబైల్ నంబర్", district:"జిల్లా", medicalHistory:"సంబంధిత వైద్య చరిత్ర", currentSymptoms:"ప్రస్తుత లక్షణాలు", consentRecord:"ఈ ప్రదర్శన కోసం ఈ రికార్డు గురించి రోగికి వివరించామని, వారు సమ్మతించారని నిర్ధారిస్తున్నాను.", cancel:"రద్దు చేయండి", savePatient:"రోగి వివరాలను సేవ్ చేయండి", localPrototype:"స్థానిక నమూనా • వైద్య వినియోగానికి కాదు", noScreenings:"ఇంకా పరీక్ష రికార్డులు లేవు.", noReviews:"ఇంకా వైద్య సమీక్షలు లేవు.", noCareRecords:"ఇంకా రిఫరల్స్ లేదా తదుపరి పరీక్షలు లేవు.", patientSaved:"రోగి రికార్డు సేవ్ అయింది.", screeningSaved:"వైద్య సమీక్ష కోసం పరీక్ష సేవ్ అయింది.", reviewSaved:"వైద్య సమీక్ష సేవ్ అయింది.", referralSaved:"రిఫరల్ సేవ్ అయింది.", followupSaved:"తదుపరి పరీక్ష షెడ్యూల్ అయింది.", serverUnavailable:"సర్వర్ అందుబాటులో లేదు. మీ సమాచారం సేవ్ అయిందని నిర్ధారించలేకపోయాము.", signInRequired:"కొనసాగించడానికి ప్రవేశించండి.", patientRequired:"కొనసాగించడానికి ముందుగా రోగిని నమోదు చేయండి.", imageDimensions:"చిత్రం చాలా చిన్నది. కనీసం 240 × 240 పిక్సెల్స్ స్పష్టమైన చిత్రాన్ని ఉపయోగించండి.", imageNotUsable:"ఈ ఫైల్‌ను మద్దతు ఉన్న చిత్రంగా చదవలేకపోయాము.", imageReady:"చిత్ర ఫార్మాట్ మరియు పరిమాణం సరిపోతున్నాయి. స్పష్టత, వెలుతురు మరియు సందర్భాన్ని వ్యక్తి పరిశీలించాలి.", imageCaution:"చిత్ర నాణ్యత తక్కువగా ఉండవచ్చు. మెరుగైన వెలుతురు మరియు స్పష్టతతో మళ్లీ తీయండి.", imageSizeLimit:"7 MB కంటే చిన్న చిత్రాన్ని ఎంచుకోండి.", loadError:"వివరాలను లోడ్ చేయలేకపోయాము.", serverOnline:"స్థానిక సర్వర్ కనెక్ట్ అయింది", serverOffline:"స్థానిక సర్వర్ అందుబాటులో లేదు", syncing:"కార్యస్థలం లోడ్ అవుతోంది…", ageYears:"సంవత్సరాలు", viewRecord:"తెరవండి", screeningCount:"పరీక్షలు", reviewCount:"సమీక్షలు", referralCount:"రిఫరల్స్", followupCount:"తదుపరి పరీక్షలు", imageChecksOnly:"ఫార్మాట్ మరియు పరిమాణం తనిఖీ చేశాం • వైద్య నాణ్యతను వ్యక్తి పరిశీలించాలి", signOut:"బయటకు వెళ్లు"
  }
};

Object.assign(translations.en, {
  auditLog: "Audit log", systemActivity: "SYSTEM ACTIVITY",
  auditDescription: "Recent record activity metadata. Clinical details are not displayed here.",
  auditActor: "ACTOR", auditAction: "ACTION", auditEntityType: "TYPE",
  auditEntityId: "RECORD ID", auditTime: "TIME",
  auditEmpty: "No audit activity recorded yet."
});
Object.assign(translations.te, {
  auditLog: "కార్యకలాపాల లాగ్", systemActivity: "వ్యవస్థ కార్యాచరణ",
  auditDescription: "ఇటీవలి రికార్డు కార్యాచరణ వివరాలు. వైద్య వివరాలు ఇక్కడ చూపబడవు.",
  auditActor: "వినియోగదారు", auditAction: "చర్య", auditEntityType: "రకం",
  auditEntityId: "రికార్డు సంఖ్య", auditTime: "సమయం",
  auditEmpty: "ఇంకా ఆడిట్ కార్యాచరణ నమోదు కాలేదు."
});
Object.assign(translations.en, {
  patientRecord: "PATIENT RECORD", patientDetails: "Patient details", patientHistory: "Medical history",
  patientSymptoms: "Current symptoms", screeningRecords: "Screening records", reviewRecords: "Clinical reviews",
  referralRecords: "Referrals", followupRecords: "Follow-ups", noHistory: "No information recorded.",
  contact: "Contact", ageLabel: "Age", genderLabel: "Gender", districtLabel: "District", close: "Close",
  imageRequiresReview: "Screening photo · clinician assessment required; this is not an AI result."
});
Object.assign(translations.te, {
  patientRecord: "రోగి రికార్డు", patientDetails: "రోగి వివరాలు", patientHistory: "వైద్య చరిత్ర",
  patientSymptoms: "ప్రస్తుత లక్షణాలు", screeningRecords: "పరీక్ష రికార్డులు", reviewRecords: "వైద్య సమీక్షలు",
  referralRecords: "రిఫరల్స్", followupRecords: "తదుపరి పరీక్షలు", noHistory: "వివరాలు నమోదు కాలేదు.",
  contact: "సంప్రదింపు", ageLabel: "వయస్సు", genderLabel: "లింగం", districtLabel: "జిల్లా", close: "మూసివేయండి",
  imageRequiresReview: "పరీక్ష ఫోటో · వైద్యుని సమీక్ష అవసరం; ఇది AI ఫలితం కాదు."
});

const consultationLabels = { en: {
  consultations:"Consultations", consultationSubtitle:"Schedule a private video review with a clinician.", scheduleConsultation:"Schedule consultation", appointmentDateTime:"Appointment date and time", appointmentLength:"Appointment length", saveAppointment:"Save appointment", consultationPrivacyTitle:"A private room for each appointment", consultationPrivacyCopy:"Room names are random and contain no patient details. A clinician must start the call; recording controls are disabled in the meeting interface.", consultationGuestTitle:"Patient access", consultationGuestCopy:"Use the copy invitation link action to share a guest link through an approved channel. The patient waits in the Jitsi lobby until admitted.", consultationRecords:"Consultation appointments", consultationInProgress:"Consultation call", leaveCall:"Leave call", consultationNoRecord:"Recording is disabled. Do not discuss or display unrelated patient records.", jitsiConfigured:"Private Jitsi video is configured. Calls open only when a clinician chooses Join.", jitsiNotConfigured:"Video consultation is not configured. Add the private Jitsi domain and JWT credentials on the server to enable calls.", noConsultations:"No appointments scheduled yet.", joinCall:"Join call", copyPatientLink:"Copy patient link", cancelAppointment:"Cancel", invitationCopied:"Guest link copied. Share it through an approved channel.", invitationCopyError:"Could not copy the guest link on this device.", appointmentSaved:"Consultation appointment saved.", appointmentCancelled:"Appointment cancelled.", startingCall:"Connecting to private video…", appointmentStatus:"Appointment", joinCallError:"Could not start the consultation.", copyLinkError:"Could not create the patient link.", cancelConfirm:"Cancel this consultation appointment?", leaveCallConfirm:"Leave the video call?", callNotConfigured:"Video consultation is not configured.", activeCallTitle:"Consultation call", consultationStatusScheduled:"Scheduled", consultationStatusCompleted:"Completed", consultationStatusCancelled:"Cancelled"
} };
Object.assign(translations.en,{experimentalOnly:"No model installed"});
Object.assign(consultationLabels.en, {
  audioJoinFirst:"Join the meeting to check your microphone. Calls start muted; turn it on when ready to speak.",
  audioMuted:"Microphone muted — the patient cannot hear your speech. Turn it on when ready.",
  audioOn:"Microphone on. Check Jitsi’s input level while speaking; ask the patient to confirm they hear you.",
  audioUnavailable:"Microphone unavailable. Allow microphone access in the Jitsi tab and select the correct input under Settings → Devices.",
  audioUnknown:"Microphone status is unavailable. Check the microphone icon and input device inside Jitsi.",
  audioRequest:"Microphone activation requested. Check the Jitsi/browser permission prompt; waiting for Jitsi to confirm.",
  audioMicError:"Microphone access failed. Allow microphone permission in Jitsi and select the correct input device.",
  turnMicrophoneOn:"Turn microphone on",
  consultationNeedsPatient:"No patients are registered in this workspace. Register a patient before scheduling. Use synthetic details for the public video demo.",
  consultationSubtitle:"Schedule a video appointment with a clinician.",
  consultationPrivacyTitle:"A separate room for each appointment",
  consultationPrivacyCopy:"Room names contain no patient details. Public demo calls require the doctor to sign into Jitsi. Use synthetic cases only in public demo mode.",
  consultationGuestCopy:"Copy the room link and open it on the second participant’s device. The doctor starts the room and manages admission through Jitsi.",
  consultationNoRecord:"Recording controls are hidden here. End the meeting in Jitsi before marking the appointment completed. Public demo calls must use synthetic data only.",
  startingCall:"Loading the video service…",
  publicVideoDemo:"PUBLIC JITSI DEMO — synthetic cases only. The doctor must sign into Jitsi to start the room. Public-service terms apply. Previously shared room links remain usable outside this app.",
  acknowledgeVideoDemo:"This call uses the public meet.jit.si service. Use synthetic cases only. The doctor must sign into Jitsi. Continue?",
  callReady:"Video interface loaded. Start the room in Jitsi, sign in if asked, then invite the second participant.",
  callConnected:"Connected to the meeting. Use Jitsi controls to manage participants and media.",
  callPermissionError:"Camera or microphone could not be used. Check browser permissions and device selection; you can join muted.",
  callNetworkError:"The video connection failed. Check the network, leave the call and retry.",
  callScriptTimeout:"The video service did not load within 20 seconds. Check your network and retry.",
  completeAppointment:"Mark completed", completeConfirm:"Mark this appointment completed and leave your call? Other participants must leave Jitsi separately; copied room links are not revoked.",
  appointmentCompleted:"Appointment marked completed.", upcomingVideo:"Join opens 15 minutes before the appointment.", expiredVideo:"The appointment join window has closed.",
  invitationReady:"Invitation link ready. Open it on another browser or device for the guest.", openJitsiRoom:"Open Jitsi room / host sign-in"
});
Object.assign(translations.te,{experimentalOnly:"మోడల్ ఇన్‌స్టాల్ కాలేదు"});
const offlineLabels = { en: {
  offlinePassphrase:"Offline drafts passphrase", offlineLoginHelp:"On your first online health-worker sign-in, this creates the encrypted draft vault. Use the same passphrase to open drafts offline and unlock them for sync.", openOfflineDrafts:"Open offline drafts", offlineOnlyTitle:"Offline draft mode", offlineOnlyCopy:"Only new patient registrations can be drafted here. Existing records, reviews, follow-ups, consultations, and screening photos are unavailable offline. Sign in online and sync drafts soon; browser storage can be cleared.", offlineDraftsEyebrow:"ENCRYPTED ON THIS DEVICE", offlineDraftsTitle:"Patient registration drafts", syncDrafts:"Sync drafts now", offlineDraftSaved:"Patient registration saved as an encrypted draft on this device. It has not been sent to the server.", offlineDraftPending:"Waiting for authenticated sync", offlineNoDrafts:"No pending patient drafts.", offlineSyncSuccess:"Patient draft sync completed.", offlineSyncPartial:"Some drafts could not be synchronized. Review the messages below.", offlineSyncNetwork:"Connection was lost. Remaining drafts are still encrypted on this device.", offlineConflict:"Server rejected this draft. Review the reason before discarding it.", discardDraft:"Discard draft", confirmDiscardDraft:"Discard this unsynchronized patient draft from this device? This cannot be undone.", offlineNeedsUnlock:"Enter the offline drafts passphrase to open this vault.", offlineVaultCreated:"Encrypted offline draft vault is ready.", offlineVaultUnavailable:"Offline drafts could not be unlocked. Online sign-in is still available.", offlineOnlyWorker:"Offline draft mode is available only for a health-worker vault.", offlineRegistrationOnly:"This browser reports a connection. Sign in online to register, or reopen drafts when offline. Screening photos are not queued.", onlineOnlyScreenings:"Sync patient registrations before starting screenings. Screening photos currently require a live connection.", sessionExpiredDrafts:"Your session expired. Drafts remain encrypted; sign in again to sync.", serverUnavailableDraft:"Server unavailable. The draft remains encrypted on this device.", tooShortOfflinePassphrase:"Use an offline passphrase of at least 12 characters.", idempotencyConflict:"This operation ID is already linked to another payload.", draftSyncing:"Sending encrypted patient drafts…"
}, te: {
  offlinePassphrase:"ఆఫ్‌లైన్ డ్రాఫ్ట్ పాస్‌ఫ్రేజ్", openOfflineDrafts:"ఆఫ్‌లైన్ డ్రాఫ్ట్‌లను తెరవండి", offlineOnlyTitle:"ఆఫ్‌లైన్ డ్రాఫ్ట్ మోడ్", syncDrafts:"డ్రాఫ్ట్‌లను సింక్ చేయండి", offlineDraftsTitle:"రోగి నమోదు డ్రాఫ్ట్‌లు", discardDraft:"డ్రాఫ్ట్ తొలగించండి"
} };
function t(key) { return translations[state.language]?.[key] || consultationLabels[state.language]?.[key] || offlineLabels[state.language]?.[key] || translations.en[key] || consultationLabels.en[key] || offlineLabels.en[key] || key; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function dateLabel(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat(state.language === "te" ? "te-IN" : "en-IN", {day:"numeric",month:"short",year:"numeric"}).format(d); }
function dateTimeLabel(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(state.language === "te" ? "te-IN" : "en-IN", {day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d); }
function today() { return new Intl.DateTimeFormat(state.language === "te" ? "te-IN" : "en-IN", {weekday:"short",day:"numeric",month:"short"}).format(new Date()); }
function showToast(message) { const el=$("toast"); el.textContent=message; el.classList.add("visible"); clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.remove("visible"),2800); }

async function api(path, options={}) {
  let response;
  try { response=await fetch(path,{credentials:"same-origin",...options,headers:{...(options.body instanceof FormData?{}:{"Content-Type":"application/json"}),...(options.headers||{})}}); }
  catch { const error=new Error(t("serverUnavailable")); error.network=true; throw error; }
  const type=response.headers.get("content-type")||"";
  const data=type.includes("application/json")?await response.json():{};
  if (!response.ok) { if (response.status===401 && path!=="/api/login") showLogin(); const error=new Error(data.error||t("loadError")); error.status=response.status; throw error; }
  return data;
}
function showLogin() { if(window.OfflineVault) window.OfflineVault.lock(); state.user=null; state.offlineMode=false; state.vaultOwner=null; state.syncErrors={}; state.syncingDrafts=false; state.pendingPatientSubmission=null; $("appView").hidden=true; $("loginView").hidden=false; }
function vaultUnlockedForCurrentUser() { return Boolean(window.OfflineVault?.isUnlocked() && state.vaultOwner && state.user && state.vaultOwner===state.user.username.toLowerCase()); }
async function unlockOrCreateVault(username, passphrase) {
  if(!window.OfflineVault) throw new Error(t("offlineVaultUnavailable"));
  try { await window.OfflineVault.unlockVault(passphrase,username); }
  catch(error) {
    if(error.code!=="VAULT_NOT_FOUND") throw error;
    try { await window.OfflineVault.createVault(passphrase,username); }
    catch(createError) {
      if(createError.code!=="VAULT_EXISTS") throw createError;
      await window.OfflineVault.unlockVault(passphrase,username);
    }
  }
  state.vaultOwner=username;
}
function showApp(user, {offline=false}={}) {
  state.user=user; state.offlineMode=offline;
  $("loginView").hidden=true; $("appView").hidden=false;
  document.querySelectorAll("[data-admin-only]").forEach(el=>el.hidden=user.role!=="admin");
  const canConsult=user.role==="admin"||user.role==="medical_officer"||user.role==="specialist";
  document.querySelectorAll("[data-clinician-only]").forEach(el=>el.hidden=!canConsult);
  document.querySelectorAll("[data-page]").forEach(el=>{
    if(offline) el.hidden=el.dataset.page!=="patients";
    else if(el.hasAttribute("data-admin-only")) el.hidden=user.role!=="admin";
    else if(el.hasAttribute("data-clinician-only")) el.hidden=!canConsult;
    else el.hidden=false;
  });
  $("offlineOnlyNotice").hidden=!offline;
  const name=user.display_name||user.username;
  $("userLabel").textContent=name; $("welcomeName").textContent=name.split(" ")[0];
  $("userInitial").textContent=name.charAt(0).toUpperCase(); $("topInitial").textContent=name.charAt(0).toUpperCase();
  $("roleLabel").textContent=offline?"health worker · offline drafts only":user.role.replaceAll("_"," ");
  translate();
  if(offline) { $("syncIndicator").className="sync-indicator offline"; $("syncLabel").textContent=t("offlineDraftPending"); goPage("patients"); }
  else { state.page="home"; document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-home")); document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page==="home")); translate(); refreshAll().catch(err=>showToast(err.message)); if(vaultUnlockedForCurrentUser()) refreshOfflineDraftPanel().catch(err=>showToast(err.message)); }
}
function translate() { document.documentElement.lang=state.language; document.querySelectorAll("[data-i18n]").forEach(el=>{const val=t(el.dataset.i18n); if(val) el.textContent=val;}); document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder)); $("languageButton").innerHTML=(state.language==="en"?"తెలుగు":"English")+" <span>⌄</span>"; $("todayLabel").textContent=today(); $("pageTitle").textContent=t(({home:"overview",patients:"patients",screening:"screening",review:"clinicalReview",care:"careCoordination",consultations:"consultations",audit:"auditLog"})[state.page]); }
function goPage(page) { if(state.offlineMode&&page!=="patients") return; const canConsult=state.user?.role==="admin"||state.user?.role==="medical_officer"||state.user?.role==="specialist"; if(page==="audit"&&state.user?.role!=="admin") return; if(page==="consultations"&&!canConsult) return; if(state.page==="consultations"&&page!=="consultations") closeConsultationCall(); state.page=page; document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id===`page-${page}`)); document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page===page)); $("sidebar").classList.remove("open"); translate(); if(page==="home") loadDashboard(); if(page==="patients") loadPatients(); if(page==="screening") { loadPatients().then(()=>loadScreenings()); } if(page==="review") { loadPatients().then(()=>loadReviews()); } if(page==="care") { loadPatients().then(()=>loadCare()); } if(page==="consultations") { loadPatients().then(()=>loadConsultations()).catch(err=>showToast(err.message)); } if(page==="audit") loadAudit(); }
function openPatientDialog() { if(!$("patientDialog").open) $("patientDialog").showModal(); $("patientError").textContent=""; }

async function refreshAll() { if(state.offlineMode) return; $("syncLabel").textContent=t("syncing"); try { await api("/api/health"); $("syncIndicator").className="sync-indicator"; $("syncLabel").textContent=t("serverOnline"); await loadDashboard(); } catch { $("syncIndicator").className="sync-indicator offline"; $("syncLabel").textContent=t("serverOffline"); throw new Error(t("serverUnavailable")); } }
async function loadDashboard() { const data=await api("/api/dashboard"); $("metricPatients").textContent=data.patients; $("metricScreenings").textContent=data.screenings; $("metricFollowups").textContent=data.followups; $("metricReferrals").textContent=data.referrals; const has=data.patients>0; $("recentEmpty").hidden=has; $("journeyEmpty").hidden=has; $("recentPatientsBody").innerHTML=data.recent.map(p=>`<tr><td><div class="patient-cell"><span class="patient-initial">${escapeHtml(p.name[0]?.toUpperCase())}</span>${escapeHtml(p.name)}</div></td><td><span class="id-code">${escapeHtml(p.patient_code)}</span></td><td>${escapeHtml(p.village)}</td><td>${dateLabel(p.created_at)}</td><td><button class="row-action" data-open-patient="${escapeHtml(p.id)}">${t("viewRecord")} →</button></td></tr>`).join(""); }
async function loadPatients() { if(state.offlineMode) { state.patients=[]; $("patientRecordsPanel").hidden=true; renderPatients(); fillPatientSelects(); await refreshOfflineDraftPanel(); return {patients:[]}; } const data=await api("/api/patients"); state.patients=data.patients; $("patientRecordsPanel").hidden=false; renderPatients(); fillPatientSelects(); if(vaultUnlockedForCurrentUser()) await refreshOfflineDraftPanel(); return data; }
async function refreshOfflineDraftPanel() {
  const panel=$("offlineDraftPanel");
  if(!vaultUnlockedForCurrentUser()) { panel.hidden=true; return []; }
  const entries=await window.OfflineVault.listOperations();
  panel.hidden=false;
  $("offlineDraftCount").textContent=String(entries.length);
  const canSync=!state.offlineMode&&state.user?.role==="health_worker";
  $("syncDraftsButton").hidden=!canSync;
  $("syncDraftsButton").disabled=!canSync||state.syncingDrafts||entries.length===0;
  if(!entries.length) {
    $("offlineDraftList").innerHTML=`<div class="empty-state"><p>${t("offlineNoDrafts")}</p></div>`;
    $("offlineDraftStatus").textContent=t("offlineNoDrafts");
    return entries;
  }
  $("offlineDraftList").innerHTML=entries.map(({id,operation})=>{
    const patient=operation?.patient||{};
    const error=state.syncErrors[id];
    const discard=`<button type="button" class="text-button danger-text" data-discard-offline-draft="${escapeHtml(id)}">${t("discardDraft")}</button>`;
    return `<article class="record-row"><span class="record-bullet">♙</span><div class="record-copy"><b>${escapeHtml(patient.name||"Patient draft")}</b><p>${escapeHtml(patient.age||"")} ${t("ageYears")} · ${escapeHtml(patient.village||"")}</p><small class="record-meta">${escapeHtml(error||t("offlineDraftPending"))}</small>${discard}</div><span class="record-meta">${error?"Review":"Draft"}</span></article>`;
  }).join("");
  if(!state.offlineMode&&state.user?.role==="health_worker") $("offlineDraftStatus").textContent=t("offlineDraftPending");
  else $("offlineDraftStatus").textContent=t("offlineDraftSaved");
  return entries;
}
async function syncOfflineDrafts() {
  if(state.offlineMode||state.user?.role!=="health_worker"||!vaultUnlockedForCurrentUser()) return;
  try {
    const session=await api("/api/session");
    if(!session.authenticated||session.user?.username!==state.user.username) { showLogin(); $("loginError").textContent=t("sessionExpiredDrafts"); return; }
  } catch(error) { $("offlineDraftStatus").textContent=error.message; return; }
  let entries;
  try { entries=await window.OfflineVault.listOperations(); }
  catch(error) { $("offlineDraftStatus").textContent=error.message; return; }
  if(!entries.length) { await refreshOfflineDraftPanel(); return; }
  state.syncingDrafts=true;
  $("syncDraftsButton").disabled=true;
  $("offlineDraftStatus").textContent=t("draftSyncing");
  let sent=0, hadConflict=false, interrupted=false;
  for(const entry of entries) {
    try {
      const operation=entry.operation;
      if(operation?.type!=="patient-registration-v1"||!operation.patient) throw Object.assign(new Error("Unsupported offline draft format."),{status:400});
      const result=await api("/api/offline/patients",{
        method:"POST",
        headers:{"Idempotency-Key":entry.id},
        body:JSON.stringify(operation.patient)
      });
      if(result.operation_id!==entry.id) throw new Error("The server acknowledgement did not match this draft.");
      await window.OfflineVault.deleteAcknowledged(entry.id);
      delete state.syncErrors[entry.id];
      sent++;
    } catch(error) {
      if(!state.user) return;
      if(error.network||!error.status||error.status>=500) { interrupted=true; break; }
      if(error.status===409||error.status===400||error.status===403) {
        state.syncErrors[entry.id]=error.message;
        hadConflict=true;
        continue;
      }
      interrupted=true;
      break;
    }
  }
  state.syncingDrafts=false;
  if(!state.user) return;
  try { await refreshOfflineDraftPanel(); } catch(error) { $("offlineDraftStatus").textContent=error.message; return; }
  if(interrupted) $("offlineDraftStatus").textContent=t("offlineSyncNetwork");
  else if(hadConflict) $("offlineDraftStatus").textContent=t("offlineSyncPartial");
  else $("offlineDraftStatus").textContent=sent?`${sent} ${t("offlineSyncSuccess")}`:t("offlineNoDrafts");
  if(sent) { await loadPatients(); await loadDashboard(); }
}
async function discardOfflineDraft(id) {
  if(!vaultUnlockedForCurrentUser()) return;
  if(!window.confirm(t("confirmDiscardDraft"))) return;
  try { await window.OfflineVault.discardOperation(id); delete state.syncErrors[id]; await refreshOfflineDraftPanel(); }
  catch(error) { $("offlineDraftStatus").textContent=error.message; }
}
function patientRow(p) { return `<tr><td><div class="patient-cell"><span class="patient-initial">${escapeHtml(p.name[0]?.toUpperCase())}</span>${escapeHtml(p.name)}</div></td><td><span class="id-code">${escapeHtml(p.patient_code)}</span></td><td>${escapeHtml(p.age)} ${t("ageYears")} / ${escapeHtml(p.gender||"—")}</td><td>${escapeHtml(p.village)}</td><td>${dateLabel(p.created_at)}</td><td><button class="row-action" data-open-patient="${escapeHtml(p.id)}">${t("viewRecord")} →</button></td></tr>`; }
function renderPatients() { const term=$("patientSearch").value.trim().toLowerCase(); const rows=state.patients.filter(p=>`${p.name} ${p.patient_code} ${p.village}`.toLowerCase().includes(term)); $("patientCount").textContent=`${rows.length} / ${state.patients.length}`; $("patientsBody").innerHTML=rows.map(patientRow).join(""); $("patientsEmpty").hidden=state.patients.length>0; }
function fillPatientSelects() { for(const id of ["screenPatient","reviewPatient","referralPatient","followPatient","consultPatient"]) { const sel=$(id), previous=sel.value; sel.innerHTML=`<option value="">${t("selectPatient")}</option>`+state.patients.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.patient_code)} · ${escapeHtml(p.name)}</option>`).join(""); if(state.patients.some(p=>p.id===previous)) sel.value=previous; } $("consultationEmptyPatients").hidden=state.patients.length>0; $("consultationSaveButton").disabled=state.patients.length===0; }
async function loadScreenings() { const data=await api("/api/screenings"); const el=$("screeningList"); el.innerHTML=data.screenings.length?data.screenings.map(s=>`<div class="record-row"><span class="record-bullet">◎</span><div class="record-copy"><b>${escapeHtml(s.patient_name)} <span class="id-code">${escapeHtml(s.patient_code)}</span></b><p>${escapeHtml(s.location||"Oral image captured")} · ${escapeHtml(s.status)} · ${s.image_width}×${s.image_height}</p><figure><a href="/api/images/${encodeURIComponent(s.id)}" target="_blank" rel="noopener noreferrer">Open protected screening photo</a><img class="image-preview" src="/api/images/${encodeURIComponent(s.id)}" alt="Screening photograph for ${escapeHtml(s.patient_name)}. Clinician review required; this is not an AI result." loading="lazy"><figcaption class="record-meta">Screening photograph · requires clinician assessment; no diagnosis is shown.</figcaption></figure></div><span class="record-meta">${dateLabel(s.created_at)}</span></div>`).join(""):`<div class="empty-state"><p>${t("noScreenings")}</p></div>`; }
async function loadReviews() { const data=await api("/api/reviews"); const el=$("reviewList"); el.innerHTML=data.reviews.length?data.reviews.map(r=>`<div class="record-row"><span class="record-bullet">▤</span><div class="record-copy"><b>${escapeHtml(r.patient_name)} <span class="id-code">${escapeHtml(r.patient_code)}</span></b><p>${escapeHtml(r.status)} · ${escapeHtml(r.reviewer)} · ${escapeHtml(r.observations)}</p></div><span class="record-meta">${dateLabel(r.created_at)}</span></div>`).join(""):`<div class="empty-state"><p>${t("noReviews")}</p></div>`; }
async function loadCare() { const data=await api("/api/care"); const all=[...data.referrals.map(x=>({...x,kind:"referral",detail:`${x.facility} · ${x.department} · ${x.status}`})),...data.followups.map(x=>({...x,kind:"followup",detail:`${t("followUp")} · ${x.status} · ${x.notes}`}))].sort((a,b)=>String(b.created_at||b.due_date).localeCompare(String(a.created_at||a.due_date))); $("careList").innerHTML=all.length?all.map(r=>`<div class="record-row"><span class="record-bullet">${r.kind==="referral"?"↗":"◷"}</span><div class="record-copy"><b>${escapeHtml(r.patient_name)} <span class="id-code">${escapeHtml(r.patient_code)}</span></b><p>${escapeHtml(r.detail)}${r.reason?` · ${escapeHtml(r.reason)}`:""}</p></div><span class="record-meta">${dateLabel(r.due_date||r.created_at)}</span></div>`).join(""):`<div class="empty-state"><p>${t("noCareRecords")}</p></div>`; }
async function loadConsultations() {
  const data=await api("/api/consultations");
  state.consultationsConfigured=Boolean(data.configured);
  state.videoProvider=data.provider||"private";
  const notice=$("consultationStatusNotice");
  notice.classList.toggle("not-configured",!state.consultationsConfigured);
  notice.textContent=state.videoProvider==="public_demo"?t("publicVideoDemo"):(state.consultationsConfigured?t("jitsiConfigured"):t("jitsiNotConfigured"));
  const records=data.consultations||[];
  $("consultationCount").textContent=String(records.length);
  if(!records.length) { $("consultationList").innerHTML=`<div class="empty-state"><p>${t("noConsultations")}</p></div>`; return; }
  $("consultationList").innerHTML=records.map(item=>{
    const statusLabel=t(`consultationStatus${item.status.charAt(0).toUpperCase()+item.status.slice(1)}`);
    const enabled=state.consultationsConfigured&&item.can_join;
    const windowNotice=item.access_state==="upcoming"?t("upcomingVideo"):(item.access_state==="expired"?t("expiredVideo"):"");
    const actions=item.status==="scheduled"?`<p class="muted">${escapeHtml(windowNotice)}</p><div class="consultation-actions"><button class="button primary" type="button" data-join-consultation="${escapeHtml(item.id)}" ${enabled?"":"disabled"}>${t("joinCall")}</button><button class="button secondary" type="button" data-copy-consultation-link="${escapeHtml(item.id)}" ${enabled?"":"disabled"}>${t("copyPatientLink")}</button><button class="button secondary" type="button" data-complete-consultation="${escapeHtml(item.id)}">${t("completeAppointment")}</button><button class="text-button danger-text" type="button" data-cancel-consultation="${escapeHtml(item.id)}">${t("cancelAppointment")}</button></div>`:"";
    return `<article class="consultation-record"><div class="consultation-record-main"><div><b>${escapeHtml(item.patient_name)} <span class="id-code">${escapeHtml(item.patient_code)}</span></b><p>${dateTimeLabel(item.scheduled_at)} · ${escapeHtml(item.duration_minutes)} ${t("appointmentLength").toLowerCase()}</p></div><span class="status-pill status-${escapeHtml(item.status)}">${escapeHtml(statusLabel)}</span></div>${actions}</article>`;
  }).join("");
}
async function createConsultation(event) {
  event.preventDefault(); $("consultationFormError").textContent="";
  const form=event.currentTarget;
  const startsAt=new Date($("consultationTime").value);
  if(!Number.isFinite(startsAt.getTime())) { $("consultationFormError").textContent=t("appointmentDateTime"); return; }
  const body={patient_id:$("consultPatient").value,scheduled_at:startsAt.toISOString(),duration_minutes:Number($("consultationDuration").value)};
  const button=form.querySelector("button[type=submit]");
  if(button.disabled) return;
  button.disabled=true;
  try { await api("/api/consultations",{method:"POST",body:JSON.stringify(body)}); form.reset(); $("consultationDuration").value="30"; showToast(t("appointmentSaved")); await loadPatients(); await loadConsultations(); }
  catch(err) { $("consultationFormError").textContent=err.message; }
  finally { button.disabled=false; }
}
async function loadJitsiApi(domain) {
  if(window.JitsiMeetExternalAPI) return;
  if(state.jitsiScriptPromise) return state.jitsiScriptPromise;
  state.jitsiScriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script"); script.src=`https://${domain}/external_api.js`; script.async=true;
    const timer=setTimeout(()=>{script.remove();reject(new Error(t("callScriptTimeout")));},20000);
    script.onload=()=>{clearTimeout(timer);window.JitsiMeetExternalAPI?resolve():reject(new Error(t("joinCallError")));};
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error(t("joinCallError")));};
    document.head.appendChild(script);
  });
  try { await state.jitsiScriptPromise; } catch(err) { state.jitsiScriptPromise=null; throw err; }
}
async function joinConsultation(id) {
  if(state.videoProvider==="public_demo"&&!window.confirm(t("acknowledgeVideoDemo"))) return;
  closeConsultationCall();
  const generation=state.callGeneration;
  state.activeConsultation=id;
  const panel=$("consultationCallPanel"); panel.hidden=false;
  $("consultationCallState").textContent=t("startingCall");
  document.querySelectorAll("[data-join-consultation]").forEach(button=>button.disabled=true);
  $("jitsiFrame").innerHTML=`<div class="empty-state"><p>${t("startingCall")}</p></div>`;
  try {
    const data=await api(`/api/consultations/${encodeURIComponent(id)}/join`,{method:"POST",body:JSON.stringify({acknowledge_demo:state.videoProvider==="public_demo"})});
    if(generation!==state.callGeneration||state.page!=="consultations"||!state.user) return;
    const externalLink=$("consultationExternalLink"); externalLink.hidden=data.provider!=="public_demo";
    if(data.provider==="public_demo") externalLink.href=`https://${data.domain}/${encodeURIComponent(data.room_name)}`;
    await loadJitsiApi(data.domain);
    if(generation!==state.callGeneration||state.page!=="consultations"||!state.user) return;
    $("jitsiFrame").replaceChildren();
    const external=new window.JitsiMeetExternalAPI(data.domain,{
      roomName:data.room_name,
      parentNode:$("jitsiFrame"),
      jwt:data.jwt,
      userInfo:{displayName:"Clinician"},
      configOverwrite:{
        startSilent:false,
        startWithAudioMuted:true,
        startWithVideoMuted:true,
        prejoinConfig:{enabled:true},
        recordings:{enabled:false,sharingEnabled:false},
        recordingService:{enabled:false,sharingEnabled:false},
        fileRecordingsServiceEnabled:false,
        fileRecordingsServiceSharingEnabled:false,
        localRecording:{disable:true,disableSelfRecording:true},
        liveStreaming:{enabled:false},
        toolbarButtons:["microphone","camera","chat","participants-pane","hangup","fullscreen","tileview","settings","security","raisehand","videoquality"]
      }
    });
    state.jitsiApi=external;
    $("consultationCallState").textContent=t("callReady");
    renderConsultationAudio();
    const currentEvent=(callback)=>(...args)=>{if(state.jitsiApi===external&&generation===state.callGeneration)return callback(...args);};
    external.addListener("videoConferenceJoined",currentEvent(()=>{state.callAudio.joined=true;$("consultationCallState").textContent=t("callConnected");return refreshConsultationAudio(external,generation);}));
    external.addListener("audioMuteStatusChanged",currentEvent(({muted})=>{if(typeof muted!=="boolean")return;state.callAudio.muteRevision=(state.callAudio.muteRevision||0)+1;state.callAudio.muted=muted;state.callAudio.activationRequested=false;if(!muted)state.callAudio.error=false;renderConsultationAudio();}));
    external.addListener("audioAvailabilityChanged",currentEvent(({available})=>{if(typeof available!=="boolean")return;state.callAudio.availabilityRevision=(state.callAudio.availabilityRevision||0)+1;state.callAudio.available=available;if(available)state.callAudio.error=false;renderConsultationAudio();}));
    external.addListener("micError",currentEvent(()=>{state.callAudio.availabilityRevision=(state.callAudio.availabilityRevision||0)+1;state.callAudio.available=false;state.callAudio.error=true;state.callAudio.activationRequested=false;$("consultationCallState").textContent=t("audioMicError");renderConsultationAudio();}));
    external.addListener("cameraError",currentEvent(()=>{$("consultationCallState").textContent=t("callPermissionError");}));
    for(const event of ["errorOccurred","peerConnectionFailure"]) external.addListener(event,currentEvent(()=>{$("consultationCallState").textContent=t("callNetworkError");}));
    external.addListener("videoConferenceLeft",currentEvent(()=>closeConsultationCall(false)));
  } catch(err) {
    if(generation===state.callGeneration) { panel.hidden=false; $("jitsiFrame").replaceChildren(); $("consultationCallState").textContent=err.message||t("joinCallError"); showToast(err.message||t("joinCallError")); }
  } finally {
    if(state.page==="consultations"&&state.user) loadConsultations().catch(()=>{});
  }
}
function renderConsultationAudio() {
  const audio=state.callAudio;
  let message="audioUnknown";
  if(!audio.joined)message="audioJoinFirst";
  else if(audio.pending||audio.activationRequested)message="audioRequest";
  else if(audio.muted===true)message="audioMuted";
  else if(audio.muted===false)message="audioOn";
  if(audio.available===false)message="audioUnavailable";
  if(audio.error)message="audioMicError";
  $("consultationMicrophoneStatus").textContent=state.jitsiApi?t(message):"";
  $("consultationUnmuteButton").disabled=!state.jitsiApi||!audio.joined||audio.pending||audio.activationRequested||audio.available===false||audio.muted!==true;
}
async function refreshConsultationAudio(external,generation) {
  const audio=state.callAudio, muteRevision=audio.muteRevision||0, availabilityRevision=audio.availabilityRevision||0;
  const read=name=>{try{return Promise.resolve(external[name]());}catch(error){return Promise.reject(error);}};
  const results=await Promise.allSettled([read("isAudioMuted"),read("isAudioAvailable")]);
  if(state.jitsiApi!==external||generation!==state.callGeneration||state.callAudio!==audio)return;
  if((audio.muteRevision||0)===muteRevision)audio.muted=results[0].status==="fulfilled"&&typeof results[0].value==="boolean"?results[0].value:null;
  if((audio.availabilityRevision||0)===availabilityRevision){audio.available=results[1].status==="fulfilled"&&typeof results[1].value==="boolean"?results[1].value:null;if(audio.available===true)audio.error=false;}
  renderConsultationAudio();
}
async function turnConsultationMicrophoneOn() {
  const external=state.jitsiApi, generation=state.callGeneration, audio=state.callAudio;
  if(!external||!audio.joined||audio.pending||audio.activationRequested||audio.available===false)return;
  const muteRevision=audio.muteRevision||0;
  audio.pending=true;renderConsultationAudio();
  try {
    const muted=await external.isAudioMuted();
    if(state.jitsiApi!==external||state.callGeneration!==generation||state.callAudio!==audio)return;
    if((audio.muteRevision||0)!==muteRevision)return;
    if(muted===true&&audio.available!==false) {
      audio.activationRequested=true;
      external.executeCommand("toggleAudio");
      audio.requestTimer=setTimeout(()=>{if(state.jitsiApi===external&&state.callGeneration===generation&&state.callAudio===audio){audio.activationRequested=false;renderConsultationAudio();}},5000);
    } else if(muted===false) audio.muted=false;
  } catch(error) {
    if(state.jitsiApi===external&&state.callGeneration===generation){audio.error=true;audio.activationRequested=false;}
  } finally {
    if(state.jitsiApi===external&&state.callGeneration===generation&&state.callAudio===audio){audio.pending=false;renderConsultationAudio();}
  }
}
function closeConsultationCall(leave=true) {
  state.callGeneration++; state.activeConsultation=null;
  if(state.callAudio.requestTimer)clearTimeout(state.callAudio.requestTimer);
  state.callAudio={joined:false,muted:null,available:null,pending:false};
  const external=state.jitsiApi; state.jitsiApi=null;
  if(external) {
    if(leave) { try { external.executeCommand("hangup"); } catch {} }
    try { external.dispose(); } catch {}
  }
  const panel=$("consultationCallPanel"); if(panel) panel.hidden=true;
  const frame=$("jitsiFrame"); if(frame) frame.replaceChildren();
  const externalLink=$("consultationExternalLink"); if(externalLink) {externalLink.hidden=true;externalLink.removeAttribute("href");}
  renderConsultationAudio();
}
async function copyConsultationLink(id) {
  if(state.videoProvider==="public_demo"&&!window.confirm(t("acknowledgeVideoDemo"))) return;
  try {
    const data=await api(`/api/consultations/${encodeURIComponent(id)}/invite`,{method:"POST",body:JSON.stringify({acknowledge_demo:state.videoProvider==="public_demo"})});
    const guestUrl=data.provider==="public_demo"?data.guest_url.split("#")[0]+"#config.startSilent=false&config.startWithAudioMuted=true":data.guest_url;
    $("consultationInvitePanel").hidden=false; $("consultationInviteLink").value=guestUrl;
    try {await navigator.clipboard.writeText(guestUrl);showToast(t("invitationCopied"));}
    catch {showToast(t("invitationReady"));}
  } catch(err) { showToast(err.message||t("invitationCopyError")); }
}
async function cancelConsultation(id) {
  if(!window.confirm(t("cancelConfirm"))) return;
  try { await api(`/api/consultations/${encodeURIComponent(id)}/cancel`,{method:"POST",body:"{}"}); if(state.activeConsultation===id) closeConsultationCall(); $("consultationInvitePanel").hidden=true; showToast(t("appointmentCancelled")); await loadConsultations(); }
  catch(err) { showToast(err.message); }
}
async function completeConsultation(id) {
  if(!window.confirm(t("completeConfirm"))) return;
  try {await api(`/api/consultations/${encodeURIComponent(id)}/complete`,{method:"POST",body:"{}"});if(state.activeConsultation===id)closeConsultationCall();$("consultationInvitePanel").hidden=true;showToast(t("appointmentCompleted"));await loadConsultations();}
  catch(err) {showToast(err.message);}
}
async function loadAudit() { if(state.user?.role!=="admin") return; const data=await api("/api/audit"); const records=data.records||[]; $("auditEmpty").hidden=records.length>0; $("auditBody").innerHTML=records.map(r=>`<tr><td>${escapeHtml(r.actor_name)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.entity_type)}</td><td><span class="id-code">${escapeHtml(r.entity_id)}</span></td><td>${escapeHtml(dateTimeLabel(r.created_at))}</td></tr>`).join(""); }
async function openPatientRecord(id) {
  try {
    const data=await api(`/api/patients/${encodeURIComponent(id)}`); const p=data.patient;
    $("recordPatientName").textContent=p.name; $("recordPatientCode").textContent=p.patient_code;
    const section=(title,content)=>`<section class="record-detail-section"><h3>${escapeHtml(title)}</h3>${content||`<p class="muted">${t("noHistory")}</p>`}</section>`;
    const screenings=(data.screenings||[]).map(s=>`<article class="record-detail-item"><div><b>${escapeHtml(s.location||t("screening"))} · ${escapeHtml(s.status)}</b><p>${escapeHtml(s.duration||"")} ${escapeHtml(s.notes||"")}</p><a class="row-action" href="/api/images/${encodeURIComponent(s.id)}" target="_blank" rel="noopener noreferrer">${t("viewRecord")} ↗</a><img class="image-preview" src="/api/images/${encodeURIComponent(s.id)}" alt="Screening photo. Clinician assessment is required; this is not an AI result." loading="lazy"><small class="muted">${t("imageRequiresReview")}</small></div><time>${dateLabel(s.created_at)}</time></article>`).join("");
    const reviews=(data.reviews||[]).map(r=>`<article class="record-detail-item"><div><b>${escapeHtml(r.status)} · ${escapeHtml(r.reviewer)}</b><p>${escapeHtml(r.observations)}</p></div><time>${dateLabel(r.created_at)}</time></article>`).join("");
    const referrals=(data.referrals||[]).map(r=>`<article class="record-detail-item"><div><b>${escapeHtml(r.facility)} · ${escapeHtml(r.status)}</b><p>${escapeHtml(r.department)} ${escapeHtml(r.reason)}</p></div><time>${dateLabel(r.appointment_date||r.created_at)}</time></article>`).join("");
    const followups=(data.followups||[]).map(r=>`<article class="record-detail-item"><div><b>${escapeHtml(r.status)}</b><p>${escapeHtml(r.notes)}</p></div><time>${dateLabel(r.due_date)}</time></article>`).join("");
    $("patientRecordContent").innerHTML=`<div class="record-facts"><div><small>${t("ageLabel")}</small><b>${escapeHtml(p.age)} ${t("ageYears")}</b></div><div><small>${t("genderLabel")}</small><b>${escapeHtml(p.gender||"—")}</b></div><div><small>${t("village")}</small><b>${escapeHtml(p.village)}</b></div><div><small>${t("districtLabel")}</small><b>${escapeHtml(p.district||"—")}</b></div><div><small>${t("contact")}</small><b>${escapeHtml(p.phone||"—")}</b></div><div><small>${t("registered")}</small><b>${dateLabel(p.created_at)}</b></div></div>${section(t("patientHistory"),`<p class="record-long-text">${escapeHtml(p.history||"")||t("noHistory")}</p>`)}${section(t("patientSymptoms"),`<p class="record-long-text">${escapeHtml(p.symptoms||"")||t("noHistory")}</p>`)}${section(t("screeningRecords"),screenings)}${section(t("reviewRecords"),reviews)}${section(t("referralRecords"),referrals)}${section(t("followupRecords"),followups)}`;
    $("patientRecordDialog").showModal();
  } catch(err) { showToast(err.message); }
}

function newOperationId() { return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join(""); }
async function handleLogin(event) {
  event.preventDefault(); $("loginError").textContent="";
  const form=event.currentTarget, button=form.querySelector('[type="submit"]');
  const username=$("username").value.trim().toLowerCase(), password=$("password").value, passphrase=$("offlinePassphrase").value;
  button.disabled=true;
  try {
    if(!password) throw new Error("Enter your account password, or use Open offline drafts.");
    const result=await api("/api/login",{method:"POST",body:JSON.stringify({username,password})});
    if(window.OfflineVault) window.OfflineVault.lock();
    state.vaultOwner=null;
    let vaultError=null;
    if(result.user.role==="health_worker"&&passphrase) {
      try { await unlockOrCreateVault(result.user.username.toLowerCase(),passphrase); }
      catch(error) { if(window.OfflineVault) window.OfflineVault.lock(); state.vaultOwner=null; vaultError=error.message; }
    }
    state.pendingPatientSubmission=null;
    form.reset();
    showApp(result.user);
    if(vaultError) showToast(`${t("offlineVaultUnavailable")} ${vaultError}`);
  } catch(error) {
    $("loginError").textContent=error.message;
  } finally { button.disabled=false; }
}
async function openOfflineDraftMode() {
  $("loginError").textContent="";
  const username=$("username").value.trim().toLowerCase(), passphrase=$("offlinePassphrase").value;
  if(!username||!passphrase) { $("loginError").textContent=t("offlineNeedsUnlock"); return; }
  try {
    await window.OfflineVault.unlockVault(passphrase,username);
    state.vaultOwner=username;
    state.pendingPatientSubmission=null;
    $("loginForm").reset();
    showApp({username,display_name:username,role:"health_worker"},{offline:true});
  } catch(error) { $("loginError").textContent=error.code==="VAULT_NOT_FOUND"?t("offlineVaultUnavailable"):error.message; }
}
async function submitPatient(event) {
  event.preventDefault(); $("patientError").textContent=""; const f=event.currentTarget;
  const body={name:$("patientName").value.trim(),age:Number($("age").value),gender:$("gender").value,phone:$("mobile").value.trim(),village:$("village").value.trim(),district:$("district").value.trim(),history:$("history").value.trim(),symptoms:$("symptoms").value.trim(),consent:$("consent").checked};
  try {
    if(state.offlineMode||navigator.onLine===false) {
      if(state.user?.role!=="health_worker"||!vaultUnlockedForCurrentUser()) throw new Error(t("offlineVaultUnavailable"));
      await window.OfflineVault.putOperation({type:"patient-registration-v1",patient:body});
      f.reset(); $("district").value="Alluri Sitharama Raju"; $("patientDialog").close(); await loadPatients(); showToast(t("offlineDraftSaved")); return;
    }
    if(state.offlineMode) throw new Error(t("offlineRegistrationOnly"));
    let result;
    if(state.user?.role==="health_worker") {
      const serialized=JSON.stringify(body);
      if(!state.pendingPatientSubmission||state.pendingPatientSubmission.serialized!==serialized) state.pendingPatientSubmission={serialized,id:newOperationId()};
      result=await api("/api/offline/patients",{method:"POST",headers:{"Idempotency-Key":state.pendingPatientSubmission.id},body:serialized});
    } else result=await api("/api/patients",{method:"POST",body:JSON.stringify(body)});
    state.pendingPatientSubmission=null;
    f.reset(); $("district").value="Alluri Sitharama Raju"; $("patientDialog").close(); await loadPatients(); if(state.page==="consultations") $("consultPatient").value=result.patient.id; await loadDashboard(); showToast(`${t("patientSaved")} ${result.patient.patient_code}`);
  }
  catch(err) { $("patientError").textContent=err.message; }
}
async function qualityCheck(file) {
  const box=$("qualityResult"); box.className="quality-result"; box.innerHTML=`<span class="quality-icon">◌</span><span>${escapeHtml(t("photoQualityPrompt"))}</span>`;
  if(!file) { $("imagePreview").hidden=true; return; }
  if(file.size>7*1024*1024) { box.classList.add("bad"); box.innerHTML=`<span class="quality-icon">!</span><span>${t("imageSizeLimit")}</span>`; $("oralImage").value=""; return; }
  const url=URL.createObjectURL(file); if(state.imageUrl) URL.revokeObjectURL(state.imageUrl); state.imageUrl=url;
  const img=new Image(); img.onload=()=>{ $("imagePreview").src=url; $("imagePreview").hidden=false; if(Math.min(img.naturalWidth,img.naturalHeight)<240){box.classList.add("bad");box.innerHTML=`<span class="quality-icon">!</span><span>${t("imageDimensions")}</span>`;return;} const canvas=document.createElement("canvas"); canvas.width=64;canvas.height=64; const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0,64,64);const data=ctx.getImageData(0,0,64,64).data;let sum=0,sumSq=0;for(let i=0;i<data.length;i+=4){const lum=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sum+=lum;sumSq+=lum*lum;}const avg=sum/(data.length/4),variance=sumSq/(data.length/4)-avg*avg;if(avg<38||avg>247||variance<85){box.classList.add("warn");box.innerHTML=`<span class="quality-icon">!</span><span>${t("imageCaution")}</span>`;}else{box.classList.add("good");box.innerHTML=`<span class="quality-icon">✓</span><span>${t("imageReady")}</span>`;}}; img.onerror=()=>{box.classList.add("bad");box.innerHTML=`<span class="quality-icon">!</span><span>${t("imageNotUsable")}</span>`;}; img.src=url;
}
async function submitScreening(event) { event.preventDefault(); const form=event.currentTarget; const file=$("oralImage").files[0]; if(!file) return; const f=new FormData();f.append("patient_id",$("screenPatient").value);f.append("worker",$("workerName").value.trim());f.append("location",$("lesionLocation").value);f.append("duration",$("duration").value.trim());f.append("notes",$("screenNotes").value.trim());f.append("image",file,file.name);try{const result=await api("/api/screenings",{method:"POST",body:f});form.reset();if(state.imageUrl)URL.revokeObjectURL(state.imageUrl);state.imageUrl=null;$("imagePreview").hidden=true;$("qualityResult").className="quality-result";$("qualityResult").innerHTML=`<span class="quality-icon">◇</span><span>${t("photoQualityPrompt")}</span>`;showToast(t("screeningSaved"));await loadScreenings();await loadDashboard();}catch(err){showToast(err.message);} }
async function saveReview(event) {event.preventDefault();const form=event.currentTarget;const body={patient_id:$("reviewPatient").value,reviewer:$("reviewerName").value.trim(),status:$("reviewStatus").value,observations:$("observations").value.trim()};try{await api("/api/reviews",{method:"POST",body:JSON.stringify(body)});form.reset();showToast(t("reviewSaved"));await loadReviews();await loadScreenings();await loadDashboard();}catch(err){showToast(err.message);}}
async function saveReferral(event) {event.preventDefault();const form=event.currentTarget;const body={patient_id:$("referralPatient").value,facility:$("hospital").value.trim(),department:$("department").value.trim(),reason:$("referralReason").value.trim(),appointment_date:$("appointmentDate").value};try{await api("/api/referrals",{method:"POST",body:JSON.stringify(body)});form.reset();showToast(t("referralSaved"));await loadCare();await loadDashboard();}catch(err){showToast(err.message);}}
async function saveFollowup(event) {event.preventDefault();const form=event.currentTarget;const body={patient_id:$("followPatient").value,due_date:$("followDate").value,notes:$("followNotes").value.trim()};try{await api("/api/followups",{method:"POST",body:JSON.stringify(body)});form.reset();showToast(t("followupSaved"));await loadCare();await loadDashboard();}catch(err){showToast(err.message);}}

async function boot() {
  translate(); $("loginForm").addEventListener("submit",handleLogin); $("patientForm").addEventListener("submit",submitPatient); $("screeningForm").addEventListener("submit",submitScreening); $("reviewForm").addEventListener("submit",saveReview); $("referralForm").addEventListener("submit",saveReferral); $("followupForm").addEventListener("submit",saveFollowup);
  $("unlockOfflineButton").addEventListener("click",openOfflineDraftMode); $("syncDraftsButton").addEventListener("click",syncOfflineDrafts);
  $("registerConsultPatient").addEventListener("click",openPatientDialog);
  $("consultationUnmuteButton").addEventListener("click",turnConsultationMicrophoneOn);
  $("consultationForm").addEventListener("submit",createConsultation); $("closeConsultationCall").addEventListener("click",()=>closeConsultationCall()); const localNow=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); $("consultationTime").min=localNow;
  $("newPatientButton").addEventListener("click",openPatientDialog); $("emptyRegisterButton").addEventListener("click",openPatientDialog); $("closePatientDialog").addEventListener("click",()=>$("patientDialog").close()); $("cancelPatient").addEventListener("click",()=>$("patientDialog").close()); $("oralImage").addEventListener("change",e=>qualityCheck(e.target.files[0])); $("patientSearch").addEventListener("input",renderPatients); $("languageButton").addEventListener("click",()=>{state.language=state.language==="en"?"te":"en";localStorage.setItem("adLanguage",state.language);translate(); if(state.user) goPage(state.page);});
  document.querySelectorAll("[data-page]").forEach(el=>el.addEventListener("click",()=>goPage(el.dataset.page))); document.querySelectorAll("[data-go]").forEach(el=>el.addEventListener("click",()=>{goPage(el.dataset.go);if(el.dataset.go==="patients")openPatientDialog();})); $("menuButton").addEventListener("click",()=>$("sidebar").classList.toggle("open")); $("closePatientRecord").addEventListener("click",()=>$("patientRecordDialog").close()); document.addEventListener("click",e=>{const button=e.target.closest("[data-open-patient]");if(button)openPatientRecord(button.dataset.openPatient);})
  document.addEventListener("click",e=>{const join=e.target.closest("[data-join-consultation]");const invite=e.target.closest("[data-copy-consultation-link]");const cancel=e.target.closest("[data-cancel-consultation]");const complete=e.target.closest("[data-complete-consultation]");const discard=e.target.closest("[data-discard-offline-draft]");if(join)joinConsultation(join.dataset.joinConsultation);else if(invite)copyConsultationLink(invite.dataset.copyConsultationLink);else if(cancel)cancelConsultation(cancel.dataset.cancelConsultation);else if(complete)completeConsultation(complete.dataset.completeConsultation);else if(discard)discardOfflineDraft(discard.dataset.discardOfflineDraft);});
  $("logoutButton").addEventListener("click",async()=>{closeConsultationCall();if(state.offlineMode){showLogin();return;}try{await api("/api/logout",{method:"POST",body:"{}"});}finally{showLogin();}});
  try {const session=await api("/api/session");if(session.authenticated)showApp(session.user);else showLogin();}catch{showLogin();$("loginError").textContent=t("serverUnavailable");}
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(()=>{});
}
document.addEventListener("DOMContentLoaded",boot);
