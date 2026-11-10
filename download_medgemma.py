"""Download official gated weights after the account holder accepts model terms."""
from pathlib import Path
from huggingface_hub import snapshot_download

if __name__ == "__main__":
    target = Path(__file__).resolve().parent / "models" / "medgemma-1.5-4b-it"
    snapshot_download(
        repo_id="google/medgemma-1.5-4b-it", local_dir=target,
        allow_patterns=["*.json", "*.safetensors", "*.model", "*.txt", "*.jinja", "README.md", "LICENSE*"],
    )
    print(f"Model files downloaded to {target}")
