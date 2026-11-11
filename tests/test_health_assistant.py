import base64
import os
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import gemini_runtime
import health_assistant as assistant


class HealthAssistantTests(unittest.TestCase):
    def payload(self, **extra):
        return {"mode": "question", "question": "What does blood pressure mean?", "acknowledge_google_transfer": True, **extra}

    def test_health_question_uses_dedicated_prompt_and_language(self):
        mode, parts = assistant.prepare(self.payload(language="te"))
        self.assertEqual(mode, "question")
        self.assertIn("Answer in Telugu", parts[0]["text"])
        self.assertIn("What does blood pressure mean?", parts[1]["text"])
        self.assertNotIn("No oral tissues", parts[0]["text"])

    def test_report_exact_values_ranges_and_pdf(self):
        encoded = base64.b64encode(b"%PDF-1.4\nSynthetic report test fixture").decode()
        mode, parts = assistant.prepare(self.payload(mode="report", question="Explain this", report_text="Glucose 105 mg/dL. Range 70-99.", attachment={"mime_type":"application/pdf", "data":encoded, "name":"not-forwarded-patient-name.pdf"}))
        self.assertEqual(mode,"report")
        self.assertIn("exact readable value, unit and reference range",parts[0]["text"])
        self.assertEqual(parts[-1]["inline_data"]["mime_type"],"application/pdf")
        self.assertNotIn("not-forwarded-patient-name",str(parts))

    def test_missing_consent_and_invalid_inputs_fail_before_network(self):
        cases=[self.payload(acknowledge_google_transfer=False), self.payload(mode="unknown"), self.payload(question=""),
               self.payload(question="x"*6001), self.payload(report_text="unexpected"), self.payload(language="xx"),
               self.payload(mode="report",question="",attachment=None),self.payload(mode="report",report_text="x"*25001),
               self.payload(mode="report",attachment={"mime_type":"application/pdf","data":"!!!"}),
               self.payload(mode="report",attachment={"mime_type":"application/pdf","data":base64.b64encode(b"not a PDF").decode()}),
               self.payload(mode="report",attachment={"mime_type":"application/javascript","data":"abc"})]
        for payload in cases:
            with self.subTest(payload=str(payload)[:80]),patch.object(gemini_runtime,"generate") as network:
                with self.assertRaises(ValueError): assistant.prepare(payload)
                network.assert_not_called()

    def handler(self, payload):
        return SimpleNamespace(body=lambda:payload,json=MagicMock())

    def runtime(self):
        slot=MagicMock();slot.acquire.return_value=True
        return SimpleNamespace(ai_jobs=SimpleNamespace(is_busy=lambda:False),medgemma_runtime=SimpleNamespace(_slot=slot))

    def test_anonymous_cannot_send(self):
        handler=self.handler(self.payload())
        with patch.object(gemini_runtime,"generate") as network:
            assistant.handle_post(handler,None,"/api/ai/assistant",self.runtime())
        self.assertEqual(handler.json.call_args.args[1],401)
        network.assert_not_called()

    def test_response_is_ephemeral_and_preserves_provider(self):
        handler=self.handler(self.payload()); runtime=self.runtime()
        result={"text":"Synthetic explanation","model":"gemini-test","execution":{"provider":"gemini"},"validated":False}
        with patch.dict(os.environ,{"AAROGYA_AI_PROVIDER":"gemini"}),patch.object(gemini_runtime,"generate",return_value=result) as network:
            assistant.handle_post(handler,{"id":"synthetic-worker"},"/api/ai/assistant",runtime)
        self.assertFalse(handler.json.call_args.args[0]["saved_to_patient_record"])
        self.assertEqual(network.call_args.args[1],"health-question-v1")
        runtime.medgemma_runtime._slot.release.assert_called_once()

    def test_busy_and_errors_do_not_return_fabricated_results(self):
        runtime=self.runtime();runtime.medgemma_runtime._slot.acquire.return_value=False
        handler=self.handler(self.payload())
        with patch.dict(os.environ,{"AAROGYA_AI_PROVIDER":"gemini"}),patch.object(gemini_runtime,"generate") as network:
            assistant.handle_post(handler,{"id":"synthetic"},"/api/ai/assistant",runtime)
            self.assertEqual(handler.json.call_args.args[1],429);network.assert_not_called()
        runtime=self.runtime();handler=self.handler(self.payload())
        with patch.dict(os.environ,{"AAROGYA_AI_PROVIDER":"gemini"}),patch.object(gemini_runtime,"generate",side_effect=gemini_runtime.GeminiUnavailable("Quota exceeded")):
            assistant.handle_post(handler,{"id":"synthetic"},"/api/ai/assistant",runtime)
        self.assertEqual(handler.json.call_args.args[1],503)
        self.assertNotIn("result",handler.json.call_args.args[0])
        runtime.medgemma_runtime._slot.release.assert_called_once()
