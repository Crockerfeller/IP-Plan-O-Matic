#!/usr/bin/env python3
"""Generate tests/accuracy-cases.json: random IPv4/IPv6 cases with answers from Python's ipaddress.

The accuracy test page feeds the same inputs to IP Plan-O-Matic and compares. Run from the repo root:
    python3 tests/make_accuracy_cases.py
"""
import ipaddress, json, pathlib, random

random.seed(7)
cases = []
for _ in range(400):
    m = random.choice(list(range(0, 33)) + [24, 24, 26, 27, 28, 29, 30, 31, 32, 16, 8])
    ip = ipaddress.IPv4Address(random.getrandbits(32))
    n = ipaddress.IPv4Network(f'{ip}/{m}', strict=False)
    hosts = 1 if m == 32 else 2 if m == 31 else n.num_addresses - 2
    first = n.network_address if m >= 31 else n.network_address + 1
    last = n.broadcast_address if m >= 31 else n.broadcast_address - 1
    cases.append(dict(inp=f'{ip}/{m}', net=str(n), mask=str(n.netmask), wild=str(n.hostmask),
                      lo=str(n.network_address), hi=str(n.broadcast_address), first=str(first), last=str(last), hosts=hosts))
sums = []
for _ in range(60):
    k = random.randint(2, 12)
    base = random.getrandbits(32) & 0xFFFF0000
    nets = [ipaddress.IPv4Network(f'{ipaddress.IPv4Address(base + random.randint(0, 65535))}/{random.randint(20, 30)}', strict=False) for _ in range(k)]
    sums.append(dict(inp=[str(x) for x in nets], out=sorted(str(x) for x in ipaddress.collapse_addresses(nets))))
sums6 = []
for _ in range(40):
    base = (0x2001_0db8 << 96) | (random.getrandbits(16) << 80)
    nets = [ipaddress.IPv6Network(f'{ipaddress.IPv6Address(base + (random.getrandbits(16) << 64))}/{random.choice([52, 56, 60, 62, 63, 64])}', strict=False) for _ in range(random.randint(2, 10))]
    sums6.append(dict(inp=[str(x) for x in nets], out=sorted(str(x) for x in ipaddress.collapse_addresses(nets))))
info6 = []
for _ in range(60):
    m = random.choice([32, 40, 44, 48, 52, 56, 60, 64, 127, 128, 47, 63])
    n = ipaddress.IPv6Network(f'{ipaddress.IPv6Address(random.getrandbits(128))}/{m}', strict=False)
    info6.append(dict(inp=str(n), first=str(n.network_address), last=str(n.broadcast_address), expanded=n.network_address.exploded))
out = pathlib.Path(__file__).resolve().parent / 'accuracy-cases.json'
out.write_text(json.dumps(dict(cases=cases, sums=sums, sums6=sums6, info6=info6)))
print(f'wrote {out}')
