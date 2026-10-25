"""
The arena's shape, straight from docs/pursuit-arena/02 §2 (game space,
metres, -Z north). District centres come from content/arena.seed.json so the
generators and the Explore fly-to can never disagree.
"""

HQ_PLAZA = 22.0
DEADLINE_LOOP = (38.0, 44.0)   # ring road, inner/outer radius
INNER_RING = 62.0              # team territories
OUTER_LOOP = (82.0, 88.0)
OUTER_RING = 105.0             # pillars + RFP Gate
BOUNDARY = 135.0
ROAD_WIDTH = 6.0

TERRITORY_RADIUS = 15.0        # "each about 30 m across"
PILLAR_RADIUS = 18.0           # "each about 36 m across"

# Decade Drive: the 180° spoke between the RFP Gate and HQ, Year 1 nearest
# the gate (doc 02 §3.1). Eight arches between the Outer Loop and the
# Deadline Loop, two between that and the HQ plaza; none may stand in a
# ring road's band (their posts sit at x = ±5.4), which the drive test caught.
DECADE_ARCHES_Z = [80.0, 75.5, 71.0, 66.5, 62.0, 57.5, 53.0, 48.5, 33.0, 27.5]

# Jump ramps on the Outer Loop (doc 02 §3.5), on bearings no spoke uses:
# pillar spokes meet the loop at multiples of 60°, so a ramp there sits
# side-on to that traffic (the drive test caught 120° and 300°).
RAMP_ANGLES = [30.0, 150.0, 210.0, 330.0]
RAMP_PITCH_DEG = 15.0
RAMP_LENGTH = 8.0

DISTRICT_IDS = [
    'hq', 'rfp_gate', 'decade_drive',
    'audit', 'tax', 'consulting', 'pace', 'studio', 'catalyst',
    'innovation', 'rnr', 'lnd', 'toolkit', 'culture',
]

# Loaded with the first frame vs streamed in afterwards (doc 06 Phase 4).
CORE = {'base', 'hq', 'rfp_gate', 'decade_drive', 'audit', 'tax', 'consulting', 'pace', 'studio', 'catalyst'}


def districts(seed):
    """id -> dict(kind, name, color, x, z, angle, stations) for every district file."""
    out = {}
    for d in seed['territories'] + seed['pillars']:
        out[d['id']] = dict(kind=d['kind'], name=d['name'], color=d['color'], x=d['position'][0],
                            z=d['position'][2], angle=d['angleDeg'], stations=d['stations'], miniGame=d['miniGame'])
    hq = seed['hq']
    out['hq'] = dict(kind='hq', name=hq['name'], color=hq['color'], x=0.0, z=0.0, angle=0.0, stations=hq['stations'])
    gate = seed['rfpGate']
    out['rfp_gate'] = dict(kind='gate', name=gate['name'], color=gate.get('color', '#86BC25'),
                           x=gate['position'][0], z=gate['position'][2], angle=180.0, stations=gate['stations'])
    out['decade_drive'] = dict(kind='timeline', name='Decade Drive', color=hq['color'], x=0.0, z=60.0,
                               angle=180.0, stations=seed['timeline'])
    return out
