const $ = (id) => document.getElementById(id);
const state = { user: null, page: "home", patients: [], language: localStorage.getItem("adLanguage") || "en", imageUrl: null, toastTimer: 0, consultationsConfigured: false, offlineMode: false, vaultOwner: null, syncErrors: {}, syncingDrafts: false, connectionStatus: "connecting", videoProvider:"jitsi", activeConsultation:null };

const translations = {
  en: { skipContent:"Skip to workspace content", secureAccess:"SECURE ACCESS", signIn:"Sign in to your workspace", loginHelp:"Use your assigned account to access patient records.", username:"Username", password:"Password", localOnly:"Local demonstration. Do not enter real patient data until your deployment has been security-reviewed.", districtCare:"DISTRICT CARE", overview:"Overview", patients:"Patients", screening:"Oral screening", clinicalReview:"Clinical review", careCoordination:"Care coordination", connecting:"Connecting…", workspace:"Workspace", fieldWorkspace:"FIELD WORKSPACE", goodDay:"Good day", overviewSubtitle:"A clear view of patients moving through care.", registerPatient:"Register patient", researchNotice:"Research and screening support only", safetyCopy:"This application does not diagnose disease. A qualified clinician makes every clinical decision.", registeredPatients:"Registered patients", allRecords:"All records in this workspace", screeningsInQueue:"Screenings in queue", awaitingReview:"Awaiting clinical review", followUpsDue:"Follow-ups due", nextSevenDays:"Scheduled in the next 7 days", referralsOpen:"Open referrals", careInMotion:"Care coordination in motion", carePathway:"CARE PATHWAY", journeyTitle:"Patient journey", viewPatients:"View patients", registration:"Registration", identityHistory:"Identity and history", photoAssessment:"Photo and assessment", clinician:"Clinician", medicalReview:"Medical review", followUp:"Follow-up", continuityCare:"Continuity of care", journeyEmpty:"Register a patient to begin their care pathway.", modelReadiness:"MODEL READINESS", imageAnalysis:"Image analysis", notConfigured:"Not configured", modelCopy:"No validated model is installed. No predictions will be generated.", experimentalOnly:"Experimental research only", latestActivity:"LATEST ACTIVITY", recentPatients:"Recent patients", seeAll:"See all", patient:"PATIENT", patientId:"PATIENT ID", village:"VILLAGE", registered:"REGISTERED", noPatients:"No patients yet", noPatientsCopy:"Your registered patients will appear here.", registerFirst:"Register your first patient", careRecords:"CARE RECORDS", patientsSubtitle:"Register people and keep their care journey organized.", searchPatients:"Search patient name or ID", ageGender:"AGE / GENDER", patientsEmptyCopy:"Add a patient to start their screening and care record.", oralHealth:"ORAL HEALTH", screeningSubtitle:"Capture a photograph and document screening observations.", newScreening:"New screening", selectPatient:"Patient", healthWorker:"Health worker", areaObserved:"Area observed", selectArea:"Select area", symptomDuration:"Symptom duration", durationPlaceholder:"e.g. 2 weeks", screenNotes:"Screening notes", oralPhoto:"Oral photograph", photoQualityPrompt:"Choose a clear, well-lit image. Quality checks will appear here.", saveScreening:"Save screening", photoGuide:"PHOTO GUIDE", betterPhoto:"A better photo helps review", goodLight:"Use good light", goodLightCopy:"Bright, even light helps show the area clearly.", steadyFocus:"Hold steady and focus", steadyFocusCopy:"Keep the camera close enough to see details.", wholeArea:"Show the whole area", wholeAreaCopy:"Avoid fingers, shadows, blur and unrelated objects.", consentFirst:"Get consent first", consentCopy:"Explain the photograph and obtain patient consent.", noDiagnosis:"No automatic diagnosis", noDiagnosisCopy:"A qualified clinician must assess every finding. Image quality checks do not identify disease.", screeningRecords:"Screening records", clinicalOversight:"CLINICAL OVERSIGHT", reviewSubtitle:"Qualified medical officers document their independent assessment.", recordReview:"Record a review", medicalOfficer:"Medical officer", reviewStatus:"Review status", clinicalObservations:"Clinical observations", saveReview:"Save review", decisionSupport:"DECISION SUPPORT", clinicianAuthority:"Clinical decisions stay with the clinician", clinicianCopy:"This workspace records human review. It does not interpret images or recommend a diagnosis, biopsy, or treatment.", researchReminder:"Any experimental model output must be separately validated and must never replace professional judgment.", reviewRecords:"Review records", careSubtitle:"Track referrals, appointments and follow-up actions.", newReferral:"New referral", hospital:"Hospital / facility", department:"Department", referralReason:"Reason for referral", appointmentDate:"Appointment date", saveReferral:"Save referral", newFollowup:"Schedule follow-up", followupDate:"Follow-up date", followupNotes:"Notes", saveFollowup:"Schedule follow-up", careRecordsTitle:"Referrals and follow-ups", fullName:"Full name", age:"Age", gender:"Gender", mobile:"Mobile number", district:"District", medicalHistory:"Relevant medical history", currentSymptoms:"Current symptoms", consentRecord:"I confirm the patient has been informed about this record and consents to its use for this demonstration.", cancel:"Cancel", savePatient:"Save patient", localPrototype:"Local prototype • NOT FOR CLINICAL USE", noScreenings:"No screening records yet.", noReviews:"No clinical reviews recorded yet.", noCareRecords:"No referrals or follow-ups yet.", patientSaved:"Patient record saved.", screeningSaved:"Screening saved for clinician review.", reviewSaved:"Clinical review saved.", referralSaved:"Referral saved.", followupSaved:"Follow-up scheduled.", serverUnavailable:"Server unavailable. Your information was not confirmed as saved.", signInRequired:"Sign in to continue.", patientRequired:"Register a patient before continuing.", imageDimensions:"Image is too small to assess. Use a clear image at least 240 × 240 pixels.", imageNotUsable:"This file could not be read as a supported image.", imageReady:"Image format and dimensions look suitable. A person must still check focus, lighting and relevance.", imageCaution:"Image quality looks limited. Consider retaking it in better light and focus.", imageSizeLimit:"Choose an image smaller than 7 MB.", loadError:"Could not load this information.", serverOnline:"Local server connected", serverOffline:"Local server unavailable", syncing:"Loading workspace…", ageYears:"years", viewRecord:"Open", screeningCount:"screenings", reviewCount:"reviews", referralCount:"referrals", followupCount:"follow-ups", imageChecksOnly:"Format and dimensions checked • clinical quality needs a person’s review", signOut:"Sign out"
  },
  te: { skipContent:"ప్రధాన విషయానికి వెళ్లండి", secureAccess:"సురక్షిత ప్రవేశం", signIn:"మీ కార్యస్థలంలోకి ప్రవేశించండి", loginHelp:"రోగి వివరాలను చూడటానికి మీ ఖాతాను ఉపయోగించండి.", username:"వినియోగదారు పేరు", password:"పాస్‌వర్డ్", localOnly:"స్థానిక ప్రదర్శన. భద్రతా సమీక్ష పూర్తయ్యే వరకు నిజమైన రోగి వివరాలను నమోదు చేయవద్దు.", districtCare:"జిల్లా ఆరోగ్య సేవలు", overview:"సారాంశం", patients:"రోగులు", screening:"నోటి పరీక్ష", clinicalReview:"వైద్య సమీక్ష", careCoordination:"చికిత్స సమన్వయం", connecting:"కనెక్ట్ అవుతోంది…", workspace:"కార్యస్థలం", fieldWorkspace:"క్షేత్ర కార్యస్థలం", goodDay:"నమస్కారం", overviewSubtitle:"చికిత్స పొందుతున్న రోగుల స్పష్టమైన వివరాలు.", registerPatient:"రోగిని నమోదు చేయండి", researchNotice:"పరిశోధన మరియు పరీక్ష సహాయం మాత్రమే", safetyCopy:"ఈ అప్లికేషన్ వ్యాధిని నిర్ధారించదు. అన్ని వైద్య నిర్ణయాలను అర్హత కలిగిన వైద్యుడు తీసుకుంటారు.", registeredPatients:"నమోదైన రోగులు", allRecords:"ఈ కార్యస్థలంలోని అన్ని రికార్డులు", screeningsInQueue:"సమీక్ష కోసం పరీక్షలు", awaitingReview:"వైద్య సమీక్ష కోసం వేచి ఉన్నాయి", followUpsDue:"తదుపరి పరీక్షలు", nextSevenDays:"తదుపరి 7 రోజుల్లో షెడ్యూల్", referralsOpen:"తెరిచి ఉన్న రిఫరల్స్", careInMotion:"చికిత్స సమన్వయం కొనసాగుతోంది", carePathway:"చికిత్స మార్గం", journeyTitle:"రోగి ప్రయాణం", viewPatients:"రోగులను చూడండి", registration:"నమోదు", identityHistory:"వివరాలు మరియు చరిత్ర", photoAssessment:"ఫోటో మరియు పరీక్ష", clinician:"వైద్యుడు", medicalReview:"వైద్య సమీక్ష", followUp:"తదుపరి పరీక్ష", continuityCare:"నిరంతర చికిత్స", journeyEmpty:"చికిత్స మార్గాన్ని ప్రారంభించడానికి రోగిని నమోదు చేయండి.", modelReadiness:"మోడల్ స్థితి", imageAnalysis:"చిత్ర విశ్లేషణ", notConfigured:"అమర్చలేదు", modelCopy:"ధృవీకరించిన మోడల్ ఇన్‌స్టాల్ కాలేదు. అంచనాలు రూపొందించబడవు.", experimentalOnly:"ప్రయోగాత్మక పరిశోధన మాత్రమే", latestActivity:"ఇటీవలి కార్యాచరణ", recentPatients:"ఇటీవల నమోదు చేసిన రోగులు", seeAll:"అన్నీ చూడండి", patient:"రోగి", patientId:"రోగి సంఖ్య", village:"గ్రామం", registered:"నమోదు తేదీ", noPatients:"ఇంకా రోగులు లేరు", noPatientsCopy:"నమోదైన రోగులు ఇక్కడ కనిపిస్తారు.", registerFirst:"మొదటి రోగిని నమోదు చేయండి", careRecords:"చికిత్స రికార్డులు", patientsSubtitle:"రోగులను నమోదు చేసి వారి చికిత్స వివరాలను నిర్వహించండి.", searchPatients:"రోగి పేరు లేదా సంఖ్యతో వెతకండి", ageGender:"వయస్సు / లింగం", patientsEmptyCopy:"పరీక్ష మరియు చికిత్స రికార్డు ప్రారంభించడానికి రోగిని జోడించండి.", oralHealth:"నోటి ఆరోగ్యం", screeningSubtitle:"ఫోటో తీసి పరీక్ష వివరాలను నమోదు చేయండి.", newScreening:"కొత్త పరీక్ష", selectPatient:"రోగి", healthWorker:"ఆరోగ్య కార్యకర్త", areaObserved:"గమనించిన ప్రాంతం", selectArea:"ప్రాంతాన్ని ఎంచుకోండి", symptomDuration:"లక్షణాల వ్యవధి", durationPlaceholder:"ఉదా. 2 వారాలు", screenNotes:"పరీక్ష గమనికలు", oralPhoto:"నోటి ఫోటో", photoQualityPrompt:"స్పష్టమైన, వెలుతురు ఉన్న చిత్రాన్ని ఎంచుకోండి. నాణ్యత తనిఖీలు ఇక్కడ కనిపిస్తాయి.", saveScreening:"పరీక్షను సేవ్ చేయండి", photoGuide:"ఫోటో మార్గదర్శకం", betterPhoto:"మంచి ఫోటో సమీక్షకు సహాయపడుతుంది", goodLight:"మంచి వెలుతురు వాడండి", goodLightCopy:"ప్రకాశవంతమైన వెలుతురు ప్రాంతాన్ని స్పష్టంగా చూపిస్తుంది.", steadyFocus:"కెమెరాను స్థిరంగా ఉంచండి", steadyFocusCopy:"వివరాలు కనిపించేంత దగ్గరగా కెమెరాను ఉంచండి.", wholeArea:"మొత్తం ప్రాంతాన్ని చూపండి", wholeAreaCopy:"వేళ్లు, నీడలు, అస్పష్టత మరియు సంబంధం లేని వస్తువులను నివారించండి.", consentFirst:"ముందుగా సమ్మతి పొందండి", consentCopy:"ఫోటో గురించి వివరించి రోగి సమ్మతి పొందండి.", noDiagnosis:"ఆటోమేటిక్ నిర్ధారణ లేదు", noDiagnosisCopy:"ప్రతి ఫలితాన్ని అర్హత కలిగిన వైద్యుడు అంచనా వేయాలి. చిత్ర నాణ్యత తనిఖీ వ్యాధిని గుర్తించదు.", screeningRecords:"పరీక్ష రికార్డులు", clinicalOversight:"వైద్య పర్యవేక్షణ", reviewSubtitle:"వైద్య అధికారులు తమ స్వతంత్ర అంచనాను నమోదు చేస్తారు.", recordReview:"సమీక్షను నమోదు చేయండి", medicalOfficer:"వైద్య అధికారి", reviewStatus:"సమీక్ష స్థితి", clinicalObservations:"వైద్య పరిశీలనలు", saveReview:"సమీక్షను సేవ్ చేయండి", decisionSupport:"నిర్ణయ సహాయం", clinicianAuthority:"వైద్య నిర్ణయాలు వైద్యుడివే", clinicianCopy:"ఈ కార్యస్థలం మానవ సమీక్షను నమోదు చేస్తుంది. ఇది చిత్రాలను విశ్లేషించదు లేదా నిర్ధారణ, బయాప్సీ లేదా చికిత్సను సూచించదు.", researchReminder:"ప్రయోగాత్మక మోడల్ ఫలితాలు విడిగా ధృవీకరించాలి. అవి వైద్యుల తీర్పుకు బదులుగా ఉండకూడదు.", reviewRecords:"సమీక్ష రికార్డులు", careSubtitle:"రిఫరల్స్, అపాయింట్‌మెంట్లు మరియు తదుపరి చర్యలను ట్రాక్ చేయండి.", newReferral:"కొత్త రిఫరల్", hospital:"ఆసుపత్రి / కేంద్రం", department:"విభాగం", referralReason:"రిఫరల్ కారణం", appointmentDate:"అపాయింట్‌మెంట్ తేదీ", saveReferral:"రిఫరల్ సేవ్ చేయండి", newFollowup:"తదుపరి పరీక్ష షెడ్యూల్", followupDate:"తదుపరి పరీక్ష తేదీ", followupNotes:"గమనికలు", saveFollowup:"తదుపరి పరీక్ష షెడ్యూల్ చేయండి", careRecordsTitle:"రిఫరల్స్ మరియు తదుపరి పరీక్షలు", fullName:"పూర్తి పేరు", age:"వయస్సు", gender:"లింగం", mobile:"మొబైల్ నంబర్", district:"జిల్లా", medicalHistory:"సంబంధిత వైద్య చరిత్ర", currentSymptoms:"ప్రస్తుత లక్షణాలు", consentRecord:"ఈ ప్రదర్శన కోసం ఈ రికార్డు గురించి రోగికి వివరించామని, వారు సమ్మతించారని నిర్ధారిస్తున్నాను.", cancel:"రద్దు చేయండి", savePatient:"రోగి వివరాలను సేవ్ చేయండి", localPrototype:"స్థానిక నమూనా • వైద్య వినియోగానికి కాదు", noScreenings:"ఇంకా పరీక్ష రికార్డులు లేవు.", noReviews:"ఇంకా వైద్య సమీక్షలు లేవు.", noCareRecords:"ఇంకా రిఫరల్స్ లేదా తదుపరి పరీక్షలు లేవు.", patientSaved:"రోగి రికార్డు సేవ్ అయింది.", screeningSaved:"వైద్య సమీక్ష కోసం పరీక్ష సేవ్ అయింది.", reviewSaved:"వైద్య సమీక్ష సేవ్ అయింది.", referralSaved:"రిఫరల్ సేవ్ అయింది.", followupSaved:"తదుపరి పరీక్ష షెడ్యూల్ అయింది.", serverUnavailable:"సర్వర్ అందుబాటులో లేదు. మీ సమాచారం సేవ్ అయిందని నిర్ధారించలేకపోయాము.", signInRequired:"కొనసాగించడానికి ప్రవేశించండి.", patientRequired:"కొనసాగించడానికి ముందుగా రోగిని నమోదు చేయండి.", imageDimensions:"చిత్రం చాలా చిన్నది. కనీసం 240 × 240 పిక్సెల్స్ స్పష్టమైన చిత్రాన్ని ఉపయోగించండి.", imageNotUsable:"ఈ ఫైల్‌ను మద్దతు ఉన్న చిత్రంగా చదవలేకపోయాము.", imageReady:"చిత్ర ఫార్మాట్ మరియు పరిమాణం సరిపోతున్నాయి. స్పష్టత, వెలుతురు మరియు సందర్భాన్ని వ్యక్తి పరిశీలించాలి.", imageCaution:"చిత్ర నాణ్యత తక్కువగా ఉండవచ్చు. మెరుగైన వెలుతురు మరియు స్పష్టతతో మళ్లీ తీయండి.", imageSizeLimit:"7 MB కంటే చిన్న చిత్రాన్ని ఎంచుకోండి.", loadError:"వివరాలను లోడ్ చేయలేకపోయాము.", serverOnline:"స్థానిక సర్వర్ కనెక్ట్ అయింది", serverOffline:"స్థానిక సర్వర్ అందుబాటులో లేదు", syncing:"కార్యస్థలం లోడ్ అవుతోంది…", ageYears:"సంవత్సరాలు", viewRecord:"తెరవండి", screeningCount:"పరీక్షలు", reviewCount:"సమీక్షలు", referralCount:"రిఫరల్స్", followupCount:"తదుపరి పరీక్షలు", imageChecksOnly:"ఫార్మాట్ మరియు పరిమాణం తనిఖీ చేశాం • వైద్య నాణ్యతను వ్యక్తి పరిశీలించాలి", signOut:"బయటకు వెళ్లు"
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
  consultations:"Consultations", consultationSubtitle:"Schedule a video appointment with a clinician.", scheduleConsultation:"Schedule consultation", appointmentDateTime:"Appointment date and time", appointmentLength:"Appointment length", saveAppointment:"Save appointment",
  consultationRecords:"Consultation appointments", noConsultations:"No appointments scheduled yet.", cancelAppointment:"Cancel", invitationCopyError:"Could not copy the meeting link on this device.", appointmentSaved:"Consultation appointment saved.", appointmentCancelled:"Appointment cancelled.", cancelConfirm:"Cancel this consultation appointment?",
  consultationStatusScheduled:"Scheduled", consultationStatusCompleted:"Completed", consultationStatusCancelled:"Cancelled", completeAppointment:"Mark completed", appointmentCompleted:"Appointment marked completed.", upcomingVideo:"Join opens 15 minutes before the appointment.", expiredVideo:"The appointment join window has closed.",
  minutes15:"15 minutes", minutes30:"30 minutes", minutes45:"45 minutes", minutes60:"60 minutes", minutesUnit:"minutes", remoteCare:"REMOTE CARE", appointmentsLabel:"APPOINTMENTS", videoMeeting:"JITSI VIDEO", consultationGuestTitle:"Patient access"
}, te: {
  consultations:"వీడియో సంప్రదింపులు", consultationSubtitle:"వైద్యునితో వీడియో సంప్రదింపును షెడ్యూల్ చేయండి.", scheduleConsultation:"వీడియో సంప్రదింపును షెడ్యూల్ చేయండి", appointmentDateTime:"అపాయింట్‌మెంట్ తేదీ, సమయం", appointmentLength:"అపాయింట్‌మెంట్ నిడివి", saveAppointment:"అపాయింట్‌మెంట్ సేవ్ చేయండి",
  consultationRecords:"వీడియో అపాయింట్‌మెంట్లు", noConsultations:"ఇంకా అపాయింట్‌మెంట్లు షెడ్యూల్ కాలేదు.", cancelAppointment:"రద్దు చేయండి", invitationCopyError:"ఈ పరికరంలో సమావేశ లింకును కాపీ చేయలేకపోయాం.", appointmentSaved:"వీడియో అపాయింట్‌మెంట్ సేవ్ అయింది.", appointmentCancelled:"అపాయింట్‌మెంట్ రద్దు అయింది.", cancelConfirm:"ఈ అపాయింట్‌మెంట్‌ను రద్దు చేయాలా?",
  consultationStatusScheduled:"షెడ్యూల్ అయింది", consultationStatusCompleted:"పూర్తయింది", consultationStatusCancelled:"రద్దయింది", completeAppointment:"పూర్తయిందిగా గుర్తించండి", appointmentCompleted:"అపాయింట్‌మెంట్ పూర్తయిందిగా గుర్తించబడింది.", upcomingVideo:"అపాయింట్‌మెంట్‌కు 15 నిమిషాల ముందు చేరవచ్చు.", expiredVideo:"చేరే సమయం ముగిసింది.",
  minutes15:"15 నిమిషాలు", minutes30:"30 నిమిషాలు", minutes45:"45 నిమిషాలు", minutes60:"60 నిమిషాలు", minutesUnit:"నిమిషాలు", remoteCare:"దూరవైద్య సేవ", appointmentsLabel:"అపాయింట్‌మెంట్లు", videoMeeting:"JITSI వీడియో", consultationGuestTitle:"రోగి ప్రవేశం"
} };
Object.assign(translations.en,{experimentalOnly:"No model installed"});
Object.assign(translations.te,{experimentalOnly:"మోడల్ ఇన్‌స్టాల్ కాలేదు"});
Object.assign(consultationLabels.en, {consultationHeroEyebrow:"CONNECTED CARE", consultationHeroTitle:"A familiar face, wherever care continues.", consultationHeroCopy:"Schedule a clinician-led video appointment from the same patient record. Open the room when the appointment window begins, then invite the second participant.", consultationPhotoCredit:"Illustrative artwork", consultationReadyNow:"Ready now", consultationUpcoming:"Upcoming", consultationPast:"Past appointments", consultationOpenLabel:"Join window open", consultationUpcomingLabel:"Not yet open", consultationExpiredLabel:"Join window closed", consultationRoomReady:"The room is ready. Start the call and share the guest link from this appointment.", consultationReference:"Appointment reference"});
Object.assign(consultationLabels.te, {consultationHeroEyebrow:"అనుసంధానిత సంరక్షణ", consultationHeroTitle:"ఎక్కడ ఉన్నా వైద్యునితో ముఖాముఖి.", consultationHeroCopy:"అదే రోగి రికార్డు నుండి వైద్యునితో వీడియో అపాయింట్‌మెంట్ షెడ్యూల్ చేయండి. సమయం వచ్చినప్పుడు గదిని తెరిచి రెండో వ్యక్తికి లింకు పంపండి.", consultationPhotoCredit:"వివరణ కోసం రూపొందించిన చిత్రం", consultationReadyNow:"ఇప్పుడే చేరవచ్చు", consultationUpcoming:"రాబోయేవి", consultationPast:"గత అపాయింట్‌మెంట్లు", consultationOpenLabel:"చేరే సమయం ప్రారంభమైంది", consultationUpcomingLabel:"ఇంకా ప్రారంభం కాలేదు", consultationExpiredLabel:"చేరే సమయం ముగిసింది", consultationRoomReady:"గది సిద్ధంగా ఉంది. కాల్ ప్రారంభించి ఈ అపాయింట్‌మెంట్ నుండి అతిథి లింకు పంపండి.", consultationReference:"అపాయింట్‌మెంట్ గుర్తింపు"});
Object.assign(consultationLabels.en, {consultationHeroCopy:"Use the saved patient record to prepare a clinician-led call. Afterward, document the review and next steps in the care journey.", consultationRoomReady:"Review the patient record, confirm identity and consent, then start the call.", consultationUpcomingCare:"Review the saved record before the appointment. The call room opens 15 minutes before the scheduled time.", consultationExpiredCare:"The call window has closed. Record the outcome or schedule another appointment if follow-up is needed.", consultationCompletedCare:"This appointment is marked complete. Continue the review and follow-up in the patient record.", consultationCancelledCare:"This appointment was cancelled. Review the patient record before arranging another call.", consultationCareRecord:"PATIENT CARE RECORD", consultationCareContext:"Review saved screenings, clinician notes and follow-up while planning care.", consultationViewRecord:"View patient record"});
Object.assign(consultationLabels.te, {consultationHeroCopy:"వైద్యునితో కాల్‌కు సిద్ధం కావడానికి సేవ్ చేసిన రోగి రికార్డును చూడండి. తర్వాత సమీక్షను, తదుపరి చర్యలను సంరక్షణ రికార్డులో నమోదు చేయండి.", consultationRoomReady:"రోగి రికార్డును చూసి, గుర్తింపు మరియు అనుమతిని నిర్ధారించిన తర్వాత కాల్ ప్రారంభించండి.", consultationUpcomingCare:"అపాయింట్‌మెంట్‌కు ముందు సేవ్ చేసిన రికార్డును చూడండి. నిర్ణయించిన సమయానికి 15 నిమిషాల ముందు కాల్ గది తెరుచుకుంటుంది.", consultationExpiredCare:"కాల్‌లో చేరే సమయం ముగిసింది. ఫలితాన్ని నమోదు చేయండి లేదా తదుపరి సంరక్షణ అవసరమైతే మరో అపాయింట్‌మెంట్ షెడ్యూల్ చేయండి.", consultationCompletedCare:"ఈ అపాయింట్‌మెంట్ పూర్తయిందిగా గుర్తించబడింది. రోగి రికార్డులో సమీక్ష, తదుపరి సంరక్షణను కొనసాగించండి.", consultationCancelledCare:"ఈ అపాయింట్‌మెంట్ రద్దయింది. మరో కాల్ ఏర్పాటు చేసే ముందు రోగి రికార్డును చూడండి.", consultationCareRecord:"రోగి సంరక్షణ రికార్డు", consultationCareContext:"చికిత్స ప్రణాళిక కోసం సేవ్ చేసిన పరీక్షలు, వైద్యుని నోట్స్ మరియు తదుపరి సంరక్షణను చూడండి.", consultationViewRecord:"రోగి రికార్డును చూడండి"});
Object.assign(consultationLabels.en, {consultationExpiredCare:"Join window closed. Document the outcome or schedule follow-up.", consultationCompletedCare:"Continue care in the patient record.", consultationCancelledCare:"Review the record before rescheduling."});
Object.assign(consultationLabels.te, {consultationExpiredCare:"చేరే సమయం ముగిసింది. ఫలితాన్ని నమోదు చేయండి లేదా తదుపరి అపాయింట్‌మెంట్ షెడ్యూల్ చేయండి.", consultationCompletedCare:"రోగి రికార్డులో సంరక్షణను కొనసాగించండి.", consultationCancelledCare:"మళ్లీ షెడ్యూల్ చేసే ముందు రికార్డును చూడండి."});
const offlineLabels = { en: {
  offlinePassphrase:"Offline drafts passphrase", offlineLoginHelp:"On your first online health-worker sign-in, this creates the encrypted draft vault. Use the same passphrase to open drafts offline and unlock them for sync.", openOfflineDrafts:"Open offline drafts", offlineOnlyTitle:"Offline draft mode", offlineOnlyCopy:"Only new patient registrations can be drafted here. Existing records, reviews, follow-ups, consultations, and screening photos are unavailable offline. Sign in online and sync drafts soon; browser storage can be cleared.", offlineDraftsEyebrow:"ENCRYPTED ON THIS DEVICE", offlineDraftsTitle:"Patient registration drafts", syncDrafts:"Sync drafts now", offlineDraftSaved:"Patient registration saved as an encrypted draft on this device. It has not been sent to the server.", offlineDraftPending:"Waiting for authenticated sync", offlineNoDrafts:"No pending patient drafts.", offlineSyncSuccess:"Patient draft sync completed.", offlineSyncPartial:"Some drafts could not be synchronized. Review the messages below.", offlineSyncNetwork:"Connection was lost. Remaining drafts are still encrypted on this device.", offlineConflict:"Server rejected this draft. Review the reason before discarding it.", discardDraft:"Discard draft", confirmDiscardDraft:"Discard this unsynchronized patient draft from this device? This cannot be undone.", offlineNeedsUnlock:"Enter the offline drafts passphrase to open this vault.", offlineVaultCreated:"Encrypted offline draft vault is ready.", offlineVaultUnavailable:"Offline drafts could not be unlocked. Online sign-in is still available.", offlineOnlyWorker:"Offline draft mode is available only for a health-worker vault.", offlineRegistrationOnly:"This browser reports a connection. Sign in online to register, or reopen drafts when offline. Screening photos are not queued.", onlineOnlyScreenings:"Sync patient registrations before starting screenings. Screening photos currently require a live connection.", sessionExpiredDrafts:"Your session expired. Drafts remain encrypted; sign in again to sync.", serverUnavailableDraft:"Server unavailable. The draft remains encrypted on this device.", tooShortOfflinePassphrase:"Use an offline passphrase of at least 12 characters.", idempotencyConflict:"This operation ID is already linked to another payload.", draftSyncing:"Sending encrypted patient drafts…"
}, te: {
  offlinePassphrase:"ఆఫ్‌లైన్ డ్రాఫ్ట్ పాస్‌ఫ్రేజ్", openOfflineDrafts:"ఆఫ్‌లైన్ డ్రాఫ్ట్‌లను తెరవండి", offlineOnlyTitle:"ఆఫ్‌లైన్ డ్రాఫ్ట్ మోడ్", syncDrafts:"డ్రాఫ్ట్‌లను సింక్ చేయండి", offlineDraftsTitle:"రోగి నమోదు డ్రాఫ్ట్‌లు", discardDraft:"డ్రాఫ్ట్ తొలగించండి"
} };
Object.assign(translations.en, {
  brandTagline:"Care across communities", conceptEyebrow:"CARE FROM COMMUNITY TO CLINIC", conceptTitle:"Care that travels with the patient.", conceptCopy:"From a village health worker to a district clinician, one connected record carries a consented oral photograph through review, referral and follow-up.",
  conceptCapture:"Capture in the community", conceptCaptureCopy:"Register a patient and save a screening. Encrypted drafts support offline field capture.", conceptReview:"Keep the clinician in control", conceptReviewCopy:"Review photographs, inspect experimental AI observations and record an independent assessment.", conceptConnect:"Continue the care journey", conceptConnectCopy:"Coordinate consultations, diagnostics, referrals, treatment progress and follow-up.", conceptNotice:"Office demonstration · synthetic data only · NOT FOR CLINICAL USE",
  demoStartEyebrow:"YOUR NEXT STEP", demoStartTitle:"Start with a patient. Follow through to care.", demoMode:"Connected care workspace", demoPatients:"Patient records", demoPatientsCopy:"Find a person or register a new record", demoScreening:"Screening and AI", demoScreeningCopy:"Save a photo and inspect advisory observations", demoCare:"Review and care", demoCareCopy:"Open the saved patient journey and next steps", demoConsultation:"Video consultation", demoConsultationCopy:"Schedule, share a Jitsi room and check audio in Jitsi", generalPathway:"General workflow guide. Open Care coordination to see a selected patient's saved progress."
});
Object.assign(translations.te, {
  brandTagline:"సమాజమంతా ఆరోగ్య సేవలు", conceptEyebrow:"సమాజం నుండి వైద్యశాల వరకు", conceptTitle:"రోగితో పాటు కొనసాగే ఆరోగ్య సేవ.", conceptCopy:"గ్రామ ఆరోగ్య కార్యకర్త నుండి జిల్లా వైద్యుని వరకు, అనుమతితో తీసిన నోటి ఫోటోను ఒకే రికార్డులో సమీక్ష, రిఫరల్ మరియు తదుపరి సంరక్షణ వరకు కొనసాగించండి.",
  conceptCapture:"క్షేత్రస్థాయిలో వివరాల సేకరణ", conceptCaptureCopy:"రోగిని నమోదు చేసి నోటి పరీక్షను సేవ్ చేయండి. ఆఫ్‌లైన్ వివరాలు గుప్తీకరించబడతాయి.", conceptReview:"వైద్యుని స్వతంత్ర సమీక్ష", conceptReviewCopy:"ఫోటోలు మరియు ప్రయోగాత్మక AI పరిశీలనలను చూసి వైద్యుని స్వతంత్ర అభిప్రాయం నమోదు చేయండి.", conceptConnect:"నిరంతర చికిత్స సమన్వయం", conceptConnectCopy:"సంప్రదింపులు, నిర్ధారణ పరీక్షలు, రిఫరల్స్, చికిత్స పురోగతి మరియు తదుపరి పరీక్షలను నమోదు చేయండి.", conceptNotice:"కార్యాలయ ప్రదర్శన · కల్పిత వివరాలు మాత్రమే · వైద్య వినియోగానికి కాదు",
  demoStartEyebrow:"తదుపరి చర్య", demoStartTitle:"రోగి నమోదు నుండి నిరంతర చికిత్స వరకు.", demoMode:"అనుసంధానిత సేవల కార్యస్థలం", demoPatients:"రోగి రికార్డులు", demoPatientsCopy:"రోగిని వెతకండి లేదా కొత్త రికార్డును నమోదు చేయండి", demoScreening:"నోటి పరీక్ష మరియు AI", demoScreeningCopy:"ఫోటో మరియు ప్రయోగాత్మక పరిశీలనలను చూడండి", demoCare:"సమీక్ష మరియు చికిత్స", demoCareCopy:"రోగి పురోగతి మరియు తదుపరి చర్యలు చూడండి", demoConsultation:"వీడియో సంప్రదింపు", demoConsultationCopy:"షెడ్యూల్ చేసి Jitsi గది లింకును పంపండి; ఆడియోను Jitsiలో తనిఖీ చేయండి", generalPathway:"ఇది సాధారణ ప్రక్రియ మాత్రమే. రోగి యొక్క సేవ్ చేసిన పురోగతి కోసం చికిత్స సమన్వయాన్ని తెరవండి."
});
Object.assign(translations.en, {demoAiTip:"Reopen a screening to view its saved MedGemma result without running the model again. A new local CPU run can take several minutes; continue the care workflow, then reopen the screening for its saved result."});
Object.assign(translations.te, {demoAiTip:"మోడల్‌ను మళ్లీ అమలు చేయకుండా సేవ్ చేసిన MedGemma ఫలితాన్ని చూడటానికి పరీక్షను తిరిగి తెరవండి. కొత్త స్థానిక CPU పరిశీలనకు కొన్ని నిమిషాలు పట్టవచ్చు; ఇతర చికిత్స పనులు కొనసాగించి తరువాత సేవ్ చేసిన ఫలితాన్ని చూడండి."});
Object.assign(translations.en, {photoClinicCaption:"Care in the clinic · project-supplied photograph", photoCommunityTitle:"Rooted in the community", photoExaminationTitle:"Connected to clinical care", photoProjectCredit:"Project-supplied photograph", conceptNotice:"Local research prototype · synthetic data only · NOT FOR CLINICAL USE", localOnly:"Local research prototype. Do not enter real patient data until your deployment has been security-reviewed."});
Object.assign(translations.te, {photoClinicCaption:"వైద్యశాలలో సంరక్షణ · ప్రాజెక్ట్ అందించిన ఛాయాచిత్రం", photoCommunityTitle:"సమాజంతో అనుబంధం", photoExaminationTitle:"వైద్య సేవలతో అనుసంధానం", photoProjectCredit:"ప్రాజెక్ట్ అందించిన ఛాయాచిత్రం", conceptNotice:"స్థానిక పరిశోధన నమూనా · కల్పిత వివరాలు మాత్రమే · వైద్య వినియోగానికి కాదు", localOnly:"స్థానిక పరిశోధన నమూనా. భద్రతా సమీక్ష పూర్తయ్యే వరకు నిజమైన రోగి వివరాలను నమోదు చేయవద్దు."});
Object.assign(consultationLabels.en, {consultationHeroAlt:"Illustration of an Indian clinician speaking with a community health worker by video"});
Object.assign(consultationLabels.te, {consultationHeroAlt:"భారతీయ వైద్యుడు వీడియో ద్వారా కమ్యూనిటీ ఆరోగ్య కార్యకర్తతో మాట్లాడుతున్న దృశ్య చిత్రం"});
Object.assign(translations.en, {
  sidebarPrototype:"Local research prototype", sidebarContextKicker:"COMMUNITY TO CLINIC", sidebarContextTitle:"Care workspace", sidebarNavigation:"Main navigation",
  sidebarGroupWorkspace:"WORKSPACE", sidebarGroupCare:"CARE JOURNEY", sidebarGroupResources:"RESOURCES", sidebarConnection:"CONNECTION", sidebarConnectionStatus:"Connection status", sidebarLanguage:"LANGUAGE",
  switchToTelugu:"Switch to Telugu", switchToEnglish:"Switch to English", roleHealthWorker:"Health worker", roleMedicalOfficer:"Medical officer", roleSpecialist:"Specialist", roleAdmin:"Administrator", roleOfflineWorker:"Health worker · offline drafts"
});
Object.assign(translations.te, {
  sidebarPrototype:"స్థానిక పరిశోధన నమూనా", sidebarContextKicker:"సమాజం నుండి వైద్యశాలకు", sidebarContextTitle:"సంరక్షణ కార్యస్థలం", sidebarNavigation:"ప్రధాన నావిగేషన్",
  sidebarGroupWorkspace:"కార్యస్థలం", sidebarGroupCare:"సంరక్షణ ప్రయాణం", sidebarGroupResources:"వనరులు", sidebarConnection:"కనెక్షన్", sidebarConnectionStatus:"కనెక్షన్ స్థితి", sidebarLanguage:"భాష",
  switchToTelugu:"తెలుగుకు మార్చండి", switchToEnglish:"ఇంగ్లీషుకు మార్చండి", roleHealthWorker:"ఆరోగ్య కార్యకర్త", roleMedicalOfficer:"వైద్య అధికారి", roleSpecialist:"నిపుణ వైద్యుడు", roleAdmin:"నిర్వాహకుడు", roleOfflineWorker:"ఆరోగ్య కార్యకర్త · ఆఫ్‌లైన్ డ్రాఫ్ట్‌లు"
});
Object.assign(translations.en, {
  contextHome:"See care activity across this workspace.", contextPatients:"Find or register a person before the next care step.", contextScreening:"Capture with consent for clinician review.", contextReview:"Record an independent clinician assessment.",
  contextCare:"Keep referrals and follow-ups connected.", contextConsultations:"Schedule and track appointment status.", contextReferences:"Inspect supplied visual examples.", contextAudit:"Review record activity metadata."
});
Object.assign(translations.te, {
  contextHome:"ఈ కార్యస్థలంలోని సంరక్షణ కార్యకలాపాలను చూడండి.", contextPatients:"తదుపరి సంరక్షణకు ముందు వ్యక్తిని కనుగొనండి లేదా నమోదు చేయండి.", contextScreening:"వైద్య సమీక్ష కోసం అనుమతితో ఫోటో తీయండి.", contextReview:"వైద్యుని స్వతంత్ర అంచనాను నమోదు చేయండి.",
  contextCare:"రిఫరల్స్ మరియు తదుపరి సంరక్షణను అనుసంధానించండి.", contextConsultations:"అపాయింట్‌మెంట్‌లను షెడ్యూల్ చేసి స్థితిని చూడండి.", contextReferences:"అందించిన సూచన చిత్రాలను పరిశీలించండి.", contextAudit:"రికార్డు కార్యకలాపాల వివరాలను చూడండి."
});
Object.assign(translations.en, {
  receiptRegistrationAction:"Registration acknowledgement", receiptCompletionAction:"Completion acknowledgement", receiptRegistrationTitle:"Registration acknowledgement", receiptCompletionTitle:"Appointment completion acknowledgement",
  receiptRegistrationLead:"This confirms that a patient registration was saved in this workspace.", receiptCompletionLead:"This confirms that an appointment record was marked complete in this workspace.",
  receiptPatientName:"Patient name", receiptPatientCode:"Patient ID", receiptRegisteredAt:"Registered on", receiptConsultationId:"Appointment ID", receiptScheduledAt:"Scheduled for", receiptCompletedAt:"Completed on", receiptCompletedBy:"Completed by",
  receiptFooter:"This acknowledges a saved workspace record. It is not a clinical report or payment receipt.", receiptClose:"Close", receiptPrint:"Print / Save PDF", receiptUnavailable:"Acknowledgement details are unavailable. Reopen the saved record and try again."
});
Object.assign(translations.te, {
  receiptRegistrationAction:"నమోదు ధృవీకరణ", receiptCompletionAction:"అపాయింట్‌మెంట్ పూర్తి ధృవీకరణ", receiptRegistrationTitle:"నమోదు ధృవీకరణ", receiptCompletionTitle:"అపాయింట్‌మెంట్ పూర్తి ధృవీకరణ",
  receiptRegistrationLead:"ఈ కార్యస్థలంలో రోగి నమోదు సేవ్ అయిందని ఇది ధృవీకరిస్తుంది.", receiptCompletionLead:"ఈ కార్యస్థలంలో అపాయింట్‌మెంట్ రికార్డును పూర్తయినట్లు గుర్తించారని ఇది ధృవీకరిస్తుంది.",
  receiptPatientName:"రోగి పేరు", receiptPatientCode:"రోగి సంఖ్య", receiptRegisteredAt:"నమోదు తేదీ", receiptConsultationId:"అపాయింట్‌మెంట్ సంఖ్య", receiptScheduledAt:"నిర్దేశించిన సమయం", receiptCompletedAt:"పూర్తయిన సమయం", receiptCompletedBy:"పూర్తి చేసిన వైద్యుడు",
  receiptFooter:"ఇది సేవ్ చేసిన కార్యస్థల రికార్డును మాత్రమే ధృవీకరిస్తుంది. ఇది వైద్య నివేదిక లేదా చెల్లింపు రసీదు కాదు.", receiptClose:"మూసివేయండి", receiptPrint:"ముద్రించండి / PDFగా సేవ్ చేయండి", receiptUnavailable:"ధృవీకరణ వివరాలు అందుబాటులో లేవు. సేవ్ చేసిన రికార్డును మళ్లీ తెరిచి ప్రయత్నించండి."
});
Object.assign(translations.en, {
  patientsStoryEyebrow:"FROM FIRST CONTACT", patientsStoryTitle:"One person. One care record.", patientsStoryCopy:"Registration connects a person with the screenings, clinician reviews, referrals and follow-ups that follow.", patientsStoryAlt:"People gathered outside a community hospital in India", patientsStoryCredit:"Project-supplied community photograph",
  screeningStoryEyebrow:"CAPTURE WITH CONTEXT", screeningStoryTitle:"A clear image becomes a reviewable record.", screeningStoryCopy:"Capture with consent and describe what was seen. The protected photograph goes to a clinician; image checks do not identify disease.", screeningStoryAlt:"A dental professional examining a person in a care room", screeningStoryCredit:"Project-supplied examination photograph",
  reviewStoryEyebrow:"CLINICIAN-LED REVIEW", reviewStoryTitle:"Human judgment leads the review.", reviewStoryCopy:"Inspect the screening photo and relevant record, then document an independent assessment. Experimental AI text is not a diagnosis.", reviewStoryAlt:"Clinicians speaking with a person in a dental clinic", reviewStoryCredit:"Project-supplied clinic photograph",
  careStoryEyebrow:"THE NEXT STEP MATTERS", careStoryTitle:"Keep care moving after the review.", careStoryCopy:"Give each referral a destination and each follow-up a date. Keep the plan linked to the patient record for the next clinician.", careStoryAlt:"Illustration of an Indian health worker coordinating a patient's next steps",
  auditStoryEyebrow:"ACCOUNTABLE CARE", auditStoryTitle:"Trust needs a record of access.", auditStoryCopy:"Review who changed which record and when. Clinical details remain in protected patient views.", auditStoryAlt:"Illustration representing protected records and responsible access",
  referencesStoryEyebrow:"VISUAL CONTEXT", referencesStoryTitle:"Compare how an area is photographed.", referencesStoryCopy:"These supplied images support discussion about framing and documentation. They are not diagnostic labels or a validated clinical dataset.", referencesStoryGumsAlt:"Reference photograph of teeth and gums", referencesStoryPalateAlt:"Reference photograph of the roof of the mouth", referencesStoryCredit:"Project-supplied oral photographs", illustrativeArtCredit:"Illustrative artwork"
});
Object.assign(translations.te, {
  patientsStoryEyebrow:"మొదటి పరిచయం నుంచి", patientsStoryTitle:"ఒక వ్యక్తి. ఒక సంరక్షణ రికార్డు.", patientsStoryCopy:"రోగి నమోదు తరువాత జరిగే పరీక్షలు, వైద్య సమీక్షలు, రిఫరల్స్ మరియు తదుపరి సంరక్షణను ఒకే రికార్డుతో కలుపుతుంది.", patientsStoryAlt:"భారతదేశంలోని కమ్యూనిటీ ఆసుపత్రి బయట చేరిన ప్రజలు", patientsStoryCredit:"ప్రాజెక్ట్ అందించిన సమాజ ఛాయాచిత్రం",
  screeningStoryEyebrow:"సందర్భంతో ఫోటో", screeningStoryTitle:"స్పష్టమైన చిత్రం సమీక్షకు సహాయపడుతుంది.", screeningStoryCopy:"అనుమతితో ఫోటో తీసి కనిపించిన విషయాలను నమోదు చేయండి. రక్షిత చిత్రాన్ని వైద్యుడు పరిశీలిస్తారు; చిత్ర తనిఖీలు వ్యాధిని గుర్తించవు.", screeningStoryAlt:"వైద్యశాలలో వ్యక్తిని పరీక్షిస్తున్న దంత వైద్య నిపుణుడు", screeningStoryCredit:"ప్రాజెక్ట్ అందించిన పరీక్ష ఛాయాచిత్రం",
  reviewStoryEyebrow:"వైద్యుని స్వతంత్ర సమీక్ష", reviewStoryTitle:"సమీక్షకు వైద్యుని నిర్ణయమే ముఖ్యం.", reviewStoryCopy:"పరీక్ష ఫోటో, సంబంధిత రికార్డును చూసి స్వతంత్ర అభిప్రాయం నమోదు చేయండి. ప్రయోగాత్మక AI వచనం రోగ నిర్ధారణ కాదు.", reviewStoryAlt:"దంత వైద్యశాలలో ఒక వ్యక్తితో మాట్లాడుతున్న వైద్యులు", reviewStoryCredit:"ప్రాజెక్ట్ అందించిన వైద్యశాల ఛాయాచిత్రం",
  careStoryEyebrow:"తదుపరి చర్య ముఖ్యం", careStoryTitle:"సమీక్ష తర్వాత సంరక్షణ కొనసాగించండి.", careStoryCopy:"ప్రతి రిఫరల్‌కు గమ్యాన్ని, ప్రతి తదుపరి పరీక్షకు తేదీని నమోదు చేయండి. తదుపరి వైద్యుని కోసం ప్రణాళికను రోగి రికార్డుతో కలిపి ఉంచండి.", careStoryAlt:"రోగి తదుపరి చర్యలను సమన్వయం చేస్తున్న భారతీయ ఆరోగ్య కార్యకర్త చిత్రం",
  auditStoryEyebrow:"జవాబుదారీతనంతో సంరక్షణ", auditStoryTitle:"నమ్మకానికి ప్రాప్యత రికార్డు అవసరం.", auditStoryCopy:"ఎవరు ఏ రికార్డును ఎప్పుడు మార్చారో చూడండి. వైద్య వివరాలు రక్షిత రోగి పేజీల్లోనే ఉంటాయి.", auditStoryAlt:"రక్షిత రికార్డులు, బాధ్యతాయుత ప్రాప్యతను సూచించే చిత్రం",
  referencesStoryEyebrow:"చిత్ర సందర్భం", referencesStoryTitle:"వేర్వేరు ప్రాంతాల ఫోటోలను పోల్చండి.", referencesStoryCopy:"ఈ చిత్రాలు ఫోటో తీయడం, నమోదు చేయడం గురించి చర్చకు సహాయపడతాయి. ఇవి ధృవీకరించిన వైద్య డేటాసెట్ లేదా రోగ నిర్ధారణ లేబుల్స్ కావు.", referencesStoryGumsAlt:"దంతాలు, చిగుళ్ల సూచన ఫోటో", referencesStoryPalateAlt:"నోటి పైభాగం సూచన ఫోటో", referencesStoryCredit:"ప్రాజెక్ట్ అందించిన నోటి ఛాయాచిత్రాలు", illustrativeArtCredit:"వివరణ కోసం రూపొందించిన చిత్రం"
});
Object.assign(translations.en, {
  overviewScenesLabel:"Illustrative care scenes", overviewCommunityAlt:"Illustration of community health outreach in India", overviewClinicAlt:"Illustration of a clinic handoff in India",
  patientsStoryAlt:"Illustration of a health worker helping a person register for care", screeningStoryAlt:"Illustration of a health worker preparing a camera and light for oral screening",
  reviewStoryAlt:"Illustration of a clinician reviewing a protected record", referencesStoryAlt:"Illustration of an oral photography learning setup",
  referencesStoryCopy:"The supplied photographs below support discussion about framing and documentation. They are not diagnostic labels or a validated clinical dataset."
});
Object.assign(translations.te, {
  overviewScenesLabel:"సంరక్షణకు సంబంధించిన దృశ్య చిత్రాలు", overviewCommunityAlt:"భారతదేశంలో సమాజ ఆరోగ్య సేవలను చూపించే దృశ్య చిత్రం", overviewClinicAlt:"భారతదేశంలోని వైద్యశాలకు సంరక్షణ బదిలీని చూపించే దృశ్య చిత్రం",
  patientsStoryAlt:"సంరక్షణ కోసం వ్యక్తిని నమోదు చేయడంలో ఆరోగ్య కార్యకర్త సహాయపడుతున్న దృశ్య చిత్రం", screeningStoryAlt:"నోటి పరీక్ష కోసం కెమెరా మరియు వెలుతురును సిద్ధం చేస్తున్న ఆరోగ్య కార్యకర్త దృశ్య చిత్రం",
  reviewStoryAlt:"రక్షిత రికార్డును పరిశీలిస్తున్న వైద్యుని దృశ్య చిత్రం", referencesStoryAlt:"నోటి ఫోటోలు తీయడం నేర్చుకునే ఏర్పాటును చూపించే దృశ్య చిత్రం",
  referencesStoryCopy:"క్రింద ఇచ్చిన ఫోటోలు చిత్రీకరణ మరియు నమోదుపై చర్చకు సహాయపడతాయి. అవి రోగ నిర్ధారణ లేబుళ్లు లేదా ధృవీకరించిన వైద్య డేటాసెట్ కాదు."
});
Object.assign(consultationLabels.en, {
  videoMeeting:"JITSI VIDEO", privateVideo:"JITSI VIDEO", consultationPrivacyTitle:"One room for both participants", consultationPrivacyCopy:"The appointment creates a random Jitsi room. The clinician opens it first. Jitsi controls the microphone and camera in its own tab.", consultationGuestTitle:"Patient access", consultationGuestCopy:"Share this appointment's link only with the intended patient through an approved channel.",
  consultationNeedsPatient:"No patients are registered in this workspace. Register a patient before scheduling a call.", jitsiRoomAutomatic:"A private Jitsi room link is created with this appointment. Open it first as the clinician, then share the patient link.", jitsiNotice:"Jitsi opens in a separate tab. Open the appointment room as the clinician, then share its link only with the intended patient. Use synthetic cases in this local research prototype.",
  joinCall:"Open Jitsi room", copyPatientLink:"Copy patient Jitsi link", guestRoomLink:"Patient Jitsi room link", guestRoomHelp:"Send this exact link to the intended patient. Join the room first as clinician, and ask the patient to allow microphone access in Jitsi.", invitationCopied:"Jitsi room link copied.", invitationReady:"Jitsi room link ready to copy from the field above.",
  consultationInProgress:"Open your consultation", closeMeetGuide:"Close guide", openingMeet:"Checking appointment access and opening Jitsi…", meetOpenedGuide:"Jitsi opened in a new tab. Click Join meeting, sign in as host if prompted, allow microphone access, choose the input in Jitsi Settings → Devices, and unmute there. Ask the patient to repeat a short spoken phrase to check both directions.", meetPopupBlocked:"Your browser blocked the new tab. Use Open Jitsi room below.", openGoogleMeet:"Open Jitsi room", meetAudioTitle:"Check your microphone in Jitsi", meetAudioCopy:"Click Join meeting and sign in as host if prompted. Allow microphone access, choose the input in Jitsi Settings → Devices, and unmute. Ask the patient to repeat a short phrase to check both directions. This page cannot control Jitsi audio.",
  consultationHeroCopy:"Schedule a clinician-led video appointment from the same patient record. Open its Jitsi room first, then share the link with the intended participant.", consultationRoomReady:"Review the record and confirm consent, then open the Jitsi room before sharing the patient link.", consultationUpcomingCare:"The appointment is upcoming. Open Jitsi now to check your microphone before the call.", consultationExpiredCare:"The scheduled time has passed. You can still open Jitsi; record the outcome or arrange another appointment.", completeConfirm:"Mark this appointment completed? This does not end the Jitsi call; leave the meeting in its tab.", joinCallError:"Could not open the Jitsi appointment.",
  consultationOpenLabel:"Appointment time", consultationUpcomingLabel:"Upcoming", consultationExpiredLabel:"Scheduled time passed", meetWorkflowTitle:"From appointment to follow-up", meetStepCreate:"Schedule the appointment", meetStepCreateCopy:"Select the patient and time. The app creates a random Jitsi room for this appointment.", meetStepSave:"Open as clinician", meetStepSaveCopy:"Open Jitsi in its own tab. Click Join meeting and sign in as host if prompted.", meetStepCheck:"Check your microphone", meetStepCheckCopy:"Allow browser mic access, select the input in Jitsi Settings → Devices, and unmute there.", meetStepShare:"Share the patient link", meetStepShareCopy:"Copy the link from this appointment. Ask the patient to open it on another device after you join.", meetStepComplete:"Record the outcome", meetStepCompleteCopy:"After the call, update the care record and mark the appointment completed.", meetNoSuchTitle:"Patient cannot hear?", meetNoSuchCopy:"If the microphone check stays flat, open this appointment's Jitsi link on a phone as the doctor's second device. Use the phone for microphone and sound, keep its camera off, and mute the laptop's Jitsi microphone and speakers to prevent echo. Confirm the patient hears a short phrase before consulting.",
  legacyMeetAppointment:"This older appointment used Google Meet. Schedule a new appointment to create a Jitsi room.", jitsiLinkInvalid:"The appointment returned an invalid Jitsi room link. Please try again or contact the administrator."
});
Object.assign(consultationLabels.te, {
  videoMeeting:"JITSI వీడియో", privateVideo:"JITSI వీడియో", consultationPrivacyTitle:"ఇద్దరికీ ఒకే గది", consultationPrivacyCopy:"ఈ అపాయింట్‌మెంట్‌కు యాదృచ్ఛిక Jitsi గది సిద్ధమవుతుంది. వైద్యుడు ముందుగా చేరాలి. మైక్రోఫోన్, కెమెరాను Jitsi ట్యాబ్‌లో నియంత్రించండి.", consultationGuestTitle:"రోగి ప్రవేశం", consultationGuestCopy:"ఈ అపాయింట్‌మెంట్ లింకును ఉద్దేశించిన రోగికి మాత్రమే పంపండి.",
  consultationNeedsPatient:"ఈ కార్యస్థలంలో రోగులు లేరు. కాల్ షెడ్యూల్ చేయడానికి ముందు రోగిని నమోదు చేయండి.", jitsiRoomAutomatic:"ఈ అపాయింట్‌మెంట్‌తో Jitsi గది లింకు సిద్ధమవుతుంది. వైద్యుడు ముందుగా తెరిచి, తర్వాత రోగికి పంపండి.", jitsiNotice:"Jitsi ప్రత్యేక ట్యాబ్‌లో తెరుచుకుంటుంది. వైద్యుడు ముందుగా గదిలో చేరి, లింకును ఉద్దేశించిన రోగితో మాత్రమే పంచుకోండి. ఈ స్థానిక నమూనాలో కల్పిత వివరాలనే వాడండి.",
  joinCall:"Jitsi గది తెరవండి", copyPatientLink:"రోగి Jitsi లింకును కాపీ చేయండి", guestRoomLink:"రోగి Jitsi గది లింకు", guestRoomHelp:"ఈ లింకును ఉద్దేశించిన రోగికి పంపండి. వైద్యుడు ముందుగా చేరాలి; రోగి Jitsiలో మైక్రోఫోన్ అనుమతి ఇవ్వాలి.", invitationCopied:"Jitsi గది లింకు కాపీ అయింది.", invitationReady:"పై ఫీల్డ్ నుండి Jitsi లింకును కాపీ చేయండి.",
  consultationInProgress:"వీడియో సంప్రదింపును తెరవండి", closeMeetGuide:"మార్గదర్శకం మూసివేయండి", openingMeet:"అపాయింట్‌మెంట్ ప్రవేశం తనిఖీ చేసి Jitsi తెరుస్తున్నాం…", meetOpenedGuide:"Jitsi కొత్త ట్యాబ్‌లో తెరుచుకుంది. Join meeting నొక్కండి; అడిగితే హోస్ట్‌గా సైన్ ఇన్ చేయండి. మైక్రోఫోన్ అనుమతించి, Settings → Devicesలో సరైన ఇన్‌పుట్ ఎంచుకుని అన్‌మ్యూట్ చేయండి. రోగిని చిన్న వాక్యం పలకమని అడిగి రెండు వైపులా వినిపిస్తుందో చూడండి.", meetPopupBlocked:"బ్రౌజర్ కొత్త ట్యాబ్‌ను అడ్డుకుంది. క్రింద Jitsi గది తెరవండి నొక్కండి.", openGoogleMeet:"Jitsi గది తెరవండి", meetAudioTitle:"Jitsiలో మైక్రోఫోన్ తనిఖీ చేయండి", meetAudioCopy:"Join meeting నొక్కండి; అడిగితే హోస్ట్‌గా సైన్ ఇన్ చేయండి. మైక్రోఫోన్ అనుమతించి, Jitsi Settings → Devicesలో ఇన్‌పుట్ ఎంచుకుని అన్‌మ్యూట్ చేయండి. రెండు వైపులా వినిపిస్తుందో తెలుసుకోవడానికి రోగిని చిన్న వాక్యం పలకమని అడగండి. ఈ పేజీ Jitsi ఆడియోను నియంత్రించదు.",
  consultationHeroCopy:"అదే రోగి రికార్డు నుండి వీడియో అపాయింట్‌మెంట్ షెడ్యూల్ చేయండి. ముందుగా Jitsi గదిని తెరిచి, తర్వాత ఉద్దేశించిన రోగికి లింకును పంపండి.", consultationRoomReady:"రికార్డును చూసి సమ్మతి నిర్ధారించండి; రోగికి లింకు పంపే ముందు Jitsi గదిని తెరవండి.", consultationUpcomingCare:"అపాయింట్‌మెంట్ రాబోతోంది. ముందుగానే Jitsiలో మైక్రోఫోన్ తనిఖీ చేసుకోవచ్చు.", consultationExpiredCare:"షెడ్యూల్ సమయం గడిచింది. Jitsi గది ఇంకా తెరవవచ్చు; ఫలితాన్ని నమోదు చేయండి లేదా మరో అపాయింట్‌మెంట్ ఏర్పాటు చేయండి.", completeConfirm:"ఈ అపాయింట్‌మెంట్‌ను పూర్తయిందిగా గుర్తించాలా? Jitsi కాల్‌ను ఆ ట్యాబ్‌లోనే ముగించండి.", joinCallError:"Jitsi అపాయింట్‌మెంట్ తెరవలేకపోయాం.",
  consultationOpenLabel:"అపాయింట్‌మెంట్ సమయం", consultationUpcomingLabel:"రాబోయే అపాయింట్‌మెంట్", consultationExpiredLabel:"షెడ్యూల్ సమయం గడిచింది", meetWorkflowTitle:"అపాయింట్‌మెంట్ నుండి తదుపరి సంరక్షణ వరకు", meetStepCreate:"అపాయింట్‌మెంట్ షెడ్యూల్ చేయండి", meetStepCreateCopy:"రోగి, సమయాన్ని ఎంచుకోండి. ఈ అపాయింట్‌మెంట్‌కు యాదృచ్ఛిక Jitsi గది సిద్ధమవుతుంది.", meetStepSave:"వైద్యుడు ముందుగా చేరండి", meetStepSaveCopy:"Jitsiని ప్రత్యేక ట్యాబ్‌లో తెరిచి Join meeting నొక్కండి; అడిగితే హోస్ట్‌గా సైన్ ఇన్ చేయండి.", meetStepCheck:"మైక్రోఫోన్ తనిఖీ చేయండి", meetStepCheckCopy:"మైక్రోఫోన్ అనుమతించి, Jitsi Settings → Devicesలో ఇన్‌పుట్ ఎంచుకుని అన్‌మ్యూట్ చేయండి.", meetStepShare:"రోగి లింకును పంపండి", meetStepShareCopy:"ఈ అపాయింట్‌మెంట్ నుండి లింకును కాపీ చేయండి. మీరు చేరిన తర్వాత రోగి మరో పరికరంలో తెరవాలి.", meetStepComplete:"ఫలితాన్ని నమోదు చేయండి", meetStepCompleteCopy:"కాల్ తర్వాత సంరక్షణ రికార్డును నవీకరించి అపాయింట్‌మెంట్ పూర్తయిందిగా గుర్తించండి.", meetNoSuchTitle:"రోగికి వినిపించడం లేదా?", meetNoSuchCopy:"మైక్రోఫోన్ పరీక్షలో స్థాయి మారకపోతే, ఈ అపాయింట్‌మెంట్ Jitsi లింకును వైద్యుడి ఫోన్‌లో కూడా తెరవండి. ఫోన్ మైక్రోఫోన్, స్పీకర్ వాడండి; ఫోన్ కెమెరా ఆపండి. ప్రతిధ్వని రాకుండా ల్యాప్‌టాప్ Jitsiలో మైక్రోఫోన్, స్పీకర్ మ్యూట్ చేయండి. సంప్రదింపుకు ముందు రోగికి చిన్న వాక్యం వినిపిస్తుందో నిర్ధారించండి.",
  legacyMeetAppointment:"ఈ పాత అపాయింట్‌మెంట్ Google Meetతో ఉంది. Jitsi గది కోసం కొత్త అపాయింట్‌మెంట్ షెడ్యూల్ చేయండి.", jitsiLinkInvalid:"అపాయింట్‌మెంట్ నుండి చెల్లని Jitsi లింకు వచ్చింది. మళ్లీ ప్రయత్నించండి లేదా నిర్వాహకుడిని సంప్రదించండి."
});
function t(key) { return translations[state.language]?.[key] || consultationLabels[state.language]?.[key] || offlineLabels[state.language]?.[key] || translations.en[key] || consultationLabels.en[key] || offlineLabels.en[key] || key; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function dateLabel(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat(state.language === "te" ? "te-IN" : "en-IN", {day:"numeric",month:"short",year:"numeric"}).format(d); }
function dateTimeLabel(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(state.language === "te" ? "te-IN" : "en-IN", {day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d); }
function today() { return new Intl.DateTimeFormat(state.language === "te" ? "te-IN" : "en-IN", {weekday:"short",day:"numeric",month:"short"}).format(new Date()); }
function currentRoleLabel() { if(!state.user)return ""; if(state.offlineMode)return t("roleOfflineWorker"); const key={health_worker:"roleHealthWorker",medical_officer:"roleMedicalOfficer",specialist:"roleSpecialist",admin:"roleAdmin"}[state.user.role]; return key?t(key):state.user.role.replaceAll("_"," "); }
Object.assign(translations.en, {
  registeredBy:"REGISTERED BY",
  roleWorkerKicker:"FIELD CARE", roleWorkerTitle:"My patient records", roleWorkerPatients:"Your registrations and their care journey are visible here. Clinical decisions belong to the doctor.", roleWorkerMetric:"Patients registered by you",
  roleDoctorKicker:"CLINICAL CARE", roleDoctorTitle:"Worker and doctor records", roleDoctorPatients:"Review registrations from all health workers and clinical colleagues, then record the next care step.", roleDoctorMetric:"Worker and doctor patient records",
  roleAdminKicker:"DISTRICT OVERSIGHT", roleAdminTitle:"All care records", roleAdminPatients:"View records created by every worker, doctor and administrator, with their registered-by details.", roleAdminMetric:"All patient records"
});
Object.assign(translations.te, {
  registeredBy:"నమోదు చేసినవారు",
  roleWorkerKicker:"క్షేత్ర సంరక్షణ", roleWorkerTitle:"నా రోగి రికార్డులు", roleWorkerPatients:"మీరు నమోదు చేసిన రోగులు, వారి సంరక్షణ వివరాలు ఇక్కడ కనిపిస్తాయి. వైద్య నిర్ణయాలు వైద్యుడివి.", roleWorkerMetric:"మీరు నమోదు చేసిన రోగులు",
  roleDoctorKicker:"వైద్య సంరక్షణ", roleDoctorTitle:"కార్యకర్తలు మరియు వైద్యుల రికార్డులు", roleDoctorPatients:"అందరి ఆరోగ్య కార్యకర్తలు మరియు వైద్యులు నమోదు చేసిన రోగులను సమీక్షించి తదుపరి సంరక్షణను నమోదు చేయండి.", roleDoctorMetric:"కార్యకర్తలు మరియు వైద్యుల రోగులు",
  roleAdminKicker:"జిల్లా పర్యవేక్షణ", roleAdminTitle:"అన్ని సంరక్షణ రికార్డులు", roleAdminPatients:"కార్యకర్తలు, వైద్యులు, నిర్వాహకులు నమోదు చేసిన అన్ని రికార్డులను, నమోదు చేసినవారి వివరాలతో చూడండి.", roleAdminMetric:"అన్ని రోగి రికార్డులు"
});
function roleWorkspacePrefix(role) { return role==="admin"?"roleAdmin":role==="health_worker"?"roleWorker":"roleDoctor"; }
function configureRoleWorkspace(role) {
  const prefix=roleWorkspacePrefix(role);
  $("roleScopeKicker").dataset.i18n=prefix+"Kicker";
  $("roleScopeTitle").dataset.i18n=prefix+"Title";
  $("patientsScopeDescription").dataset.i18n=prefix+"Patients";
  $("roleMetricScope").dataset.i18n=prefix+"Metric";
}
function showToast(message) { const el=$("toast"); el.textContent=message; el.classList.add("visible"); clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.remove("visible"),2800); }

async function api(path, options={}) {
  const requestOwner=state.user?.id, requestRole=state.user?.role;
  let response;
  try { response=await fetch(path,{credentials:"same-origin",...options,headers:{...(options.body instanceof FormData?{}:{"Content-Type":"application/json"}),...(options.headers||{})}}); }
  catch { const error=new Error(t("serverUnavailable")); error.network=true; throw error; }
  if(!["/api/health","/api/session","/api/login","/api/logout"].includes(path)&&(state.user?.id!==requestOwner||state.user?.role!==requestRole)) {
    const stale=new Error("The signed-in account changed. Open this page again.");stale.stale=true;throw stale;
  }
  const type=response.headers.get("content-type")||"";
  const data=type.includes("application/json")?await response.json():{};
  if (!response.ok) { if (response.status===401 && path!=="/api/login") showLogin(); const error=new Error(data.error||t("loadError")); error.status=response.status; throw error; }
  return data;
}
function showLogin() { closeConsultationCall(); for(const id of ["patientDialog","patientRecordDialog","receiptDialog","referenceImageDialog"]) {const dialog=$(id);if(dialog?.open)dialog.close();} const record=$("patientRecordContent");if(record)record.replaceChildren(); $("receiptDetails")?.replaceChildren?.(); if(window.OfflineVault) window.OfflineVault.lock(); state.user=null; state.offlineMode=false; state.vaultOwner=null; state.syncErrors={}; state.syncingDrafts=false; state.pendingPatientSubmission=null; $("appView").hidden=true; $("loginView").hidden=false; }
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
  configureRoleWorkspace(user.role);
  document.querySelectorAll("[data-admin-only]").forEach(el=>el.hidden=user.role!=="admin");
  const canConsult=user.role==="admin"||user.role==="medical_officer"||user.role==="specialist";
  const canVideo=canConsult;
  const reviewForm=$("reviewForm"), referralForm=$("referralForm");
  if(reviewForm)reviewForm.hidden=!canConsult;
  if(referralForm)referralForm.hidden=!canConsult;
  document.querySelectorAll("[data-clinician-only]").forEach(el=>el.hidden=!canConsult);
  document.querySelectorAll("[data-video-only]").forEach(el=>el.hidden=!canVideo);
  document.querySelectorAll("[data-page]").forEach(el=>{
    if(offline) el.hidden=el.dataset.page!=="patients";
    else if(el.hasAttribute("data-admin-only")) el.hidden=user.role!=="admin";
    else if(el.hasAttribute("data-clinician-only")) el.hidden=!canConsult;
    else if(el.hasAttribute("data-video-only")) el.hidden=!canVideo;
    else el.hidden=false;
  });
  $("offlineOnlyNotice").hidden=!offline;
  const name=user.display_name||user.username;
  $("userLabel").textContent=name; $("welcomeName").textContent=name.split(" ")[0];
  $("userInitial").textContent=name.charAt(0).toUpperCase(); $("topInitial").textContent=name.charAt(0).toUpperCase();
  $("roleLabel").textContent=currentRoleLabel();
  translate();
  if(offline) { state.connectionStatus="offlineDraftPending"; $("syncIndicator").className="sync-indicator offline"; $("syncLabel").textContent=t(state.connectionStatus); goPage("patients"); }
  else { state.page="home"; document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-home")); document.querySelectorAll(".nav-item").forEach(el=>{const active=el.dataset.page==="home";el.classList.toggle("active",active);if(active)el.setAttribute?.("aria-current","page");else el.removeAttribute?.("aria-current");}); translate(); refreshAll().catch(err=>showToast(err.message)); if(vaultUnlockedForCurrentUser()) refreshOfflineDraftPanel().catch(err=>showToast(err.message)); }
}
function translate() {
  document.documentElement.lang=state.language;
  document.querySelectorAll("[data-i18n]").forEach(el=>{const val=t(el.dataset.i18n);if(val&&val!==el.dataset.i18n)el.textContent=val;});
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));
  document.querySelectorAll("[data-i18n-alt]").forEach(el=>el.alt=t(el.dataset.i18nAlt));
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el=>el.setAttribute("aria-label",t(el.dataset.i18nAriaLabel)));
  if($("syncLabel"))$("syncLabel").textContent=t(state.connectionStatus);
  $("languageChoice").textContent=state.language==="en"?"తెలుగు":"English";
  $("languageButton").setAttribute("aria-label",t(state.language==="en"?"switchToTelugu":"switchToEnglish"));
  if(state.user)$("roleLabel").textContent=currentRoleLabel();
  $("todayLabel").textContent=today();
  $("pageTitle").textContent=t(({home:"overview",patients:"patients",screening:"screening",review:"clinicalReview",care:"careCoordination",references:"references",consultations:"consultations",audit:"auditLog",assistant:"healthAssistant"})[state.page]);
  $("pageContext").textContent=t(({home:"contextHome",patients:"contextPatients",screening:"contextScreening",review:"contextReview",care:"contextCare",references:"contextReferences",consultations:"contextConsultations",audit:"contextAudit",assistant:"contextAssistant"})[state.page]);
}
function navigationFocusable() {
  const sidebar=$("sidebar");
  if(!sidebar?.querySelectorAll)return [];
  return [...sidebar.querySelectorAll('a[href],button:not([disabled])')]
    .filter(el=>!el.hidden&&!el.closest?.("[hidden]")&&el.getClientRects?.().length);
}
function ensureActiveNavigationVisible() {
  const nav=$("sidebar")?.querySelector?.(".side-nav"), active=nav?.querySelector?.(".nav-item.active");
  if(!nav||!active||!nav.getBoundingClientRect||!active.getBoundingClientRect)return;
  const viewport=nav.getBoundingClientRect(), row=active.getBoundingClientRect();
  if(row.top<viewport.top)nav.scrollTop+=row.top-viewport.top;
  else if(row.bottom>viewport.bottom)nav.scrollTop+=row.bottom-viewport.bottom;
}
function setNavigationOpen(open, restoreFocus=false) {
  const sidebar=$("sidebar"), wasOpen=sidebar.classList.contains("open");
  if(open&&!wasOpen)state.navigationReturnFocus=document.activeElement;
  sidebar.classList.toggle("open", Boolean(open));
  $("menuButton")?.setAttribute?.("aria-expanded", String(Boolean(open)));
  const backdrop=$("navigationBackdrop");
  if(backdrop) backdrop.hidden=!open;
  if(open&&!wasOpen){const items=navigationFocusable();(items.find(el=>el.classList?.contains("active"))||items[0])?.focus?.();ensureActiveNavigationVisible();}
  if(!open&&wasOpen&&restoreFocus)(state.navigationReturnFocus?.isConnected?state.navigationReturnFocus:$("menuButton"))?.focus?.();
}
function handleNavigationKeydown(event) {
  const sidebar=$("sidebar");
  if(!sidebar.classList.contains("open"))return;
  if(event.key==="Escape") {event.preventDefault();setNavigationOpen(false,true);return;}
  if(event.key!=="Tab")return;
  const items=navigationFocusable();
  if(!items.length)return;
  const first=items[0],last=items[items.length-1],current=document.activeElement;
  if(!sidebar.contains?.(current)||event.shiftKey&&current===first||!event.shiftKey&&current===last) {
    event.preventDefault();
    (event.shiftKey&&sidebar.contains?.(current)?last:first).focus();
  }
}
function handleWorkspaceAction(button) {
  goPage(button.dataset.go);
  if(button.hasAttribute("data-register")&&state.page==="patients") openPatientDialog();
}
function goPage(page) {
  if(!["home","patients","screening","review","care","references","consultations","audit","assistant"].includes(page)) return;
  if(state.offlineMode&&page!=="patients") return;
  const canConsult=["admin","medical_officer","specialist"].includes(state.user?.role);
  if(page==="review"&&!canConsult) return;
  if(page==="audit"&&state.user?.role!=="admin") return;
  if(page==="consultations"&&!canConsult) return;
  if(state.page==="consultations"&&page!=="consultations") closeConsultationCall();
  state.page=page;
  document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id===`page-${page}`));
  document.querySelectorAll(".nav-item").forEach(el=>{
    const active=el.dataset.page===page;
    el.classList.toggle("active",active);
    if(active)el.setAttribute?.("aria-current","page");
    else el.removeAttribute?.("aria-current");
  });
  const navigationWasOpen=$("sidebar").classList.contains("open");
  setNavigationOpen(false);
  if(navigationWasOpen)$("mainWorkspace")?.focus?.();
  translate();
  const load={home:()=>loadDashboard(),patients:()=>loadPatients(),screening:()=>loadPatients().then(()=>loadScreenings()),review:()=>loadPatients().then(()=>loadReviews()),care:()=>loadPatients().then(()=>loadCare()),consultations:()=>loadPatients().then(()=>loadConsultations()),audit:()=>loadAudit()}[page];
  if(load) Promise.resolve().then(load).catch(err=>showToast(err.message));
}

