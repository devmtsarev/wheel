"""Economic identities, planner behavior and simulation accounting boundaries."""
import math
import unittest
from controller import choose, forecast
from settings import PREMIUM, Q, PRICES, OFFERS, PS, H, HARD
from simulate import simulate, SCENARIOS, Fitted, Oracle


class Predictor:
    def __init__(self, wheel=0., direct=0.):
        self.wheel = wheel
        self.direct = direct
    def predict(self, arm, audience, shared, wait, minute=0):
        return (self.wheel if arm else 0.), self.direct


class ControllerTests(unittest.TestCase):
    def test_premium_and_inverse_price_shares(self):
        self.assertAlmostEqual(sum(Q), 1)
        for price, p in zip(OFFERS[1:], PS[1:]):
            self.assertTrue(0 < p < 1)
            self.assertAlmostEqual(price / (p * H) - 1, PREMIUM)
            values = p * Q * PRICES
            self.assertLess(float(max(values) - min(values)), 1e-12)

    def test_fixed_spend_cancels_win_probability_change(self):
        rates = [1.5 * (s / 32) ** -1 for s in OFFERS[1:]]
        wins = [rate * p for rate, p in zip(rates, PS[1:])]
        self.assertLess(max(wins) - min(wins), 1e-12)

    def test_price_insensitive_low_load_prefers_higher_price(self):
        self.assertEqual(choose(Predictor(.1), 4, 1, 0, 0, 0, 30, 0), 6)

    def test_zero_demand_keeps_current_offer(self):
        self.assertEqual(choose(Predictor(), 4, 1, 0, 0, 0, 30, 0), 4)

    def test_off_disabled_even_when_current_offer_is_off(self):
        self.assertNotEqual(choose(Predictor(), 0, 1, 0, 0, 0, 30, 0), 0)

    def test_can_opt_into_off_when_it_preserves_direct_business(self):
        class Substitution:
            def predict(self, arm, *args):
                return 0., 1. if arm == 0 else .01
        self.assertEqual(choose(Substitution(), 4, 1, 0, 0, 0, 30, 0, True), 0)
        self.assertNotEqual(choose(Substitution(), 4, 1, 0, 0, 0, 30, 0, False), 0)

    def test_refuses_invalid_demand_and_capacity(self):
        for demand in (-1, math.inf, math.nan):
            with self.assertRaises(ValueError):
                forecast(Predictor(demand), 4, 1, 0, 0, 0, 30, 0)
        for capacity in (0, -1, math.inf, math.nan):
            with self.assertRaises(ValueError):
                forecast(Predictor(1), 4, 1, 0, 0, 0, capacity, 0)

    def test_no_wheel_has_no_wheel_sales(self):
        r, _ = simulate(SCENARIOS['fixed_spend'], 0, 12)
        self.assertEqual(r['wins'], 0)
        self.assertEqual(r['wheel_revenue'], 0)
        self.assertAlmostEqual(r['contribution'], r['direct_revenue'] - r['delivery_cost'])

    def test_all_scenarios_reserve_and_account_for_work(self):
        for name, cfg in SCENARIOS.items():
            with self.subTest(name=name):
                # Simulator asserts reservation and accounting invariants at every tick.
                r, _ = simulate(cfg, 'oracle', 7000, Oracle(cfg))
                self.assertLessEqual(r['peak_work'], HARD)
                self.assertLessEqual(r['end_work'], HARD)
                self.assertEqual(r['unfinished'], r['wins'] + r['direct_accepted'] - r['completed'])
                self.assertAlmostEqual(r['contribution'], r['wheel_revenue'] + r['direct_revenue'] - r['delivery_cost'] - .05 * r['wheel_accepted'])

    def test_pilot_fit_and_held_out_replay(self):
        cfg = SCENARIOS['fixed_spend']
        model = Fitted(cfg)
        a = simulate(cfg, 'fitted_on', 7000, model)
        b = simulate(cfg, 'fitted_on', 7000, model)
        self.assertEqual(a, b)
        self.assertEqual(a[0]['off_fraction'], 0)


if __name__ == '__main__':
    unittest.main()
