// api/upload.js
// Parses DRF data sheets (PDF, image, or plain text) using Claude's vision/document API.
// Returns structured horse data + race info ready for the analyze pipeline.

const PARSE_PROMPT = `You are a DRF (Daily Racing Form) past performances extractor for horse racing.
Parse the provided past performances sheet and output data in two sections.

SECTION 1 — Race information (output this block first, exactly as shown):
RACE_INFO:
Track: [full track name, e.g. Santa Anita]
Race: [race number only, e.g. 9]
Date: [date as MM/DD/YYYY]
Distance: [distance, e.g. 6f or 1 1/16M]
Surface: [Dirt or Turf or Synthetic]
Race Type: [CLM, MCL, MSW, ALW, OC, STK, G1, G2, or G3]
Purse: [number only, no $ sign or commas, e.g. 37000]
Field Size: [number of horses]

SECTION 2 — One block per horse (blank line between horses):

#[post position] [Horse Name] — Trainer: [Last First], Jockey: [Last First]
Best Beyers: [top 4-5 speed figures most recent first, or N/A]
Last race: [one sentence: finish position, how horse ran, any trip issues]
Works: [2-3 most recent workouts: MonDD Track Dist :Time H/B]
ML Odds: [morning line odds]
Notes: [class change, layoff, first-time starter, surface switch, bullet works, any standout detail]

Rules:
- Output RACE_INFO block first, then a blank line, then horses starting with #1
- If a value is unknown write N/A
- Do not add commentary outside the format above`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { fileData, fileType } = req.body;
  if (!fileData || !fileType) {
    return res.status(400).json({ error: "fileData and fileType are required" });
  }

  try {
    let messages;

    if (fileType === "application/pdf") {
      messages = [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: fileData },
          },
          { type: "text", text: PARSE_PROMPT },
        ],
      }];
    } else if (fileType.startsWith("image/")) {
      messages = [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: fileType, data: fileData },
          },
          { type: "text", text: PARSE_PROMPT },
        ],
      }];
    } else {
      // Plain text or CSV — decode and send as text
      const text = Buffer.from(fileData, "base64").toString("utf-8");
      messages = [{
        role: "user",
        content: `${PARSE_PROMPT}\n\nDRF DATA:\n\n${text}`,
      }];
    }

    const apiHeaders = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
    if (fileType === "application/pdf") {
      apiHeaders["anthropic-beta"] = "pdfs-2024-09-25";
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: apiHeaders,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const parsed = data.content?.map(b => b.text || "").join("") || "";

    return res.status(200).json({ parsed });
  } catch (err) {
    console.error("DRF upload parse error:", err);
    return res.status(500).json({ error: err.message });
  }
}
