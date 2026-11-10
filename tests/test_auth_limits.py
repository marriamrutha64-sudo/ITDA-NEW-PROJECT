import unittest
from auth_limits import LoginThrottle


class LoginThrottleTests(unittest.TestCase):
    def test_window_limit_and_expiry(self):
        clock = [0]
        throttle = LoginThrottle(limit=2, window=10, clock=lambda: clock[0])
        self.assertTrue(throttle.allow("a"))
        self.assertTrue(throttle.allow("a"))
        self.assertFalse(throttle.allow("a"))
        clock[0] = 10
        self.assertTrue(throttle.allow("a"))

    def test_accounts_are_independent_and_success_can_reset(self):
        throttle = LoginThrottle(limit=1)
        self.assertTrue(throttle.allow("a"))
        self.assertFalse(throttle.allow("a"))
        self.assertTrue(throttle.allow("b"))
        throttle.clear("a")
        self.assertTrue(throttle.allow("a"))
