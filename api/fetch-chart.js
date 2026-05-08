// api/fetch-chart.js
// Fetches a free Equibase result chart PDF and parses it with Claude.
// URL format: https://www.equibase.com/static/chart/pdf/{TRACK}{MMDDYY}USA{RACE}.pdf
// Charts are free, public, available ~40 min after race completion, kept 45 days.

const RESULTS_PROMPT = `You are a horse racing result extractor. Parse this Equibase result chart and extract all visible information.

Output ONLY valid JSON — no explanation, no markdown, no extra text:
{
  "track": "Santa Anita",
  "race": "R1",
  "date": "5/8/2026",
  "distance": "6f",
  "surface": "Dirt",
  "raceType": "CLM",
  "winner": "Lord Bullingdon",
  "winnerJockey": "K Kimura",
  "winnerTrainer": "M McCarthy",
  "place": "Pioneer Prince",
  "show": "Desert Storm",
  "winPayoff": 8.40,
  "placePayoff": 4.20,
  "showPayoff": 3.10,
  "exactaPayoff": 24.60,
  "trifectaPayoff": 0,
  "superfectaPayoff": 0,
  "notes": ""
}

Rules:
- Race number format: "R" + number (e.g. "R5")
- Payoffs are dollar amounts for a $2 bet
- Use null for number fields not visible, "" for string fields not visible
- Output ONLY the JSON object, nothing else`;

function buildEquibaseUrl(track, dateStr, race) {
  // dateStr expected as MM/DD/YYYY from the UI
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const mm = parts[0].padStart(2, "0");
  const dd = parts[1].padStart(2, "0");
  const yy = parts[2].slice(-2); // last 2 digits of year
  return `https://www.equibase.com/static/chart/pdf/${track.toUpperCase()}${mm}${dd}${yy}USA${race}.pdf`;
}

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

  const chartUrl = buildEquibaseUrl(track, date, race);
  if (!chartUrl) {
    return res.status(400).json({ error: "Invalid date format — use MM/DD/YYYY" });
  }

  // ── Fetch PDF from Equibase ──────────────────────────────────────────────────
  let pdfBase64;
  try {
    const fetchRes = await fetch(chartUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
        "Referer": "https://www.equibase.com/",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!fetchRes.ok) {
      const msg = fetchRes.status === 404
        ? `Chart not found — ${track.toUpperCase()} Race ${race} on ${date} (${chartUrl}). Charts post ~40 min after the race and are kept for 45 days.`
        : `Equibase returned ${fetchRes.status}. Try again shortly.`;
      return res.status(404).json({ error: msg, url: chartUrl });
    }

    const buffer = await fetchRes.arrayBuffer();
    pdfBase64 = Buffer.from(buffer).toString("base64");
  } catch (e) {
    if (e.name === "TimeoutError") {
      return res.status(504).json({ error: "Equibase request timed out. Try again." });
    }
    return res.status(502).json({ error: `Could not reach Equibase: ${e.message}` });
  }

  // ── Parse with Claude ────────────────────────────────────────────────────────
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: RESULTS_PROMPT },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Anthropic error ${claudeRes.status}: ${err}`);
    }

    const data   = await claudeRes.json();
    const text   = data.content?.map(b => b.text || "").join("") || "";
    const match  = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse result data from chart");

    const result = JSON.parse(match[0]);
    return res.status(200).json({ result, chartUrl });
  } catch (e) {
    console.error("fetch-chart parse error:", e);
    return res.status(500).json({ error: e.message });
  }
}
