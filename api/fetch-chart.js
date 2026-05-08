// api/fetch-chart.js
// Fetches a single Equibase result chart PDF and parses it with Claude.
// URL format: https://www.equibase.com/static/chart/pdf/{TRACK}{MMDDYY}USA{RACE}.pdf

import { fetchAndParseChart } from "./_shared.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { track, date, race } = req.body;
  if (!track || !date || !race) {
    return res.status(400).json({ error: "track, date, and race are required" });
  }

  try {
    const { result, chartUrl } = await fetchAndParseChart(track, date, String(race), apiKey);
    return res.status(200).json({ result, chartUrl });
  } catch (e) {
    console.error("fetch-chart error:", e);
    const status  = e.status  || 500;
    const message = e.message || String(e);
    return res.status(status).json({ error: message, url: e.is404 ? undefined : undefined });
  }
}
