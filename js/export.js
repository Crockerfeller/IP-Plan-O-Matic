// IP Plan-O-Matic: The Export tab: the format menu, the preview, Copy and Download.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

const EXT = { cisco: 'txt', arista: 'txt', junos: 'txt', mikrotik: 'rsc', fortigate: 'conf', panos: 'txt', pfsense: 'php', opnsense: 'sh', 'tf-aws': 'tf', 'tf-azure': 'tf', 'tf-gcp': 'tf', 'tf-oci': 'tf', ansible: 'yml', csv: 'csv', json: 'json', xlsx: 'xlsx', md: 'md', html: 'html', bicep: 'bicep', 'az-ps': 'ps1', 'cfn-aws': 'yaml', netbox: 'csv', 'netbox-vlans': 'csv', phpipam: 'csv', png: 'png', svg: 'svg', hosts: 'csv', unifi: 'sh', edgeos: 'txt' };
const MIME = { json: 'application/json', csv: 'text/csv', md: 'text/markdown', html: 'text/html', ansible: 'text/yaml', 'cfn-aws': 'text/yaml', netbox: 'text/csv', 'netbox-vlans': 'text/csv', phpipam: 'text/csv', svg: 'image/svg+xml', hosts: 'text/csv', unifi: 'text/x-shellscript', opnsense: 'text/x-shellscript' };
const renderExport = () => {
  const f = $('exFmt').value;
  $('exCopy').disabled = $('exDl').disabled = !f;
  if (!f) {
    // Nothing chosen yet (every page load starts here): no output until a format is picked.
    $('exDhcpL').hidden = $('exAzRtL').hidden = $('exAzNsgL').hidden = true; $('exImg').hidden = true; $('exOut').hidden = false; $('exOut').value = '';
    showMsg('exMsg', 'Choose a format to see the export.', 'info');
    return;
  }
  const whole = f === 'json' || f === 'csv' || f === 'xlsx' || f === 'hosts';
  $('exInc').disabled = whole;
  $('exDhcpL').hidden = !DHCP_FMTS.includes(f);
  $('exAzRtL').hidden = $('exAzNsgL').hidden = !['tf-azure', 'bicep', 'az-ps'].includes(f);
  clearMsg('exMsg');
  let text;
  const isImg = f === 'png' || f === 'svg';
  $('exOut').hidden = isImg;
  $('exImg').hidden = !isImg;
  if (isImg) {
    const { list } = exportList();
    text = genPlanSvg(list);
    $('exImg').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    showMsg('exMsg', `The address map of every network, and a table of the subnets that Include picks. ${f === 'png' ? 'Copy puts the image on your clipboard for pasting into a ticket, chat or document.' : 'SVG stays sharp at any size, and opens in browsers, draw.io, Visio and Inkscape.'}`, 'info');
  } else if (f === 'json') text = genJson();
  else if (f === 'csv') text = buildCsv(false).text;
  else if (f === 'hosts') {
    text = genHostsCsv();
    showMsg('exMsg', hostRows().length ? 'Every assigned IP address with its name, MAC and subnet. Import it back (here or into another plan) to add the addresses.' : 'No IP addresses are assigned yet. Click a number in the Hosts column on the Plan tab to assign some.', 'info');
  }
  else if (f === 'xlsx') {
    // Preview as tab-separated text (Copy pastes straight into a spreadsheet); Download gives the .xlsx file.
    const m = buildMatrix(false);
    text = [m.head, ...m.rows].map((r) => r.join('\t')).join('\n');
    showMsg('exMsg', `Excel workbook with every subnet${v6.root.c || Object.keys(v6.meta).length ? ' and a second sheet for IPv6' : ''}. Click Download to save the .xlsx file; Copy puts the table on your clipboard for pasting.`, 'info');
  } else {
    const { list, note } = exportList();
    if (note) showMsg('exMsg', note, 'info');
    const dhcp = $('exDhcp').checked;
    const gen = { cisco: genCisco, arista: genArista, junos: genJunos, mikrotik: genMikrotik, fortigate: genFortigate, panos: genPanos, pfsense: genPfsense, ansible: genAnsible, md: genMarkdown, html: genHtml,
      'az-ps': genAzCli, bicep: genBicep, 'cfn-aws': genCfn, netbox: genNetbox, 'netbox-vlans': genNetboxVlans, phpipam: genPhpipam, unifi: genUnifi, edgeos: genEdgeos, opnsense: genOpnsense }[f];
    text = gen ? gen(list, dhcp) : genTf(list, f);
    const how = {
      'az-ps': 'Paste into Azure Cloud Shell (PowerShell) or run as a .ps1 after “az login”. Set $ResourceGroup and $Location at the top; $DryRun = $true prints the commands first.',
      bicep: 'Preview with “az deployment group what-if”, then deploy with “az deployment group create” (commands at the top).',
      'cfn-aws': 'Deploy with “aws cloudformation deploy” or upload it in the CloudFormation console.',
      netbox: 'In NetBox: IPAM → Prefixes → Import. Base networks come in as containers. If the plan has VLANs, import “NetBox: VLANs” first so the VLAN column matches.',
      'netbox-vlans': list.some((x) => x.meta.v) ? 'In NetBox: IPAM → VLANs → Import. Import these before the prefixes.' : 'No subnets in this export have a VLAN, so there are no VLANs to import.',
      pfsense: 'Set $parent to your trunk port, then paste it into Diagnostics > Command Prompt > Execute PHP Commands (without the first <?php line), or run it over SSH. Try $dry_run = true first. Only subnets with a VLAN ID are added.',
      opnsense: 'Runs in two parts: “vlans” creates the VLANs through the OPNsense API, you assign them in the web UI (the script lists exactly what), then “dhcp” adds Kea DHCP subnets. Needs an API key and secret; DRY_RUN=1 shows the requests first.',
      unifi: 'Run it on a computer that can reach your UniFi console: UNIFI_HOST=<console address> UNIFI_API_KEY=<key> bash subnet-plan-unifi.sh. Make the key in UniFi Network under Settings > Control Plane > Integrations. Only subnets with a VLAN ID become networks.',
      edgeos: 'Paste into the EdgeRouter CLI (SSH or the CLI button in the web UI). It ends with “compare” so you can check the changes, then type commit and save.',
      phpipam: 'In phpIPAM: Administration → Subnets → Import (or Import / export on a section). Create the section “IP Plan-O-Matic” first, or rename it in the file, and match the columns when asked.',
    }[f];
    if (how && !note) showMsg('exMsg', how, 'info');
  }
  $('exOut').value = text;
};
for (const id of ['exFmt', 'exInc', 'exDhcp', 'exAzRt', 'exAzNsg']) $(id).addEventListener('change', renderExport);

