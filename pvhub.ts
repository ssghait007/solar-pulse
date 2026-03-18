/**
 * PV-Hub API Client Library
 * All config from environment variables (loaded via .env)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";

const BASE_URL = "https://www.pv-hub.com";
const LANG = "en";
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const MODULE_DIR = dirname(new URL(import.meta.url).pathname);

// ─── WASM Signature ───────────────────────────────────────────────────
let beginSig: (url: string, token: string, lang: string, ts: string) => string;
let endSig: (sig: string) => number;
let authToken = "";

export async function init(): Promise<void> {
  const wasmPath = join(MODULE_DIR, "signature.wasm");
  const jsCode = readFileSync(join(MODULE_DIR, "signature.js"), "utf-8");
  const mc: any = {
    wasmBinary: readFileSync(wasmPath),
    locateFile: (p: string) => (p.endsWith(".wasm") ? wasmPath : join(MODULE_DIR, p)),
    print: () => {},
    printErr: () => {},
  };
  const m = new Function("Module", "require", "__dirname", jsCode + "\n; return Module;")(
    mc, require, MODULE_DIR
  );
  if (m.ready) await m.ready;
  else await new Promise((r) => setTimeout(r, 500));
  beginSig = m.cwrap("begin_signature", "string", ["string", "string", "string", "string"]);
  endSig = m.cwrap("end_signature", "number", ["string"]);
}

// ─── HTTP ─────────────────────────────────────────────────────────────
function headers(path: string, ts: number): Record<string, string> {
  const sig = beginSig(path, authToken, LANG, ts.toString());
  endSig(sig);
  return {
    accept: "application/json, text/plain, */*",
    contentType: "application/json",
    lang: LANG,
    token: authToken,
    timezone: TIMEZONE,
    timestamp: ts.toString(),
    signature: sig,
    origin: BASE_URL,
    referer: `${BASE_URL}/bus/plant/detail`,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };
}

export async function get(path: string, params?: Record<string, string>): Promise<any> {
  const ts = Date.now();
  let url = `${BASE_URL}${path}`;
  if (params) url += "?" + new URLSearchParams(params).toString();
  return (await fetch(url, { method: "GET", headers: headers(path, ts) })).json();
}

export async function post(path: string, data: any): Promise<any> {
  const ts = Date.now();
  return (
    await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { ...headers(path, ts), "content-type": "application/json;charset=UTF-8" },
      body: JSON.stringify(data),
    })
  ).json();
}

// ─── Auth ─────────────────────────────────────────────────────────────
export async function login(): Promise<void> {
  const user = process.env.PVHUB_USERNAME;
  const pass = process.env.PVHUB_PASSWORD_MD5;
  if (!user || !pass) throw new Error("Missing PVHUB_USERNAME or PVHUB_PASSWORD_MD5 in .env");

  const ts = Date.now();
  const sig = beginSig("/c/v0/user/login", "", LANG, ts.toString());
  endSig(sig);
  const r = await fetch(`${BASE_URL}/c/v0/user/login`, {
    method: "POST",
    headers: {
      ...headers("/c/v0/user/login", ts),
      "content-type": "application/json;charset=UTF-8",
      token: "",
      signature: sig,
    },
    body: JSON.stringify({ user, password: pass }),
  });
  const j = await r.json();
  if (j.errno !== 0) throw new Error(`Login failed: ${JSON.stringify(j)}`);
  authToken = j.result.token;
}

// ─── API Helpers ──────────────────────────────────────────────────────
export const stationId = () => {
  const sid = process.env.PVHUB_STATION_ID;
  if (!sid) throw new Error("Missing PVHUB_STATION_ID in .env");
  return sid;
};

export const getEarnings = (sid: string) =>
  get("/c/v0/plant/earnings/detail", { stationID: sid });

export const getStatus = (sid: string) =>
  get("/c/v0/plant/status/detail", { stationID: sid });

export const getAlarms = (sid: string) =>
  get("/c/v0/plant/alarm/today", { stationID: sid });

export const getFlow = (sid: string) =>
  get("/generic/v1/plant/flow", { plantId: sid });

export const getDevices = (sid: string) =>
  post("/c/v0/plant/device/list", { stationID: sid, currentPage: 1, pageSize: 20 });

export const getPlantList = () =>
  post("/c/v1/plant/list", {
    pageSize: 20, currentPage: 1, total: 0,
    condition: { status: 0, contentType: 2, content: "" },
  });

export const getMonthlyReport = (sid: string, year: number, month: number) =>
  post("/generic/w/v0/plant/history/report", {
    isSplit: null, stationID: sid, reportType: "month",
    variables: ["feedin", "generation", "loads", "gridConsumption"],
    queryDate: { year, month, day: null, hour: 5 },
  });

export const getDailyPower = (sid: string, year: number, month: number, day: number) =>
  post("/generic/w/v0/plant/history/raw", {
    isSplit: null, stationID: sid,
    variables: ["generationPower", "feedinPower", "loadsPower", "gridConsumptionPower"],
    timespan: "day",
    beginDate: { year, month, day, hour: 0, minute: 0, second: 0 },
  });

export function extractVar(result: any[], varName: string): { index: number; value: number }[] {
  return result?.find((r: any) => r.variable === varName)?.data || [];
}

export function formatEnergy(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(2)} MWh`;
  return `${kwh.toFixed(2)} kWh`;
}

// ─── Discord Webhook ─────────────────────────────────────────────────
export async function sendDiscord(content: string, embeds?: any[]): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;

  try {
    const body: any = { content };
    if (embeds) body.embeds = embeds;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok || res.status === 204) {
      console.log("  Discord: sent");
      return true;
    }
    console.error(`  Discord failed: ${res.status}`);
    return false;
  } catch (err: any) {
    console.error(`  Discord error: ${err.message}`);
    return false;
  }
}
