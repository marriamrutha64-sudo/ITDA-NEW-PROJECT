"""Offline data backup and isolated restore. Stop the server and AI workers first."""
from contextlib import closing
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
from datetime import datetime, timezone


def inventory(directory):
    result = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
            raise ValueError("Linked files/directories are not supported")
        if path.is_file() and path.name != "backup-manifest.json":
            digest = hashlib.sha256()
            with path.open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
            result[path.relative_to(directory).as_posix()] = digest.hexdigest()
    return result


def check_database(directory):
    database = directory / "aarogya.sqlite3"
    if not database.is_file():
        raise ValueError("Database is missing")
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as connection:
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("Database integrity check failed")
        if connection.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Database foreign-key check failed")
        for (name,) in connection.execute("SELECT image_name FROM screenings"):
            image = directory / "uploads" / name
            if image.resolve().parent != (directory / "uploads").resolve() or not image.is_file():
                raise ValueError("A referenced screening image is missing or invalid")


def copy_data(source, destination, restore=False):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if not source.is_dir():
        raise ValueError("Source directory does not exist")
    if destination.exists() or source == destination or source in destination.parents or destination in source.parents:
        raise ValueError("Destination must be a new, separate directory")
    files = inventory(source)
    if restore:
        manifest = json.loads((source / "backup-manifest.json").read_text(encoding="utf-8"))
        if manifest.get("version") != 1 or manifest.get("files") != files:
            raise ValueError("Backup manifest verification failed")
    check_database(source)
    destination.mkdir(parents=True)
    try:
        shutil.copytree(source, destination, dirs_exist_ok=True)
        if inventory(destination) != files:
            raise ValueError("Copied files do not match the source")
        check_database(destination)
        if not restore:
            (destination / "backup-manifest.json").write_text(json.dumps({
                "version": 1,
                "created_at_utc": datetime.now(timezone.utc).isoformat(),
                "files": files,
                "encrypted": False,
            }, indent=2) + "\n", encoding="utf-8")
    except Exception:
        # Leave the new destination for inspection; never delete operator data.
        raise
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["backup", "restore"])
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--server-stopped", action="store_true", required=True,
                        help="Confirm the server and AI workers have been stopped")
    args = parser.parse_args()
    try:
        count = copy_data(args.source, args.destination, restore=args.action == "restore")
    except (OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, f"Operation failed: {error}\n")
    print(f"{args.action.capitalize()} verified: {count} files. Destination is unencrypted; protect its storage.")


if __name__ == "__main__":
    main()

