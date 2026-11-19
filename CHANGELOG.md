# What's new

IP Plan-O-Matic deploys every change as soon as its tests pass, so there are no version numbers: entries are grouped by
date. The build number in the app's footer is the commit it was built from.

## 2026-11-18

- **Visualize tab:** a network diagram of the plan, drawn in each cloud's own style: AWS VPCs with Availability Zones
  and public and private subnets, Azure VNets, Google Cloud VPCs by region, Oracle VCNs and on-premises sites by VLAN,
  with an icon for what each subnet is for. Peered networks show the hub, spokes and the Transit Gateway or DRG
  between them. Pan and zoom it, double-click a subnet to open it, and download it as PNG, SVG, or a PowerPoint slide
  or Visio drawing made of editable shapes.
- **Dual-stack IPv6 for cloud networks:** a switch on the network (and in the subnet wizard) gives every subnet an IPv6
  /64 in the Terraform, CloudFormation, Bicep and Azure CLI exports, following each cloud's rules.
- **Import from NetBox and phpIPAM:** load their CSV export or paste their API's JSON. Top-level prefixes become
  base networks, containers name them, and names, VLANs, statuses and comments come across.
- **Numbers in your format:** counts, decimals and percentages on screen use your browser's settings (1,024 and 6.3%,
  or 1.024 and 6,3 % in Germany). Exported files stay in one format so tools read them the same everywhere.
- **PNG export** shows an error instead of hanging when the image is too big for the device's memory.
- **Backups:** the Plans dialog reminds you to back up saved plans when they've changed since your last backup,
  and asks the browser to keep them (so Safari doesn't clear them after a week away). Backups are dated files.
- **Content Security Policy:** the app and guides can only run their own script files, so a malicious plan link
  couldn't run code even if a bug let its text through.
- **Accessibility:** checked against WCAG 2.2 AA in light and dark themes on every release. Text colors have more
  contrast, every field has a label, and screen readers can now reach the rename button on group bars.
- **Fonts are self-hosted:** the page makes no requests to Google or anyone else.
- **Exports are checked with their real tools** (Terraform, Bicep, cfn-lint, PowerShell, shellcheck and more) on
  every release. Terraform files now come out already formatted, and names containing `${` no longer break them.
- Tested in Safari (WebKit) and Firefox as well as Chrome on every release.
- **Feedback:** report a problem or suggest a feature from the link in the footer.
- MIT license.

## 2026-11-16

- **Import** existing networks from AWS, Azure, Google Cloud and Oracle Cloud.
- **Compare plans:** see what changed between another version and the current plan.
- **IP addresses:** assign single addresses within subnets, and see how full each subnet is.
- Export as a **PNG or SVG image**, and to **Ubiquiti UniFi and EdgeRouter**.
- pfSense export is a PHP script pfSense runs; OPNsense export uses its API for VLANs and Kea DHCP.
- Azure exports add route tables through Azure Firewall, and an NSG per subnet.
- Subnet wizards for on-prem, Google Cloud and Oracle Cloud; the wizard button follows the Platform.
- A guide page for every subnet size from /8 to /32, plus IPv6 /48, /56 and /64.
- **Subnetting practice:** random questions, checked answers, with the working shown.
- The Format menu has a submenu per cloud, with logos.

## 2026-11-15

- Export to **Bicep, CloudFormation**, an Azure CLI PowerShell script, **NetBox and phpIPAM**.
- **Networks panel:** network cards, peering lines, add a network or split one off.
- Name groups from their join bar; group names appear in the table, CSV, Terraform and print.
- Single-VNet subnet wizard; hub-and-spoke templates have their own menu.
- Build numbers: Reload turns into **Update app** when a newer build is live.

## 2026-11-14

First public release, with:

- Subnet table with divide and join, names, VLANs, status and notes; several base networks per plan; undo and redo.
- VLSM planner with best-fit placement, a Fill free space mode and availability-zone layouts.
- A 2-D address map, IPv6 planning, and tools for summarizing and checking routes.
- Cloud platforms (Azure, AWS, Google Cloud, Oracle Cloud) with their reserved addresses; Azure and AWS
  hub-and-spoke templates and a peering wizard.
- Exports: Terraform, Excel, CSV, Markdown, HTML, Cisco, Arista, FortiGate, PAN-OS, pfSense, OPNsense, Ansible and more.
- Saved plans in the browser, autosave, short share links, keyboard shortcuts, and an installable offline app.
- Subnetting guides.
