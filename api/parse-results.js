// api/parse-results.js
// Parses race result screenshots (Equibase, track app, DRF) using Claude vision.
// Returns structured JSON: winner, place, show, payoffs, race info.

const RESULTS_PROMPT = `You are a horse racing result extractor. Parse the race result screenshot(s) and extract all visible information.

Output ONLY valid JSON — no explanation, no markdown, no extra text:
{
  "track": "Santa Anita",
  "race": "R5",
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
- Race number format: "R" + number (e.g. "R5", not "Race 5" or "5")
- Payoffs are the dollar amount for a $2 bet
- Use null for number fields not visible, "" for string fields not visible
- If multiple races are shown, extract the most prominent/complete one
- Output ONLY the JSON object, nothing else`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { files } = req.body;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "files array is required" });
  }

  try {
    const contentBlocks = [];

    for (const { fileData, fileType } of files) {
      if (!fileData || !fileType) continue;
      if (fileType.startsWith("image/")) {
        contentBlocks.push({ type: "image", source: { type: "base64", media_type: fileType, data: fileData } });
      } else if (fileType === "application/pdf") {
        contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileData } });
      }
    }

    if (contentBlocks.length === 0) return res.status(400).json({ error: "No valid image files provided" });

    contentBlocks.push({ type: "text", text: RESULTS_PROMPT });

    const hasPdf = files.some(f => f.fileType === "application/pdf");
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(hasPdf ? { "anthropic-beta": "pdfs-2024-09-25" } : {}),
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data.content?.map(b => b.text || "").join("") || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not extract result data from image");

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ result });
  } catch (err) {
    console.error("parse-results error:", err);
    return res.status(500).json({ error: err.message });
  }
}
