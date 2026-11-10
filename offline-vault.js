/*
 * Encrypted offline operation vault for the Aarogya Drishti PWA.
 *
 * This module stores operation payloads only as AES-GCM ciphertext in IndexedDB.
 * Callers should use random opaque vault/entry IDs and delete an entry only after
 * the server has confirmed that operation was committed. This is an application
 * building block, not a security certification; review key handling, device use,
 * and the complete deployment with a qualified security reviewer before storing
 * real patient information.
 *
 * The user-provided passphrase is never stored. The derived CryptoKey is kept only
 * in this page's memory while unlocked. JavaScript cannot guarantee that memory is
 * securely erased, and same-origin script running while unlocked can access data.
 */
(function installOfflineVault(global) {
  "use strict";

  const DATABASE_NAME = "aarogya-offline-vault-v1";
  const DATABASE_VERSION = 1;
  const VAULT_STORE = "vaults";
  const ENTRY_STORE = "entries";
  const VAULT_ENTRY_INDEX = "byVault";
  const KDF_ITERATIONS = 310000;
  const KDF_HASH = "SHA-256";
  const AES_ALGORITHM = "AES-GCM";
  const AES_LENGTH = 256;
  const IV_BYTES = 12;
  const SALT_BYTES = 16;
  const CANARY_TEXT = "aarogya-offline-vault-canary-v1";
  const encoder = new TextEncoder();

  let activeVaultId = null;
  let activeKey = null;

  class OfflineVaultError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "OfflineVaultError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    return new OfflineVaultError(code, message, cause);
  }

  function requirePlatform() {
    if (!global.isSecureContext) {
      throw fail("SECURE_CONTEXT_REQUIRED", "Offline vault requires HTTPS or a secure local development origin.");
    }
    if (!global.indexedDB) {
      throw fail("INDEXEDDB_UNAVAILABLE", "This browser does not provide IndexedDB storage.");
    }
    if (!global.crypto || !global.crypto.subtle || !global.crypto.getRandomValues) {
      throw fail("WEBCRYPTO_UNAVAILABLE", "This browser does not provide the required Web Crypto features.");
    }
  }

  function validateVaultId(vaultId) {
    if (typeof vaultId !== "string" || vaultId.length < 1 || vaultId.length > 128) {
      throw fail("INVALID_VAULT_ID", "Vault ID must be a non-empty opaque string of at most 128 characters.");
    }
    return vaultId;
  }

  function validateEntryId(entryId) {
    if (typeof entryId !== "string" || entryId.length < 1 || entryId.length > 128) {
      throw fail("INVALID_ENTRY_ID", "Entry ID must be a non-empty opaque string of at most 128 characters.");
    }
    return entryId;
  }

  function validatePassphrase(passphrase) {
    if (typeof passphrase !== "string" || passphrase.length < 12 || passphrase.length > 256) {
      throw fail("INVALID_PASSPHRASE", "Offline vault passphrases must be 12 to 256 characters long.");
    }
  }

  function randomBytes(length) {
    return global.crypto.getRandomValues(new Uint8Array(length));
  }

  function randomId() {
    const bytes = randomBytes(16);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function openDatabase() {
    requirePlatform();
    return new Promise((resolve, reject) => {
      let settled = false;
      let request;
      try {
        request = global.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      } catch (error) {
        reject(fail("STORAGE_OPEN_FAILED", "Could not open offline vault storage.", error));
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(VAULT_STORE)) {
          db.createObjectStore(VAULT_STORE, { keyPath: "vaultId" });
        }
        if (!db.objectStoreNames.contains(ENTRY_STORE)) {
          const entries = db.createObjectStore(ENTRY_STORE, { keyPath: ["vaultId", "id"] });
          entries.createIndex(VAULT_ENTRY_INDEX, "vaultId", { unique: false });
        }
      };

      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(fail("STORAGE_OPEN_FAILED", "Could not open offline vault storage.", request.error));
      };

      request.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(fail("STORAGE_BLOCKED", "Offline vault storage upgrade is blocked by another open tab. Close other app tabs and try again."));
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        resolve(db);
      };
    });
  }

  function storageError(error, fallbackCode, fallbackMessage) {
    if (error && error.name === "QuotaExceededError") {
      return fail("STORAGE_QUOTA_EXCEEDED", "Offline storage is full. Sync or remove acknowledged drafts before saving more.", error);
    }
    if (error && error.name === "InvalidStateError") {
      return fail("STORAGE_UNAVAILABLE", "Offline storage is unavailable in this browser session.", error);
    }
    return fail(fallbackCode, fallbackMessage, error);
  }

  async function withDatabase(action, fallbackCode, fallbackMessage) {
    const db = await openDatabase();
    try {
      return await action(db);
    } catch (error) {
      if (error instanceof OfflineVaultError) throw error;
      throw storageError(error, fallbackCode, fallbackMessage);
    } finally {
      db.close();
    }
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || fail("STORAGE_TRANSACTION_FAILED", "Offline storage transaction was cancelled."));
      transaction.onerror = () => reject(transaction.error || fail("STORAGE_TRANSACTION_FAILED", "Offline storage transaction failed."));
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || fail("STORAGE_REQUEST_FAILED", "Offline storage request failed."));
    });
  }

  async function deriveKey(passphrase, salt) {
    validatePassphrase(passphrase);
    const material = await global.crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return global.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: KDF_HASH },
      material,
      { name: AES_ALGORITHM, length: AES_LENGTH },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function aad(vaultId, entryId, kind) {
    return encoder.encode(`${DATABASE_VERSION}:${vaultId}:${kind}:${entryId}`);
  }

  async function encryptBytes(key, bytes, vaultId, entryId, kind) {
    const iv = randomBytes(IV_BYTES);
    const ciphertext = await global.crypto.subtle.encrypt(
      { name: AES_ALGORITHM, iv, additionalData: aad(vaultId, entryId, kind), tagLength: 128 },
      key,
      bytes
    );
    return { iv, ciphertext };
  }

  async function decryptBytes(key, sealed, vaultId, entryId, kind) {
    return global.crypto.subtle.decrypt(
      { name: AES_ALGORITHM, iv: sealed.iv, additionalData: aad(vaultId, entryId, kind), tagLength: 128 },
      key,
      sealed.ciphertext
    );
  }

  async function readVault(vaultId) {
    return withDatabase(async db => {
      const tx = db.transaction(VAULT_STORE, "readonly");
      const result = await requestValue(tx.objectStore(VAULT_STORE).get(vaultId));
      await transactionDone(tx);
      return result || null;
    }, "VAULT_READ_FAILED", "Could not read offline vault metadata.");
  }

  async function verifyKey(key, meta) {
    try {
      const clear = await decryptBytes(key, meta.canary, meta.vaultId, "canary", "verification");
      return new TextDecoder().decode(clear) === CANARY_TEXT;
    } catch {
      return false;
    }
  }

  function activate(vaultId, key) {
    activeVaultId = vaultId;
    activeKey = key;
  }

  /** Create a vault and unlock it in this page. Vault IDs should be opaque. */
  async function createVault(passphrase, vaultId = "default") {
    requirePlatform();
    validatePassphrase(passphrase);
    validateVaultId(vaultId);

    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(passphrase, salt);
    const sealedCanary = await encryptBytes(key, encoder.encode(CANARY_TEXT), vaultId, "canary", "verification");
    const meta = {
      vaultId,
      schemaVersion: DATABASE_VERSION,
      kdf: "PBKDF2-SHA-256",
      iterations: KDF_ITERATIONS,
      salt,
      canary: sealedCanary
    };

    await withDatabase(async db => {
      const tx = db.transaction(VAULT_STORE, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(VAULT_STORE).add(meta);
      await done;
    }, "VAULT_CREATE_FAILED", "Could not create offline vault metadata.").catch(error => {
      if (error.cause && error.cause.name === "ConstraintError") {
        throw fail("VAULT_EXISTS", "An offline vault already exists for this ID.", error.cause);
      }
      throw error;
    });

    activate(vaultId, key);
    return { vaultId };
  }

  /** Verify a passphrase without unlocking the vault or retaining its key. */
  async function verifyPassphrase(passphrase, vaultId = "default") {
    requirePlatform();
    validatePassphrase(passphrase);
    validateVaultId(vaultId);
    const meta = await readVault(vaultId);
    if (!meta) throw fail("VAULT_NOT_FOUND", "No offline vault exists for this ID.");
    const key = await deriveKey(passphrase, meta.salt);
    return verifyKey(key, meta);
  }

  /** Verify a passphrase, then keep its non-extractable key in memory until lock(). */
  async function unlockVault(passphrase, vaultId = "default") {
    requirePlatform();
    validatePassphrase(passphrase);
    validateVaultId(vaultId);
    const meta = await readVault(vaultId);
    if (!meta) throw fail("VAULT_NOT_FOUND", "No offline vault exists for this ID.");
    if (meta.schemaVersion !== DATABASE_VERSION || meta.iterations !== KDF_ITERATIONS || meta.kdf !== "PBKDF2-SHA-256") {
      throw fail("VAULT_VERSION_UNSUPPORTED", "This offline vault uses a version this app cannot open.");
    }
    const key = await deriveKey(passphrase, meta.salt);
    if (!(await verifyKey(key, meta))) {
      throw fail("BAD_PASSPHRASE_OR_VAULT", "Passphrase is incorrect or vault verification failed.");
    }
    activate(vaultId, key);
    return { vaultId };
  }

  function requireUnlocked() {
    if (!activeVaultId || !activeKey) {
      throw fail("VAULT_LOCKED", "Unlock the offline vault before accessing queued operations.");
    }
    return { vaultId: activeVaultId, key: activeKey };
  }

  /** Encrypt and save one immutable JSON operation using a fresh random IV. */
  async function putOperation(operation, entryId = randomId()) {
    requirePlatform();
    const { vaultId, key } = requireUnlocked();
    validateEntryId(entryId);
    let json;
    try {
      json = JSON.stringify(operation);
    } catch (error) {
      throw fail("OPERATION_NOT_SERIALIZABLE", "Operation must be JSON-serializable.", error);
    }
    if (json === undefined) {
      throw fail("OPERATION_NOT_SERIALIZABLE", "Operation must be JSON-serializable.");
    }
    const sealed = await encryptBytes(key, encoder.encode(json), vaultId, entryId, "operation");
    const stored = { vaultId, id: entryId, iv: sealed.iv, ciphertext: sealed.ciphertext };

    await withDatabase(async db => {
      const tx = db.transaction(ENTRY_STORE, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(ENTRY_STORE).add(stored);
      await done;
    }, "OPERATION_SAVE_FAILED", "Could not save encrypted offline operation.").catch(error => {
      if (error.cause && error.cause.name === "ConstraintError") {
        throw fail("ENTRY_EXISTS", "An offline operation already uses this ID.", error.cause);
      }
      throw error;
    });
    return entryId;
  }

  /** Return decrypted operations for the unlocked vault; storage remains ciphertext-only. */
  async function listOperations() {
    requirePlatform();
    const { vaultId, key } = requireUnlocked();
    const entries = await withDatabase(async db => {
      const tx = db.transaction(ENTRY_STORE, "readonly");
      const done = transactionDone(tx);
      const results = await requestValue(tx.objectStore(ENTRY_STORE).index(VAULT_ENTRY_INDEX).getAll(vaultId));
      await done;
      return results;
    }, "OPERATION_READ_FAILED", "Could not read encrypted offline operations.");

    const operations = [];
    for (const entry of entries) {
      try {
        const clear = await decryptBytes(key, entry, vaultId, entry.id, "operation");
        operations.push({ id: entry.id, operation: JSON.parse(new TextDecoder().decode(clear)) });
      } catch (error) {
        throw fail("ENTRY_DECRYPT_FAILED", "An encrypted offline operation could not be verified or opened.", error);
      }
    }
    return operations;
  }

  /** Remove an entry only after its caller has received a successful server acknowledgement. */
  async function deleteAcknowledged(entryId) {
    requirePlatform();
    const { vaultId } = requireUnlocked();
    validateEntryId(entryId);
    await withDatabase(async db => {
      const tx = db.transaction(ENTRY_STORE, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(ENTRY_STORE).delete([vaultId, entryId]);
      await done;
    }, "OPERATION_DELETE_FAILED", "Could not remove acknowledged offline operation.");
  }

  /** Remove a draft only after an explicit user decision to discard a sync conflict. */
  async function discardOperation(entryId) {
    requirePlatform();
    const { vaultId } = requireUnlocked();
    validateEntryId(entryId);
    await withDatabase(async db => {
      const tx = db.transaction(ENTRY_STORE, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(ENTRY_STORE).delete([vaultId, entryId]);
      await done;
    }, "OPERATION_DELETE_FAILED", "Could not discard offline operation.");
  }

  /** Drop the in-memory key reference. JavaScript cannot guarantee memory zeroization. */
  function lock() {
    activeKey = null;
    activeVaultId = null;
  }

  const api = Object.freeze({
    createVault,
    unlockVault,
    verifyPassphrase,
    putOperation,
    listOperations,
    deleteAcknowledged,
    discardOperation,
    lock,
    isUnlocked: () => activeKey !== null
  });

  Object.defineProperty(global, "OfflineVault", {
    value: api,
    configurable: false,
    enumerable: false,
    writable: false
  });
})(window);
