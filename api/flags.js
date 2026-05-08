// api/flags.js
// Bounce-back flag storage.
// Uses Vercel KV when KV_REST_API_URL is set (persistent across deploys).
// Falls back to in-memory when KV is not configured.

import { kv } from "@vercel/kv";

const KV_KEY = "ssm:flags";

const DEFAULT_FLAGS = [
  { id: "1",  horse: "Constitution Andi", race: "SA R11 5/2/26", trip: "Checked twice early, ran 3rd",           flag: "RED",      bonus: 8,  date: "2026-05-02", active: true },
  { id: "2",  horse: "Plagarist",         race: "SA R11 5/2/26", trip: "4-wide entire trip, 6th",                flag: "YELLOW",   bonus: 5,  date: "2026-05-02", active: true },
  { id: "3",  horse: "Yacowlef (Ire)",    race: "SA R2 5/2/26",  trip: "3-wide turn, no rally",                  flag: "YELLOW",   bonus: 3,  date: "2026-05-02", active: true },
  { id: "4",  horse: "Mizumi",            race: "SA R1 5/2/26",  trip: "WON 3-wide on debut",                    flag: "WIDE WIN", bonus: 10, date: "2026-05-02", active: true },
  { id: "5",  horse: "Soul Sister",       race: "SA R9 5/2/26",  trip: "Checked 3/8 + 2-wide",                   flag: "RED",      bonus: 6,  date: "2026-05-02", active: true },
  { id: "6",  horse: "Nerida (Fr)",       race: "SA R9 5/2/26",  trip: "Slow start + traffic 1/4 and 1/8",       flag: "RED",      bonus: 7,  date: "2026-05-02", active: true },
  { id: "7",  horse: "Meeking",           race: "SA R4 5/2/26",  trip: "Crowded + pulled + 2-4 wide",            flag: "RED",      bonus: 12, date: "2026-05-02", active: true },
  { id: "8",  horse: "Miss Practical",    race: "SA R5 5/2/26",  trip: "Off slow + 3-deep + tight stretch",      flag: "RED",      bonus: 10, date: "2026-05-02", active: true },
  { id: "9",  horse: "Redheaded Reba",    race: "SA R6 5/2/26",  trip: "Off slow + 3-wide, lost by short head",  flag: "RED",      bonus: 6,  date: "2026-05-02", active: true },
  { id: "10", horse: "Novinophobia",      race: "SA R4 5/2/26",  trip: "Won 4-wide — WIDE WIN",                  flag: "WIDE WIN", bonus: 10, date: "2026-05-02", active: true },
  { id: "11", horse: "Lookin At Diamond", race: "SA R9 5/2/26",  trip: "Won 3-4 wide — WIDE WIN",                flag: "WIDE WIN", bonus: 10, date: "2026-05-02", active: true },
  { id: "12", horse: "Caves",             race: "SA R7 5/3/26",  trip: "D'Amato debut, missed — watch next",     flag: "GREEN",    bonus: 3,  date: "2026-05-03", active: true },
  { id: "13", horse: "Cailin Dana",       race: "SA R3 5/3/26",  trip: "2nd in stakes — consistent grinder",     flag: "YELLOW",   bonus: 5,  date: "2026-05-03", active: true },
  { id: "14", horse: "Resolve",           race: "SA R3 5/3/26",  trip: "4th — TMER B-entry confirmed",           flag: "GREEN",    bonus: 3,  date: "2026-05-03", active: true },
];

// In-memory fallback when KV is not configured
let _mem = null;

function hasKV() {
  return !!process.env.KV_REST_API_URL;
}

function getMemStore() {
  if (!_mem) _mem = DEFAULT_FLAGS.map(f => ({ ...f }));
  return _mem;
}

async function loadFlags() {
  if (hasKV()) {
    try {
      let flags = await kv.get(KV_KEY);
      if (!flags) {
        flags = DEFAULT_FLAGS.map(f => ({ ...f }));
        await kv.set(KV_KEY, flags);
      }
      return flags;
    } catch (e) {
      console.error("KV load error:", e);
    }
  }
  return getMemStore();
}

async function saveFlags(flags) {
  if (hasKV()) {
    try {
      await kv.set(KV_KEY, flags);
      return;
    } catch (e) {
      console.error("KV save error:", e);
    }
  }
  _mem = flags;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const flags = await loadFlags();
    return res.status(200).json({ flags: flags.filter(f => f.active), kv: hasKV() });
  }

  if (req.method === "POST") {
    const { horse, race, trip, flag, bonus, date } = req.body;
    if (!horse || !flag) return res.status(400).json({ error: "Horse name and flag type required" });
    const newFlag = {
      id: Date.now().toString(),
      horse, race: race || "", trip: trip || "", flag,
      bonus: Number(bonus) || 0,
      date: date || new Date().toLocaleDateString(),
      active: true,
    };
    const flags = await loadFlags();
    const updated = [...flags, newFlag];
    await saveFlags(updated);
    return res.status(200).json({ flag: newFlag, total: updated.filter(f => f.active).length });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    const flags = await loadFlags();
    const flag = flags.find(f => f.id === id);
    if (!flag) return res.status(404).json({ error: "Flag not found" });
    const updated = flags.map(f => f.id === id ? { ...f, active: false } : f);
    await saveFlags(updated);
    return res.status(200).json({ deactivated: id });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
