// api/pending.js — pending result queue (auto-fetched charts awaiting confirmation)

import { kv } from "@vercel/kv";

const PENDING_KEY = "ssm:pending";

async function loadPending() {
  try { return (await kv.get(PENDING_KEY)) || []; } catch { return []; }
}

async function savePending(items) {
  try { await kv.set(PENDING_KEY, items); } catch (e) { console.error("KV save error:", e); }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const items = await loadPending();
    return res.status(200).json({ pending: items });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id required" });
    const items   = await loadPending();
    const updated = items.filter(p => p.id !== id);
    await savePending(updated);
    return res.status(200).json({ remaining: updated.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
