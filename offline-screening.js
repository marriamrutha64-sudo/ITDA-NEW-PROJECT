/* Encrypted offline photographs, patient choices, and explicit same-user sync.
 * Requires offline-vault.js. Never stores a photo or patient list in localStorage
 * or the service-worker cache. Callers must supply isCurrentUser(ownerUsername).
 */
(function installOfflineScreening(global) {
  "use strict";

  const CAPTURE_TYPE = "screening-capture-v1";
  const CACHE_TYPE = "screening-patient-cache-v1";
  const MAX_IMAGE = 7 * 1024 * 1024;
  const OPERATION_ID = /^[0-9a-f]{32}$/;

  function failure(message, status = 400) {
    return Object.assign(new Error(message), { status });
  }
  function context(options = {}) {
    const vault = options.vault || global.OfflineVault;
    const owner = String(options.ownerUsername || "").trim().toLowerCase();
    if (!owner || typeof options.isCurrentUser !== "function") {
      throw failure("An unlocked same-user vault context is required.", 403);
    }
    const assertCurrent = () => {
      if (!vault?.isUnlocked() || options.isCurrentUser(owner) !== true) {
        throw failure("The offline vault or account changed. Unlock this account's vault and retry.", 401);
      }
    };
    assertCurrent();
    return { vault, owner, assertCurrent };
  }
  function text(value, name, maximum, required = false) {
    const result = String(value || "").trim();
    if (result.length > maximum || (required && !result)) throw failure(`Enter a valid ${name}.`);
    return result;
  }
  function id() {
    return Array.from(global.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");
  }
  function bytesToBase64(bytes) {
    let binary = "";
    for (let start = 0; start < bytes.length; start += 32768) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
    }
    return global.btoa(binary);
  }
  function base64ToBytes(encoded) {
    if (typeof encoded !== "string" || !encoded || encoded.length > Math.ceil(MAX_IMAGE / 3) * 4 ||
        encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw failure("This encrypted photograph could not be opened for sync.");
    }
    const binary = global.atob(encoded);
    return Uint8Array.from(binary, value => value.charCodeAt(0));
  }
  function imageInfo(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
      return { mime: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes.length > 10 && bytes[0] === 255 && bytes[1] === 216) {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if ([216, 217].includes(marker) || (marker >= 208 && marker <= 215)) continue;
        if (offset + 2 > bytes.length) break;
        const length = view.getUint16(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
          return { mime: "image/jpeg", width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
        }
        offset += length;
      }
    }
    if (bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
      const kind = String.fromCharCode(...bytes.subarray(12, 16));
      if (kind === "VP8X") return { mime: "image/webp",
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
      if (kind === "VP8 ") return { mime: "image/webp", width: view.getUint16(26, true) & 16383, height: view.getUint16(28, true) & 16383 };
    }
    return null;
  }
  function validateImage(bytes) {
    if (!bytes.length || bytes.length > MAX_IMAGE) throw failure("Choose a photograph smaller than 7 MB.");
    const info = imageInfo(bytes);
    if (!info) throw failure("Choose a supported JPEG, PNG or WebP photograph.");
    if (Math.min(info.width, info.height) < 240 || info.width * info.height > 20000000) {
      throw failure("The photograph must be at least 240 pixels on each side and no more than 20 megapixels.");
    }
    return info;
  }
  async function entriesFor(ctx) {
    const entries = await ctx.vault.listOperations();
    ctx.assertCurrent();
    return entries;
  }

  async function cachePatients(patients, options) {
    const ctx = context(options);
    if (!Array.isArray(patients)) throw failure("Patient choices were not provided.");
    const minimal = patients.slice(0, 1000).map(patient => ({
      id: text(patient.id, "patient ID", 40, true),
      name: text(patient.name, "patient name", 120, true),
      patient_code: text(patient.patient_code, "patient code", 40),
      consent: patient.consent === true || patient.consent === 1
    }));
    const entries = await entriesFor(ctx);
    const newId = id();
    ctx.assertCurrent();
    await ctx.vault.putOperation({ type: CACHE_TYPE, owner_username: ctx.owner, cached_at: new Date().toISOString(), patients: minimal }, newId);
    ctx.assertCurrent();
    // A new encrypted server snapshot is durable before old snapshots are removed.
    for (const entry of entries) {
      if (entry.operation?.type === CACHE_TYPE && entry.operation.owner_username === ctx.owner) {
        ctx.assertCurrent();
        await ctx.vault.deleteAcknowledged(entry.id);
      }
    }
    return newId;
  }

  function choicesFrom(entries, owner) {
    const choices = [];
    const caches = entries.filter(entry => entry.operation?.type === CACHE_TYPE && entry.operation.owner_username === owner)
      .sort((a, b) => String(b.operation.cached_at).localeCompare(String(a.operation.cached_at)));
    for (const patient of caches[0]?.operation.patients || []) {
      if (!patient.consent) continue;
      choices.push({ value: `patient:${patient.id}`, patientId: patient.id, patientOperationId: "",
        label: `${patient.patient_code || "Registered"} · ${patient.name}`, cached: true });
    }
    for (const entry of entries) {
      if (entry.operation?.type !== "patient-registration-v1" || !entry.operation.patient?.consent || !OPERATION_ID.test(entry.id)) continue;
      choices.push({ value: `draft:${entry.id}`, patientId: "", patientOperationId: entry.id,
        label: `Pending registration · ${entry.operation.patient.name || "Patient draft"}`, cached: false });
    }
    return choices;
  }
  async function listPatientChoices(options) {
    const ctx = context(options);
    return choicesFrom(await entriesFor(ctx), ctx.owner);
  }
  async function listQueued(options) {
    const ctx = context(options);
    return (await entriesFor(ctx)).filter(entry => entry.operation?.type === CAPTURE_TYPE && entry.operation.owner_username === ctx.owner);
  }

  async function queueCapture(capture, options) {
    const ctx = context(options);
    const patientId = text(capture.patientId, "patient ID", 40);
    const patientOperationId = text(capture.patientOperationId, "pending registration ID", 32).toLowerCase();
    if (Boolean(patientId) === Boolean(patientOperationId) || (patientOperationId && !OPERATION_ID.test(patientOperationId))) {
      throw failure("Choose a registered patient or a pending registration.");
    }
    const choices = choicesFrom(await entriesFor(ctx), ctx.owner);
    if (!choices.some(choice => choice.patientId === patientId && choice.patientOperationId === patientOperationId)) {
      throw failure("This patient is not in this vault's consented offline choices. Refresh patients online or create a consented patient draft.", 403);
    }
    if (!capture.file || typeof capture.file.arrayBuffer !== "function" || capture.file.size > MAX_IMAGE) {
      throw failure("Choose a photograph smaller than 7 MB.");
    }
    const fields = {
      worker: text(capture.worker, "health-worker name", 120, true),
      location: text(capture.location, "area observed", 80),
      duration: text(capture.duration, "symptom duration", 120),
      notes: text(capture.notes, "screening notes", 2000)
    };
    const bytes = new Uint8Array(await capture.file.arrayBuffer());
    ctx.assertCurrent();
    const info = validateImage(bytes);
    const operation = {
      type: CAPTURE_TYPE, owner_username: ctx.owner,
      patient_id: patientId, patient_operation_id: patientOperationId,
      captured_at: new Date().toISOString(), ...fields,
      image: { base64: bytesToBase64(bytes), mime: info.mime, bytes: bytes.length }
    };
    const operationId = id();
    ctx.assertCurrent();
    await ctx.vault.putOperation(operation, operationId);
    ctx.assertCurrent();
    return { operation_id: operationId, captured_at: operation.captured_at };
  }

  async function syncQueued(options = {}) {
    const ctx = context(options);
    const api = options.api;
    if (typeof api !== "function") throw failure("Authenticated synchronization is not available.");
    const entries = (await entriesFor(ctx)).filter(entry => entry.operation?.type === CAPTURE_TYPE && entry.operation.owner_username === ctx.owner);
    const result = { synced: 0, pending: entries.length, errors: [], interrupted: false };
    for (const entry of entries) {
      try {
        ctx.assertCurrent();
        const session = await api("/api/session");
        ctx.assertCurrent();
        if (!session.authenticated || session.user?.role !== "health_worker" ||
            String(session.user?.username || "").toLowerCase() !== ctx.owner) {
          throw failure("Sign in online with the same health-worker account to synchronize these photographs.", 401);
        }
        const operation = entry.operation;
        if (!OPERATION_ID.test(entry.id)) throw failure("Invalid encrypted screening operation ID.");
        const bytes = base64ToBytes(operation.image?.base64);
        const info = validateImage(bytes);
        if (operation.image?.bytes !== bytes.length || operation.image.mime !== info.mime) throw failure("Encrypted photo metadata does not match its image.");
        const form = new global.FormData();
        form.append("operation_id", entry.id);
        for (const key of ["patient_id", "patient_operation_id", "worker", "location", "duration", "notes", "captured_at"]) {
          form.append(key, operation[key] || "");
        }
        form.append("image", new global.Blob([bytes], { type: info.mime }), "offline-capture" + ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[info.mime]));
        ctx.assertCurrent();
        const acknowledgement = await api("/api/offline/screenings", { method: "POST", headers: { "Idempotency-Key": entry.id }, body: form });
        ctx.assertCurrent();
        if (acknowledgement.ok !== true || acknowledgement.operation_id !== entry.id || !acknowledgement.screening?.id) {
          throw failure("The server acknowledgement did not match this photograph. It remains encrypted for retry.", 502);
        }
        await ctx.vault.deleteAcknowledged(entry.id);
        ctx.assertCurrent();
        result.synced++;
        result.pending--;
      } catch (error) {
        result.errors.push({ id: entry.id, message: error.message || "Photograph synchronization failed.", status: error.status || 0 });
        if (!error.status || error.status === 401 || error.status >= 500) {
          result.interrupted = true;
          break;
        }
      }
    }
    return result;
  }

  Object.defineProperty(global, "OfflineScreening", {
    value: Object.freeze({ cachePatients, listPatientChoices, listQueued, queueCapture, syncQueued }),
    configurable: false, writable: false
  });
})(window);
