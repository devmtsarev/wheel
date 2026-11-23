import unittest
from dataclasses import replace
import numpy as np
from agents import World,run
from action_experiment import offer,OFFERS,TABLE,MIXES,MATCHED,TRAIN_WORLDS
from settings import PRICES,Q

class ActionTests(unittest.TestCase):
    def test_matched_value_experiment_holds_price_and_ev(self):
        for a in MATCHED:
            o=OFFERS[a]
            self.assertEqual(o['price'],32.)
            self.assertAlmostEqual(o['ev'],32/1.2)
            self.assertAlmostEqual(np.dot(o['action_probabilities'],PRICES),32/1.2)
            self.assertGreater(o['empty'],0)
        self.assertTrue(any(OFFERS[a]['negative'] for a in MATCHED))

    def test_additional_controls_hold_price_value_and_frequency(self):
        from action_controls import OFFERS as controls
        baseline=controls['equal']
        for o in controls.values():
            self.assertAlmostEqual(o['price'],baseline['price'])
            self.assertAlmostEqual(o['ev'],baseline['ev'])
            self.assertAlmostEqual(o['win_probability'],baseline['win_probability'])
        self.assertLess(controls['expensive_same_frequency']['adjustments'][3],0)
        self.assertLess(controls['middle_same_frequency']['adjustments'][2],0)

    def test_adjustments_have_explicit_reference_allocation(self):
        for o in OFFERS[1:]:
            m=np.asarray(o['adjustments'])
            self.assertTrue(np.all(m>-1))
            p=o['price']*.25/((1+m)*PRICES)
            np.testing.assert_allclose(p,o['action_probabilities'])
            self.assertAlmostEqual(o['price']/(p@PRICES)-1,o['premium'])
            self.assertAlmostEqual(sum(p)+o['empty'],1)

    def test_equal_adjustments_reproduce_inverse_price_mix(self):
        for m in (-.2,.2,8.):
            o=offer([.25]*4,m,win=.1)
            np.testing.assert_allclose(o['mix'],Q)
            np.testing.assert_allclose(o['adjustments'],[m]*4)

    def test_negative_adjustment_is_not_negative_overall_return(self):
        o=offer([.05,.1,.25,.6],.2,price=32)
        self.assertAlmostEqual(o['adjustments'][-1],-.5)
        self.assertGreater(o['premium'],0)
        self.assertGreater(o['price']-.35*o['ev'],0)

    def test_mixed_offers_preserve_quotas_budget_and_action_costs(self):
        for world in TRAIN_WORLDS.values():
            r,u=run(replace(world,quota=8),4,40000,offers=TABLE,reward_mixes=MIXES)
            self.assertEqual(sum(r[f'action_{j}_wheel_awards'] for j in range(4)),r['wins'])
            self.assertEqual(sum(r[f'action_{j}_direct_awards'] for j in range(4)),r['direct_purchases'])
            self.assertEqual(sum(r[f'action_{j}_completed'] for j in range(4)),r['completed'])
            self.assertAlmostEqual(sum(r[f'action_{j}_cost'] for j in range(4)),r['delivery_cost'])
            self.assertAlmostEqual(sum(u['spent']),r['revenue'])
            self.assertLessEqual(r['max_slots'],8)
            self.assertEqual(r['wins']+r['direct_purchases'],r['completed']+r['unfinished'])

    def test_explicit_default_mixes_do_not_change_legacy_outcomes(self):
        from settings import OFFERS as prices,PS
        self.assertEqual(run(World(),4,42),run(World(),4,42,reward_mixes=np.tile(Q,(len(prices),1))))

    def test_invalid_allocation_and_mix_fail_before_charging(self):
        for b in ([0,.3,.3,.4],[1,1,1,1],[.2,float('nan'),.4,.4]):
            with self.assertRaises(ValueError):offer(b,.2,win=.1)
        for m in (-1,float('nan')):
            with self.assertRaises(ValueError):offer([.25]*4,m,win=.1)
        with self.assertRaises(ValueError):run(World(),1,42,offers=TABLE,reward_mixes=[[.1]*4]*len(TABLE[0]))
        with self.assertRaises(ValueError):run(replace(World(),action_durations=(1,2,3,100)),1,42)

if __name__=='__main__':unittest.main()
