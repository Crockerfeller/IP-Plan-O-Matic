# IP Plan-O-Matic — Free Visual Subnet Calculator & IP Address Planner

**▶ Use it now: https://crockerfeller.github.io/IP-Plan-O-Matic/**

![IP Plan-O-Matic](og-image.png)

IP Plan-O-Matic is a free, browser-based **subnet calculator**, **VLSM calculator** and **IPv4/IPv6 address planner**. Lay out a whole network plan visually: divide a block into subnets with a click, join them back together, label each with a name, VLAN and status, then export router or Terraform config. Nothing to install, no account, no server. Your plan lives in the page link.

## Features

- **Visual IPv4 subnetting:** divide and join subnets; see network, broadcast, usable range, gateway, netmask, wildcard, binary and host count.
- **VLSM auto-planner:** list networks with host counts (plus optional VLAN and growth headroom) and get a packed, overlap-free plan.
- **Cloud-aware:** AWS VPC, Azure VNet and Google Cloud VPC reserved addresses and minimum subnet sizes.
- **Overlap checker:** test your plan against existing networks, VPN peers and VPCs.
- **Route summarization:** collapse a list of routes into the fewest CIDR blocks and find the covering supernet.
- **Address info:** RFC 1918, CGNAT, link-local, documentation, multicast and other special ranges, plus the reverse DNS zone.
- **IPv6 planner:** split prefixes by bit or nibble, name them, and generate a random ULA /48.
- **Export:** Cisco IOS / IOS-XE, Juniper Junos, MikroTik RouterOS, Terraform (AWS, Azure, GCP), CSV and JSON, with optional DHCP pools. Import JSON or CSV.
- **Share by link:** the whole plan, names and VLANs included, is stored in the URL. Bookmark it or send it.
- Light and dark themes, works on phones, print-friendly.

## Who it's for

Network engineers, sysadmins, cloud architects, homelabbers, and CCNA / Network+ students learning subnetting.

## Run locally

It's a single `index.html` with no build step. Open it in a browser.

## Support

IP Plan-O-Matic is free. If it saved you time, tip **@wangooroo** on X Money (in the X app: Money → Send → `@wangooroo`), or follow [@wangooroo on X](https://x.com/wangooroo).

---

By Huddacaster, a subsidiary of Crockerfeller Industries © 2026
