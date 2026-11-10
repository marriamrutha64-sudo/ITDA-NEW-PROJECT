"""HTTP dry runs for offline photos, idempotency, ownership and vault integration."""
import http.cookiejar
import json
import os
import struct
import subprocess
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid
import zlib
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import app
import offline_screenings


def png(width=320, height=240, shade=128):
    def chunk(kind, value):
        return struct.pack(">I", len(value)) + kind + value + struct.pack(">I", zlib.crc32(kind + value) & 0xFFFFFFFF)
    pixels = (b"\x00" + bytes([shade, shade, shade]) * width) * height
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")


class SyncHandler(app.Handler):
    """Exercise the new module without requiring edits to app.py for this suite."""
    def do_POST(self):
        if urlparse(self.path).path == offline_screenings.PATH:
            try:
                offline_screenings.handle_post(self, self.user(), offline_screenings.PATH, app)
            except Exception:
                self.json({"error": "Synthetic transaction failed."}, 500)
            return
        super().do_POST()

    def log_message(self, *_):
        pass


class OfflineScreeningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_paths = app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH
        cls.temporary = tempfile.TemporaryDirectory(prefix="aarogya-offline-photo-tests-")
        app.DATA_DIR = Path(cls.temporary.name)
        app.UPLOAD_DIR = app.DATA_DIR / "uploads"
        app.DB_PATH = app.DATA_DIR / "test.sqlite3"
        cls.original_secret = os.environ.get("AAROGYA_SESSION_SECRET")
        os.environ["AAROGYA_SESSION_SECRET"] = "offline-photo-test-secret-at-least-32-characters"
        for username, role in [("capture-worker", "health_worker"), ("other-worker", "health_worker"), ("capture-admin", "admin")]:
            app.create_user(username, "synthetic-password-for-tests", role, username)
        with app.connect() as db:
            offline_screenings.ensure_schema(db)
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), SyncHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(3)
        app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH = cls.original_paths
        if cls.original_secret is None:
            os.environ.pop("AAROGYA_SESSION_SECRET", None)
        else:
            os.environ["AAROGYA_SESSION_SECRET"] = cls.original_secret
        cls.temporary.cleanup()

    def setUp(self):
        with app.connect() as db:
            db.execute("DROP TRIGGER IF EXISTS reject_synthetic_capture")
            for table in ["offline_screening_receipts", "offline_sync_receipts", "audit_log", "screenings", "patients"]:
                db.execute("DELETE FROM " + table)
        for file in app.UPLOAD_DIR.iterdir():
            file.unlink()

    def client(self):
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, client, path, body=None, headers=None, method="POST"):
        request = urllib.request.Request(self.base + path, data=body, headers=headers or {}, method=method)
        try:
            with client.open(request, timeout=10) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            try:
                return error.code, json.loads(error.read())
            finally:
                error.close()

    def login(self, username="capture-worker"):
        client = self.client()
        status, result = self.request(client, "/api/login", json.dumps({"username": username, "password": "synthetic-password-for-tests"}).encode(), {"Content-Type": "application/json"})
        self.assertEqual(status, 200, result)
        return client

    def patient(self, client, operation_id=None, name="Synthetic Offline Capture"):
        operation_id = operation_id or uuid.uuid4().hex
        status, result = self.request(client, "/api/offline/patients", json.dumps({
            "name": name, "age": 30, "village": "Synthetic Village", "consent": True
        }).encode(), {"Origin": self.base, "Content-Type": "application/json", "Idempotency-Key": operation_id})
        self.assertEqual(status, 201, result)
        return result["patient"]["id"]

    def fields(self, patient_id=None, patient_operation_id=None, operation_id=None):
        return {
            "operation_id": operation_id or uuid.uuid4().hex,
            "patient_id": patient_id or "", "patient_operation_id": patient_operation_id or "",
            "worker": "Synthetic Worker", "location": "Gums", "duration": "2 weeks",
            "notes": "Synthetic test photograph only", "captured_at": "2026-01-01T10:00:00.000Z"
        }

    def upload(self, client, fields, image=None, extra_headers=None, origin=True, extra_parts=()):
        boundary = "aarogya-test-" + uuid.uuid4().hex
        parts = []
        for name, value in list(fields.items()) + list(extra_parts):
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        if image is not False:
            image = png() if image is None else image
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + image + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        headers = {"Content-Type": "multipart/form-data; boundary=" + boundary, "Idempotency-Key": fields.get("operation_id", "")}
        if origin:
            headers["Origin"] = self.base
        headers.update(extra_headers or {})
        return self.request(client, offline_screenings.PATH, b"".join(parts), headers)

    def counts(self):
        with app.connect() as db:
            return tuple(db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] for table in ["screenings", "offline_screening_receipts"]) + (len(list(app.UPLOAD_DIR.iterdir())),)

    def test_photo_sync_and_replay_preserve_capture_time_without_duplicates(self):
        client = self.login()
        patient_id = self.patient(client)
        fields = self.fields(patient_id=patient_id)
        image = png()
        status, first = self.upload(client, fields, image)
        self.assertEqual(status, 201, first)
        self.assertTrue(first["ok"])
        self.assertEqual(first["operation_id"], fields["operation_id"])
        self.assertEqual(first["screening"]["patient_id"], patient_id)
        self.assertEqual(first["screening"]["captured_at"], "2026-01-01T10:00:00.000+00:00")
        status, replay = self.upload(client, fields, image)
        self.assertEqual(status, 200, replay)
        self.assertEqual(replay, first)
        self.assertEqual(self.counts(), (1, 1, 1))
        with app.connect() as db:
            row = db.execute("SELECT * FROM screenings").fetchone()
            self.assertEqual(row["captured_at"], first["screening"]["captured_at"])
            self.assertEqual((app.UPLOAD_DIR / row["image_name"]).read_bytes(), image)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_log WHERE entity_type='screening'").fetchone()[0], 1)
        self.assertNotIn("name", first["screening"])
        self.assertNotIn("notes", first["screening"])

    def test_changed_image_or_fields_conflict_with_same_operation(self):
        client = self.login()
        fields = self.fields(patient_id=self.patient(client))
        self.assertEqual(self.upload(client, fields)[0], 201)
        changed = dict(fields, notes="Changed synthetic notes")
        self.assertEqual(self.upload(client, changed)[0], 409)
        self.assertEqual(self.upload(client, fields, png(shade=20))[0], 409)
        self.assertEqual(self.counts(), (1, 1, 1))

    def test_unsynced_patient_dependency_is_retained_then_resolved_from_same_actor_receipt(self):
        client = self.login()
        pending_id = uuid.uuid4().hex
        fields = self.fields(patient_operation_id=pending_id)
        status, missing = self.upload(client, fields)
        self.assertEqual(status, 409)
        self.assertIn("registration", missing["error"])
        self.assertEqual(self.counts(), (0, 0, 0))
        patient_id = self.patient(client, pending_id)
        status, saved = self.upload(client, fields)
        self.assertEqual(status, 201, saved)
        self.assertEqual(saved["screening"]["patient_id"], patient_id)

    def test_other_actor_cannot_resolve_registration_receipt_or_replay_anothers_photo(self):
        client = self.login()
        other = self.login("other-worker")
        pending_id = uuid.uuid4().hex
        patient_id = self.patient(client, pending_id)
        fields = self.fields(patient_id=patient_id)
        self.assertEqual(self.upload(client, fields)[0], 201)
        self.assertEqual(self.upload(other, fields)[0], 403)
        self.assertEqual(self.upload(other, self.fields(patient_operation_id=pending_id))[0], 409)
        self.assertEqual(self.counts(), (1, 1, 1))

    def test_authentication_role_origin_and_patient_consent_are_enforced(self):
        client = self.login()
        fields = self.fields(patient_id=self.patient(client))
        self.assertEqual(self.upload(self.client(), fields)[0], 401)
        self.assertEqual(self.upload(client, fields, origin=False)[0], 403)
        self.assertEqual(self.upload(client, fields, extra_headers={"Origin": "https://attacker.example"})[0], 403)
        self.assertEqual(self.upload(self.login("capture-admin"), fields)[0], 403)
        with app.connect() as db:
            db.execute("UPDATE patients SET consent=0 WHERE id=?", (fields["patient_id"],))
        self.assertEqual(self.upload(client, fields)[0], 403)
        self.assertEqual(self.counts(), (0, 0, 0))

    def test_invalid_references_ids_dates_and_header_mismatches_are_rejected(self):
        client = self.login()
        fields = self.fields(patient_id=self.patient(client))
        for changes in [
            {"patient_operation_id": uuid.uuid4().hex}, {"patient_id": "", "patient_operation_id": ""},
            {"operation_id": "../escape"}, {"patient_id": "", "patient_operation_id": "bad"},
            {"captured_at": "2026-01-01T10:00:00"}, {"captured_at": "not-a-date"},
            {"captured_at": "2999-01-01T00:00:00Z"}, {"worker": ""}, {"notes": "x" * 2001}
        ]:
            status, result = self.upload(client, dict(fields, **changes))
            self.assertEqual(status, 400, (changes, result))
        self.assertEqual(self.upload(client, fields, extra_headers={"Idempotency-Key": "a" * 32})[0], 400)
        self.assertEqual(self.counts(), (0, 0, 0))

    def test_bad_images_and_ambiguous_multipart_fields_do_not_create_records(self):
        client = self.login()
        fields = self.fields(patient_id=self.patient(client))
        images = [False, b"not a photo", png(239, 240), png(5000, 4001), b"x" * (app.MAX_IMAGE + 1)]
        for image in images:
            self.assertEqual(self.upload(client, fields, image)[0], 400)
        self.assertEqual(self.upload(client, fields, extra_parts=[("worker", "Duplicate")])[0], 400)
        self.assertEqual(self.upload(client, dict(fields, unexpected="bad"))[0], 400)
        self.assertEqual(self.request(client, offline_screenings.PATH, b"{}", {"Origin": self.base, "Content-Type": "application/json"})[0], 415)
        self.assertEqual(self.counts(), (0, 0, 0))

    def test_database_failure_removes_uploaded_file_and_rolls_back_receipt(self):
        client = self.login()
        fields = self.fields(patient_id=self.patient(client))
        with app.connect() as db:
            db.execute("CREATE TRIGGER reject_synthetic_capture BEFORE INSERT ON screenings BEGIN SELECT RAISE(ABORT,'synthetic failure'); END")
        self.assertEqual(self.upload(client, fields)[0], 500)
        self.assertEqual(self.counts(), (0, 0, 0))

    def test_unrelated_route_is_not_handled(self):
        self.assertFalse(offline_screenings.handle_post(None, None, "/api/other", app))


