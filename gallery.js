(() => {
  "use strict";

  const dialog = document.getElementById("referenceImageDialog");
  const fullImage = document.getElementById("referenceDialogImage");
  const title = document.getElementById("referenceDialogTitle");
  const caption = document.getElementById("referenceDialogCaption");
  const closeButton = document.getElementById("closeReferenceImage");
  if (!dialog || !fullImage || !title || !caption || !closeButton) return;

  let lastTrigger = null;

  document.querySelectorAll(".reference-open").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const card = trigger.closest(".reference-card");
      const image = trigger.querySelector("img");
      const heading = card?.querySelector("h3");
      const description = card?.querySelector("figcaption p");
      if (!image || !heading || !description) return;

      lastTrigger = trigger;
      fullImage.src = image.src;
      fullImage.alt = image.alt;
      title.textContent = heading.textContent;
      caption.textContent = description.textContent;
      document.body.classList.add("reference-dialog-open");
      dialog.showModal();
    });
  });

  closeButton.addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialog.close();
    }
  });

  // Native dialog behavior handles Escape and confines keyboard focus to the image viewer.
  dialog.addEventListener("close", () => {
    document.body.classList.remove("reference-dialog-open");
    fullImage.removeAttribute("src");
    fullImage.alt = "";
    if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
    lastTrigger = null;
  });
})();
