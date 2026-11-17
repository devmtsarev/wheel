import unittest
from dataclasses import replace
import math
import numpy as np
from agents import World, run
from joint_experiment import OFFERS, TABLE, pressure, controller, robust_score
from settings import H, Q, PRICES, OFFERS as LEGACY_PRICES, PS


class JointTests(unittest.TestCase):
    def test_economics_and_empty_outcome_for_entire_grid(self):
        for price,p,premium in OFFERS[1:]:
            self.assertGreater(p,0);self.assertLess(p,1)
            self.assertAlmostEqual(price/(p*float(Q@PRICES))-1,premium)
            np.testing.assert_allclose((p*Q)*PRICES,np.repeat(p*Q[0]*PRICES[0],4))

    def test_all_offers_preserve_budget_capacity_and_accounting(self):
        for a in range(1,len(OFFERS)):
            r,u=run(replace(World(),quota=6),a,123,offers=TABLE)
            self.assertEqual(r['wins']+r['direct_purchases'],r['completed']+r['unfinished'])
            self.assertLessEqual(r['max_slots'],6)
            self.assertAlmostEqual(r['revenue'],sum(u['spent']))
            self.assertLessEqual(r['spins'],r['wheel_intents'])
            self.assertLessEqual(r['direct_purchases'],r['direct_intents'])
            self.assertEqual(r['refused'],r['intents']-r['spins']-r['direct_purchases'])
            self.assertAlmostEqual(r['wheel_revenue'],r['spins']*OFFERS[a][0])

    def test_legacy_offer_behavior_unchanged_by_parameterization(self):
        self.assertEqual(run(World(),4,99),run(World(),4,99,offers=(LEGACY_PRICES,PS)))

    def test_controller_uses_only_observable_supply_and_demand(self):
        state=dict(seconds=300,completed=0,quota=24,outstanding=0,work=0,recent_direct_intents=0,recent_wheel_intents=0)
        choose=controller(2,5,1.)
        self.assertEqual(choose(state),2)
        self.assertEqual(choose(dict(state,recent_direct_intents=20)),5)
        self.assertEqual(choose(dict(state,work=80)),5)
        self.assertGreater(pressure(dict(state,completed=23,recent_direct_intents=2)),pressure(dict(state,recent_direct_intents=2)))

    def test_adaptation_retains_accounting(self):
        r,u=run(World(),controller(2,20,.75),20000,offers=TABLE,trace=True)
        self.assertEqual(r['wins']+r['direct_purchases'],r['completed']+r['unfinished'])
        self.assertAlmostEqual(r['revenue'],sum(u['spent']))
        self.assertGreater(r['decision_exposures'],r['intents'])
        self.assertLessEqual(r['expected_direct_intents']+r['expected_wheel_intents'],r['decision_exposures'])
        self.assertTrue(all(t['remaining_slots']>=0 for t in u['trace']))

    def test_training_objective_prefers_coverage_then_penalizes_losses(self):
        self.assertGreater(robust_score([.01,.01]),robust_score([1.,-.01]))
        self.assertGreater(robust_score([.1,-.01]),robust_score([.1,-.1]))

    def test_invalid_offers_are_rejected(self):
        for table in (([0,1],[0,1]),([0,-1],[0,.5]),([0,math.inf],[0,.5]),([1,2],[0,.5])):
            with self.assertRaises(ValueError):run(World(),1,3,offers=table)


if __name__=='__main__':unittest.main()