class OfflineScreeningBrowserContractTests(unittest.TestCase):
    def test_vault_queue_sync_identity_and_acknowledgement_guards(self):
        # Use the actual JS module with a strict vault double: the only durable
        # write goes through putOperation; no browser plaintext persistence exists.
        script = r'''
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const rows = new Map();
let current = 'worker';
const deleted = [];
const vault = {
  isUnlocked: () => true,
  async listOperations() { return [...rows].map(([id,operation]) => ({id,operation})); },
  async putOperation(operation,id) { assert.ok(!rows.has(id)); rows.set(id,JSON.parse(JSON.stringify(operation))); },
  async deleteAcknowledged(id) { deleted.push(id); rows.delete(id); }
};
const window = {crypto:webcrypto,OfflineVault:vault,Blob,FormData,btoa,atob};
vm.runInNewContext(fs.readFileSync('offline-screening.js','utf8'),{window,Uint8Array,DataView,Date,Number,Error});
const api = window.OfflineScreening;
const options = {ownerUsername:'worker',isCurrentUser:owner=>current===owner};
const bytes = new Uint8Array(24);
bytes.set([137,80,78,71,13,10,26,10]);
const view = new DataView(bytes.buffer); view.setUint32(16,320);view.setUint32(20,240);
const file = {size:bytes.length,arrayBuffer:async()=>bytes.buffer};
(async()=>{
  await api.cachePatients([{id:'patient-1',name:'Synthetic',patient_code:'AD-DEMO',consent:1,history:'MUST NOT CACHE'}],options);
  assert.equal(JSON.stringify([...rows.values()]).includes('MUST NOT CACHE'),false);
  const choices=await api.listPatientChoices(options);
  assert.equal(choices[0].patientId,'patient-1');
  const queued=await api.queueCapture({file,patientId:'patient-1',worker:'Worker',notes:'Synthetic'},options);
  assert.equal((await api.listQueued(options)).length,1);
  const operation=rows.get(queued.operation_id);
  assert.equal(operation.type,'screening-capture-v1');
  assert.equal(operation.image.mime,'image/png');
  assert.equal(Buffer.from(operation.image.base64,'base64').length,24);
  let posts=0;
  const post = async(path,request)=>{
    if(path==='/api/session')return {authenticated:true,user:{username:'worker',role:'health_worker'}};
    posts++;
    assert.equal(request.body.get('operation_id'),queued.operation_id);
    assert.equal(request.body.get('image').size,24);
    return {ok:true,operation_id:queued.operation_id,screening:{id:'screening-1'}};
  };
  const wrong=await api.syncQueued({...options,api:async()=>({authenticated:true,user:{username:'other',role:'health_worker'}})});
  assert.equal(wrong.interrupted,true); assert.ok(rows.has(queued.operation_id));assert.equal(posts,0);
  const mismatch=await api.syncQueued({...options,api:async(path)=>path==='/api/session'?{authenticated:true,user:{username:'worker',role:'health_worker'}}:{ok:true,operation_id:'bad',screening:{id:'screening-1'}}});
  assert.equal(mismatch.interrupted,true);assert.ok(rows.has(queued.operation_id));
  const result=await api.syncQueued({...options,api:post});
  assert.equal(result.synced,1);assert.equal(posts,1);assert.ok(!rows.has(queued.operation_id));
  rows.set('a'.repeat(32),{type:'patient-registration-v1',patient:{name:'Pending',consent:true}});
  await api.queueCapture({file,patientOperationId:'a'.repeat(32),worker:'Worker'},options);
  const pending=await api.listQueued(options);assert.equal(pending.length,1);
  let finish;
  const saving=api.queueCapture({file:{size:24,arrayBuffer:()=>new Promise(resolve=>finish=resolve)},patientId:'patient-1',worker:'Worker'},options);
  for(let i=0;i<20;i++)await Promise.resolve();
  current='other';finish(bytes.buffer);
  await assert.rejects(saving,/account changed/);
  current='worker';
  let reply;
  const sending=api.syncQueued({...options,api:async(path)=>path==='/api/session'?{authenticated:true,user:{username:'worker',role:'health_worker'}}:new Promise(resolve=>reply=resolve)});
  for(let i=0;i<20;i++)await Promise.resolve();
  current='other';reply({ok:true,operation_id:pending[0].id,screening:{id:'screening-2'}});
  const stale=await sending;assert.equal(stale.interrupted,true);assert.ok(rows.has(pending[0].id));
})().catch(error=>{console.error(error);process.exitCode=1;});
'''
        completed = subprocess.run(["node", "-e", script], cwd=Path(__file__).resolve().parents[1], text=True, capture_output=True, timeout=20)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)


if __name__ == "__main__":
    unittest.main()
