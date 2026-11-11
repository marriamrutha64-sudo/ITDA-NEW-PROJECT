"""Float32 CPU linear arithmetic with unchanged bfloat16 weight storage.

AVX2 CPUs lack native bfloat16 matrix instructions. Convert one bounded weight
slice at a time instead of retaining a second, full float32 model in memory.
This changes arithmetic precision, so generated text can differ from baseline.
"""
from types import MethodType


def enable_float32_compute(model):
    import torch
    import torch.nn.functional as functional

    def linear(module, inputs):
        dtype = inputs.dtype
        inputs = inputs.float()
        # The tied vocabulary head is >1 GB even in bfloat16. Bound its temporary
        # float32 copy as well as ordinary projections to 16,384 output rows.
        pieces = []
        for start in range(0, module.out_features, 16384):
            bias = module.bias[start:start + 16384].float() if module.bias is not None else None
            pieces.append(functional.linear(
                inputs, module.weight[start:start + 16384].float(), bias
            ).to(dtype))
        return pieces[0] if len(pieces) == 1 else torch.cat(pieces, dim=-1)

    def convolution(module, inputs):
        return module._conv_forward(inputs.float(), module.weight.float(),
                                    module.bias.float() if module.bias is not None else None).to(inputs.dtype)

    count = 0
    for module in model.modules():
        if isinstance(module, torch.nn.Linear):
            module.forward = MethodType(linear, module)
            count += 1
        elif isinstance(module, torch.nn.Conv2d):
            module.forward = MethodType(convolution, module)
            count += 1
    return count


def enable_float32_attention(model):
    from transformers import AttentionInterface
    from transformers.integrations.sdpa_attention import sdpa_attention_forward
    from transformers.masking_utils import AttentionMaskInterface, sdpa_mask
    import torch

    def attention(module, query, key, value, attention_mask, **kwargs):
        dtype = query.dtype
        mask = attention_mask
        if mask is not None and mask.dtype != torch.bool:
            mask = mask.float()
        output, weights = sdpa_attention_forward(
            module, query.float(), key.float(), value.float(), mask, **kwargs
        )
        return output.to(dtype), weights

    AttentionInterface.register("aarogya_cpu_float32", attention)
    AttentionMaskInterface.register("aarogya_cpu_float32", sdpa_mask)
    model.set_attn_implementation("aarogya_cpu_float32")
