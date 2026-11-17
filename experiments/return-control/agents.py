"""Individual-viewer simulation with a finite streamer action quota.

Behavioral constants are synthetic hypotheses, not fitted psychological facts.
Controllers see aggregate supply and demand only; cohort labels and private
viewer states belong exclusively to the simulator and reporting.
"""
from collections import deque
from dataclasses import dataclass, replace
import math
import numpy as np
from settings import PRICES, DURATIONS, Q, OFFERS, PS, COST, SPIN_COST

GROUPS = ('ready', 'unsure', 'not_ready')
STYLES = ('engage', 'ignore', 'avoid')

@dataclass(frozen=True)
class World:
    viewers: int = 100
    quota: int = 24
    max_minutes: int = 180  # observation cutoff, not a second stream-end rule
    group_mix: tuple = (.25, .35, .40)
    style_mix: tuple = (.35, .40, .25)
    shared_satisfaction: float = .18
    social_strength: float = .5
    loss_fatigue: float = .22
    overload: float = .35
    streamer_fatigue: float = .35
    delivery_fraction: float = .4
    fixed_cost_per_minute: float = .25
    novelty_decay: float = .035
    price_sensitivity: float = .65
    probability_sensitivity: float = .3
    seed_version: int = 1

WORLDS = {
    'balanced': World(),
    'buyer_heavy': World(group_mix=(.55, .25, .20)),
    'curious_audience': World(group_mix=(.10, .35, .55), style_mix=(.55, .30, .15), social_strength=.8),
    'fatigue_and_free_riding': World(style_mix=(.15, .35, .50), shared_satisfaction=.45, loss_fatigue=.4, overload=.65),
    'slow_streamer': World(streamer_fatigue=.65, delivery_fraction=.25),
}


def population(world, seed):
    rng = np.random.default_rng(seed)
    n = world.viewers
    group = rng.choice(3, n, p=world.group_mix)
    style = rng.choice(3, n, p=world.style_mix)
    target = rng.choice(4, n, p=[.15, .30, .35, .20])
    willingness = np.clip(rng.normal(np.array([1.35, .95, .42])[group], .13), .1, 1.8)
    budget = np.maximum(8, np.round(PRICES[target] * rng.uniform(.8, 2.0, n)))
    budget[group == 0] = np.maximum(budget[group == 0], PRICES[target[group == 0]])
    # Not initially ready to buy an action still has a finite entertainment budget.
    budget[group == 2] = rng.choice([16., 32., 64., 96.], np.sum(group == 2))
    entertainment = np.maximum(0, rng.normal(np.array([1.0, 1.5, 1.9])[group], .5))
    arrival = rng.uniform(0, 15 * 60, n)
    # Individual exogenous patience is coupled across policies. Behavior can shorten it.
    departure = arrival + rng.uniform(25, 80, n) * 60
    consider_probability = rng.uniform(.025, .075, n) # per ten-second observation
    wait_tolerance = rng.uniform(2, 8, n)
    persistent = rng.random(n) < .12
    return dict(group=group, style=style, target=target, willingness=willingness,
                budget=budget, entertainment=entertainment, arrival=arrival,
                departure=departure, consider_probability=consider_probability,
                wait_tolerance=wait_tolerance, persistent=persistent)


def offer_arm(policy, completed, quota, work):
    if isinstance(policy, int):
        return policy
    if isinstance(policy, tuple):
        # Entire-stream optimized two-phase policy: no access to latent cohorts.
        return policy[0] if completed < quota / 2 else policy[1]
    if policy == 'busy_empty':
        return 2 if work > 30 else 4
    raise ValueError(policy)


