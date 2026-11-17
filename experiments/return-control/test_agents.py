import unittest
from dataclasses import replace
import numpy as np
from agents import World, WORLDS, GROUPS, population, run, offer_arm
from agent_experiment import enrich


class AgentTests(unittest.TestCase):
    def test_cohorts_and_profiles_are_reproducible(self):
        world=World(viewers=200)
        a=population(world,42);b=population(world,42)
        for key in a:np.testing.assert_array_equal(a[key],b[key])
        self.assertEqual(set(a['group']),{0,1,2})
        means=[a['willingness'][a['group']==g].mean() for g in range(3)]
        self.assertGreater(means[0],means[1]);self.assertGreater(means[1],means[2])

    def test_quota_end_honors_every_sold_action(self):
        for cap in (1,3,12):
            for policy in (0,1,4,(1,6)):
                r,u=run(replace(World(),quota=cap),policy,7000)
                self.assertEqual(u['reason'],'action_quota')
                self.assertEqual(r['completed'],cap)
                self.assertEqual(r['unfinished'],0)
                self.assertLessEqual(r['max_slots'],cap)
                self.assertEqual(r['wins']+r['direct_purchases'],cap)

    def test_empty_draws_consume_no_action_slots(self):
        r,_=run(World(),1,7000)
        self.assertGreater(r['spins'],r['wins'])
        self.assertEqual(r['completed']+r['unfinished'],r['wins']+r['direct_purchases'])

    def test_budget_revenue_and_cost_conservation(self):
        for name,w in WORLDS.items():
            with self.subTest(name=name):
                initial=population(w,7001)
                r,u=run(w,4,7001)
                self.assertTrue(np.all(np.array(u['spent'])<=initial['budget']+1e-8))
                self.assertAlmostEqual(r['revenue'],sum(u['spent']))
                self.assertAlmostEqual(r['net'],r['revenue']-r['delivery_cost']-r['processing']-r['operating_cost'])
                self.assertAlmostEqual(r['wheel_revenue']+r['direct_revenue'],r['revenue'])
                self.assertAlmostEqual(sum(r[g+'_wheel_revenue']+r[g+'_direct_revenue'] for g in GROUPS),r['revenue'])

    def test_no_wheel_cannot_generate_spins(self):
        r,_=run(World(),0,7000)
        self.assertEqual((r['spins'],r['wins'],r['wheel_revenue']),(0,0,0))

    def test_censoring_is_not_reported_as_successful_stream_end(self):
        r,u=run(replace(World(),max_minutes=1,quota=100),4,7000)
        self.assertEqual(u['reason'],'observation_cutoff')
        self.assertEqual(r['quota_ended'],0)
        self.assertLess(r['completed'],100)

    def test_paired_cohort_attribution_has_zero_self_effect(self):
        r,u=run(World(),4,7000)
        enrich(r,u,u)
        for group in GROUPS:
            self.assertEqual(r[group+'_new_payers'],0)
            self.assertEqual(r[group+'_lost_payers'],0)
            self.assertEqual(r[group+'_direct_delta'],0)
            self.assertEqual(r[group+'_spend_delta'],0)

    def test_controller_sees_only_phase_and_queue(self):
        self.assertEqual(offer_arm((1,6),11,24,0),1)
        self.assertEqual(offer_arm((1,6),12,24,0),6)
        self.assertEqual(offer_arm((1,6),12,24,100),6)

    def test_complete_run_replays(self):
        self.assertEqual(run(World(),(2,6),88),run(World(),(2,6),88))

    def test_invalid_duration_bound_is_rejected(self):
        with self.assertRaises(ValueError):run(replace(World(),streamer_fatigue=1),4,1)


if __name__=='__main__':unittest.main()
