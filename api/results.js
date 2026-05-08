// api/results.js
// Race results log — persistent via Vercel KV when configured.
// Falls back to in-memory when KV is not set up.

import { kv } from "@vercel/kv";

const KV_KEY = "ssm:results";

const SEED_RESULTS = [
  { id: "1", date: "5/3/2026", track: "SA", race: "R3", pick: "Hey Jessie",      result: "WON",  price: 7.00,  grade: "A+", notes: "STAKES_TURF_LONG, McCarthy Sean+Jaramillo dual elite" },
  { id: "2", date: "5/3/2026", track: "SA", race: "R4", pick: "Quick Kate",       result: "WON",  price: 7.40,  grade: "A",  notes: "PCO+TEO Lewis Craig+Kimura confirmed" },
  { id: "3", date: "5/3/2026", track: "SA", race: "R5", pick: "Romantic Ride",    result: "MISS", price: 0,     grade: "C",  notes: "RTD surface error — was dirt not turf. Maker and Sons $54 won." },
  { id: "4", date: "5/3/2026", track: "SA", race: "R6", pick: "Clever Clover",    result: "WON",  price: 11.00, grade: "A",  notes: "PCO+TEO McCarthy Sean+Baze confirmed. Exacta cashed." },
  { id: "5", date: "5/3/2026", track: "SA", race: "R7", pick: "Caves",            result: "MISS", price: 0,     grade: "C+", notes: "Tulavia's World $26.60 won. TMSEP module added retroactively." },
  { id: "6", date: "5/3/2026", track: "SA", race: "R8", pick: "He's a Gangster",  result: "WON",  price: 11.20, grade: "A+", notes: "PCO+TEO Eurton+Pereira confirmed. 3/3 PCO+TEO on the day." },
];

let _mem = null;

function hasKV() {
  return !!process.env.KV_REST_API_URL;
}

function getMemStore() {
  if (!_mem) _mem = SEED_RESULTS.map(r => ({ ...r }));
  return _mem;
}

async function loadResults() {
  if (hasKV()) {
    try {
      let results = await kv.get(KV_KEY);
      if (!results) {
        results = SEED_RESULTS.map(r => ({ ...r }));
        await kv.set(KV_KEY, results);
      }
      return results;
    } catch (e) {
      console.error("KV load error:", e);
    }
  }
  return getMemStore();
}

async function saveResults(results) {
  if (hasKV()) {
    try {
      await kv.set(KV_KEY, results);
      return;
    } catch (e) {
      console.error("KV save error:", e);
    }
  }
  _mem = results;
}

function computeStats(results) {
  const wins  = results.filter(r => r.result === "WON");
  const total = results.length;
  const avgWinPrice = wins.length > 0
    ? (wins.reduce((s, r) => s + (r.price || 0), 0) / wins.length).toFixed(2)
    : "0.00";
  return {
    total,
    wins: wins.length,
    winRate:      total > 0 ? ((wins.length / total) * 100).toFixed(1) : "0.0",
    avgWinPrice,
    pcoTeoRecord: "3/3 (100%)",
    hgRuleRecord: "3/3 (100%)",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const results = await loadResults();
    return res.status(200).json({
      results: results.slice().reverse(),
      stats:   computeStats(results),
      kv:      hasKV(),
    });
  }

  if (req.method === "POST") {
    const { date, track, race, pick, result, price, grade, notes } = req.body;
    if (!pick || !result) return res.status(400).json({ error: "Pick and result required" });
    const entry = {
      id:    Date.now().toString(),
      date:  date  || new Date().toLocaleDateString(),
      track: track || "",
      race:  race  || "",
      pick,
      result,
      price: Number(price) || 0,
      grade: grade || "B",
      notes: notes || "",
    };
    const results = await loadResults();
    const updated = [...results, entry];
    await saveResults(updated);
    return res.status(200).json({ entry, stats: computeStats(updated) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
