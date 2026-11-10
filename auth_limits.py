"""Small in-memory login throttle for local and temporary demo servers."""
from collections import deque
import threading
import time


class LoginThrottle:
    def __init__(self, limit=10, window=300, clock=time.monotonic):
        self.limit = limit
        self.window = window
        self.clock = clock
        self.attempts = {}
        self.lock = threading.Lock()

    def allow(self, key):
        now = self.clock()
        with self.lock:
            expired = [item for item, values in self.attempts.items() if not values or values[-1] <= now - self.window]
            for item in expired:
                self.attempts.pop(item, None)
            values = self.attempts.setdefault(key, deque())
            while values and values[0] <= now - self.window:
                values.popleft()
            if len(values) >= self.limit:
                return False
            values.append(now)
            return True

    def clear(self, key):
        with self.lock:
            self.attempts.pop(key, None)
