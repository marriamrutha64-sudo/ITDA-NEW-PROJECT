"""Nonblocking model locks shared by server processes owned by one OS user.

Lock files intentionally remain in the temporary directory. Deleting a released
lock file can let two processes lock different inodes for the same model.
"""
import errno
import getpass
import hashlib
import os
from pathlib import Path
import tempfile
import threading

if os.name == "nt":
    import msvcrt
else:
    import fcntl


def _lock_path(model_path):
    canonical = os.path.normcase(os.path.realpath(os.path.expanduser(os.fspath(model_path))))
    identity = str(os.getuid()) if hasattr(os, "getuid") else getpass.getuser().casefold()
    digest = hashlib.sha256((identity + "\0" + canonical).encode("utf-8")).hexdigest()
    return Path(tempfile.gettempdir()) / ("aarogya-model-" + digest + ".lock")


def _contended(error):
    return error.errno in {errno.EACCES, errno.EAGAIN, errno.EDEADLK} or getattr(error, "winerror", None) in {32, 33}


class InferenceLock:
    """An acquired lock; closing or leaving its context releases the OS handle."""

    def __init__(self, descriptor):
        self._descriptor = descriptor
        self._release_guard = threading.Lock()

    def close(self):
        with self._release_guard:
            descriptor = self._descriptor
            if descriptor is None:
                return
            self._descriptor = None
            try:
                os.lseek(descriptor, 0, os.SEEK_SET)
                if os.name == "nt":
                    msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(descriptor, fcntl.LOCK_UN)
            except OSError:
                # Closing still releases the OS lock even if explicit unlock fails.
                pass
            finally:
                os.close(descriptor)

    def __enter__(self):
        if self._descriptor is None:
            raise RuntimeError("The inference lock has already been released.")
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
        return False

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass


def try_acquire(model_path):
    """Return an exclusive lock handle immediately, or None if it is busy.

    Filesystem/OS errors propagate instead of being reported as available. The
    file contains only one null byte; its name hashes model path and user.
    """
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(_lock_path(model_path), flags, 0o600)
    try:
        os.set_inheritable(descriptor, False)
        if hasattr(os, "getuid") and os.fstat(descriptor).st_uid != os.getuid():
            raise PermissionError("The model lock file belongs to another OS user.")
        # Windows byte-range locking uses a stable first byte. A competing
        # initializer can already hold that byte; treat its write denial as busy.
        if not os.fstat(descriptor).st_size:
            try:
                os.write(descriptor, b"\0")
            except OSError as error:
                if os.name == "nt" and _contended(error):
                    os.close(descriptor)
                    return None
                raise
        os.lseek(descriptor, 0, os.SEEK_SET)
        try:
            if os.name == "nt":
                msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
            else:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            if _contended(error):
                os.close(descriptor)
                return None
            raise
        return InferenceLock(descriptor)
    except BaseException:
        os.close(descriptor)
        raise


def release(handle):
    """Release a handle once; repeated release and release(None) are harmless."""
    if handle is not None:
        handle.close()


def is_busy(model_path):
    """Probe the same OS lock without waiting or retaining an acquired handle."""
    handle = try_acquire(model_path)
    if handle is None:
        return True
    release(handle)
    return False
