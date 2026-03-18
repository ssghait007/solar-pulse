/**
 * Weekly Solar Report — Orchestrator
 * Runs Sunday 7:15 PM via LaunchAgent
 * Fetches week's data, generates HTML report, emails via Resend, notifies
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import {
  init, login, stationId,
  getEarnings, getStatus, getAlarms, getDevices,
  getMonthlyReport, extractVar, formatEnergy,
} from "./pvhub";
import { generateWeeklyReportHTML, type WeeklyReportData, type DayData } from "./weekly-report-html";

const REPORTS_DIR = join(import.meta.dir, "reports");
const KEEP_REPORTS = 12;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────
function notify(title: string, message: string) {
  const esc = (s: string) => s.replace(/"/g, '\\"');
  execSync(`osascript -e 'display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"'`);
}

function speak(text: string) {
  execSync(`say "${text.replace(/"/g, '\\"')}"`);
}

function fmtDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ─── Date Range Calculation ───────────────────────────────────────────
function getWeekRange(sundayDate: Date): { start: Date; end: Date } {
  // Week = Mon–Sun. If today is Sunday, the week just ended.
  const end = new Date(sundayDate);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - 6); // Monday
  return { start, end };
}

function getPrevWeekRange(weekStart: Date): { start: Date; end: Date } {
  const end = new Date(weekStart);
  end.setDate(end.getDate() - 1); // Sunday before
  const start = new Date(end);
  start.setDate(end.getDate() - 6); // Monday before
  return { start, end };
}

// ─── Fetch Generation Data for a Date Range ───────────────────────────
async function fetchDaysGeneration(
  sid: string,
  start: Date,
  end: Date
): Promise<DayData[]> {
  const result: DayData[] = [];

  // Collect all year-month combos needed
  const monthsNeeded = new Map<string, { year: number; month: number }>();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (!monthsNeeded.has(key)) {
      monthsNeeded.set(key, { year: d.getFullYear(), month: d.getMonth() + 1 });
    }
  }

  // Fetch monthly reports
  const reportData = new Map<string, Map<number, number>>();
  for (const [key, { year, month }] of monthsNeeded) {
    const report = await getMonthlyReport(sid, year, month);
    const dayMap = new Map<number, number>();
    if (report.errno === 0 && Array.isArray(report.result)) {
      const gen = extractVar(report.result, "generation");
      for (const g of gen) dayMap.set(g.index, g.value);
    }
    reportData.set(key, dayMap);
  }

  // Build day array
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const dayMap = reportData.get(key)!;
    const gen = dayMap.get(d.getDate()) || 0;
    result.push({
      date: fmtDate(d),
      dayName: DAYS[d.getDay()],
      generation: gen,
      income: 0, // filled later
    });
  }

  return result;
}

// ─── Report Retention ─────────────────────────────────────────────────
function cleanOldReports() {
  try {
    const files = readdirSync(REPORTS_DIR)
      .filter((f) => f.startsWith("solar-week-") && f.endsWith(".html"))
      .sort()
      .reverse();
    for (const f of files.slice(KEEP_REPORTS)) {
      unlinkSync(join(REPORTS_DIR, f));
    }
  } catch {}
}

// ─── Email via Resend ─────────────────────────────────────────────────
async function sendEmail(html: string, subject: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REPORT_EMAIL_TO;
  if (!apiKey || !to) {
    console.log("  Skipping email: RESEND_API_KEY or REPORT_EMAIL_TO not set");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Solar Report <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });
    const body = await res.json();
    if (res.ok) {
      console.log(`  Email sent: ${body.id}`);
      return true;
    }
    console.error(`  Email failed: ${res.status}`, body);
    return false;
  } catch (err: any) {
    console.error(`  Email error: ${err.message}`);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  await init();
  await login();

  const sid = stationId();
  const now = new Date();

  // Date ranges
  const thisWeek = getWeekRange(now);
  const prevWeek = getPrevWeekRange(thisWeek.start);

  console.log(`\n  Weekly Solar Report`);
  console.log(`  ${fmtDate(thisWeek.start)} – ${fmtDate(thisWeek.end)}, ${now.getFullYear()}`);
  console.log(`  ${"─".repeat(40)}`);

  // Fetch all data
  const [earnings, status, alarms, devices, days, prevDays] = await Promise.all([
    getEarnings(sid),
    getStatus(sid),
    getAlarms(sid),
    getDevices(sid),
    fetchDaysGeneration(sid, thisWeek.start, thisWeek.end),
    fetchDaysGeneration(sid, prevWeek.start, prevWeek.end),
  ]);

  // Derive income rate from cumulative data
  const cumGen = earnings.result?.cumulate?.generation || 1;
  const cumEarn = earnings.result?.cumulate?.earnings || 0;
  const ratePerKwh = cumGen > 0 ? cumEarn / cumGen : 0;

  // Apply income to days
  for (const d of days) d.income = d.generation * ratePerKwh;
  for (const d of prevDays) d.income = d.generation * ratePerKwh;

  // Aggregates
  const weekTotal = days.reduce((s, d) => s + d.generation, 0);
  const prevWeekTotal = prevDays.reduce((s, d) => s + d.generation, 0);
  const weekChange = prevWeekTotal > 0 ? ((weekTotal - prevWeekTotal) / prevWeekTotal) * 100 : 0;
  const avgDaily = weekTotal / 7;
  const weekIncome = days.reduce((s, d) => s + d.income, 0);

  const nonZeroDays = days.filter((d) => d.generation > 0);
  const bestDay = nonZeroDays.length > 0
    ? nonZeroDays.reduce((a, b) => (a.generation > b.generation ? a : b))
    : days[0];
  const worstDay = nonZeroDays.length > 0
    ? nonZeroDays.reduce((a, b) => (a.generation < b.generation ? a : b))
    : days[0];

  // Month-to-date
  const monthDaysTotal = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const monthDaysElapsed = now.getDate();
  const monthGen = earnings.result?.month?.generation || 0;
  const monthEarnings = earnings.result?.month?.earnings || 0;
  const monthAvgDaily = monthDaysElapsed > 0 ? monthGen / monthDaysElapsed : 0;
  const monthProjection = monthAvgDaily * monthDaysTotal;

  // Device info
  const deviceList = (devices.result?.devices || []).map((d: any) => ({
    sn: d.deviceSN,
    model: d.deviceType || d.inverterModel || "—",
    status: d.status,
    todayGen: d.generationToday || 0,
    totalGen: d.generationTotal || 0,
  }));

  // Build report data
  const reportData: WeeklyReportData = {
    weekStart: fmtDate(thisWeek.start),
    weekEnd: fmtDate(thisWeek.end),
    yearStr: now.getFullYear().toString(),
    plantName: `${earnings.result?.systemCapacity || 3.3} kWp SOLARYAAN`,
    systemCapacity: earnings.result?.systemCapacity || 3.3,
    currency: earnings.result?.currency || "INR",

    days,
    prevDays,

    weekTotal,
    prevWeekTotal,
    weekChange,
    avgDaily,
    bestDay: { label: `${bestDay.dayName}, ${bestDay.date}`, value: bestDay.generation },
    worstDay: { label: `${worstDay.dayName}, ${worstDay.date}`, value: worstDay.generation },
    weekIncome,

    devicesOnline: status.result?.normal || 0,
    devicesOffline: status.result?.offline || 0,
    devicesFault: status.result?.fault || 0,
    alarmsToday: alarms.result?.total || 0,
    devices: deviceList,

    monthName: MONTHS[now.getMonth()],
    monthToDateGen: monthGen,
    monthDaysElapsed,
    monthDaysTotal,
    monthEarnings,
    monthProjection,

    generatedAt: now.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
  };

  // Generate HTML
  const html = generateWeeklyReportHTML(reportData);

  // Save file
  mkdirSync(REPORTS_DIR, { recursive: true });
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const filePath = join(REPORTS_DIR, `solar-week-${dateStr}.html`);
  writeFileSync(filePath, html);
  console.log(`  Saved: ${filePath}`);

  // Clean old reports
  cleanOldReports();

  // Email
  const subject = `Solar Weekly: ${weekTotal.toFixed(1)} kWh | ${fmtDate(thisWeek.start)} – ${fmtDate(thisWeek.end)}`;
  const emailSent = await sendEmail(html, subject);

  // macOS notification
  const notifBody = `${formatEnergy(weekTotal)} this week (${weekChange >= 0 ? "+" : ""}${weekChange.toFixed(0)}%) | Avg: ${avgDaily.toFixed(1)} kWh/day`;
  notify("Weekly Solar Report", notifBody);

  // Voice
  const voiceParts = ["Weekly solar report."];
  voiceParts.push(`This week you generated ${weekTotal.toFixed(1)} kilowatt hours.`);
  if (prevWeekTotal > 0) {
    voiceParts.push(weekChange >= 0
      ? `That's ${weekChange.toFixed(0)} percent more than last week.`
      : `That's ${Math.abs(weekChange).toFixed(0)} percent less than last week.`);
  }
  voiceParts.push(`Average daily generation was ${avgDaily.toFixed(1)} kilowatt hours.`);
  if (reportData.devicesOffline > 0) voiceParts.push("Warning: your inverter is offline.");
  if (emailSent) voiceParts.push("Report emailed.");
  speak(voiceParts.join(" "));

  // Stdout summary
  console.log(`  Week Total:   ${formatEnergy(weekTotal)}`);
  console.log(`  Prev Week:    ${formatEnergy(prevWeekTotal)} (${weekChange >= 0 ? "+" : ""}${weekChange.toFixed(1)}%)`);
  console.log(`  Avg Daily:    ${avgDaily.toFixed(1)} kWh`);
  console.log(`  Best Day:     ${bestDay.date} — ${bestDay.generation.toFixed(1)} kWh`);
  console.log(`  Income:       ${reportData.currency} ${weekIncome.toFixed(2)}`);
  console.log(`  Email:        ${emailSent ? "sent" : "skipped"}`);
  console.log();
}

main().catch((err) => {
  console.error("Weekly report failed:", err.message);
  try { notify("Solar Report Error", err.message); } catch {}
  process.exit(1);
});
