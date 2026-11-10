"""Resumable HTTP range transfer for large, official Hugging Face model shards."""
from concurrent.futures import CancelledError, ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import time

import requests
from huggingface_hub import get_token


def download_shard(url, target, size, workers=8):
    target = Path(target)
    if target.is_file() and target.stat().st_size == size:
        return
    partial = target.with_suffix(target.suffix + ".partial")
    ledger = partial.with_suffix(partial.suffix + ".json")
    chunk_size = 8 * 1024 * 1024
    count = (size + chunk_size - 1) // chunk_size
    completed = set()
    if partial.exists() and partial.stat().st_size == size and ledger.exists():
        try:
            record = json.loads(ledger.read_text())
            indices = record.get("completed", [])
            if (record.get("url") == url and record.get("size") == size
                    and record.get("chunk_size") == chunk_size and isinstance(indices, list)
                    and all(type(i) is int and 0 <= i < count for i in indices)):
                completed = set(indices)
        except (OSError, ValueError, TypeError):
            pass
    if not completed:
        with partial.open("wb") as stream:
            stream.truncate(size)
    token = get_token()

    def fetch(index):
        start, end = index * chunk_size, min((index + 1) * chunk_size, size) - 1
        for attempt in range(4):
            try:
                # Distinct range query avoids intermediaries caching one partial response for every range.
                with requests.get(url + f"?download=true&range_start={start}",
                                  headers={"Authorization": f"Bearer {token}", "Range": f"bytes={start}-{end}"},
                                  stream=True, timeout=(20, 90)) as response:
                    response.raise_for_status()
                    expected_range = f"bytes {start}-{end}/{size}"
                    if response.status_code != 206 or response.headers.get("Content-Range") != expected_range:
                        raise RuntimeError("Server did not honor the requested model range.")
                    received = 0
                    with partial.open("r+b") as stream:
                        stream.seek(start)
                        for block in response.iter_content(256 * 1024):
                            if received + len(block) > end - start + 1:
                                raise RuntimeError("Model range exceeds expected size.")
                            stream.write(block)
                            received += len(block)
                        stream.flush()
                    if received != end - start + 1:
                        raise RuntimeError("Model range transfer was incomplete.")
                return index
            except Exception:
                if attempt == 3:
                    raise RuntimeError(f"Model transfer failed for chunk {index}; rerun to resume.") from None
                time.sleep(2 ** attempt)

    def checkpoint():
        temporary = ledger.with_suffix(".tmp")
        temporary.write_text(json.dumps({"url": url, "size": size, "chunk_size": chunk_size, "completed": sorted(completed)}))
        temporary.replace(ledger)

    print(f"Downloading {target.name}: {len(completed)}/{count} chunks complete", flush=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        tasks = [pool.submit(fetch, i) for i in range(count) if i not in completed]
        first_error = None
        for task in as_completed(tasks):
            try:
                index = task.result()
            except CancelledError:
                continue
            except Exception as error:
                if first_error is None:
                    first_error = error
                    for pending in tasks:
                        pending.cancel()
                continue
            completed.add(index)
            checkpoint()
            if len(completed) % 8 == 0 or len(completed) == count:
                print(f"{target.name}: {len(completed)}/{count} chunks verified by byte range", flush=True)
        if first_error is not None:
            raise first_error
    partial.replace(target)
    # Keep the resumability ledger for troubleshooting; it contains no credentials.
