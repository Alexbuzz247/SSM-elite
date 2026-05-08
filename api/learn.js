// api/learn.js
// Analyzes race results history and returns pattern findings + formula adjustment suggestions.

const CURRENT_WEIGHTS = `CLM_DIRT_SPRINT:  PCO+TEO 0.35 | TJI 0.30 | ARI 0.20 | BA/CF 0.10 | THM 0.05
CLM_TURF_ROUTE:   PCO 0.25 | TRSO 0.25 | ARI 0.20 | BA/CF 0.15 | TJI 0.10 | THM 0.05
ALW_DIRT_SPRINT:  ARI 0.30 | BA/CF 0.25 | TJI 0.20 | PCO 0.15 | THM 0.10
ALW_TURF_SPRINT:  BA/CF 0.35 | TJI 0.25 | ARI 0.20 | PCO 0.15 | THM 0.05
ALW_TURF_LONG:    TRSO 0.30 | BA/CF 0.25 | ARI 0.15 | PCO 0.15 | TJI 0.10 | THM 0.05
MSW_SPRINT:       Proto-PCO 0.35 | TJI 0.30 | ARI 0.20 | Chaos 0.15
MSW_SPRINT_TURF:  Proto-PCO 0.35 | TJI 0.28 | ARI 0.12 | TMSEP 0.10 | Chaos 0.15
MSW_TURF_ROUTE:   MSW Rule 0.40 | TJI 0.25 | ARI 0.15 | BA/CF 0.10 | Chaos 0.10
STAKES_DIRT:      BA/CF 0.35 | TJI 0.25 | ARI 0.10 | PCO 0.15 | THM 0.10
STAKES_TURF_LONG: BA/CF 0.30 | TRSO 0.25 | TJI 0.20 | ARI 0.10 | PCO 0.10 | THM 0.05`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { results } = req.body;
  if (!results || results.length === 0) return res.status(400).json({ error: "No results provided" });

  const wins = results.filter(r => r.result === "WON").length;
  const resultsText = results
    .slice()
    .reverse()
    .map(r => `${r.date} | ${r.track} ${r.race} | PICK: ${r.pick} | ${r.result}${r.price ? ` $${r.price}` : ""} | Grade: ${r.grade} | ${r.notes || ""}`)
    .join("\n");

  const prompt = `You are the SSM Elite calibration engine. Analyze ${results.length} race results (${wins} wins) and identify what patterns to strengthen or adjust.

CURRENT MODULE WEIGHTS:
${CURRENT_WEIGHTS}

RACE RESULTS LOG:
${resultsText}

Analyze wins vs. misses. Look for:
- Which signals (PCO+TEO, TJI tiers, ARI, TRSO, TMSEP, bounce-back flags, etc.) correlated with wins
- What caused misses (wrong surface, class error, signal missed, etc.)
- Race type or surface patterns
- Any new rules that should be added or existing ones reinforced

Respond ONLY with valid JSON, no extra text, in this exact structure:
{
  "summary": "2-3 sentence overall pattern analysis",
  "winRate": "${wins}/${results.length}",
  "patterns": [
    { "signal": "PCO+TEO", "finding": "3/3 wins when confirmed", "confidence": "HIGH" }
  ],
  "adjustments": [
    {
      "raceType": "CLM_DIRT_SPRINT",
      "module": "PCO+TEO",
      "currentWeight": 0.35,
      "suggestedWeight": 0.40,
      "reason": "100% confirmed win rate across 3 CLM races"
    }
  ],
  "newRules": [
    { "rule": "TMSEP mandatory in MSW_SPRINT_TURF", "reason": "Tulavia's World miss corrected retroactively" }
  ]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data.content?.map(b => b.text || "").join("") || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse calibration response");

    const calibration = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ calibration });
  } catch (err) {
    console.error("Learn error:", err);
    return res.status(500).json({ error: err.message });
  }
}
