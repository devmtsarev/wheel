"""Synthetic experiment settings, not production defaults or operator controls."""
import numpy as np

PRICES=np.array([20.,60.,120.,240.]); DURATIONS=np.array([5.,15.,30.,60.])
Q=1/PRICES;Q/=Q.sum();DIRECT_Q=np.array([.1,.2,.3,.4])
PREMIUM=.2;H=float(Q@PRICES);D=float(Q@DURATIONS)
HD=float(DIRECT_Q@PRICES);DD=float(DIRECT_Q@DURATIONS)
COST=.35 # synthetic delivery cost as fraction of direct value, not operator premium
SPIN_COST=.05 # synthetic processing cost, token-equivalent
OFFERS=[0,8,16,24,32,40,48] # 0 means wheel unavailable, not a paid all-empty spin
PS=[s/((1+PREMIUM)*H) for s in OFFERS]
BASE=4 # price 32
DT=5;HARD=180.;WORST=120.;SOFT=HARD-WORST;HORIZON=6;WINDOW=120