// ---------- Format menu: sections, with a pop-out submenu per cloud provider and for Ubiquiti ----------
/** Heading, then formats as [value, label?] (no label: the format's own name) or a submenu as [name, [[value, label], …]].
    @type {[string, ([string, string?] | [string, [string, string][]])[]][]} */
const FMT_MENU = [
  ['Infrastructure as code', [
    ['Amazon Web Services', [['tf-aws', 'Terraform'], ['cfn-aws', 'CloudFormation (YAML)']]],
    ['Microsoft Azure', [['tf-azure', 'Terraform'], ['bicep', 'Bicep'], ['az-ps', 'Azure CLI script (PowerShell)']]],
    ['Google Cloud', [['tf-gcp', 'Terraform']]],
    ['Oracle Cloud (OCI)', [['tf-oci', 'Terraform']]],
    ['ansible'],
  ]],
  ['Router / firewall config', [['cisco'], ['arista'], ['junos'], ['mikrotik'], ['fortigate'], ['panos'], ['pfsense'], ['opnsense'],
    ['Ubiquiti', [['unifi', 'UniFi Network (API script)'], ['edgeos', 'EdgeRouter (EdgeOS)']]]]],
  ['IPAM tools', [['netbox'], ['netbox-vlans'], ['phpipam']]],
  ['Spreadsheets, documents and images', [['xlsx'], ['csv'], ['hosts'], ['json'], ['md'], ['html'], ['png'], ['svg']]],
];
// Brand marks from Simple Icons 16.38.0 (CC0; the trademarks belong to their owners): [colour or null for the text colour, path].
// AWS, Azure, Oracle, Arista, NetBox, phpIPAM and Excel aren't there (several asked to be removed), so they get a text badge.
const BRAND = {
  googlecloud: ["#4285F4", 'M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-3.875 2.551-3.922 8.11-.247 10.941l.006-.007-.007.03a6.717 6.717 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.365 9.365 0 0 0-2.821-4.552l-.043.043.006-.05A9.344 9.344 0 0 0 12.19 2.38zm-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.186 5.186 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.59 2.59 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.747 6.747 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.186 5.186 0 0 1 3.67-1.69z'],
  terraform: ["#844FBA", 'M1.44 0v7.575l6.561 3.79V3.787zm21.12 4.227l-6.561 3.791v7.574l6.56-3.787zM8.72 4.23v7.575l6.561 3.787V8.018zm0 8.405v7.575L15.28 24v-7.578z'],
  ansible: ["#EE0000", 'M10.617 11.473l4.686 3.695-3.102-7.662zM12 0C5.371 0 0 5.371 0 12s5.371 12 12 12 12-5.371 12-12S18.629 0 12 0zm5.797 17.305c-.011.471-.403.842-.875.83-.236 0-.416-.09-.664-.293l-6.19-5-2.079 5.203H6.191L11.438 5.44c.124-.314.427-.52.764-.506.326-.014.63.189.742.506l4.774 11.494c.045.111.08.234.08.348-.001.009-.001.009-.001.023z'],
  cisco: ["#1BA0D7", 'M16.331 18.171V17.06l-.022.01c-.25.121-.522.19-.801.203a1.186 1.186 0 01-.806-.237 1.038 1.038 0 01-.352-.498 1.21 1.21 0 01-.023-.667c.052-.225.178-.426.357-.569.16-.134.355-.218.562-.242a1.85 1.85 0 011.061.198l.024.013v-1.117l-.051-.014a2.862 2.862 0 00-1.011-.132 2.34 2.34 0 00-.903.206c-.287.132-.54.327-.739.571a2.221 2.221 0 00-.04 2.705c.295.378.709.645 1.175.756.491.12 1.006.102 1.487-.052l.082-.023M5.336 18.171V17.06l-.022.01c-.25.121-.522.19-.801.203a1.183 1.183 0 01-.806-.237 1.03 1.03 0 01-.351-.498 1.202 1.202 0 01-.024-.667c.052-.225.177-.426.357-.569.16-.134.355-.218.562-.242a1.85 1.85 0 011.061.198l.024.013v-1.117l-.051-.014a2.862 2.862 0 00-1.011-.132 2.344 2.344 0 00-.903.206 2.08 2.08 0 00-.74.571 2.224 2.224 0 00-.041 2.705 2.11 2.11 0 001.176.756c.491.12 1.005.102 1.487-.052l.083-.023M9.26 17.249l-.004.957.07.012c.22.041.441.069.664.085.195.019.391.022.587.012.187-.014.372-.049.551-.104.21-.06.405-.163.571-.305a1.16 1.16 0 00.333-.478 1.31 1.31 0 00-.007-.96 1.068 1.068 0 00-.298-.414 1.261 1.261 0 00-.438-.255l-.722-.268a.388.388 0 01-.197-.188.245.245 0 01.008-.219.382.382 0 01.154-.142.798.798 0 01.257-.074c.153-.022.308-.021.46.005.18.02.358.051.533.096l.038.008v-.883l-.069-.015a4.749 4.749 0 00-.543-.097 2.844 2.844 0 00-.714-.003c-.3.027-.585.143-.821.33-.16.126-.281.293-.351.484-.104.29-.105.608 0 .899.054.145.14.274.252.381.097.093.207.173.327.236.157.084.324.149.497.195.057.017.114.035.17.054l.085.031.024.01c.084.03.162.078.226.14.045.042.08.094.101.151a.325.325 0 01.001.161.339.339 0 01-.166.198.856.856 0 01-.275.086 2.032 2.032 0 01-.427.021 5.208 5.208 0 01-.557-.074 9.195 9.195 0 01-.287-.067l-.033-.006zm-2.475.995h1.05v-4.167h-1.05v4.167zm12.162-2.936a1.095 1.095 0 011.541.158 1.094 1.094 0 01-.157 1.541l-.017.014a1.096 1.096 0 01-1.367-1.713m-1.525.854a2.193 2.193 0 002.666 2.107 2.139 2.139 0 00.701-3.937 2.207 2.207 0 00-3.367 1.83M22.961 10.728a.52.52 0 001.039 0V9.573a.52.52 0 00-1.039 0v1.155M20.117 10.728a.522.522 0 001.041 0V8.139a.521.521 0 00-1.04 0v2.589M17.231 11.771a.521.521 0 001.039 0V6.17a.52.52 0 00-1.039 0v5.601M14.393 10.728a.521.521 0 001.04 0V8.139a.52.52 0 00-1.039 0v2.589M11.494 10.728a.522.522 0 001.039 0V9.573a.52.52 0 00-1.039 0v1.155M8.624 10.728a.52.52 0 001.039 0V8.139a.52.52 0 00-1.039 0v2.589M5.737 11.771a.52.52 0 001.039 0V6.17a.52.52 0 00-1.039 0v5.601M2.876 10.728a.522.522 0 001.04 0V8.139a.52.52 0 00-1.039 0v2.589M0 10.728a.521.521 0 001.039 0V9.573a.52.52 0 00-1.039 0v1.155'],
  junipernetworks: ["#84B135", 'M23.0864 13.1643c.0456 0 .0717-.0132.0717-.062 0-.0482-.0254-.0593-.0731-.0593h-.1023v.1213zm-.1037.0417v.1285h-.0445v-.334h.1487c.0846 0 .1172.0347.1172.1006 0 .054-.0229.0912-.0806.102l.0755.1314h-.0484l-.0746-.1285zm.0746-.2918a.2535.2535 0 0 0-.2533.2531c0 .1395.1136.2532.2533.2532a.2535.2535 0 0 0 .253-.2532.2534.2534 0 0 0-.253-.2531zm-.291.2531a.2912.2912 0 0 1 .291-.2908.291.291 0 0 1 .2905.2908.291.291 0 0 1-.2905.2907.2912.2912 0 0 1-.291-.2907zm-20.7445-.6602V8.8304h-.4212v3.6767c0 .8506.0337 1.5332-1.4404 1.5332A4.029 4.029 0 0 1 0 14.0369v.397a6.215 6.215 0 0 0 .1602.0022c1.7858 0 1.8616-.8002 1.8616-1.929zm15.5404-1.6972h3.1334c-.042-.918-.1011-1.7014-1.4404-1.7014-1.2887 0-1.6425.6992-1.693 1.7014zm1.7016-2.0889c1.794 0 1.853 1.2045 1.8447 2.4764h-3.5548c.0085 1.1204.2863 1.9544 1.7436 1.9544.775 0 1.1288-.2107 1.5079-.4886l.2357.3116c-.421.3117-.918.556-1.7436.556-1.8194 0-2.1565-1.053-2.1565-2.4091 0-1.356.3877-2.4007 2.123-2.4007zm-4.1484 2.7055c.7439 0 1.1135-.3625 1.1135-1.0949 0-.7322-.3988-1.0798-1.132-1.0798h-1.7285v2.1747zM15.109 8.839c1.0678 0 1.5519.5307 1.5519 1.474 0 .9497-.478 1.527-1.5578 1.527h-1.7348v1.5981h-.4124V8.839zm-2.9253 0v4.5991h-.4122V8.839zm-1.1939 4.5991h-.4296v-2.8134c0-.8086.0084-1.491-1.474-1.491-1.4743 0-1.4405.6824-1.4405 1.5331v2.7713h-.4212v-2.7713c0-1.1288.076-1.9289 1.8616-1.9289 1.7943 0 1.9037.8001 1.9037 1.8952zM2.7466 8.8304h.4297v2.8134c0 .8088-.0084 1.491 1.474 1.491 1.4742 0 1.4405-.6822 1.4405-1.533V8.8303h.4212v2.7713c0 1.1289-.0759 1.929-1.8616 1.929-1.7943 0-1.9038-.8001-1.9038-1.8952zm18.9675 1.8364v2.7713h.421v-2.7713c0-.8507-.0336-1.533 1.4407-1.533.1579 0 .298.0083.4242.023v-.4012a4.8535 4.8535 0 0 0-.4242-.0177c-1.7859 0-1.8617.8001-1.8617 1.929zm-.4315 4.3602c.1525.096.3017.1286.4542.1286.2624 0 .3789-.0737.3789-.2486 0-.18-.1508-.2057-.3789-.2468-.2743-.048-.4594-.0944-.4594-.3514 0-.2453.1577-.3413.4594-.3413.199 0 .3412.0447.4423.1132l-.072.1097c-.0908-.06-.2263-.0995-.3703-.0995-.228 0-.3257.0636-.3257.2144 0 .1612.132.192.3584.233.2776.0499.4782.091.4782.3635 0 .2521-.1612.3737-.5074.3737-.192 0-.3652-.0393-.5263-.1456zm-.7886-.4423l-.2538.2777v.396h-.132v-1.2703h.132v.7012l.643-.7012h.156l-.456.4989.5176.7715h-.1525l-.4543-.6738m-1.1006.0326c.18 0 .2914-.0549.2914-.2555 0-.1971-.108-.2485-.2965-.2485h-.4132v.504zm-.0377.1234h-.3806v.5178h-.132V13.988h.5486c.2948 0 .4286.1183.4286.3703 0 .2194-.1046.348-.3258.377l.3068.523h-.1439l-.3017-.5177m-.924-.1166c0-.3429-.1594-.528-.5058-.528-.3446 0-.5023.1851-.5023.528 0 .3446.1577.5298.5023.5298.3464 0 .5058-.1852.5058-.5298zm-.5058-.6566c.408 0 .6412.2024.6412.655 0 .4542-.2332.6565-.6412.6565-.4063 0-.6377-.2023-.6377-.6566 0-.4525.2314-.6549.6377-.6549zm-2.3571.0206l.3342 1.0508.3412-1.0508h.1166l.3394 1.0508.336-1.0508h.1303l-.408 1.2789h-.1165l-.343-1.0577-.341 1.0577h-.1183l-.4098-1.2789zm-1.392.1286v-.1286h1.0886v.1286h-.4766v1.1418h-.1355v-1.1418zm-.204-.1286v.1286h-.7046v.42h.6874v.127h-.6874v.4713h.7114v.1235h-.8468V13.988zm-2.0539 0l.7596 1.0475V13.988h.1303v1.2704h-.1235l-.7835-1.0784v1.0784h-.1303V13.988Z'],
  mikrotik: [null, 'M23.041 6.188a1.404 1.404 0 0 0-.218-.36c-.24-.296-.634-.586-1.14-.864l-4.052-2.22L13.576.519C13.074.243 12.61.065 12.22.013A1.772 1.772 0 0 0 12 0c-.432 0-.974.192-1.576.52L6.37 2.74 2.317 4.96c-.504.279-.9.569-1.14.867a1.59 1.59 0 0 0-.122.17 1.654 1.654 0 0 0-.096.19c-.15.348-.22.816-.22 1.368v8.887c0 .66.1 1.2.316 1.558.216.356.66.706 1.262 1.036l4.054 2.22 4.053 2.223c.504.276.966.456 1.36.506.145.02.291.02.436 0 .39-.05.852-.228 1.356-.506l8.107-4.443c.6-.33 1.046-.68 1.262-1.036.036-.06.068-.123.096-.188.15-.348.22-.818.22-1.37V7.556c0-.552-.07-1.02-.22-1.368zM7.233 16.618c0 .2-.218.33-.396.233l-1.45-.796a1.066 1.066 0 0 1-.552-.934v-4.296c0-.2.216-.33.394-.235l1.728.947a.53.53 0 0 1 .276.468v4.612zm11.934-1.497c0 .39-.213.748-.554.936l-1.45.794a.266.266 0 0 1-.394-.234v-5.692c0-.2-.217-.33-.395-.232l-2.62 1.434c-.34.187-.552.545-.552.934v5.646a.532.532 0 0 1-.278.468l-.41.224c-.32.176-.707.176-1.026 0l-.408-.224a.532.532 0 0 1-.278-.468v-5.646c0-.389-.212-.747-.552-.934L4.835 9.16v-.28c0-.388.212-.746.552-.934l.6-.328a1.064 1.064 0 0 1 1.022 0l4.48 2.452c.318.176.704.176 1.021 0l2.07-1.134a.266.266 0 0 0 0-.468L9.932 5.922a.266.266 0 0 1 0-.468l1.556-.852c.32-.176.707-.176 1.026 0l6.1 3.34c.342.188.554.547.553.936v6.243z'],
  fortinet: ["#EE3124", 'M0 9.785h6.788v4.454H0zm8.666-6.33h6.668v4.453H8.666zm0 12.637h6.668v4.454H8.666zm8.522-6.307H24v4.454h-6.812zM2.792 3.455C1.372 3.814.265 5.404 0 7.425v.506h6.788V3.454zM0 16.091v.554c.24 1.926 1.276 3.466 2.624 3.9h4.188v-4.454zm24-8.184v-.506c-.265-1.998-1.372-3.587-2.792-3.972h-4.02v4.454H24zM21.376 20.57c1.324-.458 2.36-1.974 2.624-3.9v-.554h-6.812v4.454Z'],
  paloaltonetworks: ["#F04E23", 'm10.278 15.443 1.705 1.705-3.426 3.426-3.427-3.426 8.592-8.591-1.705-1.705 3.426-3.426 3.427 3.426-8.592 8.591zM0 12.017l3.426 3.426 8.591-8.59-3.426-3.427L0 12.017zm11.983 5.13 3.426 3.427L24 11.983l-3.426-3.426-8.591 8.59z'],
  opnsense: ['#E44A20', 'M5.25 0v5.25h13.5v13.5H24V7.5L16.5 0Zm13.5 18.75H5.25V5.25H0V16.5L7.5 24h11.25Z'],
  pfsense: [null, 'M2.013 0C.898 0 0 .929 0 2.044v17.775L3.252 8.27h3.282L6.1 9.785h.063c.186-.217.433-.403.742-.62.31-.216.62-.402.96-.588.342-.186.713-.31 1.116-.433.402-.124.805-.155 1.208-.155.867 0 1.579.154 2.198.433.62.279 1.084.712 1.455 1.239.31.464.5 1.019.593 1.669.006.06.027.135.027.189.062.712-.031 1.518-.28 2.385a8.571 8.571 0 0 1-1.02 2.322 9.885 9.885 0 0 1-1.58 1.95 8.125 8.125 0 0 1-2.044 1.364 5.536 5.536 0 0 1-2.354.495 5.655 5.655 0 0 1-1.982-.34c-.588-.217-.99-.62-1.238-1.177h-.062L2.353 24h19.603A2.042 2.042 0 0 0 24 21.956V4.706c-.093-.03-.186-.06-.248-.092a2.771 2.771 0 0 0-.557-.062c-.557 0-1.022.124-1.394.372-.34.248-.65.743-.867 1.518l-.526 1.826h2.013l.495 1.58-1.3 1.27h-2.014l-2.446 8.67h-3.53l2.446-8.67h-1.455l.805-2.85h1.425l.557-2.044c.185-.619.403-1.238.681-1.795a4.996 4.996 0 0 1 1.053-1.487c.433-.434.99-.775 1.641-1.022.65-.248 1.487-.372 2.447-.372.248 0 .464 0 .712.031A2.082 2.082 0 0 0 21.988 0zm6.565 11.118c-.898 0-1.672.278-2.323.805-.65.526-1.083 1.239-1.331 2.106-.248.867-.217 1.579.155 2.105.31.557.929.805 1.858.805.898 0 1.672-.278 2.322-.805.65-.526 1.115-1.238 1.363-2.105.247-.867.185-1.58-.155-2.106-.34-.527-.991-.805-1.89-.805Z'],
  ubiquiti: ["#0559C9", 'M23.1627 0h-1.4882v1.4882h1.4882zm-5.2072 10.4226V7.4409l.0007.001h2.9755v2.9762h2.9756v.9433c0 1.0906-.0927 2.3827-.306 3.3973-.1194.5672-.3004 1.1308-.5127 1.672-.2175.5537-.468 1.0841-.7408 1.5595a11.6795 11.6795 0 0 1-1.2456 1.7762l-.0253.0294-.0417.0488c-.1148.1347-.2283.2679-.3531.398a11.7612 11.7612 0 0 1-.4494.4492c-1.9046 1.8343-4.3861 2.98-6.9808 3.243-.3122.032-.939.0652-1.2519.0652-.3139-.001-.9397-.0331-1.252-.0651-2.5946-.263-5.0761-1.4097-6.9806-3.243a11.75 11.75 0 0 1-.4495-.4494c-.131-.1356-.249-.2748-.3683-.4154l-.0006-.0004-.0512-.0603a11.6576 11.6576 0 0 1-1.2456-1.7762c-.2727-.4763-.5233-1.0058-.7408-1.5595-.2123-.5414-.3933-1.1048-.5128-1.6718C.1854 13.743.0927 12.452.0927 11.3616V.1864h5.9518v10.2362s0 .7847.0099 1.0415l.0022.0599v.0004c.0127.332.0247.6575.0594.9812.098.919.3014 1.7913.7203 2.5288.1213.213.2443.42.3915.616.8953 1.1939 2.2577 2.0901 3.9573 2.3398.2022.0294.6108.0552.8149.0552.204 0 .6125-.0258.8149-.0552 1.6996-.2497 3.062-1.146 3.9573-2.3398.148-.196.2701-.403.3914-.616.419-.7375.6224-1.6095.7204-2.5288.0346-.3243.047-.6503.0594-.9831l.0022-.0584c.0099-.2568.0099-1.0415.0099-1.0415zm.7427-8.19h2.2326v2.2319h2.9764v2.9764h-2.9764V4.4654h-2.2326V2.2328Z'],
  json: [null, 'M12.043 23.968c.479-.004.953-.029 1.426-.094a11.805 11.805 0 003.146-.863 12.404 12.404 0 003.793-2.542 11.977 11.977 0 002.44-3.427 11.794 11.794 0 001.02-3.476c.149-1.16.135-2.346-.045-3.499a11.96 11.96 0 00-.793-2.788 11.197 11.197 0 00-.854-1.617c-1.168-1.837-2.861-3.314-4.81-4.3a12.835 12.835 0 00-2.172-.87h-.005c.119.063.24.132.345.201.12.074.239.146.351.225a8.93 8.93 0 011.559 1.33c1.063 1.145 1.797 2.548 2.218 4.041.284.982.434 1.998.495 3.017.044.743.044 1.491-.047 2.229-.149 1.27-.554 2.51-1.228 3.596a7.475 7.475 0 01-1.903 2.084c-1.244.928-2.877 1.482-4.436 1.114a3.916 3.916 0 01-.748-.258 4.692 4.692 0 01-.779-.45 6.08 6.08 0 01-1.244-1.105 6.507 6.507 0 01-1.049-1.747 7.366 7.366 0 01-.494-2.54c-.03-1.273.225-2.553.854-3.67a6.43 6.43 0 011.663-1.918c.225-.178.464-.333.704-.479l.016-.007a5.121 5.121 0 00-1.441-.12 4.963 4.963 0 00-1.228.24c-.359.12-.704.27-1.019.45a6.146 6.146 0 00-.733.494c-.211.18-.42.36-.615.555-1.123 1.153-1.768 2.682-2.022 4.256-.15.973-.15 1.96-.091 2.95.105 1.395.391 2.787.945 4.062a8.518 8.518 0 001.348 2.173 8.14 8.14 0 003.132 2.23 7.934 7.934 0 002.113.54c.074.015.149.015.209.015zm-2.934-.398a4.102 4.102 0 01-.45-.228 8.5 8.5 0 01-2.038-1.534c-1.094-1.137-1.827-2.566-2.247-4.08a15.184 15.184 0 01-.495-3.172 12.14 12.14 0 01.046-2.082c.135-1.257.495-2.501 1.124-3.58a6.889 6.889 0 011.783-2.053 6.23 6.23 0 011.633-.9 5.363 5.363 0 013.522-.045c.029 0 .029 0 .045.03.015.015.045.015.06.03.045.016.104.045.165.074.239.12.479.271.704.42a6.294 6.294 0 012.097 2.502c.42.914.615 1.934.631 2.938.014 1.079-.18 2.157-.645 3.146a6.42 6.42 0 01-2.638 2.832c.09.03.18.045.271.075.225.044.449.074.688.074 1.468.045 2.892-.66 3.94-1.647.195-.18.375-.375.54-.585.225-.27.435-.54.614-.823.239-.375.435-.75.614-1.154a8.112 8.112 0 00.509-1.664c.196-1.004.211-2.022.149-3.026-.135-2.022-.673-4.045-1.842-5.724a9.054 9.054 0 00-.555-.719 9.868 9.868 0 00-1.063-1.034 8.477 8.477 0 00-1.363-.915 9.927 9.927 0 00-1.692-.598l-.3-.06c-.209-.03-.42-.044-.634-.06a8.453 8.453 0 00-1.015.016c-.704.045-1.412.16-2.112.337C5.799 1.227 2.863 3.566 1.3 6.67A11.834 11.834 0 00.238 9.801a11.81 11.81 0 00-.104 3.775c.12 1.02.374 2.023.778 2.977.227.57.511 1.124.825 1.648 1.094 1.783 2.683 3.236 4.51 4.24.688.39 1.408.69 2.157.944.226.074.45.15.689.21z'],
  markdown: [null, 'M22.27 19.385H1.73A1.73 1.73 0 010 17.655V6.345a1.73 1.73 0 011.73-1.73h20.54A1.73 1.73 0 0124 6.345v11.308a1.73 1.73 0 01-1.73 1.731zM5.769 15.923v-4.5l2.308 2.885 2.307-2.885v4.5h2.308V8.078h-2.308l-2.307 2.885-2.308-2.885H3.46v7.847zM21.232 12h-2.309V8.077h-2.307V12h-2.308l3.461 4.039z'],
  html5: ["#E34F26", 'M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z'],
};
// Wide marks cropped to their shape so they fill the icon slot instead of shrinking into a 24×24 square.
const BRAND_VB = { cisco: '0 5.4 24 13.2', junipernetworks: '0 8.4 24 7.2', fortinet: '0 3.2 24 17.6', paloaltonetworks: '0 3.2 24 17.6', googlecloud: '0 2.2 24 19.6', markdown: '0 4.4 24 15.2' };
const GLYPH = {
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-10 9"/>',
};
const FMT_ICON = {
  'tf-aws': 'terraform', 'cfn-aws': 'AWS', 'tf-azure': 'terraform', bicep: 'Az', 'az-ps': 'Az', 'tf-gcp': 'terraform', 'tf-oci': 'terraform', ansible: 'ansible',
  cisco: 'cisco', arista: 'Ar', junos: 'junipernetworks', mikrotik: 'mikrotik', fortigate: 'fortinet', panos: 'paloaltonetworks', pfsense: 'pfsense', opnsense: 'opnsense', unifi: 'ubiquiti', edgeos: 'ubiquiti',
  netbox: 'NB', 'netbox-vlans': 'NB', phpipam: 'php', xlsx: 'table', csv: 'table', hosts: 'table', json: 'json', md: 'markdown', html: 'html5', png: 'image', svg: 'image',
  'Amazon Web Services': 'AWS', 'Microsoft Azure': 'Az', 'Google Cloud': 'googlecloud', 'Oracle Cloud (OCI)': 'OCI', Ubiquiti: 'ubiquiti',
};
// Static markup only: every value comes from the tables above.
const fmtIcon = (key) => {
  const k = FMT_ICON[key];
  if (!k) return '';
  if (BRAND[k]) return `<svg class="fm-ico" viewBox="${BRAND_VB[k] || '0 0 24 24'}" aria-hidden="true"${BRAND[k][0] ? ` style="color:${BRAND[k][0]}"` : ''}><path fill="currentColor" d="${BRAND[k][1]}"/></svg>`;
  if (GLYPH[k]) return `<svg class="fm-ico glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPH[k]}</svg>`;
  return `<span class="fm-ico fm-badge" aria-hidden="true">${k}</span>`;
};
const fmtText = (v) => $('exFmt').querySelector(`option[value="${v}"]`).textContent;
const fmtPop = $('exFmtMenu'), fmtWrap = fmtPop.parentElement;
const fmtItem = (v, label) => {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.dataset.fmt = v;
  b.innerHTML = `<span class="fm-tick" aria-hidden="true">✓</span>${fmtIcon(v)}<span class="fm-lab"></span>`;
  b.querySelector('.fm-lab').textContent = label || fmtText(v);
  return b;
};
// Submenus live beside the scrolling list (in .fmenu), not inside it, so nothing can clip them;
// on a phone they move into the list, under their parent. parentOf / subOf link the two.
const subOf = new Map(), parentOf = new Map();
for (const [head, items] of FMT_MENU) {
  const h = document.createElement('div');
  h.className = 'fm-head'; h.setAttribute('role', 'presentation'); h.textContent = head;
  const grp = document.createElement('div');
  grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', head);
  fmtPop.append(h, grp);
  for (const it of items) {
    if (!Array.isArray(it[1])) { grp.append(fmtItem(it[0], it[1])); continue; }
    const wrap = document.createElement('div'), b = document.createElement('button'), sub = document.createElement('div');
    const id = 'fmSub' + subOf.size;
    wrap.className = 'fm-group';
    b.type = 'button'; b.className = 'fm-parent'; b.setAttribute('role', 'menuitem'); b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', id);
    b.innerHTML = `<span class="fm-tick" aria-hidden="true">✓</span>${fmtIcon(it[0])}<span class="fm-lab"></span><span aria-hidden="true">▸</span>`;
    b.querySelector('.fm-lab').textContent = it[0];
    sub.id = id; sub.className = 'fmenu-sub'; sub.setAttribute('role', 'menu'); sub.setAttribute('aria-label', it[0]); sub.hidden = true;
    for (const [v, label] of it[1]) sub.append(fmtItem(v, label));
    subOf.set(b, sub); parentOf.set(sub, b);
    wrap.append(b); grp.append(wrap); fmtWrap.append(sub);
  }
}
const narrow = () => matchMedia('(max-width: 640px)').matches;
const fmtSubs = () => [...subOf.values()];
const fmtSub = (b, open) => {
  const sub = subOf.get(b);
  if (open) for (const o of fmtSubs()) if (o !== sub && !o.hidden) fmtSub(parentOf.get(o), false);
  const home = open && narrow() ? b.parentElement : fmtWrap;
  if (sub.parentElement !== home) home.append(sub);
  sub.hidden = !open; b.setAttribute('aria-expanded', String(open));
  if (!open || narrow()) { sub.style.left = sub.style.top = ''; if (open) sub.lastElementChild.scrollIntoView({ block: 'nearest' }); return; }
  // Pop out beside the item, on whichever side has room, kept on screen. Coordinates are relative to .fmenu.
  const r = b.getBoundingClientRect(), f = fmtWrap.getBoundingClientRect(), w = sub.offsetWidth, hgt = sub.offsetHeight;
  const right = r.right + 4 + w <= innerWidth - 8;
  sub.style.left = `${(right ? r.right + 4 : Math.max(8, r.left - 4 - w)) - f.left}px`;
  sub.style.top = `${Math.max(8, Math.min(r.top - 5, innerHeight - hgt - 8)) - f.top}px`;
};
const fmtOpen = (open, focus) => {
  if (!open) { clearTimeout(hoverTimer); for (const o of fmtSubs()) fmtSub(parentOf.get(o), false); }
  fmtPop.hidden = !open; $('exFmtBtn').setAttribute('aria-expanded', String(open));
  if (open && focus) {
    // Start on the chosen format, opening its submenu.
    const cur = fmtWrap.querySelector('[data-fmt][aria-checked="true"]') || fmtPop.querySelector('button');
    const sub = cur.closest('.fmenu-sub');
    if (sub) fmtSub(parentOf.get(sub), true);
    cur.scrollIntoView({ block: 'nearest' }); cur.focus();
  }
};
const fmtSync = () => {
  const v = $('exFmt').value;
  $('exFmtCur').textContent = fmtText(v);
  $('exFmtIco').innerHTML = fmtIcon(v);
  $('exFmtBtn').classList.toggle('empty', !v);
  for (const b of fmtWrap.querySelectorAll('[data-fmt]')) b.setAttribute('aria-checked', String(b.dataset.fmt === v));
  for (const [b, sub] of subOf) b.querySelector('.fm-tick').style.visibility = sub.querySelector(`[data-fmt="${v}"]`) ? 'visible' : '';
};
$('exFmt').addEventListener('change', fmtSync);
fmtSync();
$('exFmtBtn').addEventListener('click', (e) => { e.stopPropagation(); fmtOpen(fmtPop.hidden, true); });
$('exFmtBtn').addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); fmtOpen(true, true); } });
const inMenu = (el) => el && el !== $('exFmtBtn') && (fmtPop.contains(el) || !!el.closest('.fmenu-sub'));
// A mouse click on a parent always opens its submenu (hovering may already have). Touch and keyboard toggle it,
// unless a hover opened it a moment ago.
let hoverOpened = null, hoverAt = 0, hoverTimer = 0;
fmtWrap.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!inMenu(b)) return;
  e.stopPropagation();
  if (b.classList.contains('fm-parent')) {
    clearTimeout(hoverTimer);
    const sub = subOf.get(b), keep = e.pointerType === 'mouse' || (hoverOpened === b && performance.now() - hoverAt < 1500);
    hoverOpened = null;
    fmtSub(b, sub.hidden || keep);
    if (!sub.hidden && e.detail === 0) sub.querySelector('button').focus();
    return;
  }
  pickFmt(b.dataset.fmt);
});
const pickFmt = (v) => {
  fmtOpen(false); $('exFmtBtn').focus();
  if ($('exFmt').value !== v) { $('exFmt').value = v; $('exFmt').dispatchEvent(new Event('change')); }
};
// Hovering a parent opens its submenu, on a pointer that can hover. Moving to another item waits a moment
// first, so a diagonal path from a parent to its submenu can cross the next item without switching.
const hoverTo = (b) => {
  const open = fmtSubs().find((o) => !o.hidden);
  if (b.classList.contains('fm-parent')) {
    if (!subOf.get(b).hidden) return;
    fmtSub(b, true); hoverOpened = b; hoverAt = performance.now();
  } else if (open) fmtSub(parentOf.get(open), false);
};
fmtWrap.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse' || narrow()) return;
  if (e.target.closest('.fmenu-sub')) { clearTimeout(hoverTimer); return; }   // inside the open submenu: keep it
  const b = e.target.closest('button');
  if (!inMenu(b)) return;
  clearTimeout(hoverTimer);
  if (fmtSubs().some((o) => !o.hidden && parentOf.get(o) !== b)) hoverTimer = setTimeout(() => hoverTo(b), 250);
  else hoverTo(b);
});
fmtWrap.addEventListener('keydown', (e) => {
  const a = document.activeElement;
  if (!inMenu(a)) return;
  e.stopPropagation();
  const sub = a.closest('.fmenu-sub');
  // Arrows move within the current level: the submenu, or the top level.
  const level = sub ? [...sub.querySelectorAll('button')] : [...fmtPop.querySelectorAll('button')].filter((b) => !b.closest('.fmenu-sub'));
  const i = level.indexOf(a);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = level[(i + (e.key === 'ArrowDown' ? 1 : level.length - 1)) % level.length]; n.scrollIntoView({ block: 'nearest' }); n.focus(); }
  else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); level[e.key === 'Home' ? 0 : level.length - 1].focus(); }
  else if (e.key === 'ArrowRight' && a.classList.contains('fm-parent')) { e.preventDefault(); fmtSub(a, true); subOf.get(a).querySelector('button').focus(); }
  else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && sub) { e.preventDefault(); const p = parentOf.get(sub); fmtSub(p, false); p.focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); fmtOpen(false); $('exFmtBtn').focus(); }
  else if (e.key === 'Tab') fmtOpen(false);
});
document.addEventListener('click', (e) => { if (!fmtPop.hidden && !/** @type {any} */ (e.target).closest('.fmenu')) fmtOpen(false); });
// Phones resize as the address bar hides, so keep the menu open and just move an open submenu.
const fmtPlace = () => { for (const o of fmtSubs()) if (!o.hidden) fmtSub(parentOf.get(o), true); };
addEventListener('resize', fmtPlace);
fmtPop.addEventListener('scroll', fmtPlace);
$('exCopy').addEventListener('click', async () => {
  if ($('exFmt').value === 'png') {
    // Copy the picture itself where the browser can; the promise keeps Safari's copy inside the click.
    try {
      if (!window.ClipboardItem || !navigator.clipboard.write) throw new Error('no image clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': svgToPng($('exOut').value) })]);
      toast('Copied the image');
    } catch (e) { toast('This browser can’t copy images. Use Download instead.'); }
    return;
  }
  toast((await copyText($('exOut').value)) ? 'Copied' : 'Couldn’t copy');
});
$('exDl').addEventListener('click', () => {
  const f = $('exFmt').value;
  if (f === 'xlsx') { download('subnet-plan.xlsx', buildXlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); return; }
  if (f === 'png') { svgToPng($('exOut').value).then((b) => download('subnet-plan.png', b), () => toast('Couldn’t make the PNG. Try SVG instead.')); return; }
  if (f === 'svg') { download('subnet-plan.svg', $('exOut').value, 'image/svg+xml'); return; }
  download(`subnet-plan-${f}.${EXT[f]}`, $('exOut').value, MIME[f] || 'text/plain');
});
