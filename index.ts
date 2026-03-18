/**
 * PV-Hub Solar Plant Dashboard (interactive CLI)
 *
 * Usage:
 *   bun run index.ts                  # Overview + daily generation chart
 *   bun run index.ts --flow           # Real-time power flow
 *   bun run index.ts --devices        # List all devices
 *   bun run index.ts --daily          # Daily generation bar chart
 *   bun run index.ts --power          # Today's power curve
 *   bun run index.ts --json           # Raw JSON output
 */

import {
  init, login, stationId,
  getEarnings, getStatus, getAlarms, getFlow, getDevices,
  getMonthlyReport, getDailyPower, getPlantList,
  extractVar, formatEnergy,
} from "./pvhub";

function miniBar(value: number, max: number, width = 25): string {
  const filled = Math.round((value / max) * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const showFlow = args.includes("--flow");
  const showDevices = args.includes("--devices");
  const showDaily = args.includes("--daily");
  const showPower = args.includes("--power");

  await init();
  await login();

  const now = new Date();
  const sid = stationId();

  if (!jsonMode) {
    console.log("\u2550".repeat(47));
    console.log("  Solar Plant Dashboard");
    console.log("\u2550".repeat(47) + "\n");
  }

  const earnings = await getEarnings(sid);
  if (jsonMode && !showDaily && !showPower && !showFlow && !showDevices) {
    console.log(JSON.stringify(earnings, null, 2));
    return;
  }

  if (earnings.errno === 0) {
    const r = earnings.result;
    console.log(`  Power Now:        ${r.power || 0} kW`);
    console.log(`  Today Yield:      ${formatEnergy(r.today?.generation || 0)}`);
    console.log(`  Today Income:     ${r.currency} ${(r.today?.earnings || 0).toFixed(2)}`);
    console.log(`  Monthly Yield:    ${formatEnergy(r.month?.generation || 0)}`);
    console.log(`  Monthly Income:   ${r.currency} ${(r.month?.earnings || 0).toFixed(2)}`);
    console.log(`  Yearly Yield:     ${formatEnergy(r.year?.generation || 0)}`);
    console.log(`  Lifetime Yield:   ${formatEnergy(r.cumulate?.generation || 0)}`);
    console.log(`  Lifetime Income:  ${r.currency} ${(r.cumulate?.earnings || 0).toFixed(2)}`);
  }

  const status = await getStatus(sid);
  if (status.errno === 0) {
    const s = status.result;
    console.log(`\n  Devices: ${s.total||0} total | ${s.normal||0} online | ${s.offline||0} offline | ${s.fault||0} fault`);
  }

  const alarms = await getAlarms(sid);
  if (alarms.errno === 0) console.log(`  Alarms Today:     ${alarms.result?.total ?? 0}`);

  if (showFlow) {
    console.log("\n\u2500\u2500\u2500 Real-Time Power Flow \u2500\u2500\u2500\n");
    const flow = await getFlow(sid);
    if (flow.errno === 0 && flow.result) {
      const f = flow.result;
      console.log(`  PV Power:         ${f.pvPower || 0} W`);
      console.log(`  Load Power:       ${f.loadPower || 0} W`);
      console.log(`  Grid Power:       ${f.gridPower || 0} W`);
      console.log(`  Battery Power:    ${f.batteryPower || 0} W`);
    } else console.log("  Inverter offline");
  }

  if (showDevices) {
    console.log("\n\u2500\u2500\u2500 Devices \u2500\u2500\u2500\n");
    const devices = await getDevices(sid);
    if (devices.errno === 0) {
      for (const d of devices.result?.devices || []) {
        console.log(`  ${d.deviceSN} (${d.deviceType})`);
        console.log(`    Module:        ${d.moduleSN}`);
        console.log(`    Status:        ${d.status === 1 ? "Online" : d.status === 3 ? "Offline" : d.status}`);
        console.log(`    Today Yield:   ${d.generationToday || 0} kWh`);
        console.log(`    Total Yield:   ${formatEnergy(d.generationTotal || 0)}`);
      }
    }
  }

  if (showDaily) {
    console.log("\n\u2500\u2500\u2500 Daily Generation (This Month) \u2500\u2500\u2500\n");
    const report = await getMonthlyReport(sid, now.getFullYear(), now.getMonth() + 1);
    if (report.errno === 0 && Array.isArray(report.result)) {
      const gen = extractVar(report.result, "generation");
      const maxGen = Math.max(...gen.map((d) => d.value), 0);
      for (const d of gen) {
        if (d.value > 0)
          console.log(`  Day ${String(d.index).padStart(2)}: ${miniBar(d.value, maxGen || 1)} ${d.value.toFixed(1)} kWh`);
      }
      console.log(`\n  Month Total:  ${formatEnergy(gen.reduce((s, d) => s + d.value, 0))}`);
    }
  }

  if (showPower) {
    console.log("\n\u2500\u2500\u2500 Today's Power Curve \u2500\u2500\u2500\n");
    const raw = await getDailyPower(sid, now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (raw.errno === 0 && Array.isArray(raw.result)) {
      const genData = extractVar(raw.result, "generationPower");
      if (genData.length > 0) {
        const maxP = Math.max(...genData.map((d) => d.value), 0);
        for (const d of genData) {
          const min = d.index % 60;
          if (d.value > 0 && min === 0)
            console.log(`  ${String(Math.floor(d.index / 60)).padStart(2)}:00  ${miniBar(d.value, maxP || 1)} ${(d.value * 1000).toFixed(0)} W`);
        }
      } else console.log("  No power data (inverter may be offline)");
    }
  }

  // Default: show monthly chart
  if (!showDaily && !showPower && !showFlow && !showDevices) {
    const monthReport = await getMonthlyReport(sid, now.getFullYear(), now.getMonth() + 1);
    if (monthReport.errno === 0 && Array.isArray(monthReport.result)) {
      const gen = extractVar(monthReport.result, "generation");
      const nonZero = gen.filter((d) => d.value > 0);
      if (nonZero.length > 0) {
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const mn = months[now.getMonth()];
        console.log(`\n\u2500\u2500\u2500 ${mn} Daily Generation \u2500\u2500\u2500\n`);
        const maxGen = Math.max(...nonZero.map((d) => d.value));
        for (const d of nonZero)
          console.log(`  ${mn} ${String(d.index).padStart(2)}: ${miniBar(d.value, maxGen || 1)} ${d.value.toFixed(1)} kWh`);
        console.log(`\n  Month Total:  ${formatEnergy(gen.reduce((s, d) => s + d.value, 0))}`);
      }
    }
  }

  console.log("\n" + "\u2550".repeat(47) + "\n");
}

main().catch(console.error);
