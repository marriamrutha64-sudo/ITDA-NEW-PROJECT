// Experimental model observations stay separate from human clinical review.
document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("screeningList");
  let available = false;
  fetch("/api/health").then(r => r.json()).then(data => {
    available = Boolean(data.ai?.available);
    if (available) {
      document.getElementById("modelStatus").textContent = "MedGemma configured · unvalidated";
      if (typeof translations !== "undefined") {
        Object.assign(translations.en, {
          notConfigured:"Local MedGemma installed",
          modelCopy:"Local MedGemma can generate experimental observations. Oral screening performance has not been validated; clinician review is required.",
          experimentalOnly:"Unvalidated model observations"
        });
        Object.assign(translations.te, {
          notConfigured:"స్థానిక MedGemma ఇన్‌స్టాల్ అయింది",
          modelCopy:"MedGemma ప్రయోగాత్మక పరిశీలనలను రూపొందించగలదు. నోటి పరీక్ష ఖచ్చితత్వం ఇంకా ధృవీకరించలేదు; వైద్యుని సమీక్ష అవసరం.",
          experimentalOnly:"ధృవీకరించని మోడల్ పరిశీలనలు"
        });
        if (typeof translate === "function") translate();
      }
    }
    enhance();
  }).catch(() => {});
  function enhance() {
    for (const link of list.querySelectorAll('a[href^="/api/images/"]')) {
      const row = link.closest(".record-copy");
      if (!row || row.querySelector(".medgemma-action")) continue;
      const button = document.createElement("button");
      button.className = "button secondary medgemma-action";
      button.type = "button";
      button.textContent = available ? "Experimental MedGemma observations" : "MedGemma setup required";
      button.disabled = !available;
      const output = document.createElement("pre");
      output.style.whiteSpace = "pre-wrap";
      output.setAttribute("role", "status");
      button.addEventListener("click", async () => {
        if (!confirm("MedGemma is unvalidated for oral screening. Generated observations can be incorrect. Continue for experimental clinician review?")) return;
        button.disabled = true;
        output.textContent = "Running local MedGemma. This may take several minutes…";
        try {
          const response = await fetch("/api/ai/analyze", {
            method: "POST", credentials: "same-origin", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({screening_id: decodeURIComponent(link.getAttribute("href").split("/").pop()), acknowledge_experimental: true})
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Inference failed.");
          output.textContent = `${data.notice}\n\n${data.text}`;
        } catch (error) { output.textContent = error.message; }
        finally { button.disabled = false; }
      });
      row.append(button, output);
    }
  }
  new MutationObserver(enhance).observe(list, {childList: true, subtree: true});
});
