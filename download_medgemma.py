"""Download official gated weights after the account holder accepts model terms."""
from pathlib import Path
import hashlib
import json
import time
from huggingface_hub import HfApi, snapshot_download
from medgemma_runtime import MODEL_ID, MODEL_REVISION
from model_transfer import download_shard

if __name__ == "__main__":
    target = Path(__file__).resolve().parent / "models" / "medgemma-1.5-4b-it"
    info = HfApi().model_info(MODEL_ID, revision=MODEL_REVISION, files_metadata=True)
    snapshot_download(
        repo_id=MODEL_ID, revision=MODEL_REVISION, local_dir=target,
        allow_patterns=["*.json", "*.model", "*.txt", "*.jinja", "README.md", "LICENSE*"],
    )
    for entry in info.siblings:
        if entry.rfilename.endswith(".safetensors"):
            download_shard(f"https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}/{entry.rfilename}", target / entry.rfilename, entry.size)
    files = {}
    for entry in info.siblings:
        path = target / entry.rfilename
        if not path.is_file():
            continue
        if entry.size and path.stat().st_size != entry.size:
            raise RuntimeError(f"Incomplete download: {entry.rfilename}")
        if entry.lfs and entry.lfs.sha256:
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != entry.lfs.sha256:
                rejected = path.with_name(path.name + f".rejected-{time.time_ns()}")
                path.replace(rejected)
                raise RuntimeError(f"Checksum mismatch: {entry.rfilename}. The rejected file was quarantined; rerun setup_medgemma.py to download it again.")
        files[entry.rfilename] = path.stat().st_size
    index = json.loads((target / "model.safetensors.index.json").read_text())
    if not set(index["weight_map"].values()).issubset(files):
        raise RuntimeError("Model weight shards are incomplete.")
    (target / "installation.json").write_text(json.dumps({"model": MODEL_ID, "revision": MODEL_REVISION, "files": files}, indent=2), encoding="utf-8")
    print(f"Model files downloaded to {target}")
