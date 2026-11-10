const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const moduleSource = fs.readFileSync(path.join(__dirname, "..", "offline-vault.js"), "utf8");
const DATABASE_NAME = "aarogya-offline-vault-v1";

class FakeRequest {
  result = undefined;
  error = null;
  onsuccess = null;
  onerror = null;
}

class FakeDatabase {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = { contains: name => this.stores.has(name) };
  }

  createObjectStore(name, options) {
    const store = { keyPath: options.keyPath, values: new Map(), indexes: new Map() };
    this.stores.set(name, store);
    return new FakeObjectStore(this, name, null);
  }

  transaction(storeNames, mode) {
    return new FakeTransaction(this, Array.isArray(storeNames) ? storeNames : [storeNames], mode);
  }

  close() {}
}

class FakeTransaction {
  constructor(database, storeNames, mode) {
    this.database = database;
    this.storeNames = storeNames;
    this.mode = mode;
    this.error = null;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
    this.finished = false;
  }

  objectStore(name) {
    if (!this.storeNames.includes(name)) throw new Error(`Unexpected store ${name}`);
    return new FakeObjectStore(this.database, name, this);
  }

  complete() {
    if (this.finished) return;
    this.finished = true;
    queueMicrotask(() => this.oncomplete && this.oncomplete());
  }

  abort(error) {
    if (this.finished) return;
    this.finished = true;
    this.error = error;
    queueMicrotask(() => {
      if (this.onerror) this.onerror({ target: this });
      if (this.onabort) this.onabort({ target: this });
    });
  }
}

class FakeObjectStore {
  constructor(database, name, transaction) {
    this.database = database;
    this.name = name;
    this.transaction = transaction;
  }

  get definition() {
    return this.database.stores.get(this.name);
  }

  createIndex(name, keyPath, options) {
    this.definition.indexes.set(name, { keyPath, unique: Boolean(options && options.unique) });
  }

  index(name) {
    if (!this.definition.indexes.has(name)) throw new Error(`Unexpected index ${name}`);
    return {
      getAll: query => this.read(() => [...this.definition.values.values()]
        .filter(value => value.vaultId === query))
    };
  }

  add(value) {
    return this.write(() => {
      const key = this.keyFor(value);
      if (this.definition.values.has(key)) {
        const error = new Error("Duplicate IndexedDB key");
        error.name = "ConstraintError";
        throw error;
      }
      this.definition.values.set(key, structuredClone(value));
      return key;
    });
  }

  get(key) {
    return this.read(() => this.definition.values.get(this.normalizeKey(key)));
  }

  getAll(query) {
    return this.read(() => {
      const values = [...this.definition.values.values()];
      return query === undefined ? values : values.filter(value => value.vaultId === query);
    });
  }

  delete(key) {
    return this.write(() => this.definition.values.delete(this.normalizeKey(key)));
  }

  keyFor(value) {
    return this.normalizeKey(Array.isArray(this.definition.keyPath)
      ? this.definition.keyPath.map(key => value[key])
      : value[this.definition.keyPath]);
  }

  normalizeKey(key) {
    return Array.isArray(key) ? key.join("\u0000") : String(key);
  }

  read(action) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      try {
        const result = action();
        request.result = Array.isArray(result) ? structuredClone(result) : structuredClone(result);
        if (request.onsuccess) request.onsuccess({ target: request });
        this.transaction.complete();
      } catch (error) {
        request.error = error;
        if (request.onerror) request.onerror({ target: request });
        this.transaction.abort(error);
      }
    });
    return request;
  }

  write(action) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      try {
        request.result = action();
        if (request.onsuccess) request.onsuccess({ target: request });
        this.transaction.complete();
      } catch (error) {
        request.error = error;
        if (request.onerror) request.onerror({ target: request });
        this.transaction.abort(error);
      }
    });
    return request;
  }
}

class FakeIndexedDB {
  constructor() {
    this.databases = new Map();
  }

  open(name) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      let database = this.databases.get(name);
      const needsUpgrade = !database;
      if (!database) {
        database = new FakeDatabase();
        this.databases.set(name, database);
      }
      request.result = database;
      if (needsUpgrade && request.onupgradeneeded) request.onupgradeneeded({ target: request });
      if (request.onsuccess) request.onsuccess({ target: request });
    });
    return request;
  }
}

