"""Numerical checks for CPU arithmetic; no checkpoint or clinical image loaded."""
import importlib.util
import unittest
from unittest.mock import patch

from medgemma_cpu import enable_float32_compute, enable_float32_attention


@unittest.skipUnless(importlib.util.find_spec("torch"), "Optional model runtime is not installed")
class CPUComputeTests(unittest.TestCase):
    def test_linear_keeps_weights_and_matches_float32_reference(self):
        import torch
        from torch.nn import functional
        torch.manual_seed(7)
        model = torch.nn.Linear(5, 17000).bfloat16().eval()
        inputs = torch.randn(2, 5).bfloat16()
        weight, bias = model.weight, model.bias
        expected = functional.linear(inputs.float(), weight.float(), bias.float()).bfloat16()
        original = weight.detach().clone()
        enable_float32_compute(model)
        original_linear = functional.linear
        with patch.object(functional, "linear", wraps=original_linear) as linear:
            with torch.inference_mode():
                actual = model(inputs)
        self.assertTrue(all(call.args[1].shape[0] <= 16384 for call in linear.call_args_list))
        torch.testing.assert_close(actual, expected)
        self.assertIs(model.weight, weight)
        self.assertIs(model.bias, bias)
        self.assertEqual(model.weight.dtype, torch.bfloat16)
        self.assertTrue(torch.equal(model.weight, original))

    def test_convolution_matches_reference_without_mutating_weights(self):
        import torch
        model = torch.nn.Conv2d(3, 4, 3, stride=2, padding=1).bfloat16().eval()
        inputs = torch.randn(1, 3, 16, 16).bfloat16()
        weight = model.weight.detach().clone()
        expected = model._conv_forward(inputs.float(), model.weight.float(), model.bias.float()).bfloat16()
        enable_float32_compute(model)
        with torch.inference_mode():
            torch.testing.assert_close(model(inputs), expected)
        self.assertTrue(torch.equal(model.weight, weight))

    def test_shared_embedding_head_remains_tied(self):
        import torch
        model = torch.nn.ModuleDict({"embedding": torch.nn.Embedding(10, 5), "head": torch.nn.Linear(5, 10, bias=False)}).bfloat16()
        model["head"].weight = model["embedding"].weight
        enable_float32_compute(model)
        self.assertIs(model["head"].weight, model["embedding"].weight)

    def test_attention_preserves_causal_mask_and_registers_sdpa_mask_builder(self):
        import torch
        from types import SimpleNamespace
        from transformers.modeling_utils import ALL_ATTENTION_FUNCTIONS
        from transformers.masking_utils import ALL_MASK_ATTENTION_FUNCTIONS, sdpa_mask
        model = SimpleNamespace(set_attn_implementation=lambda name: None)
        enable_float32_attention(model)
        self.assertIs(ALL_MASK_ATTENTION_FUNCTIONS["aarogya_cpu_float32"], sdpa_mask)
        attention = ALL_ATTENTION_FUNCTIONS["aarogya_cpu_float32"]
        query = torch.randn(1, 2, 4, 8).bfloat16()
        key, value = torch.randn_like(query), torch.randn_like(query)
        mask = torch.ones(4, 4, dtype=torch.bool).tril()[None, None]
        actual, _ = attention(SimpleNamespace(), query, key, value, mask, is_causal=False)
        expected = torch.nn.functional.scaled_dot_product_attention(query.float(), key.float(), value.float(), attn_mask=mask).transpose(1, 2).contiguous().bfloat16()
        torch.testing.assert_close(actual, expected)
