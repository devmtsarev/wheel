"""Experimental fixed-premium planner. No RNG, user data or outcome manipulation.

Predictor contract: predict(offer_index, audience, shared, wait, minute) returns
non-negative finite wheel/direct request rates per minute. The simulator supplies
a pilot-fitted predictor; this module cannot inspect its synthetic environment.
"""
import math
from settings import HORIZON, PS, D, DD, DT, WORST, SOFT, OFFERS, COST, H, HD, SPIN_COST

def forecast(model,arm,audience,shared,work,reserved,capacity,minute):
    """Six-minute fluid forecast, constant candidate and current audience/capacity.
    Common acceptance approximation; does not observe future random outcomes.
    Full expected delivery cost is charged when an obligation is awarded.
    """
    if not math.isfinite(capacity) or capacity <= 0:
        raise ValueError('Positive finite service capacity required; pause outside the planner.')
    total=0.;q=work+reserved # conservative: count in-flight reservation as work
    e=shared
    for step in range(HORIZON):
        w,d=model.predict(arm,audience,e,q/capacity,minute)
        if any(not math.isfinite(x) or x < 0 for x in (w,d)):
            raise ValueError('Predictor rates must be finite and non-negative.')
        incoming=w*PS[arm]*D+d*DD
        service=min(q,capacity);q-=service
        # Keep room for a worst-case award; account for in-flight reservations.
        reserve=w*DT/60*WORST
        acceptance=min(1.,max(0,SOFT-q)/max(1e-9,incoming+reserve))
        total+=acceptance*(w*(OFFERS[arm]-PS[arm]*COST*H-SPIN_COST)+d*(1-COST)*HD)
        q+=acceptance*incoming
        # Approximate shared completions with expected mix, max observed exposure.
        win_rate=w*PS[arm]+d
        duration=incoming/max(win_rate,1e-9)
        e=min(3.,e*math.exp(-1/5)+.8*service/max(duration,1e-9)/5)
    return total

def choose(model,current,audience,shared,work,reserved,capacity,minute,allow_off=False):
    scores=[forecast(model,a,audience,shared,work,reserved,capacity,minute) for a in range(7)]
    best=max(range(0 if allow_off else 1,7),key=lambda a:scores[a])
    # Avoid small oscillations; 3% is an experimental internal hysteresis setting.
    if current == 0 and not allow_off:
        return best
    if scores[best]-scores[current] > abs(scores[current])*.03+1:return best
    return current