function createVaultApi() {
  const indexedDB = new FakeIndexedDB();
  const window = { indexedDB, crypto: webcrypto, isSecureContext: true };
  vm.runInNewContext(moduleSource, { window, TextEncoder, TextDecoder });
  return { api: window.OfflineVault, indexedDB };
}

test("creates a vault, verifies passphrase, encrypts entries, and unlocks only with the correct passphrase", async () => {
  const { api } = createVaultApi();
  await api.createVault("long test passphrase", "test-user");
  assert.equal(api.isUnlocked(), true);

  const id = await api.putOperation({ kind: "patient", name: "Example Patient" }, "entry-opaque-001");
  assert.equal(id, "entry-opaque-001");
  api.lock();
  assert.equal(api.isUnlocked(), false);
  await assert.rejects(api.listOperations(), error => error.code === "VAULT_LOCKED");

  assert.equal(await api.verifyPassphrase("wrong passphrase", "test-user"), false);
  await assert.rejects(api.unlockVault("wrong passphrase", "test-user"), error => error.code === "BAD_PASSPHRASE_OR_VAULT");
  await api.unlockVault("long test passphrase", "test-user");
  const result = await api.listOperations();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { id: "entry-opaque-001", operation: { kind: "patient", name: "Example Patient" } }
  ]);
});

test("persists ciphertext only with a fresh 12-byte AES-GCM IV for every operation", async () => {
  const { api, indexedDB } = createVaultApi();
  await api.createVault("another long passphrase", "test-user");
  await api.putOperation({ kind: "screening", notes: "private note" }, "entry-opaque-002");
  await api.putOperation({ kind: "screening", notes: "another private note" }, "entry-opaque-003");

  const database = indexedDB.databases.get(DATABASE_NAME);
  const storedEntries = [...database.stores.get("entries").values.values()];
  assert.equal(storedEntries.length, 2);
  assert.deepEqual(
    storedEntries.map(entry => Object.keys(entry).sort()),
    [
      ["ciphertext", "id", "iv", "vaultId"],
      ["ciphertext", "id", "iv", "vaultId"]
    ]
  );
  assert.ok(storedEntries.every(entry => entry.iv.byteLength === 12));
  assert.ok(storedEntries.every(entry => entry.ciphertext instanceof ArrayBuffer));
  assert.notDeepEqual([...storedEntries[0].iv], [...storedEntries[1].iv]);
  const bytes = storedEntries.flatMap(entry => [...new Uint8Array(entry.ciphertext)]);
  const ciphertextText = String.fromCharCode(...bytes);
  assert.equal(ciphertextText.includes("private note"), false);

  const metadata = [...database.stores.get("vaults").values.values()][0];
  assert.equal(metadata.salt.byteLength, 16);
  assert.equal(metadata.iterations, 310000);
  assert.ok(metadata.canary.ciphertext instanceof ArrayBuffer);
  assert.equal(Object.hasOwn(metadata, "key"), false);
  assert.equal(Object.hasOwn(metadata, "passphrase"), false);
});

test("rejects a tampered encrypted operation", async () => {
  const { api, indexedDB } = createVaultApi();
  await api.createVault("tamper test passphrase", "test-user");
  await api.putOperation({ kind: "patient", name: "Hidden" }, "entry-opaque-004");

  const stored = [...indexedDB.databases.get(DATABASE_NAME).stores.get("entries").values.values()][0];
  const changed = new Uint8Array(stored.ciphertext.slice(0));
  changed[0] ^= 0x01;
  stored.ciphertext = changed.buffer;
  await assert.rejects(api.listOperations(), error => error.code === "ENTRY_DECRYPT_FAILED");
});

test("deletes an operation only through the acknowledgement API", async () => {
  const { api } = createVaultApi();
  await api.createVault("delete test passphrase", "test-user");
  await api.putOperation({ kind: "patient" }, "entry-opaque-005");
  await api.deleteAcknowledged("entry-opaque-005");
  assert.deepEqual(JSON.parse(JSON.stringify(await api.listOperations())), []);
});

test("requires a strong enough passphrase and allows explicit discard", async () => {
  const { api } = createVaultApi();
  await assert.rejects(api.createVault("short", "test-user"), error => error.code === "INVALID_PASSPHRASE");
  await api.createVault("explicit discard test passphrase", "test-user");
  await api.putOperation({ kind: "patient" }, "entry-opaque-006");
  await api.discardOperation("entry-opaque-006");
  assert.deepEqual(JSON.parse(JSON.stringify(await api.listOperations())), []);
});
