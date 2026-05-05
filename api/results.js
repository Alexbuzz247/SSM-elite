// api/results.js
// Race results log — tracks system performance over time

const SEED_RESULTS = [
  { id: "1", date: "5/3/2026", track: "SA", race: "R3", pick: "Hey Jessie", result: "WON", price: 7.00, grade: "A+", notes: "STAKES_TURF_LONG, McCarthy Sean+Jaramillo dual elite" },
  { id: "2", date: "5/3/2026", track: "SA", race: "R4", pick: "Quick Kate", result: "WON", price: 7.40, grade: "A", notes: "PCO+TEO Lewis Craig+Kimura confirmed" },
  { id: "3", date: "5/3/2026", track: "SA", race: "R5", pick: "Romantic Ride", result: "MISS", price: 0, grade: "C", notes: "RTD surface error — was dirt not turf. Maker and Sons $54 won. Calibration added." },
  { id: "4", date: "5/3/2026", track: "SA", race: "R6", pick: "Clever Clover", result: "WON", price: 11.00, grade: "A", notes: "PCO+TEO McCarthy Sean+Baze confirmed. Exacta cashed." },
  { id: "5", date: "5/3/2026", track: "SA", race: "R7", pick: "Caves", result: "MISS", price: 0, grade: "C+", notes: "Tulavia's World $26.60 won. TMSEP module added — corrects miss retroactively." },
  { id: "6", date: "5/3/2026", track: "SA", race: "R8", pick: "He's a Gangster", result: "WON", price: 11.20, grade: "A+", notes: "PCO+TEO Eurton+Pereira confirmed. 3/3 PCO+TEO on the day." },
];

let resultStore = [...SEED_RESULTS];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const wins = resultStore.filter(r => r.result === "WON").length;
    const total = resultStore.length;
    const avgPrice = wins > 0
      ? (resultStore.filter(r => r.result === "WON").reduce((s, r) => s + r.price, 0) / wins).toFixed(2)
      : 0;

    return res.status(200).json({
      results: resultStore.slice().reverse(),
      stats: {
        total,
        wins,
        winRate: total > 0 ? ((wins / total) * 100).toFixed(1) : 0,
        avgWinPrice: avgPrice,
        pcoTeoRecord: "3/3 (100%)",
        hgRuleRecord: "3/3 (100%)",
      }
    });
  }

  if (req.method === "POST") {
    const { date, track, race, pick, result, price, grade, notes } = req.body;
    if (!pick || !result) {
      return res.status(400).json({ error: "Pick and result required" });
    }
    const entry = {
      id: Date.now().toString(),
      date: date || new Date().toLocaleDateString(),
      track, race, pick, result,
      price: Number(price) || 0,
      grade, notes,
    };
    resultStore.push(entry);
    return res.status(200).json({ entry });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
