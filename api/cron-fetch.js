// api/cron-fetch.js
// Fetches all of today's SA result charts from Equibase and stores them
// to ssm:pending in KV for one-click confirmation in the app.
//
// Triggered by Vercel Cron (GET) at 7:30 PM PT daily.
// Also accepts POST from the frontend for manual "Fetch Today" triggers.

import { kv } from "@vercel/kv";
import { fetchAndParseChart, todayPT } from "./_shared.js";

const PENDING_KEY = "ssm:pending";
const MAX_RACES = 12;
const MAX_CONSECUTIVE_404 = 3;

async function loadPending() {
  try { return (await kv.get(PENDING_KEY)) || []; } catch { return []; }
}

async function savePending(items) {
  try { await kv.set(PENDING_KEY, items); } catch (e) { console.error("KV save error:", e); }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify Vercel cron secret on GET requests
  if (req.method === "GET") {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers["authorization"] || "";
      if (auth !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: "Vercel KV not configured — pending queue requires KV storage" });
  }

  // Track and date — from POST body or default to SA today
  const body  = req.method === "POST" ? req.body : {};
  const track = (body.track || "SA").toUpperCase();
  const date  = body.date  || todayPT();

  const existing = await loadPending();
  const existingUrls = new Set(existing.map(p => p.chartUrl));

  const fetched = [];
  const skipped = [];
  const errors  = [];
  let consecutiveFails = 0;

  for (let race = 1; race <= MAX_RACES; race++) {
    try {
      const { result, chartUrl } = await fetchAndParseChart(track, date, String(race), apiKey);

      if (existingUrls.has(chartUrl)) {
        skipped.push(`R${race} (already queued)`);
        consecutiveFails = 0;
        continue;
      }

      const item = {
        id:        `${Date.now()}-${race}`,
        fetchedAt: new Date().toISOString(),
        chartUrl,
        track:     result.track  || track,
        race:      result.race   || `R${race}`,
        date:      result.date   || date,
        winner:    result.winner || null,
        winPayoff: result.winPayoff || null,
        placePayoff:    result.placePayoff    || null,
        showPayoff:     result.showPayoff     || null,
        exactaPayoff:   result.exactaPayoff   || null,
        trifectaPayoff: result.trifectaPayoff || null,
        place:          result.place   || null,
        show:           result.show    || null,
        distance:       result.distance || null,
        surface:        result.surface  || null,
        raceType:       result.raceType || null,
        winnerJockey:   result.winnerJockey  || null,
        winnerTrainer:  result.winnerTrainer || null,
      };

      existing.push(item);
      existingUrls.add(chartUrl);
      fetched.push(`R${race}`);
      consecutiveFails = 0;
    } catch (e) {
      if (e.is404 || e.status === 404) {
        consecutiveFails++;
        if (consecutiveFails >= MAX_CONSECUTIVE_404) break;
      } else {
        errors.push(`R${race}: ${e.message || e}`);
        consecutiveFails = 0;
      }
    }
  }

  if (fetched.length > 0) {
    await savePending(existing);
  }

  return res.status(200).json({
    fetched,
    skipped,
    errors,
    total: existing.length,
    track,
    date,
  });
}
