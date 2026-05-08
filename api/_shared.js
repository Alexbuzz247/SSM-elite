// api/_shared.js — shared Equibase fetch + Claude parse logic

export const RESULTS_PROMPT = `You are a horse racing result extractor. Parse this Equibase result chart and extract all visible information.

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

export function buildEquibaseUrl(track, dateStr, race) {
  // dateStr expected as MM/DD/YYYY
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const mm = parts[0].padStart(2, "0");
  const dd = parts[1].padStart(2, "0");
  const yy = parts[2].slice(-2);
  return `https://www.equibase.com/static/chart/pdf/${track.toUpperCase()}${mm}${dd}${yy}USA${race}.pdf`;
}

// Returns { result, chartUrl } or throws { status, message }
export async function fetchAndParseChart(track, dateStr, race, apiKey) {
  const chartUrl = buildEquibaseUrl(track, dateStr, race);
  if (!chartUrl) throw { status: 400, message: "Invalid date format — use MM/DD/YYYY" };

  // ── Fetch PDF ─────────────────────────────────────────────────────────────
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
      const is404 = fetchRes.status === 404;
      throw {
        status: fetchRes.status,
        message: is404
          ? `Chart not found — ${track.toUpperCase()} Race ${race} on ${dateStr}. Charts post ~40 min after the race and are kept for 45 days.`
          : `Equibase returned ${fetchRes.status}. Try again shortly.`,
        is404,
      };
    }

    const buffer = await fetchRes.arrayBuffer();
    pdfBase64 = Buffer.from(buffer).toString("base64");
  } catch (e) {
    if (e.status) throw e;
    if (e.name === "TimeoutError") throw { status: 504, message: "Equibase request timed out." };
    throw { status: 502, message: `Could not reach Equibase: ${e.message}` };
  }

  // ── Parse with Claude ─────────────────────────────────────────────────────
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
    signal: AbortSignal.timeout(30000),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    throw { status: 500, message: `Anthropic error ${claudeRes.status}: ${err}` };
  }

  const data  = await claudeRes.json();
  const text  = data.content?.map(b => b.text || "").join("") || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw { status: 500, message: "Could not parse result data from chart" };

  return { result: JSON.parse(match[0]), chartUrl };
}

// Today's date in Pacific Time as MM/DD/YYYY
export function todayPT() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit", day: "2-digit", year: "numeric",
  }).format(new Date());
}