def run(world, policy, seed, trace=False, offers=None):
    if world.quota < 1 or world.viewers < 1 or world.delivery_fraction <= 0 or not 0 <= world.streamer_fatigue <= 2/1.2-1:
        raise ValueError('Positive quota, viewer count and delivery capacity required')
    prices, probabilities = (OFFERS, PS) if offers is None else offers
    if len(prices) != len(probabilities) or prices[0] != 0 or probabilities[0] != 0:
        raise ValueError('Offer zero must be unavailable')
    if any(not math.isfinite(p) or p <= 0 for p in prices[1:]) or any(not 0 < p < 1 for p in probabilities[1:]):
        raise ValueError('Paid offers require positive finite prices and a nonzero empty outcome')
    pop = population(world, seed)
    n = world.viewers
    budget = pop['budget'].copy()
    spent = np.zeros(n); direct_spent = np.zeros(n); wheel_spent = np.zeros(n)
    spins = np.zeros(n, dtype=int); losses = np.zeros(n, dtype=int)
    wins = np.zeros(n, dtype=int); purchases = np.zeros(n, dtype=int)
    satisfied = np.zeros(n); excitement = np.zeros(n)
    abstain = np.zeros(n, dtype=bool); left = np.zeros(n, dtype=bool)
    pending_own = np.zeros(n, dtype=int); next_decision = np.zeros(n)
    group = pop['group']; style = pop['style']; target = pop['target']
    wheel_exposed = np.zeros(n, dtype=bool)
    spin_times = [[] for _ in range(n)]
    # Per-step exogenous draws are generated for every viewer even when inactive.
    # Policy-dependent consumption cannot shift later viewers' decision shocks.
    rng = np.random.default_rng(seed + 100000)
    draws = [np.random.default_rng(seed * 1000 + i + 300000) for i in range(n)]
    queue = deque(); inflight = []
    work = 0.; reserved = 0.; completed = 0; awarded = 0
    delivered_wheel = 0; delivered_direct = 0
    delivery_cost = 0.; revenue = 0.; processing = 0.
    refused = 0; intents = 0; peak_work = 0.; max_slots = 0
    break_until = 0; last_break_count = 0
    social_events = 0.; performed_events = 0
    fatigue_stops = 0; waiting_stops = 0; wait_samples = []
    trace_rows = []; arm_history = []; reason = 'observation_cutoff'; sec = 0
    action_counts = np.zeros(4, dtype=int)
    demand_events = deque()
    decision_exposures = 0; direct_intents = 0; wheel_intents = 0
    expected_direct_intents = 0.; expected_wheel_intents = 0.
    quote_price_sum = 0.; quote_p_sum = 0.
    available_seconds = 0.; blocked_seconds = 0.

    def show_action(index, owner):
        nonlocal social_events, performed_events
        performed_events += 1
        visible = (pop['arrival'] <= sec) & (pop['departure'] > sec) & ~left
        exposure = np.where(style == 0, 1., np.where(style == 1, 0., -.7))
        excitement[visible] = np.clip(excitement[visible] + world.social_strength * exposure[visible], -2, 3)
        matching = visible & (target == index)
        # Seeing the public action can satisfy the need without buying it.
        satisfied[matching] = np.minimum(1.5, satisfied[matching] + world.shared_satisfaction)
        satisfied[owner] = min(1.5, satisfied[owner] + (1. if target[owner] == index else .18))
        social_events += 1

    for sec in range(0, world.max_minutes * 60, 10):
        # Resolve all accepted spins under their captured arm. No outcome is redrawn.
        for owner, win, index, duration, issued in inflight:
            reserved -= 120.
            if win:
                wins[owner] += 1; losses[owner] = 0; awarded += 1
                excitement[owner] = min(3, excitement[owner] + .8)
                delivery_cost += COST * PRICES[index]
                queue.append([duration, owner, index, 'wheel', issued]); work += duration
            else:
                pending_own[owner] -= 1
                losses[owner] += 1
                # A minority persists; most become less interested after repeated losses.
                excitement[owner] = np.clip(excitement[owner] + (.12 if pop['persistent'][owner] else -.15), -2, 3)
        inflight = []
        excitement *= math.exp(-10 / 240)
        social_events *= math.exp(-10 / 300)
        if completed and completed % 6 == 0 and completed != last_break_count:
            break_until = sec + 45; last_break_count = completed
        service = 0 if sec < break_until else 10 * world.delivery_fraction
        while queue and service > 1e-9:
            take = min(service, queue[0][0]); service -= take; queue[0][0] -= take; work -= take
            if queue[0][0] < 1e-9:
                _, owner, index, source, issued = queue.popleft()
                pending_own[owner] -= 1; completed += 1; action_counts[index] += 1
                delivered_wheel += source == 'wheel'; delivered_direct += source == 'direct'
                wait_samples.append((sec - issued) / 60)
                show_action(index, owner)
        assert completed + len(queue) + len(inflight) <= world.quota
        if completed == world.quota:
            assert not queue and not inflight and not np.any(pending_own)
            reason = 'action_quota'; break

        while demand_events and demand_events[0][0] <= sec - 300:
            demand_events.popleft()
        observation = dict(seconds=sec, completed=completed, quota=world.quota,
            outstanding=len(queue)+len(inflight), work=max(0.,work),
            recent_direct_intents=sum(e[1] == 1 for e in demand_events),
            recent_wheel_intents=sum(e[1] == 2 for e in demand_events))
        arm = policy(observation) if callable(policy) else offer_arm(policy, completed, world.quota, work)
        if not isinstance(arm, int) or not 0 <= arm < len(prices): raise ValueError('Invalid offer arm')
        available_seconds += 10
        blocked_seconds += 10 * (completed+len(queue)+len(inflight) >= world.quota or work+reserved+120 > 180+1e-8)
        arm_history.append(arm)
        shocks = rng.random((n, 4))
        visible = (pop['arrival'] <= sec) & (pop['departure'] > sec) & ~left
        if arm: wheel_exposed |= visible
        overload = max(0., social_events / 5 - .6)
        leave_prob = world.overload * overload * np.where(style == 2, .012, .002)
        leaving = visible & (shocks[:, 3] < leave_prob)
        left[leaving] = True
        active = visible & ~left & ~abstain & (pending_own == 0) & (sec >= next_decision)
        considering = active & (shocks[:, 0] < pop['consider_probability'])
        # Stable keyed random priorities interleave intents without cohort priority.
        order = np.flatnonzero(considering)
        order = order[np.argsort(shocks[order, 1])]
        wait_minutes = max(0., work) / (60 * world.delivery_fraction)
        for i in order:
            if losses[i] >= 3 and shocks[i, 2] < min(.85, world.loss_fatigue * (losses[i] - 2)) and not pop['persistent'][i]:
                abstain[i] = True; fatigue_stops += 1; continue
            if wait_minutes > pop['wait_tolerance'][i] and shocks[i, 2] < .25:
                abstain[i] = True; waiting_stops += 1; continue
            dprice = PRICES[target[i]]
            # Outside choice (watch/do nothing) is explicit. Utilities are hypotheses.
            effective_willingness = pop['willingness'][i] + .1 * max(0, excitement[i])
            direct_u = 3 * (effective_willingness - 1) + .15 * excitement[i] - 2.5 * satisfied[i] - .12 * wait_minutes
            direct_u -= .4 * purchases[i]
            if budget[i] < dprice or effective_willingness < .8: direct_u = -math.inf
            wheel_u = -math.inf
            if arm and budget[i] >= prices[arm]:
                # Expected subjective prize value includes mismatch with preferred action.
                subjective = sum(Q[j] * PRICES[j] * pop['willingness'][i] * (1 if j == target[i] else .35) for j in range(4))
                reward_u = 2 * (probabilities[arm] * subjective / prices[arm] - 1)
                novelty = pop['entertainment'][i] * math.exp(-world.novelty_decay * spins[i])
                loss_penalty = (0.04 if pop['persistent'][i] else world.loss_fatigue) * losses[i]
                wheel_u = reward_u + novelty + excitement[i] - .8 * satisfied[i] - loss_penalty - .08 * wait_minutes
                # Cheap participation lowers entry resistance; preference for an action
                # still penalizes a very small chance rather than treating odds as invisible.
                wheel_u += world.price_sensitivity * math.log(32 / prices[arm]) + world.probability_sensitivity * math.log(probabilities[arm] / PS[4])
                wheel_u -= .1 * spins[i]
            weights = np.exp(np.clip(np.array([0., direct_u, wheel_u]), -700, 20))
            weights[~np.isfinite([0., direct_u, wheel_u])] = 0
            probs = weights / weights.sum()
            decision_exposures += 1
            expected_direct_intents += probs[1]; expected_wheel_intents += probs[2]
            quote_price_sum += prices[arm]; quote_p_sum += probabilities[arm]
            choice = int(np.searchsorted(np.cumsum(probs), shocks[i, 2], side='right'))
            choice = min(choice, 2)
            if choice == 0:continue
            intents += 1
            direct_intents += choice == 1; wheel_intents += choice == 2
            demand_events.append((sec, choice))
            slots = completed + len(queue) + len(inflight)
            reserve_work = 120. if choice == 2 else 2 * DURATIONS[target[i]]
            if slots >= world.quota or work + reserved + reserve_work > 180 + 1e-8:
                refused += 1; next_decision[i] = sec + 60; continue
            price = prices[arm] if choice == 2 else dprice
            budget[i] -= price; spent[i] += price; revenue += price
            pending_own[i] += 1; next_decision[i] = sec + 30
            if choice == 2:
                spins[i] += 1; spin_times[i].append(sec); wheel_spent[i] += price; processing += SPIN_COST
                index = int(draws[i].choice(4, p=Q)); win = draws[i].random() < probabilities[arm]
                duration = DURATIONS[index] * draws[i].uniform(.8, 1.2) * (1 + world.streamer_fatigue * completed / world.quota)
                reserved += 120.
                inflight.append((i, win, index, duration, sec))
            else:
                purchases[i] += 1; direct_spent[i] += price; awarded += 1
                index = target[i]
                duration = DURATIONS[index] * draws[i].uniform(.8, 1.2) * (1 + world.streamer_fatigue * completed / world.quota)
                delivery_cost += COST * price
                queue.append([duration, i, index, 'direct', sec]); work += duration
            assert budget[i] >= -1e-8
            assert duration <= 2 * DURATIONS[index] + 1e-8
            assert completed + len(queue) + len(inflight) <= world.quota
            assert work + reserved <= 180 + 1e-8
        max_slots = max(max_slots, completed + len(queue) + len(inflight))
        peak_work = max(peak_work, work)
        if trace and sec % 60 == 0:
            trace_rows.append(dict(minute=sec/60,price=prices[arm],empty=1-probabilities[arm] if arm else None,
                completed=completed,queue=len(queue),remaining_slots=world.quota-completed-len(queue)-len(inflight),work=work,recent_direct_intents=observation['recent_direct_intents'],recent_wheel_intents=observation['recent_wheel_intents'],revenue=float(revenue),active=int(visible.sum()),spins=int(spins.sum()),direct=int(purchases.sum())))
        remaining_audience = np.any((pop['departure'] > sec) & ~left & ~abstain)
        if not remaining_audience and not queue and not inflight:
            reason = 'audience_exhausted'; break
    # At an observation cutoff, settle charged spins, but never mark awards delivered.
    for owner, win, index, duration, issued in inflight:
        if win:
            wins[owner] += 1; awarded += 1; delivery_cost += COST * PRICES[index]; work += duration
    duration_minutes = (sec + 10) / 60
    operating_cost = duration_minutes * world.fixed_cost_per_minute
    net = revenue - delivery_cost - processing - operating_cost
    assert awarded <= world.quota and completed <= awarded
    assert math.isclose(float(spent.sum()), revenue, abs_tol=1e-7)
    assert np.all(budget >= -1e-8)
    result = dict(net=float(net),revenue=float(revenue),wheel_revenue=float(wheel_spent.sum()),
        direct_revenue=float(direct_spent.sum()),delivery_cost=float(delivery_cost),processing=float(processing),operating_cost=operating_cost,
        duration_minutes=duration_minutes,quota_ended=int(reason=='action_quota'),completed=completed,
        unfinished=awarded-completed,spins=int(spins.sum()),wins=int(wins.sum()),direct_purchases=int(purchases.sum()),
        payers=int(np.sum(spent>0)),fatigue_stops=fatigue_stops,waiting_stops=waiting_stops,overload_leavers=int(left.sum()),
        budget_exhausted=int(np.sum(budget<8)),repeat_spinners=int(np.sum(spins>=2)),
        wheel_exposed=int(wheel_exposed.sum()),wheel_exposed_never_spin=int(np.sum(wheel_exposed & (spins==0))),
        accelerating_spinners=sum(len(t)>=5 and np.mean(np.diff(t[-3:])) < np.mean(np.diff(t[:3])) for t in spin_times),refused=refused,intents=intents,peak_work=peak_work,max_slots=max_slots,
        completed_wait_p95=float(np.quantile(wait_samples,.95)) if wait_samples else 0,
        mean_p=float(np.mean([probabilities[a] for a in arm_history if a])) if any(arm_history) else 0,
        decision_exposures=decision_exposures,direct_intents=direct_intents,wheel_intents=wheel_intents,
        expected_direct_intents=float(expected_direct_intents),expected_wheel_intents=float(expected_wheel_intents),
        mean_quoted_price=quote_price_sum/max(1,decision_exposures),mean_quoted_p=quote_p_sum/max(1,decision_exposures),
        capacity_blocked_fraction=blocked_seconds/max(1,available_seconds))
    for g,name in enumerate(GROUPS):
        mask=group==g
        result.update({name+'_viewers':int(mask.sum()),name+'_payers':int(np.sum(spent[mask]>0)),
            name+'_wheel_payers':int(np.sum(wheel_spent[mask]>0)),name+'_direct_revenue':float(direct_spent[mask].sum()),
            name+'_wheel_revenue':float(wheel_spent[mask].sum()),name+'_spins':int(spins[mask].sum())})
    return result, dict(group=group.tolist(),spent=spent.tolist(),direct_spent=direct_spent.tolist(),
        wheel_spent=wheel_spent.tolist(),arrivals=pop['arrival'].tolist(),reason=reason,trace=trace_rows)
