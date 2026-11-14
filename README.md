# IP Plan-O-Matic — Free Visual Subnet Calculator & IP Address Planner

**▶ Use it now: https://crockerfeller.github.io/IP-Plan-O-Matic/**

![IP Plan-O-Matic](og-image.png)

IP Plan-O-Matic is a free, browser-based **subnet calculator**, **VLSM calculator** and **IPv4/IPv6 address planner**. Lay out a whole network plan visually: divide a block into subnets with a click, join them back together, label each with a name, VLAN and status, see it all on a color-coded address map, then export router or Terraform config. Nothing to install, no account, no server. Your plan lives in the page link, and the app works offline.

## Features

- **Visual IPv4 subnetting:** divide and join subnets; see network, broadcast, usable range, gateway, netmask, wildcard, binary and host count.
- **Address map:** the base network as a grid of squares, colored by status or VLAN. Click a subnet to jump to its row.
- **Several base networks in one plan:** HQ, branches and cloud VPCs side by side, each with its own platform rules. Overlapping base networks are refused.
- **Add by CIDR:** type `10.0.5.0/24 Servers` to carve out an exact subnet, or a range outside the plan to add a new base network.
- **Undo / redo:** every change, with Ctrl+Z / ⌘Z and Ctrl+Shift+Z / ⇧⌘Z.
- **VLSM auto-planner:** list networks with host counts (plus optional VLAN and growth headroom). Each one is placed best-fit, largest first. Replace the plan, or fill only the free space around the subnets you already have.
- **Cloud-aware:** AWS VPC, Azure VNet, Google Cloud VPC and Oracle Cloud (OCI) VCN reserved addresses and minimum subnet sizes.
- **Overlap checker:** test your plan against existing networks, VPN peers and VPCs.
- **Route summarization:** collapse a list of routes into the fewest CIDR blocks and find the covering supernet.
- **Address info:** RFC 1918, CGNAT, link-local, documentation, multicast and other special ranges, plus the reverse DNS zone.
- **IPv6 planner:** split prefixes by bit or nibble; give each prefix a name, VLAN, status and notes; auto-plan by count (e.g. `Sites, /56, 12`); generate a random ULA /48.
- **Export:** Cisco IOS / IOS-XE, Juniper Junos, MikroTik RouterOS, Terraform (AWS, Azure, GCP, OCI), CSV and JSON, with optional DHCP pools. Import JSON or CSV.
- **Save and share:** the whole plan is stored in the URL, so you can bookmark it or send it. You can also save named plans in your browser and export them all as a backup. Your working plan is kept automatically.
- **Works offline:** installable as an app (PWA); after the first visit it runs without a connection.
- Light and dark themes, works on phones, print-friendly.

## Who it's for

Network engineers, sysadmins, cloud architects, homelabbers, and CCNA / Network+ students learning subnetting.

## Run locally

It's a single `index.html` with no build step. Open it in a browser. Offline support (`sw.js`, `manifest.webmanifest`) needs it served over `https://` or `http://localhost`, for example `python3 -m http.server`.

## Support

IP Plan-O-Matic is free. If it saved you time, you can tip:

- **X Money:** in the X app, Money → Send → `@wangooroo`
- **Venmo:** [@Crockerfeller](https://venmo.com/u/Crockerfeller)
- **Ko-fi:** [ko-fi.com/crockerfeller](https://ko-fi.com/crockerfeller)

Or follow [@wangooroo on X](https://x.com/wangooroo).

---

By Huddacaster, a subsidiary of Crockerfeller Industries © 2026
