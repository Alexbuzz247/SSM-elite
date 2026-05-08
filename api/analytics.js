// api/analytics.js — NIST EDA statistical analysis of race results

const ANALYTICS_PROMPT = `You are a NIST-style EDA analyst for horse racing performance data.

Given these race results and computed statistics, provide a structured analysis.

Output ONLY valid JSON:
{
  "trend": "improving",
  "trendReason": "one sentence explaining the trend direction",
  "lagAnalysis": "one sentence on whether wins tend to cluster or alternate",
  "payoffSkew": "right-skewed",
  "keyFindings": ["finding 1", "finding 2", "finding 3"],
  "summary": "2-3 sentence executive summary of performance",
  "recommendations": ["rec 1", "rec 2"]
}

trend must be exactly: "improving", "stable", or "declining"
payoffSkew must be exactly: "right-skewed", "symmetric", or "left-skewed"`;

function computeStats(results) {
  const wins = results.filter(r => r.result === "WON");
  const n = results.length;
  const pOverall = wins.length / n;

  // Running win rate — chronological order (oldest first)
  const chrono = results.slice().reverse();
  let runningWins = 0;
  const controlChart = chrono.map((r, i) => {
    if (r.result === "WON") runningWins++;
    const p = runningWins / (i + 1);
    const ucl = Math.min(100, (pOverall + 3 * Math.sqrt(pOverall * (1 - pOverall) / Math.max(i + 1, 1))) * 100);
    const lcl = Math.max(0, (pOverall - 3 * Math.sqrt(pOverall * (1 - pOverall) / Math.max(i + 1, 1))) * 100);
    return {
      race: i + 1,
      label: `${r.track || ""}${r.race || ""}`.trim() || `R${i + 1}`,
      winRate: Math.round(p * 1000) / 10,
      ucl: Math.round(ucl * 10) / 10,
      lcl: Math.round(lcl * 10) / 10,
    };
  });

  // By grade
  const gradeMap = {};
  results.forEach(r => {
    const g = r.grade || "?";
    if (!gradeMap[g]) gradeMap[g] = { grade: g, wins: 0, total: 0 };
    gradeMap[g].total++;
    if (r.result === "WON") gradeMap[g].wins++;
  });
  const GRADE_ORDER = ["A+","A","B+","B","C+","C","D"];
  const byGrade = Object.values(gradeMap)
    .map(g => ({ ...g, winRate: Math.round((g.wins / g.total) * 100) }))
    .sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade));

  // By race type — inferred from notes keywords
  const TYPE_PATTERNS = [
    { key: "PCO+TEO", pattern: /PCO\+TEO/i },
    { key: "Stakes",  pattern: /STAKES/i },
    { key: "ALW",     pattern: /\bALW\b/i },
    { key: "CLM",     pattern: /\bCLM\b|\bclaiming\b/i },
    { key: "Maiden",  pattern: /\bMSW\b|\bMCL\b|\bmaiden\b/i },
  ];
  const typeMap = {};
  results.forEach(r => {
    const notes = (r.notes || "") + " " + (r.race || "");
    let matched = false;
    for (const { key, pattern } of TYPE_PATTERNS) {
      if (pattern.test(notes)) {
        if (!typeMap[key]) typeMap[key] = { type: key, wins: 0, total: 0 };
        typeMap[key].total++;
        if (r.result === "WON") typeMap[key].wins++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (!typeMap["Other"]) typeMap["Other"] = { type: "Other", wins: 0, total: 0 };
      typeMap["Other"].total++;
      if (r.result === "WON") typeMap["Other"].wins++;
    }
  });
  const byRaceType = Object.values(typeMap)
    .map(t => ({ ...t, winRate: Math.round((t.wins / t.total) * 100) }))
    .sort((a, b) => b.total - a.total);

  // Signal reliability
  const SIGNALS = [
    { key: "PCO+TEO",    pattern: /PCO\+TEO/i },
    { key: "Dual Elite", pattern: /dual elite/i },
    { key: "Wide Trip",  pattern: /WIDE WIN|wide/i },
    { key: "Stakes",     pattern: /STAKES/i },
  ];
  const sigMap = {};
  results.forEach(r => {
    const notes = r.notes || "";
    for (const { key, pattern } of SIGNALS) {
      if (pattern.test(notes)) {
        if (!sigMap[key]) sigMap[key] = { signal: key, wins: 0, total: 0 };
        sigMap[key].total++;
        if (r.result === "WON") sigMap[key].wins++;
      }
    }
  });
  const signals = Object.values(sigMap)
    .map(s => ({ ...s, winRate: Math.round((s.wins / s.total) * 100) }))
    .filter(s => s.total > 0)
    .sort((a, b) => b.total - a.total);

  // ROI — prices are $2-bet payoffs
  const invested = n * 2;
  const returned = Math.round(wins.reduce((sum, r) => sum + (r.price || 0), 0) * 100) / 100;
  const roi = {
    invested,
    returned,
    profit: Math.round((returned - invested) * 100) / 100,
    roiPct: invested > 0 ? Math.round(((returned - invested) / invested) * 100) : 0,
    avgWinPrice: wins.length > 0
      ? Math.round(wins.reduce((s, r) => s + (r.price || 0), 0) / wins.length * 100) / 100
      : 0,
  };

  // Lag correlation — does a win predict the next start?
  let lagHit = 0, lagTotal = 0;
  for (let i = 0; i < chrono.length - 1; i++) {
    if (chrono[i].result === "WON") {
      lagTotal++;
      if (chrono[i + 1].result === "WON") lagHit++;
    }
  }
  const lagCorr = lagTotal > 0 ? Math.round((lagHit / lagTotal) * 100) : null;

  return { controlChart, byGrade, byRaceType, signals, roi, lagCorr, n, winsCount: wins.length };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { results } = req.body;
  if (!results || results.length === 0) return res.status(400).json({ error: "No results to analyze" });

  const computed = computeStats(results);
  const winPct = Math.round(computed.winsCount / computed.n * 100);

  const prompt = `${ANALYTICS_PROMPT}

Race Results (${computed.n} total, ${computed.winsCount} wins, ${winPct}% win rate):
${results.map(r => `${r.date} ${r.track} ${r.race}: ${r.pick} — ${r.result}${r.result === "WON" ? ` $${r.price}` : ""} [Grade: ${r.grade}] ${r.notes || ""}`).join("\n")}

Computed:
- ROI: ${computed.roi.roiPct}% (invested $${computed.roi.invested}, returned $${computed.roi.returned})
- Avg Win Price: $${computed.roi.avgWinPrice}
- Lag (win→win rate): ${computed.lagCorr !== null ? `${computed.lagCorr}%` : "N/A"}
- By Grade: ${computed.byGrade.map(g => `${g.grade}: ${g.wins}/${g.total}`).join(", ")}
- Signals: ${computed.signals.map(s => `${s.signal}: ${s.wins}/${s.total}`).join(", ")}`;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    const data = await claudeRes.json();
    const text = data.content?.map(b => b.text || "").join("") || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse interpretation");
    const interpretation = JSON.parse(match[0]);
    return res.status(200).json({ ...computed, ...interpretation });
  } catch (e) {
    // Return computed stats even if Claude interpretation fails
    return res.status(200).json({
      ...computed,
      trend: "stable",
      trendReason: "Interpretation unavailable.",
      lagAnalysis: computed.lagCorr !== null
        ? `Win-then-win rate: ${computed.lagCorr}% (${computed.lagCorr > 50 ? "wins tend to cluster" : "wins appear independent"}).`
        : "Insufficient data for lag analysis.",
      payoffSkew: "right-skewed",
      keyFindings: [
        `Win rate: ${winPct}% (${computed.winsCount}/${computed.n})`,
        `ROI: ${computed.roi.roiPct}% on $${computed.roi.invested} invested`,
        `Average win payoff: $${computed.roi.avgWinPrice}`,
      ],
      summary: `${computed.n} races analyzed, ${computed.winsCount} wins (${winPct}%). ROI: ${computed.roi.roiPct}%.`,
      recommendations: [],
    });
  }
}
