/**
 * Daily Solar Report - runs at 7PM via LaunchAgent
 * Fetches today's generation and sends a macOS notification
 */

import { execSync } from "child_process";
import {
  init, login, stationId,
  getEarnings, getStatus, getMonthlyReport,
  extractVar, formatEnergy,
} from "./pvhub";

function notify(title: string, message: string) {
  const escaped = message.replace(/"/g, '\\"');
  execSync(
    `osascript -e 'display notification "${escaped}" with title "${title}" sound name "Glass"'`
  );
}

function speak(text: string) {
  execSync(`say "${text.replace(/"/g, '\\"')}"`);
}

async function main() {
  await init();
  await login();

  const sid = stationId();
  const now = new Date();
  const day = now.getDate();

  // Fetch earnings
  const earnings = await getEarnings(sid);
  if (earnings.errno !== 0) {
    notify("Solar Report", "Failed to fetch data from PV-Hub");
    process.exit(1);
  }

  const r = earnings.result;
  const todayGen = r.today?.generation || 0;
  const todayIncome = r.today?.earnings || 0;
  const monthGen = r.month?.generation || 0;
  const power = r.power || 0;
  const currency = r.currency || "INR";

  // Fetch device status
  const status = await getStatus(sid);
  const online = status.result?.normal || 0;
  const offline = status.result?.offline || 0;
  const inverterStatus = offline > 0 ? "OFFLINE" : "Online";

  // Fetch monthly report to get last 7 days
  const monthReport = await getMonthlyReport(sid, now.getFullYear(), now.getMonth() + 1);
  let last7 = "";
  if (monthReport.errno === 0 && Array.isArray(monthReport.result)) {
    const gen = extractVar(monthReport.result, "generation");
    const startDay = Math.max(1, day - 6);
    const days = gen.filter((d) => d.index >= startDay && d.index <= day);
    last7 = days.map((d) => `${d.index}:${d.value}`).join(" | ");
  }

  // Build notification
  const notifTitle = `Solar: ${todayGen > 0 ? formatEnergy(todayGen) : "0 kWh"} today`;
  const notifBody = [
    `Income: ${currency} ${todayIncome.toFixed(2)}`,
    `Month: ${formatEnergy(monthGen)}`,
    `Inverter: ${inverterStatus}`,
    power > 0 ? `Power: ${power} kW` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  notify(notifTitle, notifBody);

  // Voice notification
  const voiceParts = [`Solar report.`];
  if (todayGen > 0) {
    voiceParts.push(`Today you generated ${todayGen.toFixed(1)} kilowatt hours, earning ${todayIncome.toFixed(0)} rupees.`);
  } else {
    voiceParts.push(`No generation today.`);
  }
  voiceParts.push(`Month total is ${monthGen.toFixed(1)} kilowatt hours.`);
  if (offline > 0) voiceParts.push(`Warning: your inverter is offline.`);
  speak(voiceParts.join(" "));

  // Also print to stdout (for log capture)
  console.log(`\n  Solar Daily Report - ${now.toLocaleDateString()}`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  Today:      ${formatEnergy(todayGen)} (${currency} ${todayIncome.toFixed(2)})`);
  console.log(`  Month:      ${formatEnergy(monthGen)}`);
  console.log(`  Inverter:   ${inverterStatus}`);
  if (power > 0) console.log(`  Power Now:  ${power} kW`);
  if (last7) console.log(`  Last 7 days: ${last7}`);
  console.log();
}

main().catch((err) => {
  console.error("Daily report failed:", err.message);
  try {
    notify("Solar Report Error", err.message);
  } catch {}
  process.exit(1);
});
