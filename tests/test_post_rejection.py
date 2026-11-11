"""Reject POST bodies without losing HTTP errors to unread-upload socket resets."""
from contextlib import ExitStack
import http.client
import io
import json
import os
from pathlib import Path
import queue
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import app


class ObservedHandler(app.Handler):
    observations = queue.Queue()

    def do_POST(self):
        if self.path == "/__test/partial":
            self.read_request_body(17)
            self.json({"error": "Synthetic rejection after partial read."}, 403)
            return
        super().do_POST()

    def discard_rejected_request_body(self):
        before = getattr(self, "_request_body_consumed", 0)
        super().discard_rejected_request_body()
        self.observations.put({
            "before": before, "after": getattr(self, "_request_body_consumed", 0),
            "timeout": self.connection.gettimeout(),
        })


class RejectedPostTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        stack = ExitStack()
        cls.addClassCleanup(stack.close)
        directory = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="aarogya-rejection-test-")))
        stack.enter_context(patch.multiple(app, DATA_DIR=directory, UPLOAD_DIR=directory / "uploads", DB_PATH=directory / "test.sqlite3"))
        stack.enter_context(patch.dict(os.environ, {"AAROGYA_PUBLIC_DEMO": "0"}))
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), ObservedHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]
        cls.origin = f"http://127.0.0.1:{cls.port}"
        stack.callback(cls.stop_server)

    @classmethod
    def stop_server(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def setUp(self):
        while not ObservedHandler.observations.empty():
            ObservedHandler.observations.get_nowait()

    def post(self, path, body, origin=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request("POST", path, body, {"Content-Type": "application/json", "Origin": origin or self.origin})
            response = connection.getresponse()
            status, headers, result = response.status, response.headers, json.loads(response.read())
            return status, headers, result
        finally:
            connection.close()

    def test_early_authentication_and_origin_rejections_deliver_json_for_large_bodies(self):
        body = b'{"synthetic_padding":"' + b"x" * (3 * 1024 * 1024) + b'"}'
        for origin, expected in ((self.origin, 401), ("https://other-origin.example", 403), (self.origin, 401)):
            with self.subTest(expected=expected, origin=origin):
                status, headers, result = self.post("/api/patients", body, origin)
                self.assertEqual(status, expected)
                self.assertTrue(result["error"])
                self.assertEqual(headers["Connection"], "close")
                observed = ObservedHandler.observations.get(timeout=1)
                self.assertEqual(observed["before"], 0)
                self.assertEqual(observed["after"], len(body))
                self.assertIsNone(observed["timeout"])

    def test_rejection_after_partial_read_drains_only_remaining_bytes(self):
        body = b"x" * (512 * 1024)
        status, _, _ = self.post("/__test/partial", body)
        self.assertEqual(status, 403)
        observed = ObservedHandler.observations.get(timeout=1)
        self.assertEqual(observed["before"], 17)
        self.assertEqual(observed["after"], len(body))

    def test_already_parsed_invalid_json_is_not_read_again(self):
        body = b"{" + b"x" * 3000
        status, _, _ = self.post("/api/login", body)
        self.assertEqual(status, 400)
        observed = ObservedHandler.observations.get(timeout=1)
        self.assertEqual(observed["before"], len(body))
        self.assertEqual(observed["after"], len(body))

    def test_incomplete_declared_body_cannot_hold_rejection_indefinitely(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.putrequest("POST", "/api/patients")
            connection.putheader("Origin", self.origin)
            connection.putheader("Content-Type", "application/json")
            connection.putheader("Content-Length", str(app.MAX_REQUEST * 100))
            connection.endheaders()
            started = time.monotonic()
            connection.send(b"{}")
            response = connection.getresponse()
            self.assertEqual(response.status, 401)
            self.assertTrue(json.loads(response.read())["error"])
            self.assertLess(time.monotonic() - started, 2)
            self.assertEqual(response.headers["Connection"], "close")
            observed = ObservedHandler.observations.get(timeout=1)
            self.assertEqual(observed["after"], 2)
            self.assertIsNone(observed["timeout"])
        finally:
            connection.close()

    def test_drain_byte_budget_never_exceeds_maximum_request_size(self):
        class SyntheticConnection:
            timeout = None

            def gettimeout(self):
                return self.timeout

            def settimeout(self, value):
                self.timeout = value

        handler = object.__new__(app.Handler)
        handler.headers = {"Content-Length": str(app.MAX_REQUEST * 100)}
        handler.connection = SyntheticConnection()
        handler.rfile = io.BytesIO(b"x" * (app.MAX_REQUEST + 64))
        handler.discard_rejected_request_body()
        self.assertEqual(handler.rfile.tell(), app.MAX_REQUEST)
        self.assertEqual(handler._request_body_consumed, app.MAX_REQUEST)
        self.assertIsNone(handler.connection.timeout)


if __name__ == "__main__":
    unittest.main()
