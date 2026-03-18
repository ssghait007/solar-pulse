/**
 * Weekly Solar Report — Email-Safe HTML Template
 * Uses tables for layout + HTML/CSS bar charts (no SVG, no CSS Grid)
 * Works identically in Gmail, Outlook, Apple Mail, and browsers
 */

// ─── Types ────────────────────────────────────────────────────────────
export interface DayData {
  date: string;
  dayName: string;
  generation: number;
  income: number;
}

export interface DeviceData {
  sn: string;
  model: string;
  status: number;
  todayGen: number;
  totalGen: number;
}

export interface WeeklyReportData {
  weekStart: string;
  weekEnd: string;
  yearStr: string;
  plantName: string;
  systemCapacity: number;
  currency: string;
  days: DayData[];
  prevDays: DayData[];
  weekTotal: number;
  prevWeekTotal: number;
  weekChange: number;
  avgDaily: number;
  bestDay: { label: string; value: number };
  worstDay: { label: string; value: number };
  weekIncome: number;
  devicesOnline: number;
  devicesOffline: number;
  devicesFault: number;
  alarmsToday: number;
  devices: DeviceData[];
  monthName: string;
  monthToDateGen: number;
  monthDaysElapsed: number;
  monthDaysTotal: number;
  monthEarnings: number;
  monthProjection: number;
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function fmtE(kwh: number): string {
  return kwh >= 1000 ? `${(kwh / 1000).toFixed(2)} MWh` : `${kwh.toFixed(1)} kWh`;
}

function cur(d: WeeklyReportData): string {
  return d.currency.replace(/\(.*\)/, "").trim();
}

function delta(change: number): string {
  if (change > 0) return `<span style="color:#16a34a">&#9650; +${change.toFixed(1)}%</span>`;
  if (change < 0) return `<span style="color:#dc2626">&#9660; ${change.toFixed(1)}%</span>`;
  return `<span style="color:#64748b">&mdash; 0%</span>`;
}

function badge(status: number): string {
  if (status === 1) return `<span style="color:#16a34a;font-weight:700">&#9679; Online</span>`;
  if (status === 3) return `<span style="color:#dc2626;font-weight:700">&#9679; Offline</span>`;
  return `<span style="color:#d97706;font-weight:700">&#9679; Warning</span>`;
}

function barColor(val: number, avg: number): string {
  if (val === 0) return "#fecaca";
  if (val >= avg * 1.05) return "#16a34a";
  if (val < avg * 0.9) return "#d97706";
  return "#2563eb";
}

// ─── Table-Based Bar Chart ────────────────────────────────────────────
function htmlBarChart(
  days: { label: string; value: number }[],
  avg: number,
  maxBarH = 120
): string {
  const maxVal = Math.max(...days.map((d) => d.value), avg, 1);

  const cols = days
    .map((d) => {
      const h = maxVal > 0 ? Math.round((d.value / maxVal) * maxBarH) : 0;
      const color = barColor(d.value, avg);
      return `<td style="vertical-align:bottom;text-align:center;padding:0 6px;width:${Math.floor(100 / days.length)}%">
        <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:4px">${d.value > 0 ? d.value.toFixed(1) : "0"}</div>
        <div style="background:${color};height:${h}px;min-height:${d.value > 0 ? 4 : 2}px;border-radius:4px 4px 0 0;margin:0 auto;width:36px"></div>
      </td>`;
    })
    .join("");

  const labels = days
    .map(
      (d) =>
        `<td style="text-align:center;padding:6px 6px 0;font-size:12px;color:#64748b">${d.label}</td>`
    )
    .join("");

  // Average line indicator
  const avgH = maxVal > 0 ? Math.round((avg / maxVal) * maxBarH) : 0;

  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0">
    <tr>${cols}</tr>
    <tr style="border-top:2px solid #e2e8f0">${labels}</tr>
  </table>
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:4px"><tr>
    <td style="width:12px;height:3px;background:#2563eb;border-radius:2px"></td>
    <td style="padding-left:6px;font-size:11px;color:#2563eb">Avg: ${avg.toFixed(1)} kWh/day</td>
  </tr></table>`;
}

// ─── Table-Based Comparison Chart ─────────────────────────────────────
function htmlComparisonChart(
  thisWeek: { label: string; value: number }[],
  prevWeek: { label: string; value: number }[],
  maxBarH = 90
): string {
  const allVals = [...thisWeek, ...prevWeek].map((d) => d.value);
  const maxVal = Math.max(...allVals, 1);

  const cols = thisWeek
    .map((d, i) => {
      const tH = maxVal > 0 ? Math.round((d.value / maxVal) * maxBarH) : 0;
      const pH = maxVal > 0 ? Math.round((prevWeek[i].value / maxVal) * maxBarH) : 0;
      return `<td style="vertical-align:bottom;text-align:center;padding:0 4px;width:${Math.floor(100 / thisWeek.length)}%">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>
          <td style="vertical-align:bottom;padding:0 1px">
            <div style="background:#cbd5e1;height:${pH}px;min-height:2px;width:16px;border-radius:3px 3px 0 0"></div>
          </td>
          <td style="vertical-align:bottom;padding:0 1px">
            <div style="background:#2563eb;height:${tH}px;min-height:2px;width:16px;border-radius:3px 3px 0 0"></div>
          </td>
        </tr></table>
      </td>`;
    })
    .join("");

  const labels = thisWeek
    .map(
      (d) =>
        `<td style="text-align:center;padding:6px 4px 0;font-size:11px;color:#64748b">${d.label}</td>`
    )
    .join("");

  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0">
    <tr>${cols}</tr>
    <tr style="border-top:2px solid #e2e8f0">${labels}</tr>
  </table>
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:4px"><tr>
    <td style="width:12px;height:10px;background:#cbd5e1;border-radius:2px"></td>
    <td style="padding:0 8px 0 4px;font-size:11px;color:#64748b">Last week</td>
    <td style="width:12px;height:10px;background:#2563eb;border-radius:2px"></td>
    <td style="padding-left:4px;font-size:11px;color:#64748b">This week</td>
  </tr></table>`;
}

// ─── Table-Based Progress Bar ─────────────────────────────────────────
function htmlProgressBar(fraction: number, width = 100): string {
  const pct = Math.min(Math.max(fraction * 100, 0), 100);
  return `<table cellpadding="0" cellspacing="0" border="0" width="${width}%" style="margin:8px 0">
    <tr>
      <td style="background:#e2e8f0;border-radius:12px;padding:0;height:22px">
        <div style="background:#2563eb;width:${pct.toFixed(0)}%;height:22px;border-radius:12px;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:${pct > 35 ? "#fff" : "#1e293b"};min-width:30px">${pct.toFixed(0)}%</div>
      </td>
    </tr>
  </table>`;
}

// ─── Section Header ───────────────────────────────────────────────────
function h2(text: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0 12px">
    <tr><td style="font-size:16px;font-weight:700;color:#334155;padding-bottom:8px;border-bottom:2px solid #e2e8f0">${text}</td></tr>
  </table>`;
}

// ─── Main Template ────────────────────────────────────────────────────
export function generateWeeklyReportHTML(d: WeeklyReportData): string {
  const c = cur(d);
  const totalDevices = d.devicesOnline + d.devicesOffline + d.devicesFault;

  // Offline warning banner
  const offlineWarning =
    d.devicesOffline > 0
      ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px">
          <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;color:#991b1b;font-weight:700;font-size:14px">&#9888; ${d.devicesOffline} device(s) offline &mdash; check your datalogger connection</td></tr>
        </table>`
      : "";

  // Summary cards (2x2 table)
  const cards = `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0">
    <tr>
      <td width="25%" style="padding:4px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Week Total</div>
            <div style="font-size:24px;font-weight:700;color:#0f172a;margin:4px 0">${fmtE(d.weekTotal)}</div>
            <div style="font-size:12px">${d.prevWeekTotal > 0 ? delta(d.weekChange) + " vs last week" : "&mdash;"}</div>
          </td></tr>
        </table>
      </td>
      <td width="25%" style="padding:4px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Avg Daily</div>
            <div style="font-size:24px;font-weight:700;color:#0f172a;margin:4px 0">${d.avgDaily.toFixed(1)}</div>
            <div style="font-size:12px;color:#64748b">kWh/day</div>
          </td></tr>
        </table>
      </td>
      <td width="25%" style="padding:4px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Week Income</div>
            <div style="font-size:24px;font-weight:700;color:#0f172a;margin:4px 0">${c} ${d.weekIncome.toFixed(0)}</div>
            <div style="font-size:12px;color:#64748b">${d.currency}</div>
          </td></tr>
        </table>
      </td>
      <td width="25%" style="padding:4px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">System Health</div>
            <div style="font-size:24px;font-weight:700;color:${d.devicesOffline > 0 ? "#dc2626" : "#16a34a"};margin:4px 0">${d.devicesOffline > 0 ? "&#9888;" : "&#10003;"}</div>
            <div style="font-size:12px;color:#64748b">${d.devicesOnline}/${totalDevices} online</div>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>`;

  // Daily bar chart
  const dayChartData = d.days.map((day) => ({ label: day.dayName, value: day.generation }));
  const prevChartData = d.prevDays.map((day) => ({ label: day.dayName, value: day.generation }));

  // Daily breakdown table
  const breakdownRows = d.days
    .map((day) => {
      const diff = d.avgDaily > 0 ? ((day.generation - d.avgDaily) / d.avgDaily) * 100 : 0;
      const isBest = day.generation === d.bestDay.value && day.generation > 0;
      const isWorst = day.generation === d.worstDay.value && day.generation > 0 && !isBest;
      const isZero = day.generation === 0;
      const bg = isZero ? "#fef2f2" : isBest ? "#f0fdf4" : isWorst ? "#fffbeb" : "#ffffff";
      const txtColor = isZero ? "#991b1b" : "#1e293b";
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;background:${bg};color:${txtColor}">${day.dayName}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;background:${bg};color:${txtColor}">${day.date}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;background:${bg};color:${txtColor};font-weight:600">${day.generation.toFixed(1)} kWh</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;background:${bg};color:${txtColor}">${c} ${day.income.toFixed(2)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;background:${bg};color:${day.generation > 0 ? (diff >= 0 ? "#16a34a" : "#dc2626") : "#94a3b8"};font-weight:600">${day.generation > 0 ? (diff >= 0 ? "+" : "") + diff.toFixed(0) + "%" : "&mdash;"}</td>
      </tr>`;
    })
    .join("\n");

  // Device health rows
  const deviceRows = d.devices
    .map(
      (dev) =>
        `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:12px">${dev.sn}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">${dev.model}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">${badge(dev.status)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">${dev.todayGen} kWh</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">${fmtE(dev.totalGen)}</td>
        </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Solar Weekly Report &mdash; ${d.weekStart} &ndash; ${d.weekEnd}, ${d.yearStr}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:680px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1e293b;line-height:1.5;font-size:14px">

<!-- Header -->
<tr><td>
  <div style="font-size:22px;font-weight:700;color:#0f172a">Weekly Solar Report</div>
  <div style="color:#64748b;font-size:14px;margin-top:4px">${d.weekStart} &ndash; ${d.weekEnd}, ${d.yearStr} &nbsp;|&nbsp; ${d.plantName}, Nandura</div>
  <div style="color:#94a3b8;font-size:12px;margin-top:2px">Generated ${d.generatedAt}</div>
</td></tr>

<tr><td style="padding-top:16px">${offlineWarning}</td></tr>

<!-- Summary Cards -->
<tr><td>${cards}</td></tr>

<!-- Daily Generation Chart -->
<tr><td>${h2("Daily Generation")}</td></tr>
<tr><td>${htmlBarChart(dayChartData, d.avgDaily)}</td></tr>

<!-- Daily Breakdown Table -->
<tr><td>${h2("Daily Breakdown")}</td></tr>
<tr><td>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px">
    <tr>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Day</th>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Date</th>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Generation</th>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Income</th>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">vs Avg</th>
    </tr>
    ${breakdownRows}
  </table>
</td></tr>

<!-- Best / Worst -->
<tr><td style="padding-top:16px">
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td width="50%" style="padding-right:6px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Best Day</div>
            <div style="font-size:22px;font-weight:700;color:#16a34a;margin:2px 0">${d.bestDay.value.toFixed(1)} kWh</div>
            <div style="font-size:13px;color:#1e293b">${d.bestDay.label}</div>
          </td></tr>
        </table>
      </td>
      <td width="50%" style="padding-left:6px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">${d.worstDay.value > 0 ? "Lowest Day" : "No Generation"}</div>
            <div style="font-size:22px;font-weight:700;color:#d97706;margin:2px 0">${d.worstDay.value > 0 ? d.worstDay.value.toFixed(1) + " kWh" : "0 kWh"}</div>
            <div style="font-size:13px;color:#1e293b">${d.worstDay.label}</div>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</td></tr>

<!-- Week-over-Week -->
<tr><td>${h2("Week-over-Week")}</td></tr>
<tr><td>${htmlComparisonChart(dayChartData, prevChartData)}</td></tr>
<tr><td style="color:#64748b;font-size:13px;padding-top:4px">
  This week: <strong style="color:#1e293b">${fmtE(d.weekTotal)}</strong> &nbsp;|&nbsp;
  Last week: <strong style="color:#1e293b">${fmtE(d.prevWeekTotal)}</strong> &nbsp;|&nbsp;
  Change: ${delta(d.weekChange)}
</td></tr>

<!-- Month Progress -->
<tr><td>${h2(d.monthName + " Progress")}</td></tr>
<tr><td>
  ${htmlProgressBar(d.monthDaysElapsed / d.monthDaysTotal)}
  <div style="color:#64748b;font-size:13px;margin-top:4px">
    <strong style="color:#1e293b">${fmtE(d.monthToDateGen)}</strong> in ${d.monthDaysElapsed}/${d.monthDaysTotal} days
    &nbsp;|&nbsp; Income: ${c} ${d.monthEarnings.toFixed(2)}
    &nbsp;|&nbsp; Projected: <strong style="color:#1e293b">${fmtE(d.monthProjection)}</strong>
  </div>
</td></tr>

<!-- Device Health -->
<tr><td>${h2("Device Health")}</td></tr>
<tr><td>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px">
    <tr>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Device</th>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Model</th>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Status</th>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Today</th>
      <th style="background:#f8fafc;color:#64748b;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Lifetime</th>
    </tr>
    ${deviceRows}
  </table>
  ${d.alarmsToday > 0 ? `<div style="color:#dc2626;margin-top:8px;font-weight:600">&#9888; ${d.alarmsToday} alarm(s) today</div>` : ""}
</td></tr>

<!-- Footer -->
<tr><td style="padding-top:32px;border-top:1px solid #e2e8f0;margin-top:32px">
  <div style="color:#94a3b8;font-size:11px;text-align:center">Auto-generated by pvhub-api &nbsp;|&nbsp; PV-Hub Weekly Solar Report</div>
</td></tr>

</table>
</body>
</html>`;
}
