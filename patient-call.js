/* Older app invitations cannot prove access to the current appointment room. */
(() => {
  const status=document.getElementById("patientCallStatus");
  if(!status) return;
  if(new URLSearchParams(location.hash.slice(1)).has("room")) {
    status.textContent="This older room link cannot open the current Jitsi appointment. Ask the clinician to copy the patient link from Consultations.";
  }
})();