function openPatientDialog() { if(!$("patientDialog").open) $("patientDialog").showModal(); $("patientError").textContent=""; }

async function refreshAll() { if(state.offlineMode) return; state.connectionStatus="syncing"; $("syncLabel").textContent=t(state.connectionStatus); try { await api("/api/health"); state.connectionStatus="serverOnline"; $("syncIndicator").className="sync-indicator"; $("syncLabel").textContent=t(state.connectionStatus); await loadDashboard(); } catch { state.connectionStatus="serverOffline"; $("syncIndicator").className="sync-indicator offline"; $("syncLabel").textContent=t(state.connectionStatus); throw new Error(t("serverUnavailable")); } }
async function loadDashboard() { const data=await api("/api/dashboard"); $("metricPatients").textContent=data.patients; $("metricScreenings").textContent=data.screenings; $("metricFollowups").textContent=data.followups; $("metricReferrals").textContent=data.referrals; const has=data.patients>0; $("recentEmpty").hidden=has; $("journeyEmpty").hidden=has; $("recentPatientsBody").innerHTML=data.recent.map(p=>`<tr><td><div class="patient-cell"><span class="patient-initial">${escapeHtml(p.name[0]?.toUpperCase())}</span>${escapeHtml(p.name)}</div></td><td><span class="id-code">${escapeHtml(p.patient_code)}</span></td><td>${escapeHtml(p.village)}</td><td>${dateLabel(p.created_at)}</td><td><button class="row-action" data-open-patient="${escapeHtml(p.id)}">${t("viewRecord")} →</button></td></tr>`).join(""); }
async function loadPatients() { if(state.offlineMode) { state.patients=[]; $("patientRecordsPanel").hidden=true; renderPatients(); fillPatientSelects(); await refreshOfflineDraftPanel(); return {patients:[]}; } const data=await api("/api/patients"); state.patients=data.patients; if(window.OfflineScreening&&vaultUnlockedForCurrentUser()) await window.OfflineScreening.cachePatients(data.patients,{ownerUsername:state.vaultOwner,isCurrentUser:owner=>vaultUnlockedForCurrentUser()&&state.user?.username.toLowerCase()===owner}); $("patientRecordsPanel").hidden=false; renderPatients(); fillPatientSelects(); window.dispatchEvent(new Event("aarogya-patients-loaded")); if(vaultUnlockedForCurrentUser()) await refreshOfflineDraftPanel(); return data; }
async function refreshOfflineDraftPanel() {
  const panel=$("offlineDraftPanel");
  if(!vaultUnlockedForCurrentUser()) { panel.hidden=true; return []; }
  const entries=(await window.OfflineVault.listOperations()).filter(entry=>entry.operation?.type==="patient-registration-v1");
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
  try { entries=(await window.OfflineVault.listOperations()).filter(entry=>entry.operation?.type==="patient-registration-v1"); }
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
function patientRow(p) {
  const roleKey={health_worker:"roleHealthWorker",medical_officer:"roleMedicalOfficer",specialist:"roleSpecialist",admin:"roleAdmin"}[p.creator_role];
  const creator=`<div class="record-origin"><b>${escapeHtml(p.creator_name||"")}</b><small>${escapeHtml(roleKey?t(roleKey):p.creator_role||"")}</small></div>`;
  return `<tr><td><div class="patient-cell"><span class="patient-initial">${escapeHtml(p.name[0]?.toUpperCase())}</span>${escapeHtml(p.name)}</div></td><td><span class="id-code">${escapeHtml(p.patient_code)}</span></td><td>${escapeHtml(p.age)} ${t("ageYears")} / ${escapeHtml(p.gender||"-")}</td><td>${escapeHtml(p.village)}</td><td>${creator}</td><td>${dateLabel(p.created_at)}</td><td><div class="patient-row-actions"><button class="row-action" data-open-patient="${escapeHtml(p.id)}">${t("viewRecord")} &rarr;</button><button class="row-action receipt-link" type="button" data-registration-receipt="${escapeHtml(p.id)}">${t("receiptRegistrationAction")}</button></div></td></tr>`;
}
function renderPatients() { const term=$("patientSearch").value.trim().toLowerCase(); const rows=state.patients.filter(p=>`${p.name} ${p.patient_code} ${p.village} ${p.creator_name||""}`.toLowerCase().includes(term)); $("patientCount").textContent=`${rows.length} / ${state.patients.length}`; $("patientsBody").innerHTML=rows.map(patientRow).join(""); $("patientsEmpty").hidden=state.patients.length>0; }
function fillPatientSelects() { for(const id of ["screenPatient","reviewPatient","referralPatient","followPatient","consultPatient"]) { const sel=$(id), previous=sel.value; sel.innerHTML=`<option value="">${t("selectPatient")}</option>`+state.patients.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.patient_code)} · ${escapeHtml(p.name)}</option>`).join(""); if(state.patients.some(p=>p.id===previous)) sel.value=previous; } $("consultationEmptyPatients").hidden=state.patients.length>0; $("consultationSaveButton").disabled=state.patients.length===0; }
async function loadScreenings() {
  const data=await api("/api/screenings"),el=$("screeningList");
  el.innerHTML=data.screenings.length?data.screenings.map(s=>`<article class="record-row screening-record"><span class="record-bullet">◎</span><div class="record-copy"><div class="screening-record-details"><b>${escapeHtml(s.patient_name)} <span class="id-code">${escapeHtml(s.patient_code)}</span></b><p>${escapeHtml(s.location||"Oral image captured")} · ${escapeHtml(s.status)} · ${escapeHtml(s.image_width)}×${escapeHtml(s.image_height)}</p></div><figure class="screening-record-media"><a href="/api/images/${encodeURIComponent(s.id)}" target="_blank" rel="noopener noreferrer">Open protected screening photo</a><img class="image-preview" src="/api/images/${encodeURIComponent(s.id)}" alt="Screening photograph for ${escapeHtml(s.patient_name)}. Clinician review required; this is not an AI result." loading="lazy"><figcaption class="record-meta">Screening photograph · requires clinician assessment; no diagnosis is shown.</figcaption></figure></div><time class="record-meta">${escapeHtml(dateLabel(s.created_at))}</time></article>`).join(""):`<div class="empty-state"><p>${t("noScreenings")}</p></div>`;
}
async function loadReviews() { const data=await api("/api/reviews"); const el=$("reviewList"); el.innerHTML=data.reviews.length?data.reviews.map(r=>`<div class="record-row"><span class="record-bullet">▤</span><div class="record-copy"><b>${escapeHtml(r.patient_name)} <span class="id-code">${escapeHtml(r.patient_code)}</span></b><p>${escapeHtml(r.status)} · ${escapeHtml(r.reviewer)} · ${escapeHtml(r.observations)}</p></div><span class="record-meta">${dateLabel(r.created_at)}</span></div>`).join(""):`<div class="empty-state"><p>${t("noReviews")}</p></div>`; }
async function loadCare() { const data=await api("/api/care"); const all=[...data.referrals.map(x=>({...x,kind:"referral",detail:`${x.facility} · ${x.department} · ${x.status}`})),...data.followups.map(x=>({...x,kind:"followup",detail:`${t("followUp")} · ${x.status} · ${x.notes}`}))].sort((a,b)=>String(b.created_at||b.due_date).localeCompare(String(a.created_at||a.due_date))); $("careList").innerHTML=all.length?all.map(r=>`<div class="record-row"><span class="record-bullet">${r.kind==="referral"?"↗":"◷"}</span><div class="record-copy"><b>${escapeHtml(r.patient_name)} <span class="id-code">${escapeHtml(r.patient_code)}</span></b><p>${escapeHtml(r.detail)}${r.reason?` · ${escapeHtml(r.reason)}`:""}</p></div><span class="record-meta">${dateLabel(r.due_date||r.created_at)}</span></div>`).join(""):`<div class="empty-state"><p>${t("noCareRecords")}</p></div>`; }
async function loadConsultations() {
  const data=await api("/api/consultations");
  state.consultationsConfigured=Boolean(data.configured);
  state.videoProvider=data.provider||"jitsi";
  const notice=$("consultationStatusNotice");
  notice.classList.toggle("not-configured",!state.consultationsConfigured);
  notice.textContent=t("jitsiNotice");
  const records=data.consultations||[];
  $("consultationCount").textContent=String(records.length);
  if(!records.length) { $("consultationList").innerHTML=`<div class="empty-state"><p>${t("noConsultations")}</p></div>`; return; }
  const groups={ready:[],upcoming:[],past:[]};
  for(const item of records) {
    const access=item.status==="scheduled"?(item.access_state||(item.can_join?"open":"upcoming")):item.status;
    const group=access==="open"?"ready":access==="upcoming"?"upcoming":"past";
    const statusKey=access==="open"?"consultationOpenLabel":access==="upcoming"?"consultationUpcomingLabel":access==="expired"?"consultationExpiredLabel":`consultationStatus${item.status.charAt(0).toUpperCase()+item.status.slice(1)}`;
    const isJitsi=item.video_provider==="jitsi";
    const enabled=state.consultationsConfigured&&isJitsi&&item.status==="scheduled"&&item.can_join===true;
    const windowNotice=access==="open"?(enabled?t("consultationRoomReady"):""):access==="upcoming"?t("consultationUpcomingCare"):access==="expired"?t("consultationExpiredCare"):access==="completed"?t("consultationCompletedCare"):access==="cancelled"?t("consultationCancelledCare"):"";
    const callActions=(enabled?`<button class="button primary" type="button" data-join-consultation="${escapeHtml(item.id)}">${t("joinCall")}</button><button class="button secondary" type="button" data-copy-consultation-link="${escapeHtml(item.id)}">${t("copyPatientLink")}</button>`:"");
    const management=item.status==="scheduled"?`${access!=="upcoming"?`<button class="button secondary" type="button" data-complete-consultation="${escapeHtml(item.id)}">${t("completeAppointment")}</button>`:""}<button class="text-button danger-text" type="button" data-cancel-consultation="${escapeHtml(item.id)}">${t("cancelAppointment")}</button>`:"";
    const receiptAction=item.status==="completed"?`<button class="button secondary receipt-link" type="button" data-completion-receipt="${escapeHtml(item.id)}">${t("receiptCompletionAction")}</button>`:"";
    const actions=callActions||management||receiptAction?`<div class="consultation-actions">${callActions}${management}${receiptAction}</div>`:"";
    const unavailable=item.status==="scheduled"&&!isJitsi?`<p class="consultation-window">${t("legacyMeetAppointment")}</p>`:"";
    const patientRecord=item.patient_id?`<div class="consultation-record-care${group==="past"?" consultation-record-care-compact":""}">${group==="past"?"":`<div class="consultation-care-copy"><b>${t("consultationCareRecord")}</b><p>${t("consultationCareContext")}</p></div>`}<button class="row-action" type="button" data-open-patient="${escapeHtml(item.patient_id)}">${t("consultationViewRecord")} <span aria-hidden="true">→</span></button></div>`:"";
    groups[group].push(`<article class="consultation-record consultation-record-${escapeHtml(access)}"><div class="consultation-record-main"><span class="consultation-record-icon"><svg class="icon" aria-hidden="true"><use href="#icon-video"></use></svg></span><div class="consultation-record-person"><b>${escapeHtml(item.patient_name)}</b><span class="id-code">${escapeHtml(item.patient_code)}</span></div><span class="status-pill status-${escapeHtml(access)}">${escapeHtml(t(statusKey))}</span></div><div class="consultation-record-meta"><time datetime="${escapeHtml(item.scheduled_at)}">${escapeHtml(dateTimeLabel(item.scheduled_at))}</time><span>${escapeHtml(item.duration_minutes)} ${t("minutesUnit")}</span><span class="id-code">${t("consultationReference")}: ${escapeHtml(item.id.slice(0,8).toUpperCase())}</span></div>${patientRecord}${windowNotice?`<p class="consultation-window">${escapeHtml(windowNotice)}</p>`:""}${unavailable}${actions}</article>`);
  }
  $("consultationList").innerHTML=[
    ["ready","consultationReadyNow"],["upcoming","consultationUpcoming"],["past","consultationPast"]
  ].filter(([group])=>groups[group].length).map(([group,title])=>`<section class="consultation-group consultation-group-${group}"><div class="consultation-group-heading"><h3>${t(title)}</h3><span class="count-label">${groups[group].length}</span></div><div class="consultation-group-list">${groups[group].join("")}</div></section>`).join("");
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
function canonicalJitsiUrl(value) {
  try {
    const url=new URL(String(value||"").trim());
    if(url.protocol!=="https:"||url.hostname!=="meet.jit.si"||url.username||url.password||url.port||url.search||url.hash||!/^\/[a-f0-9]{48}$/.test(url.pathname)) return "";
    return `https://meet.jit.si${url.pathname}`;
  } catch { return ""; }
}
async function joinConsultation(id) {
  const tab=window.open("about:blank","_blank");
  if(tab) tab.opener=null;
  closeConsultationCall();
  state.activeConsultation=id;
  const panel=$("consultationCallPanel"); panel.hidden=false;
  $("consultationCallState").textContent=t("openingMeet");
  const link=$("consultationExternalLink"); link.removeAttribute("href");
  try {
    const data=await api(`/api/consultations/${encodeURIComponent(id)}/join`,{method:"POST",body:"{}"});
    if(state.activeConsultation!==id||state.page!=="consultations"||!state.user) { if(tab) tab.close(); return; }
    const meetingUrl=canonicalJitsiUrl(data.meeting_url);
    if(!meetingUrl) throw new Error(t("jitsiLinkInvalid"));
    link.href=meetingUrl;
    if(tab) {
      tab.location.replace(meetingUrl);
      $("consultationCallState").textContent=t("meetOpenedGuide");
    } else {
      $("consultationCallState").textContent=t("meetPopupBlocked");
      showToast(t("meetPopupBlocked"));
    }
  } catch(err) {
    if(tab) tab.close();
    $("consultationCallState").textContent=err.message||t("joinCallError");
    showToast(err.message||t("joinCallError"));
  } finally {
    if(state.page==="consultations"&&state.user) loadConsultations().catch(()=>{});
  }
}
function closeConsultationCall() {
  state.activeConsultation=null;
  const panel=$("consultationCallPanel"); if(panel) panel.hidden=true;
  const link=$("consultationExternalLink"); if(link) link.removeAttribute("href");
}
async function copyConsultationLink(id) {
  try {
    const data=await api(`/api/consultations/${encodeURIComponent(id)}/invite`,{method:"POST",body:"{}"});
    const guestUrl=canonicalJitsiUrl(data.guest_url);
    if(!guestUrl) throw new Error(t("jitsiLinkInvalid"));
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
  try {await api(`/api/consultations/${encodeURIComponent(id)}/complete`,{method:"POST",body:"{}"});if(state.activeConsultation===id)closeConsultationCall();$("consultationInvitePanel").hidden=true;showToast(t("appointmentCompleted"));try{await loadConsultations();}catch(refreshError){showToast(refreshError.message);}await openCompletionReceipt(id);}
  catch(err) {showToast(err.message);}
}
async function loadAudit() { if(state.user?.role!=="admin") return; const data=await api("/api/audit"); const records=data.records||[]; $("auditEmpty").hidden=records.length>0; $("auditBody").innerHTML=records.map(r=>`<tr><td>${escapeHtml(r.actor_name)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.entity_type)}</td><td><span class="id-code">${escapeHtml(r.entity_id)}</span></td><td>${escapeHtml(dateTimeLabel(r.created_at))}</td></tr>`).join(""); }
function showReceipt(type, record) {
  const registration=type==="registration";
  $("receiptTitle").textContent=t(registration?"receiptRegistrationTitle":"receiptCompletionTitle");
  $("receiptLead").textContent=t(registration?"receiptRegistrationLead":"receiptCompletionLead");
  const fields=registration?[
    ["receiptPatientName",record.name],["receiptPatientCode",record.patient_code],
    ["receiptRegisteredAt",record.created_at?dateTimeLabel(record.created_at):null]
  ]:[
    ["receiptPatientName",record.patient_name],["receiptPatientCode",record.patient_code],
    ["receiptConsultationId",record.id],["receiptScheduledAt",record.scheduled_at?dateTimeLabel(record.scheduled_at):null],
    ["receiptCompletedAt",record.completed_at?dateTimeLabel(record.completed_at):null],["receiptCompletedBy",record.completed_by_name]
  ];
  $("receiptDetails").innerHTML=fields.filter(([,value])=>value!==null&&value!==undefined&&value!=="").map(([label,value])=>`<div><dt>${escapeHtml(t(label))}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  if(!$("receiptDialog").open)$("receiptDialog").showModal();
}
async function openRegistrationReceipt(id) {
  if(state.offlineMode||!state.user)return;
  try { const data=await api(`/api/patients/${encodeURIComponent(id)}`); if(!data.patient?.patient_code)throw new Error(t("receiptUnavailable")); showReceipt("registration",data.patient); }
  catch(error) { showToast(error.message||t("receiptUnavailable")); }
}
async function openCompletionReceipt(id) {
  if(!["medical_officer","specialist"].includes(state.user?.role))return;
  try { const data=await api("/api/consultations"); const record=(data.consultations||[]).find(item=>item.id===id&&item.status==="completed"); if(!record)throw new Error(t("receiptUnavailable")); showReceipt("completion",record); }
  catch(error) { showToast(error.message||t("receiptUnavailable")); }
}
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
    f.reset(); $("district").value="Alluri Sitharama Raju"; $("patientDialog").close(); showToast(`${t("patientSaved")} ${result.patient.patient_code}`);
    try {await loadPatients(); if(state.page==="consultations") $("consultPatient").value=result.patient.id; await loadDashboard();} catch(refreshError) {showToast(refreshError.message);}
    await openRegistrationReceipt(result.patient.id);
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
  $("consultationForm").addEventListener("submit",createConsultation); $("closeConsultationCall").addEventListener("click",()=>closeConsultationCall()); const localNow=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); $("consultationTime").min=localNow;
  $("newPatientButton").addEventListener("click",openPatientDialog); $("emptyRegisterButton").addEventListener("click",openPatientDialog); $("closePatientDialog").addEventListener("click",()=>$("patientDialog").close()); $("cancelPatient").addEventListener("click",()=>$("patientDialog").close()); $("oralImage").addEventListener("change",e=>qualityCheck(e.target.files[0])); $("patientSearch").addEventListener("input",renderPatients); $("languageButton").addEventListener("click",()=>{state.language=state.language==="en"?"te":"en";localStorage.setItem("adLanguage",state.language);translate();if(state.user) goPage(state.page);});
  document.querySelectorAll("[data-page]").forEach(el=>el.addEventListener("click",()=>goPage(el.dataset.page))); document.querySelectorAll("[data-go]").forEach(el=>el.addEventListener("click",()=>handleWorkspaceAction(el))); $("menuButton").addEventListener("click",()=>setNavigationOpen(!$("sidebar").classList.contains("open"),true)); $("navigationBackdrop")?.addEventListener("click",()=>setNavigationOpen(false,true)); document.addEventListener("keydown",handleNavigationKeydown); $("closePatientRecord").addEventListener("click",()=>$("patientRecordDialog").close()); $("closeReceipt").addEventListener("click",()=>$("receiptDialog").close()); $("printReceipt").addEventListener("click",()=>window.print()); document.addEventListener("click",e=>{const button=e.target.closest("[data-open-patient]");if(button)openPatientRecord(button.dataset.openPatient);})
  document.addEventListener("click",e=>{const join=e.target.closest("[data-join-consultation]");const invite=e.target.closest("[data-copy-consultation-link]");const cancel=e.target.closest("[data-cancel-consultation]");const complete=e.target.closest("[data-complete-consultation]");const registrationReceipt=e.target.closest("[data-registration-receipt]");const completionReceipt=e.target.closest("[data-completion-receipt]");const discard=e.target.closest("[data-discard-offline-draft]");if(join)joinConsultation(join.dataset.joinConsultation);else if(invite)copyConsultationLink(invite.dataset.copyConsultationLink);else if(cancel)cancelConsultation(cancel.dataset.cancelConsultation);else if(complete)completeConsultation(complete.dataset.completeConsultation);else if(registrationReceipt)openRegistrationReceipt(registrationReceipt.dataset.registrationReceipt);else if(completionReceipt)openCompletionReceipt(completionReceipt.dataset.completionReceipt);else if(discard)discardOfflineDraft(discard.dataset.discardOfflineDraft);});
  $("logoutButton").addEventListener("click",async()=>{closeConsultationCall();if(state.offlineMode){showLogin();return;}try{await api("/api/logout",{method:"POST",body:"{}"});}finally{showLogin();}});
  try {const session=await api("/api/session");if(session.authenticated)showApp(session.user);else showLogin();}catch{showLogin();$("loginError").textContent=t("serverUnavailable");}
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(()=>{});
}
document.addEventListener("DOMContentLoaded",boot);
