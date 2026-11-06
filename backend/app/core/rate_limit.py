"""Thread-safe in-memory sliding window rate limiter for login attempts."""

import threading
import time
from collections import defaultdict


class LoginRateLimiter:
    """Sliding-window rate limiter to mitigate credential-stuffing and brute-force attacks."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 900):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def _cleanup_old_attempts(self, key: str, now: float) -> None:
        threshold = now - self.window_seconds
        self._attempts[key] = [t for t in self._attempts[key] if t > threshold]
        if not self._attempts[key]:
            del self._attempts[key]

    def is_rate_limited(self, key: str) -> bool:
        """Check if the key has exceeded the maximum allowed failed attempts."""
        now = time.time()
        with self._lock:
            self._cleanup_old_attempts(key, now)
            return len(self._attempts.get(key, [])) >= self.max_attempts

    def record_failure(self, key: str) -> None:
        """Record a failed login attempt."""
        now = time.time()
        with self._lock:
            self._cleanup_old_attempts(key, now)
            self._attempts[key].append(now)

    def reset(self, key: str) -> None:
        """Reset the failure counter upon successful authentication."""
        with self._lock:
            self._attempts.pop(key, None)

    def get_retry_after(self, key: str) -> int:
        """Calculate the remaining lockout seconds for a rate-limited key."""
        now = time.time()
        with self._lock:
            self._cleanup_old_attempts(key, now)
            attempts = self._attempts.get(key, [])
            if len(attempts) >= self.max_attempts:
                oldest_relevant = attempts[-self.max_attempts]
                return max(1, int(self.window_seconds - (now - oldest_relevant)))
            return 0


# Global singleton instance for authentication endpoints
login_rate_limiter = LoginRateLimiter(max_attempts=5, window_seconds=900)

