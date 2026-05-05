// api/flags.js
// Persistent bounce-back flag storage using Vercel KV
// If KV not configured, falls back to in-memory (flags reset on redeploy)

// Default flags validated from 5/2-5/3/2026
const DEFAULT_FLAGS = [
  { id: "1", horse: "Constitution Andi", race: "SA R11 5/2/26", trip: "Checked twice early, ran 3rd", flag: "RED", bonus: 8, date: "2026-05-02", active: true },
  { id: "2", horse: "Plagarist", race: "SA R11 5/2/26", trip: "4-wide entire trip, 6th", flag: "YELLOW", bonus: 5, date: "2026-05-02", active: true },
  { id: "3", horse: "Yacowlef (Ire)", race: "SA R2 5/2/26", trip: "3-wide turn, no rally", flag: "YELLOW", bonus: 3, date: "2026-05-02", active: true },
  { id: "4", horse: "Mizumi", race: "SA R1 5/2/26", trip: "WON 3-wide on debut", flag: "WIDE WIN", bonus: 10, date: "2026-05-02", active: true },
  { id: "5", horse: "Soul Sister", race: "SA R9 5/2/26", trip: "Checked 3/8 + 2-wide", flag: "RED", bonus: 6, date: "2026-05-02", active: true },
  { id: "6", horse: "Nerida (Fr)", race: "SA R9 5/2/26", trip: "Slow start + traffic 1/4 and 1/8", flag: "RED", bonus: 7, date: "2026-05-02", active: true },
  { id: "7", horse: "Meeking", race: "SA R4 5/2/26", trip: "Crowded + pulled + 2-4 wide", flag: "RED", bonus: 12, date: "2026-05-02", active: true },
  { id: "8", horse: "Miss Practical", race: "SA R5 5/2/26", trip: "Off slow + 3-deep + tight stretch", flag: "RED", bonus: 10, date: "2026-05-02", active: true },
  { id: "9", horse: "Redheaded Reba", race: "SA R6 5/2/26", trip: "Off slow + 3-wide, lost by short head", flag: "RED", bonus: 6, date: "2026-05-02", active: true },
  { id: "10", horse: "Novinophobia", race: "SA R4 5/2/26", trip: "Won 4-wide — WIDE WIN", flag: "WIDE WIN", bonus: 10, date: "2026-05-02", active: true },
  { id: "11", horse: "Lookin At Diamond", race: "SA R9 5/2/26", trip: "Won 3-4 wide — WIDE WIN", flag: "WIDE WIN", bonus: 10, date: "2026-05-02", active: true },
  { id: "12", horse: "Caves", race: "SA R7 5/3/26", trip: "D'Amato debut, missed — watch next", flag: "GREEN", bonus: 3, date: "2026-05-03", active: true },
  { id: "13", horse: "Cailin Dana", race: "SA R3 5/3/26", trip: "2nd in stakes — consistent grinder", flag: "YELLOW", bonus: 5, date: "2026-05-03", active: true },
  { id: "14", horse: "Resolve", race: "SA R3 5/3/26", trip: "4th — TMER B-entry confirmed", flag: "GREEN", bonus: 3, date: "2026-05-03", active: true },
];

// Simple in-memory store (persists during Vercel function warm state)
// For true persistence, connect Vercel KV: https://vercel.com/docs/storage/vercel-kv
let flagStore = [...DEFAULT_FLAGS];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET — return all active flags
  if (req.method === "GET") {
    const active = flagStore.filter(f => f.active);
    return res.status(200).json({ flags: active });
  }

  // POST — add new flag
  if (req.method === "POST") {
    const { horse, race, trip, flag, bonus, date } = req.body;
    if (!horse || !flag) {
      return res.status(400).json({ error: "Horse name and flag type required" });
    }
    const newFlag = {
      id: Date.now().toString(),
      horse, race, trip, flag,
      bonus: Number(bonus) || 0,
      date: date || new Date().toLocaleDateString(),
      active: true,
    };
    flagStore.push(newFlag);
    return res.status(200).json({ flag: newFlag, total: flagStore.filter(f => f.active).length });
  }

  // DELETE — deactivate a flag (horse ran, flag used)
  if (req.method === "DELETE") {
    const { id } = req.query;
    const flag = flagStore.find(f => f.id === id);
    if (!flag) return res.status(404).json({ error: "Flag not found" });
    flag.active = false;
    return res.status(200).json({ deactivated: id });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
