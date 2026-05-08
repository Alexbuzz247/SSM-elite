import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FLAG_META = {
  RED:      { color: "#f87171", bg: "rgba(248,113,113,0.08)", label: "RED" },
  YELLOW:   { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  label: "YELLOW" },
  GREEN:    { color: "#34d399", bg: "rgba(52,211,153,0.08)",  label: "GREEN" },
  "WIDE WIN": { color: "#a78bfa", bg: "rgba(167,139,250,0.08)", label: "WIDE WIN" },
};

const GRADE_COLOR = {
  "A+": "#16c784", A: "#16c784", "B+": "#60a5fa", B: "#60a5fa",
  "C+": "#fbbf24", C: "#fbbf24", D: "#f87171",
};

const SURFACES   = ["Dirt", "Turf", "Synthetic"];
const RACE_TYPES = [
  { value: "CLM", label: "CLM — Claiming" },
  { value: "MCL", label: "MCL — Maiden Claiming" },
  { value: "MSW", label: "MSW — Maiden Special Weight" },
  { value: "ALW", label: "ALW — Allowance" },
  { value: "OC",  label: "OC/AOC — Optional Claiming" },
  { value: "STK", label: "STK — Stakes" },
  { value: "G1",  label: "G1 — Grade 1" },
  { value: "G2",  label: "G2 — Grade 2" },
  { value: "G3",  label: "G3 — Grade 3" },
];

// ─── API ──────────────────────────────────────────────────────────────────────

const API = {
  upload: async (files) => {
    const r = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    if (!r.ok) {
      const text = await r.text();
      let msg = `Upload failed (${r.status})`;
      try { const j = JSON.parse(text); msg = j.error || j.message || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  },
  analyze: async (body) => {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json()).error || "Analysis failed");
    return r.json();
  },
  getFlags:   async () => { const r = await fetch("/api/flags"); return r.json(); },
  addFlag:    async (flag) => { const r = await fetch("/api/flags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(flag) }); return r.json(); },
  removeFlag: async (id) => { await fetch(`/api/flags?id=${id}`, { method: "DELETE" }); },
  getResults:     async () => { const r = await fetch("/api/results"); return r.json(); },
  addResult:      async (result) => { const r = await fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) }); return r.json(); },
  getPending:     async () => { const r = await fetch("/api/pending"); return r.json(); },
  dismissPending: async (id) => { await fetch(`/api/pending?id=${id}`, { method: "DELETE" }); },
  fetchToday:     async (track, date) => { const r = await fetch("/api/cron-fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track, date }) }); return r.json(); },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ─── SHARED STYLE ATOMS ───────────────────────────────────────────────────────

const INPUT  = "w-full bg-[#0c0c10] border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-white/[0.18] transition-colors placeholder:text-slate-700";
const LABEL  = "block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";
const CARD   = "bg-[#111115] border border-white/[0.06] rounded-xl p-5";
const SCARD  = "bg-[#111115] border border-white/[0.06] rounded-xl p-4";

function Ghost({ color = "green", disabled = false, onClick, children, className = "" }) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border cursor-pointer select-none";
  const variants = {
    green:  "border-[#16c784]/25 text-[#16c784] bg-[#16c784]/[0.08] hover:bg-[#16c784]/[0.15]",
    blue:   "border-blue-400/25 text-blue-400 bg-blue-400/[0.08] hover:bg-blue-400/[0.15]",
    red:    "border-red-400/25 text-red-400 bg-red-400/[0.08] hover:bg-red-400/[0.15]",
    amber:  "border-amber-400/25 text-amber-400 bg-amber-400/[0.08] hover:bg-amber-400/[0.15]",
    muted:  "border-white/[0.08] text-slate-400 bg-white/[0.03] hover:bg-white/[0.06]",
    purple: "border-purple-400/25 text-purple-400 bg-purple-400/[0.08] hover:bg-purple-400/[0.15]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(base, variants[color], disabled && "opacity-40 cursor-not-allowed pointer-events-none", className)}
    >
      {children}
    </button>
  );
}

// ─── PENDING CARD ─────────────────────────────────────────────────────────────

function PendingCard({ item, onConfirm, onDismiss }) {
  const [pick,   setPick]   = useState(item._pick || "");
  const [result, setResult] = useState(item._isWin ? "WON" : item._pick ? "MISS" : "WON");
  const [price,  setPrice]  = useState(item._isWin ? (item.winPayoff || "") : "");
  const [grade,  setGrade]  = useState(item._isWin ? "A" : item._pick ? "C" : "A");

  return (
    <div className="bg-[#111115] border border-white/[0.06] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-100">{item.track} {item.race}</span>
          <span className="text-[10px] text-slate-500">{item.date}</span>
          {item.distance && <span className="text-[10px] text-slate-600">{item.distance} {item.surface || ""}</span>}
        </div>
        <span className="text-[9px] text-slate-700 font-mono">{new Date(item.fetchedAt).toLocaleTimeString()}</span>
      </div>

      {/* Result data */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {[
          { label: "Winner",   value: item.winner,   hi: true },
          { label: "Win Pay",  value: item.winPayoff  ? `$${item.winPayoff}`  : null, hi: true },
          { label: "Exacta",   value: item.exactaPayoff   ? `$${item.exactaPayoff}`   : null },
          { label: "Trifecta", value: item.trifectaPayoff ? `$${item.trifectaPayoff}` : null },
        ].filter(f => f.value).map(f => (
          <div key={f.label} className="bg-[#0c0c10] rounded-lg px-3 py-2">
            <div className="text-[9px] text-slate-600 font-medium uppercase tracking-wide mb-0.5">{f.label}</div>
            <div className={cn("text-xs font-semibold", f.hi ? "text-[#16c784]" : "text-slate-300")}>{f.value}</div>
          </div>
        ))}
      </div>

      {/* Pick match status */}
      {item._pick && (
        <div className={cn(
          "mb-3 px-3 py-2 rounded-lg flex items-center gap-2 text-xs flex-wrap",
          item._isWin ? "bg-[#16c784]/[0.06] border border-[#16c784]/20" : "bg-red-400/[0.06] border border-red-400/20"
        )}>
          <span className={cn("font-bold", item._isWin ? "text-[#16c784]" : "text-red-400")}>
            {item._isWin ? "✓ Pick matched!" : "✗ Did not match"}
          </span>
          <span className="text-slate-500">Pick: {item._pick}</span>
        </div>
      )}

      {/* Editable fields */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div>
          <label className={LABEL}>Your Pick</label>
          <input value={pick} onChange={e => setPick(e.target.value)} placeholder="Horse name" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Result</label>
          <select value={result} onChange={e => setResult(e.target.value)} className={INPUT}>
            <option>WON</option><option>BOARD</option><option>MISS</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Win Price</label>
          <input value={price} onChange={e => setPrice(e.target.value)} placeholder={item.winPayoff || "0"} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Grade</label>
          <select value={grade} onChange={e => setGrade(e.target.value)} className={INPUT}>
            {["A+","A","B+","B","C+","C","D"].map(g => <option key={g}>{g}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Ghost color="green" disabled={!pick} onClick={() => onConfirm(item, { pick, result, price: Number(price) || 0, grade })}>
          ✓ Confirm & Log
        </Ghost>
        <Ghost color="muted" onClick={() => onDismiss(item.id)}>Dismiss</Ghost>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("analyze");

  // Race info
  const [raceInfo, setRaceInfo] = useState({
    track: "Santa Anita", raceNum: "", date: new Date().toLocaleDateString("en-US"),
    distance: "", surface: "Dirt", raceType: "CLM",
    purse: "", par: "", railFeet: "10", fieldSize: "",
  });
  const [horsesText, setHorsesText] = useState("");

  // Analysis
  const [analysis,  setAnalysis]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [showInput, setShowInput] = useState(true);

  // Flags
  const [flags,   setFlags]   = useState([]);
  const [newFlag, setNewFlag] = useState({ horse: "", race: "", trip: "", flag: "RED", bonus: 8 });

  // Results
  const [results,    setResults]    = useState([]);
  const [stats,      setStats]      = useState(null);
  const [newResult,  setNewResult]  = useState({ pick: "", result: "WON", price: "", grade: "A", notes: "", race: "", date: "" });
  const [logOpen,    setLogOpen]    = useState(false);
  const [resultsSubTab, setResultsSubTab] = useState("log");

  // Calibration
  const [calibration, setCalibration] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ssm_calibration") || "null"); } catch { return null; }
  });

  // Learn modal
  const [learnOpen,     setLearnOpen]     = useState(false);
  const [learnLoading,  setLearnLoading]  = useState(false);
  const [learnData,     setLearnData]     = useState(null);
  const [learnSelected, setLearnSelected] = useState([]);

  // Analytics (EDA)
  const [analyticsData,    setAnalyticsData]    = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError,   setAnalyticsError]   = useState("");

  // Pending queue
  const [pending,        setPending]        = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError,   setPendingError]   = useState("");
  const [fetchTrack,     setFetchTrack]     = useState("SA");
  const [fetchDate,      setFetchDate]      = useState(new Date().toLocaleDateString("en-US"));

  // DRF upload
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError,   setUploadError]   = useState("");
  const [uploadStatus,  setUploadStatus]  = useState("");
  const fileInputRef = useRef(null);

  // Result upload
  const [resultUploadLoading, setResultUploadLoading] = useState(false);
  const [resultUploadError,   setResultUploadError]   = useState("");
  const [resultUploadStatus,  setResultUploadStatus]  = useState("");
  const [parsedResult,  setParsedResult]  = useState(null);
  const [confirmResult, setConfirmResult] = useState(null);
  const resultFileInputRef = useRef(null);

  // Equibase chart fetch
  const [chartTrack,   setChartTrack]   = useState("SA");
  const [chartDate,    setChartDate]    = useState(new Date().toLocaleDateString("en-US"));
  const [chartRace,    setChartRace]    = useState("");
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError,   setChartError]   = useState("");
  const [chartUrl,     setChartUrl]     = useState("");

  useEffect(() => {
    API.getFlags().then(d => setFlags(d.flags || [])).catch(() => {});
    API.getResults().then(d => { setResults(d.results || []); setStats(d.stats); }).catch(() => {});
    API.getPending().then(d => setPending(d.pending || [])).catch(() => {});
  }, []);

  const flagsText = flags.map(f => `${f.horse} — ${f.flag} +${f.bonus}PP (${f.trip})`).join("\n");

  // ── Parse DRF upload result ──────────────────────────────────────────────────
  const parseUploadResult = useCallback((parsed) => {
    const infoMatch = parsed.match(/RACE_INFO:\s*([\s\S]*?)(?=\n\n#|\n#1 )/);
    let updatedRaceInfo = {};
    let horsesData = parsed;
    if (infoMatch) {
      const block = infoMatch[1];
      const get = (field) => {
        const m = block.match(new RegExp(`${field}:\\s*([^\n]+)`));
        const v = m?.[1]?.trim();
        return v && !/^n\/a$/i.test(v) ? v : "";
      };
      const surface  = get("Surface");
      const raceType = get("Race Type");
      updatedRaceInfo = {
        track:     get("Track"),
        raceNum:   get("Race").replace(/\D/g, ""),
        date:      get("Date"),
        distance:  get("Distance"),
        surface:   SURFACES.includes(surface) ? surface : "",
        raceType:  RACE_TYPES.some(t => t.value === raceType) ? raceType : "",
        purse:     get("Purse").replace(/\D/g, ""),
        fieldSize: get("Field Size"),
      };
      horsesData = parsed.replace(/RACE_INFO:[\s\S]*?\n\n(?=#)/, "").trim();
    }
    return { updatedRaceInfo, horsesData };
  }, []);

  const pdfPageToBase64 = useCallback(async (page) => {
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
  }, []);

  const compressImage = useCallback((file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_W = 1600;
      let { width: w, height: h } = img;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = reject;
    img.src = url;
  }), []);

  // ── DRF Upload ───────────────────────────────────────────────────────────────
  const uploadDRF = useCallback(async (fileList) => {
    setUploadLoading(true); setUploadError(""); setUploadStatus("");
    try {
      const files    = Array.from(fileList);
      const allParsed = [];
      const pdfs     = files.filter(f => f.type === "application/pdf");
      const images   = files.filter(f => f.type.startsWith("image/"));
      const texts    = files.filter(f => !f.type.startsWith("image/") && f.type !== "application/pdf");

      if (images.length > 0) {
        const compressed = [];
        for (let i = 0; i < images.length; i++) {
          if (images[i].size > 20 * 1024 * 1024) { setUploadError("File too large (max 20MB)."); return; }
          setUploadStatus(images.length > 1 ? `Compressing ${i + 1}/${images.length}…` : "Compressing…");
          compressed.push({ fileData: await compressImage(images[i]), fileType: "image/jpeg" });
        }
        setUploadStatus(images.length > 1 ? `Parsing ${images.length} images…` : "Parsing…");
        const { parsed } = await API.upload(compressed);
        if (parsed.trim()) allParsed.push(parsed.trim());
      }

      for (const pdf of pdfs) {
        const doc   = await pdfjsLib.getDocument({ data: await pdf.arrayBuffer() }).promise;
        const pages = [];
        for (let i = 1; i <= doc.numPages; i++) {
          setUploadStatus(`Rendering PDF page ${i}/${doc.numPages}…`);
          pages.push({ fileData: await pdfPageToBase64(await doc.getPage(i)), fileType: "image/jpeg" });
        }
        setUploadStatus("Parsing PDF…");
        const { parsed } = await API.upload(pages);
        if (parsed.trim()) allParsed.push(parsed.trim());
      }

      for (const tf of texts) {
        const { parsed } = await API.upload([{ fileData: btoa(unescape(encodeURIComponent(await tf.text()))), fileType: "text/plain" }]);
        if (parsed.trim()) allParsed.push(parsed.trim());
      }

      if (allParsed.length > 0) {
        const { updatedRaceInfo, horsesData } = parseUploadResult(allParsed.join("\n\n"));
        setRaceInfo(prev => ({ ...prev, ...Object.fromEntries(Object.entries(updatedRaceInfo).filter(([, v]) => v)) }));
        setHorsesText(horsesData);
      }
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploadLoading(false); setUploadStatus("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [parseUploadResult, pdfPageToBase64, compressImage]);

  // ── Run analysis ─────────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    if (!horsesText.trim()) { setError("Please enter horse/PP data."); return; }
    setLoading(true); setError(""); setAnalysis(""); setShowInput(false);
    try {
      const { analysis: text } = await API.analyze({ raceInfo, horsesText, flags: flagsText, calibration });
      setAnalysis(text);
    } catch (e) {
      setError(e.message); setShowInput(true);
    } finally {
      setLoading(false);
    }
  };

  // ── Review & Learn ───────────────────────────────────────────────────────────
  const runLearn = async () => {
    setLearnLoading(true); setLearnData(null);
    try {
      const r = await fetch("/api/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ results }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Learn failed");
      setLearnData(data.calibration);
      setLearnSelected((data.calibration.adjustments || []).map((_, i) => i));
      setLearnOpen(true);
    } catch (e) { alert(e.message); }
    finally { setLearnLoading(false); }
  };

  const applyCalibration = () => {
    const selected = (learnData.adjustments || []).filter((_, i) => learnSelected.includes(i));
    const cal = { appliedAt: new Date().toLocaleDateString(), races: results.length, summary: learnData.summary, adjustments: selected };
    setCalibration(cal);
    localStorage.setItem("ssm_calibration", JSON.stringify(cal));
    setLearnOpen(false);
  };

  const clearCalibration = () => { setCalibration(null); localStorage.removeItem("ssm_calibration"); };

  // ── NIST EDA Analytics ────────────────────────────────────────────────────────
  const runAnalytics = async () => {
    setAnalyticsLoading(true); setAnalyticsError("");
    try {
      const r = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: results.slice().reverse() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Analytics failed");
      setAnalyticsData(data);
    } catch (e) {
      setAnalyticsError(e.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // ── Pending queue ─────────────────────────────────────────────────────────────
  const fetchToday = async () => {
    if (!fetchTrack || !fetchDate) return;
    setPendingLoading(true); setPendingError("");
    try {
      const data = await API.fetchToday(fetchTrack, fetchDate);
      if (data.error) throw new Error(data.error);
      // Reload the pending list from KV
      const fresh = await API.getPending();
      setPending(fresh.pending || []);
    } catch (e) {
      setPendingError(e.message);
    } finally {
      setPendingLoading(false);
    }
  };

  const dismissPending = async (id) => {
    await API.dismissPending(id);
    setPending(p => p.filter(x => x.id !== id));
  };

  const confirmPending = async (item, overrides = {}) => {
    const myPick = overrides.pick !== undefined ? overrides.pick : item._pick || "";
    const isWin  = myPick && item.winner && myPick.toLowerCase().trim() === item.winner.toLowerCase().trim();
    const entry  = {
      date:   item.date  || fetchDate,
      track:  item.track || fetchTrack,
      race:   item.race  || "",
      pick:   myPick,
      result: overrides.result || (isWin ? "WON" : myPick ? "MISS" : "WON"),
      price:  overrides.price  !== undefined ? overrides.price : isWin ? (item.winPayoff || 0) : 0,
      grade:  overrides.grade  || (isWin ? "A" : myPick ? "C" : "A"),
      notes:  [
        item.winner    ? `Winner: ${item.winner}`            : "",
        item.winPayoff ? `Win: $${item.winPayoff}`           : "",
        item.exactaPayoff   ? `Exacta: $${item.exactaPayoff}`   : "",
        item.trifectaPayoff ? `Tri: $${item.trifectaPayoff}`    : "",
      ].filter(Boolean).join(" · "),
    };
    const { entry: saved } = await API.addResult(entry);
    setResults(r => [saved, ...r]);
    await API.dismissPending(item.id);
    setPending(p => p.filter(x => x.id !== item.id));
  };

  // ── Upload result screenshot ─────────────────────────────────────────────────
  const uploadResultFiles = async (fileList) => {
    setResultUploadLoading(true); setResultUploadError(""); setResultUploadStatus(""); setParsedResult(null); setConfirmResult(null);
    try {
      const files = Array.from(fileList);
      const compressed = [];
      for (let i = 0; i < files.length; i++) {
        setResultUploadStatus(files.length > 1 ? `Compressing ${i + 1}/${files.length}…` : "Compressing…");
        compressed.push({ fileData: await compressImage(files[i]), fileType: "image/jpeg" });
      }
      setResultUploadStatus("Reading results…");
      const r = await fetch("/api/parse-results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: compressed }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Parse failed");
      const parsed = data.result;
      const match  = results.find(res => res.race?.toLowerCase() === parsed.race?.toLowerCase() && (res.date === parsed.date || !parsed.date));
      const myPick = match?.pick || "";
      const isWin  = myPick && parsed.winner && myPick.toLowerCase().trim() === parsed.winner.toLowerCase().trim();
      setParsedResult(parsed);
      setConfirmResult({
        race: parsed.race || "", date: parsed.date || new Date().toLocaleDateString(),
        pick: myPick, result: isWin ? "WON" : myPick ? "MISS" : "WON",
        price: isWin ? (parsed.winPayoff || "") : "",
        grade: isWin ? "A" : myPick ? "C" : "A",
        notes: [
          parsed.winner     ? `Winner: ${parsed.winner}`       : "",
          parsed.winPayoff  ? `Win: $${parsed.winPayoff}`       : "",
          parsed.exactaPayoff ? `Exacta: $${parsed.exactaPayoff}` : "",
          parsed.trifectaPayoff ? `Tri: $${parsed.trifectaPayoff}` : "",
        ].filter(Boolean).join(" · "),
      });
    } catch (e) {
      setResultUploadError(e.message);
    } finally {
      setResultUploadLoading(false); setResultUploadStatus("");
      if (resultFileInputRef.current) resultFileInputRef.current.value = "";
    }
  };

  const fetchChart = async () => {
    if (!chartTrack || !chartDate || !chartRace) { setChartError("Enter track, date, and race number."); return; }
    setChartLoading(true); setChartError(""); setChartUrl(""); setParsedResult(null); setConfirmResult(null);
    try {
      const r = await fetch("/api/fetch-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: chartTrack, date: chartDate, race: chartRace }),
      });
      const data = await r.json();
      if (!r.ok) { setChartError(data.error || "Fetch failed"); return; }
      setChartUrl(data.chartUrl || "");
      const parsed = data.result;
      const match = results.find(res =>
        res.race?.toLowerCase() === parsed.race?.toLowerCase() && (res.date === parsed.date || !parsed.date)
      );
      const myPick = match?.pick || "";
      const isWin  = myPick && parsed.winner && myPick.toLowerCase().trim() === parsed.winner.toLowerCase().trim();
      setParsedResult(parsed);
      setConfirmResult({
        race: parsed.race || "", date: parsed.date || chartDate,
        pick: myPick, result: isWin ? "WON" : myPick ? "MISS" : "WON",
        price: isWin ? (parsed.winPayoff || "") : "",
        grade: isWin ? "A" : myPick ? "C" : "A",
        notes: [
          parsed.winner     ? `Winner: ${parsed.winner}`           : "",
          parsed.winPayoff  ? `Win: $${parsed.winPayoff}`          : "",
          parsed.exactaPayoff   ? `Exacta: $${parsed.exactaPayoff}`    : "",
          parsed.trifectaPayoff ? `Tri: $${parsed.trifectaPayoff}`     : "",
        ].filter(Boolean).join(" · "),
      });
    } catch (e) {
      setChartError(e.message);
    } finally {
      setChartLoading(false);
    }
  };

  const saveConfirmedResult = async () => {
    if (!confirmResult?.pick) return;
    const { entry } = await API.addResult({ ...confirmResult, track: parsedResult?.track || raceInfo.track });
    setResults(r => [entry, ...r]);
    setParsedResult(null); setConfirmResult(null); setResultsSubTab("log");
  };

  const addFlag = async () => {
    if (!newFlag.horse) return;
    const { flag } = await API.addFlag(newFlag);
    setFlags(f => [...f, flag]);
    setNewFlag({ horse: "", race: "", trip: "", flag: "RED", bonus: 8 });
  };

  const removeFlag = async (id) => { await API.removeFlag(id); setFlags(f => f.filter(x => x.id !== id)); };

  const addResult = async () => {
    if (!newResult.pick) return;
    const { entry } = await API.addResult({ ...newResult, track: raceInfo.track, date: raceInfo.date || newResult.date });
    setResults(r => [entry, ...r]);
    setLogOpen(false);
    setNewResult({ pick: "", result: "WON", price: "", grade: "A", notes: "", race: "", date: "" });
  };

  // ── Parse analysis sections ──────────────────────────────────────────────────
  const parseSection = (text, header) => {
    const re = new RegExp(`##\\s*${header}[^\n]*\\n([\\s\\S]*?)(?=##|$)`, "i");
    return text.match(re)?.[1]?.trim() || "";
  };

  const winLine     = analysis.match(/WIN:\s*([^\n]+)/)?.[1]?.trim();
  const placeLine   = analysis.match(/PLACE:\s*([^\n]+)/)?.[1]?.trim();
  const showLine    = analysis.match(/SHOW:\s*([^\n]+)/)?.[1]?.trim();
  const ticketSec   = parseSection(analysis, "Ticket Structure");
  const flagsSec    = parseSection(analysis, "Active Flags");

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-300">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#16c784] to-[#0ea563] flex items-center justify-center font-black text-[15px] text-white shrink-0 shadow-lg shadow-[#16c784]/20">
              S
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-bold text-slate-100 tracking-tight">SSM Elite</span>
                <span className="text-[10px] font-semibold text-[#16c784] bg-[#16c784]/[0.1] border border-[#16c784]/20 px-2 py-0.5 rounded">v3.3</span>
                {calibration && (
                  <span className="text-[10px] font-semibold text-blue-400 bg-blue-400/[0.1] border border-blue-400/20 px-2 py-0.5 rounded">
                    Calibrated
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5 tracking-wide">
                Race Analyzer · SA 5/3/2026 · PCO+TEO 3/3
              </div>
            </div>
          </div>

          {stats && (
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "Win Rate",  value: `${stats.winRate}%`,        hi: true  },
                { label: "Avg Price", value: `$${stats.avgWinPrice}`,    hi: true  },
                { label: "Races",     value: String(stats.total),        hi: false },
              ].map(s => (
                <div key={s.label} className="text-center bg-[#111115] border border-white/[0.06] rounded-lg px-4 py-2.5 min-w-[68px]">
                  <div className={cn("text-base font-bold tracking-tight", s.hi ? "text-[#16c784]" : "text-slate-400")}>
                    {s.value}
                  </div>
                  <div className="text-[9px] text-slate-600 font-medium mt-0.5 uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── NAV TABS ── */}
        <div className="border-b border-white/[0.06]">
          <div className="flex">
            {[
              { id: "analyze",   label: "Analyze" },
              { id: "flags",     label: flags.length ? `Flags (${flags.length})` : "Flags" },
              { id: "results",   label: "Results" },
              { id: "analytics", label: "Analytics" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.id
                    ? "border-[#16c784] text-slate-100"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:border-white/20"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            ANALYZE TAB
        ══════════════════════════════════════════════════════════════ */}
        {tab === "analyze" && (
          <div className="space-y-4">

            {showInput ? (
              <>
                {/* Race Info */}
                <div className={CARD}>
                  <div className={LABEL}>Race Information</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[
                      { key: "track",     label: "Track",      ph: "Santa Anita" },
                      { key: "raceNum",   label: "Race #",     ph: "9" },
                      { key: "date",      label: "Date",       ph: "5/8/2026" },
                      { key: "distance",  label: "Distance",   ph: "1⅛M / 9f" },
                      { key: "purse",     label: "Purse ($)",  ph: "37000" },
                      { key: "par",       label: "Beyer Par",  ph: "84 or NA" },
                      { key: "railFeet",  label: "Rail (ft)",  ph: "10" },
                      { key: "fieldSize", label: "Field Size", ph: "8" },
                    ].map(f => (
                      <div key={f.key}>
                        <label className={LABEL}>{f.label}</label>
                        <input
                          value={raceInfo[f.key]}
                          onChange={e => setRaceInfo(p => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.ph}
                          className={INPUT}
                        />
                      </div>
                    ))}
                    <div>
                      <label className={LABEL}>Surface</label>
                      <select value={raceInfo.surface} onChange={e => setRaceInfo(p => ({ ...p, surface: e.target.value }))} className={INPUT}>
                        {SURFACES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Race Type</label>
                      <select value={raceInfo.raceType} onChange={e => setRaceInfo(p => ({ ...p, raceType: e.target.value }))} className={INPUT}>
                        {RACE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Active flags strip */}
                {flags.length > 0 && (
                  <div className="bg-red-400/[0.03] border border-red-400/[0.14] rounded-xl px-5 py-4">
                    <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-3">
                      {flags.length} Active Bounce-Back Flags
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {flags.map(f => {
                        const fc = FLAG_META[f.flag] || FLAG_META.GREEN;
                        return (
                          <span key={f.id} className="text-[10px] font-medium px-2.5 py-1 rounded-md"
                            style={{ background: fc.bg, color: fc.color, border: `1px solid ${fc.color}30` }}>
                            {f.horse} +{f.bonus}PP
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Horse / PP Data */}
                <div className={CARD}>
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div className={LABEL}>Horse / PP Data</div>
                    <div className="flex items-center gap-2">
                      {uploadLoading && (
                        <span className="text-[10px] text-blue-400 font-medium animate-pulse">{uploadStatus || "Parsing…"}</span>
                      )}
                      <label className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border cursor-pointer select-none",
                        "border-blue-400/25 text-blue-400 bg-blue-400/[0.08] hover:bg-blue-400/[0.15]",
                        uploadLoading && "opacity-40 cursor-not-allowed pointer-events-none"
                      )}>
                        ↑ Upload Data Sheet
                        <input ref={fileInputRef} type="file" accept=".pdf,image/*,.txt,.csv" className="hidden" multiple
                          disabled={uploadLoading}
                          onChange={e => { if (e.target.files?.length) uploadDRF(e.target.files); }} />
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                    Upload DRF screenshots, PDFs, or paste raw PP data below. Multiple images OK — all sent in one call.
                  </p>
                  {uploadError && (
                    <div className="bg-red-400/[0.07] border border-red-400/20 rounded-lg px-3 py-2.5 text-xs text-red-400 mb-3">
                      {uploadError}
                    </div>
                  )}
                  <textarea
                    value={horsesText}
                    onChange={e => setHorsesText(e.target.value)}
                    placeholder={`#1 Lord Bullingdon — Trainer: McCarthy M, Jockey: Kimura K\nBest Beyers: 95, 86, 82, 80\nLast race: Won going away, no trip issues\nWorks: Apr29 SA 5f :482 H\n\n#2 Pioneer Prince — Trainer: O'Neill D, Jockey: Maldonado\n...`}
                    className={cn(INPUT, "min-h-[240px] resize-y leading-relaxed font-mono text-xs")}
                  />
                </div>

                {error && (
                  <div className="bg-red-400/[0.07] border border-red-400/20 rounded-xl px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <button
                  onClick={runAnalysis}
                  className="w-full py-3.5 text-sm font-bold text-white bg-gradient-to-r from-[#16c784] to-[#0ea563] rounded-xl shadow-lg shadow-[#16c784]/15 hover:shadow-[#16c784]/25 transition-shadow"
                >
                  ▶ Run SSM Elite Analysis
                </button>
              </>
            ) : (
              <>
                {/* Loading */}
                {loading && (
                  <div className={cn(CARD, "text-center py-16")}>
                    <div className="w-11 h-11 rounded-xl bg-[#16c784]/[0.1] border border-[#16c784]/20 flex items-center justify-center mx-auto mb-5 text-xl">
                      ⚡
                    </div>
                    <div className="text-base font-semibold text-slate-100 mb-2">Running SSM Elite v3.3</div>
                    <div className="text-xs text-slate-600 mb-6 font-mono tracking-wide">
                      RTD → TMER → SMD → THM → TJI → ARI → FPAD
                    </div>
                    <div className="h-[2px] bg-white/[0.05] rounded-full overflow-hidden max-w-[240px] mx-auto">
                      <div className="h-full w-2/5 bg-gradient-to-r from-[#16c784] to-blue-400 rounded-full animate-slide" />
                    </div>
                  </div>
                )}

                {/* Analysis output */}
                {!loading && analysis && (
                  <>
                    {/* WIN / PLACE / SHOW cards */}
                    {(winLine || placeLine || showLine) && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { label: "WIN",   value: winLine,   color: "#16c784", topClass: "border-t-[#16c784]" },
                          { label: "PLACE", value: placeLine, color: "#60a5fa", topClass: "border-t-blue-400" },
                          { label: "SHOW",  value: showLine,  color: "#f59e0b", topClass: "border-t-amber-500" },
                        ].filter(x => x.value).map(x => (
                          <div key={x.label} className={cn("bg-[#111115] border border-white/[0.06] border-t-2 rounded-xl p-4", x.topClass)}>
                            <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">{x.label}</div>
                            <div className="text-sm text-slate-100 font-medium leading-relaxed">{x.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ticket structure */}
                    {ticketSec && (
                      <div className="bg-amber-500/[0.04] border border-amber-500/[0.14] rounded-xl px-5 py-4">
                        <div className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-3">Ticket Structure</div>
                        <pre className="text-xs text-slate-300 font-mono leading-7 whitespace-pre-wrap">{ticketSec}</pre>
                      </div>
                    )}

                    {/* Full pipeline analysis */}
                    <div className={CARD}>
                      <div className={LABEL}>Full Pipeline Analysis</div>
                      <div className="font-mono text-xs leading-[1.7]">
                        {analysis.split("\n").map((line, i) => {
                          const isH      = line.startsWith("##");
                          const isWin    = /^WIN:|^PLACE:|^SHOW:|^UNDERNEATH:|^ELIMINATE:/.test(line);
                          const isKill   = /eliminat|kill|fpad kill/i.test(line) && !isH;
                          const isImmune = /immune|pco\+teo/i.test(line)         && !isH;
                          const isAlert  = /alert|confirmed|validated/i.test(line) && !isH;
                          return (
                            <div key={i} className={cn(
                              isH      && "text-[#16c784] font-bold border-b border-white/[0.05] pb-1 mt-5 mb-2 text-[11px] tracking-wide",
                              isWin    && !isH && "text-slate-100 font-semibold",
                              isKill   && "text-red-400",
                              isImmune && "text-amber-400",
                              isAlert  && "text-amber-300",
                              !isH && !isWin && !isKill && !isImmune && !isAlert && "text-slate-400",
                            )}>
                              {line || " "}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* New flags generated */}
                    {flagsSec && (
                      <div className="bg-amber-400/[0.04] border border-amber-400/[0.14] rounded-xl px-5 py-4">
                        <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-3">New Flags Generated</div>
                        <pre className="text-xs text-slate-300 font-mono leading-7 whitespace-pre-wrap">{flagsSec}</pre>
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex flex-wrap gap-2">
                      <Ghost color="green"  onClick={() => { setShowInput(true); setAnalysis(""); }}>← New Race</Ghost>
                      <Ghost color="blue"   onClick={() => navigator.clipboard?.writeText(analysis)}>Copy Analysis</Ghost>
                      <Ghost color="amber"  onClick={() => setLogOpen(true)}>+ Log Result</Ghost>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            FLAGS TAB
        ══════════════════════════════════════════════════════════════ */}
        {tab === "flags" && (
          <div className="space-y-4">

            {/* Add flag form */}
            <div className={CARD}>
              <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-4">Add New Flag</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                {[
                  { key: "horse", label: "Horse Name", ph: "Tulavia's World" },
                  { key: "race",  label: "Race",       ph: "SA R7 5/3/26" },
                  { key: "trip",  label: "Trip Notes", ph: "4-wide entire trip" },
                  { key: "bonus", label: "PP Bonus",   ph: "8" },
                ].map(f => (
                  <div key={f.key}>
                    <label className={LABEL}>{f.label}</label>
                    <input value={newFlag[f.key]} onChange={e => setNewFlag(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.ph} className={INPUT} />
                  </div>
                ))}
                <div>
                  <label className={LABEL}>Flag Type</label>
                  <select value={newFlag.flag} onChange={e => setNewFlag(p => ({ ...p, flag: e.target.value }))} className={INPUT}>
                    {["RED", "YELLOW", "GREEN", "WIDE WIN"].map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <Ghost color="red" onClick={addFlag}>+ Add Flag</Ghost>
            </div>

            {/* Flag list */}
            <div className={CARD}>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Active Flags ({flags.length})
              </div>
              {flags.length === 0 ? (
                <div className="text-sm text-slate-600 py-8 text-center">No active flags</div>
              ) : (
                <div className="space-y-2">
                  {flags.map(f => {
                    const fc = FLAG_META[f.flag] || FLAG_META.GREEN;
                    return (
                      <div key={f.id} className="flex items-start justify-between gap-3 rounded-lg px-4 py-3"
                        style={{ background: fc.bg, border: `1px solid ${fc.color}25`, borderLeft: `3px solid ${fc.color}` }}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-bold text-white">{f.horse}</span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
                              style={{ color: fc.color, background: `${fc.color}20` }}>
                              {fc.label} +{f.bonus}PP
                            </span>
                            {f.race && <span className="text-[10px] text-slate-500">{f.race}</span>}
                          </div>
                          {f.trip && <div className="text-xs text-slate-400 leading-relaxed">{f.trip}</div>}
                        </div>
                        <button onClick={() => removeFlag(f.id)}
                          className="text-slate-600 hover:text-slate-300 text-xl leading-none shrink-0 transition-colors">
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            RESULTS TAB
        ══════════════════════════════════════════════════════════════ */}
        {tab === "results" && (
          <div className="space-y-4">

            {/* Stats grid */}
            {stats && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[
                  { label: "Win Rate",  value: `${stats.winRate}%`,     color: "#16c784" },
                  { label: "Avg Win",   value: `$${stats.avgWinPrice}`, color: "#16c784" },
                  { label: "PCO+TEO",   value: stats.pcoTeoRecord,      color: "#f87171" },
                  { label: "Hg Rule",   value: stats.hgRuleRecord,      color: "#60a5fa" },
                  { label: "Total",     value: stats.total,             color: "#64748b" },
                  { label: "Wins",      value: stats.wins,              color: "#16c784" },
                ].map(s => (
                  <div key={s.label} className={cn(SCARD, "text-center")}>
                    <div className="text-xl font-bold tracking-tight mb-1" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] text-slate-600 font-medium uppercase tracking-wider">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Sub-nav */}
            <div className="flex gap-1 bg-[#111115] border border-white/[0.06] rounded-xl p-1">
              {[
                { id: "log",     label: "Race Log" },
                { id: "pending", label: pending.length ? `Pending (${pending.length})` : "Pending" },
                { id: "upload",  label: "↑ Upload" },
              ].map(t => (
                <button key={t.id}
                  onClick={() => { setResultsSubTab(t.id); setParsedResult(null); setConfirmResult(null); setResultUploadError(""); }}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold rounded-lg transition-colors",
                    resultsSubTab === t.id ? "bg-[#1a1a22] text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-300",
                    t.id === "pending" && pending.length > 0 && resultsSubTab !== "pending" ? "text-amber-400" : ""
                  )}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── PENDING QUEUE ── */}
            {resultsSubTab === "pending" && (
              <div className="space-y-4">
                {/* Manual fetch controls */}
                <div className={CARD}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={LABEL}>Auto-Fetch Today's Charts</div>
                    <span className="text-[9px] font-semibold text-amber-400 bg-amber-400/[0.08] border border-amber-400/20 px-2 py-0.5 rounded -mt-1.5">Cron 7:30 PM PT</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Automatically fetches all result charts for a given track and date. The cron runs daily at 7:30 PM PT — or trigger manually here.
                  </p>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex flex-col gap-1.5">
                      <label className={LABEL}>Track</label>
                      <input value={fetchTrack} onChange={e => setFetchTrack(e.target.value.toUpperCase())}
                        placeholder="SA" maxLength={4}
                        className={cn(INPUT, "w-16 uppercase")} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={LABEL}>Date</label>
                      <input value={fetchDate} onChange={e => setFetchDate(e.target.value)}
                        placeholder="5/8/2026"
                        className={cn(INPUT, "w-28")} />
                    </div>
                    <Ghost color="amber" disabled={pendingLoading || !fetchTrack || !fetchDate} onClick={fetchToday}>
                      {pendingLoading ? "⟳ Fetching…" : "⚡ Fetch All Races"}
                    </Ghost>
                  </div>
                  {pendingError && (
                    <div className="mt-3 bg-red-400/[0.07] border border-red-400/20 rounded-lg px-3 py-2.5 text-xs text-red-400 leading-relaxed">
                      {pendingError}
                    </div>
                  )}
                </div>

                {/* Pending items */}
                {pending.length === 0 ? (
                  <div className="text-sm text-slate-600 py-10 text-center">
                    No pending results — cron will fetch at 7:30 PM PT, or trigger manually above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...pending].reverse().map(item => {
                      const myPick = results.find(r =>
                        r.race?.toLowerCase() === item.race?.toLowerCase() &&
                        (r.date === item.date || !item.date)
                      )?.pick || "";
                      const isWin = myPick && item.winner &&
                        myPick.toLowerCase().trim() === item.winner.toLowerCase().trim();
                      return (
                        <PendingCard
                          key={item.id}
                          item={{ ...item, _pick: myPick, _isWin: isWin }}
                          onConfirm={confirmPending}
                          onDismiss={dismissPending}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── UPLOAD RESULT ── */}
            {resultsSubTab === "upload" && (
              <div className="space-y-4">
                <div className={CARD}>
                  <div className={LABEL}>Upload Race Result Screenshot</div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Screenshot any result (Equibase, DRF, track app). Claude extracts the winner and payoffs and auto-matches your pick from the log.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border cursor-pointer select-none",
                      "border-[#16c784]/25 text-[#16c784] bg-[#16c784]/[0.08] hover:bg-[#16c784]/[0.15]",
                      resultUploadLoading && "opacity-40 cursor-not-allowed pointer-events-none"
                    )}>
                      {resultUploadLoading ? `⟳ ${resultUploadStatus || "Processing…"}` : "↑ Upload Result Image"}
                      <input ref={resultFileInputRef} type="file" accept="image/*" multiple className="hidden"
                        disabled={resultUploadLoading}
                        onChange={e => { if (e.target.files?.length) uploadResultFiles(e.target.files); }} />
                    </label>
                    <span className="text-[10px] text-slate-600">JPG, PNG, multiple OK</span>
                  </div>
                  {resultUploadError && (
                    <div className="mt-3 bg-red-400/[0.07] border border-red-400/20 rounded-lg px-3 py-2.5 text-xs text-red-400">
                      {resultUploadError}
                    </div>
                  )}
                </div>

                {/* Equibase Auto-Fetch */}
                <div className={CARD}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={LABEL}>Fetch from Equibase</div>
                    <span className="text-[9px] font-semibold text-[#16c784] bg-[#16c784]/[0.08] border border-[#16c784]/20 px-2 py-0.5 rounded -mt-1.5">Auto</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Pulls the official result chart directly from Equibase — no screenshot needed. Charts post ~40 min after the race.
                  </p>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex flex-col gap-1.5">
                      <label className={LABEL}>Track</label>
                      <input value={chartTrack} onChange={e => setChartTrack(e.target.value.toUpperCase())}
                        placeholder="SA" maxLength={4}
                        className={cn(INPUT, "w-16 uppercase")} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={LABEL}>Date</label>
                      <input value={chartDate} onChange={e => setChartDate(e.target.value)}
                        placeholder="5/8/2026"
                        className={cn(INPUT, "w-28")} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={LABEL}>Race #</label>
                      <input value={chartRace} onChange={e => setChartRace(e.target.value.replace(/\D/g, ""))}
                        placeholder="1"
                        className={cn(INPUT, "w-16")} />
                    </div>
                    <Ghost color="green" disabled={chartLoading || !chartTrack || !chartDate || !chartRace}
                      onClick={fetchChart}
                      className="mb-0.5">
                      {chartLoading ? "⟳ Fetching…" : "⚡ Fetch Chart"}
                    </Ghost>
                  </div>
                  {chartUrl && !chartError && (
                    <div className="mt-3 text-[10px] text-slate-600 font-mono truncate">
                      {chartUrl}
                    </div>
                  )}
                  {chartError && (
                    <div className="mt-3 bg-red-400/[0.07] border border-red-400/20 rounded-lg px-3 py-2.5 text-xs text-red-400 leading-relaxed">
                      {chartError}
                    </div>
                  )}
                </div>

                {parsedResult && (
                  <div className="bg-[#16c784]/[0.03] border border-[#16c784]/[0.14] rounded-xl p-5">
                    <div className={LABEL}>Parsed Result</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      {[
                        { label: "Track",    value: parsedResult.track },
                        { label: "Race",     value: parsedResult.race },
                        { label: "Date",     value: parsedResult.date },
                        { label: "Distance", value: `${parsedResult.distance || ""} ${parsedResult.surface || ""}`.trim() },
                        { label: "Winner",   value: parsedResult.winner,   hi: true },
                        { label: "Place",    value: parsedResult.place },
                        { label: "Show",     value: parsedResult.show },
                        { label: "Win Payoff",  value: parsedResult.winPayoff   ? `$${parsedResult.winPayoff}`   : null, hi: true },
                        { label: "Exacta",      value: parsedResult.exactaPayoff   ? `$${parsedResult.exactaPayoff}`   : null },
                        { label: "Trifecta",    value: parsedResult.trifectaPayoff ? `$${parsedResult.trifectaPayoff}` : null },
                      ].filter(f => f.value).map(f => (
                        <div key={f.label} className="bg-[#0c0c10] rounded-lg px-3 py-2.5">
                          <div className="text-[9px] text-slate-600 font-medium uppercase tracking-wide mb-1">{f.label}</div>
                          <div className={cn("text-sm font-semibold", f.hi ? "text-[#16c784]" : "text-slate-200")}>{f.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {confirmResult && (
                  <div className="bg-blue-400/[0.03] border border-blue-400/[0.14] rounded-xl p-5">
                    <div className={LABEL}>Confirm & Log Your Pick</div>
                    {confirmResult.pick && (
                      <div className={cn(
                        "mb-4 px-4 py-3 rounded-lg flex items-center gap-3 flex-wrap text-sm",
                        confirmResult.result === "WON"
                          ? "bg-[#16c784]/[0.07] border border-[#16c784]/20"
                          : "bg-red-400/[0.07] border border-red-400/20"
                      )}>
                        <span className={cn("font-bold", confirmResult.result === "WON" ? "text-[#16c784]" : "text-red-400")}>
                          {confirmResult.result === "WON" ? "✓ Pick matched!" : "✗ Did not match"}
                        </span>
                        <span className="text-xs text-slate-500">
                          Pick: {confirmResult.pick} · Winner: {parsedResult?.winner}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      {[
                        { key: "race",  label: "Race",          ph: "R5" },
                        { key: "date",  label: "Date",          ph: "5/8/2026" },
                        { key: "pick",  label: "Your Pick",     ph: "Horse name" },
                        { key: "price", label: "Win Price",     ph: "8.40" },
                        { key: "notes", label: "Notes",         ph: "Auto-filled" },
                      ].map(f => (
                        <div key={f.key}>
                          <label className={LABEL}>{f.label}</label>
                          <input value={confirmResult[f.key] || ""} onChange={e => setConfirmResult(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.ph} className={INPUT} />
                        </div>
                      ))}
                      <div>
                        <label className={LABEL}>Result</label>
                        <select value={confirmResult.result} onChange={e => setConfirmResult(p => ({ ...p, result: e.target.value }))} className={INPUT}>
                          <option>WON</option><option>BOARD</option><option>MISS</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Grade</label>
                        <select value={confirmResult.grade} onChange={e => setConfirmResult(p => ({ ...p, grade: e.target.value }))} className={INPUT}>
                          {["A+","A","B+","B","C+","C","D"].map(g => <option key={g}>{g}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Ghost color="green" disabled={!confirmResult.pick} onClick={saveConfirmedResult}>
                        Save & Log Result
                      </Ghost>
                      <Ghost color="blue" onClick={() => { runLearn(); setResultsSubTab("log"); }}>
                        Save + Run Pattern Analysis
                      </Ghost>
                      <Ghost color="muted" onClick={() => { setParsedResult(null); setConfirmResult(null); }}>
                        Reset
                      </Ghost>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── RACE LOG ── */}
            {resultsSubTab === "log" && (
              <div className={CARD}>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className={LABEL}>Race Log</div>
                    {calibration && (
                      <span className="text-[9px] font-semibold text-[#16c784] bg-[#16c784]/[0.08] border border-[#16c784]/20 px-2 py-0.5 rounded">
                        Calibrated · {calibration.races}r
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {calibration && (
                      <Ghost color="red" onClick={clearCalibration} className="text-[9px] !px-2 !py-1">Clear Cal</Ghost>
                    )}
                    <Ghost color="green" disabled={learnLoading || results.length === 0} onClick={runLearn}>
                      {learnLoading ? "⟳ Analyzing…" : "⚡ Review & Learn"}
                    </Ghost>
                    <Ghost color="blue" onClick={() => setLogOpen(o => !o)}>
                      {logOpen ? "Cancel" : "+ Log Result"}
                    </Ghost>
                  </div>
                </div>

                {logOpen && (
                  <div className="bg-blue-400/[0.04] border border-blue-400/[0.12] rounded-xl p-4 mb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                      {[
                        { key: "race",  label: "Race",      ph: "R9" },
                        { key: "date",  label: "Date",      ph: "5/3/2026" },
                        { key: "pick",  label: "WIN Pick",  ph: "Lord Bullingdon" },
                        { key: "price", label: "Win Price", ph: "7.40" },
                        { key: "notes", label: "Notes",     ph: "PCO+TEO fired" },
                      ].map(f => (
                        <div key={f.key}>
                          <label className={LABEL}>{f.label}</label>
                          <input value={newResult[f.key]} onChange={e => setNewResult(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.ph} className={INPUT} />
                        </div>
                      ))}
                      <div>
                        <label className={LABEL}>Result</label>
                        <select value={newResult.result} onChange={e => setNewResult(p => ({ ...p, result: e.target.value }))} className={INPUT}>
                          <option>WON</option><option>BOARD</option><option>MISS</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Grade</label>
                        <select value={newResult.grade} onChange={e => setNewResult(p => ({ ...p, grade: e.target.value }))} className={INPUT}>
                          {["A+","A","B+","B","C+","C","D"].map(g => <option key={g}>{g}</option>)}
                        </select>
                      </div>
                    </div>
                    <Ghost color="blue" onClick={addResult}>Save Result</Ghost>
                  </div>
                )}

                {results.length === 0 ? (
                  <div className="text-sm text-slate-600 py-10 text-center">No results logged yet</div>
                ) : (
                  <div className="space-y-2">
                    {results.map(r => {
                      const isWin   = r.result === "WON";
                      const isBoard = r.result === "BOARD";
                      const rc = isWin ? "#16c784" : isBoard ? "#60a5fa" : "#f87171";
                      const gc = GRADE_COLOR[r.grade] || "#64748b";
                      return (
                        <div key={r.id} className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-lg bg-[#0e0e12] border border-white/[0.05]"
                          style={{ borderLeft: `3px solid ${rc}` }}>
                          <div className="text-[9px] text-slate-600 min-w-[64px]">{r.date}</div>
                          <div className="text-[9px] text-slate-600 min-w-[52px]">{r.track} {r.race}</div>
                          <div className="flex-1 text-sm text-white font-semibold truncate">{r.pick}</div>
                          <div className="text-xs font-bold min-w-[56px] text-right" style={{ color: rc }}>
                            {isWin ? `✓ $${r.price}` : isBoard ? "BOARD" : "✗ MISS"}
                          </div>
                          <div className="text-[9px] font-bold px-2 py-0.5 rounded"
                            style={{ color: gc, background: `${gc}18` }}>
                            {r.grade}
                          </div>
                          {r.notes && (
                            <div className="w-full text-[10px] text-slate-500 -mt-1 pl-0.5">{r.notes}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ANALYTICS TAB
        ══════════════════════════════════════════════════════════════ */}
        {tab === "analytics" && (
          <div className="space-y-4">

            {/* Header card */}
            <div className={CARD}>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                <div>
                  <div className={LABEL}>NIST Exploratory Data Analysis</div>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">
                    p-control chart · grade breakdown · signal reliability · ROI analysis
                  </p>
                </div>
                <Ghost color="green" disabled={analyticsLoading || results.length === 0} onClick={runAnalytics}>
                  {analyticsLoading ? "⟳ Running…" : "⚡ Run EDA"}
                </Ghost>
              </div>
              {analyticsError && (
                <div className="mt-3 bg-red-400/[0.07] border border-red-400/20 rounded-lg px-3 py-2.5 text-xs text-red-400">
                  {analyticsError}
                </div>
              )}
              {results.length === 0 && (
                <div className="mt-2 text-xs text-slate-600">Log at least one result to run EDA.</div>
              )}
            </div>

            {analyticsData && (
              <>
                {/* ROI metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "ROI",       value: `${analyticsData.roi.roiPct >= 0 ? "+" : ""}${analyticsData.roi.roiPct}%`, color: analyticsData.roi.roiPct >= 0 ? "#16c784" : "#f87171" },
                    { label: "Invested",  value: `$${analyticsData.roi.invested}`,   color: "#64748b" },
                    { label: "Returned",  value: `$${analyticsData.roi.returned}`,   color: "#60a5fa" },
                    { label: "Avg Win",   value: `$${analyticsData.roi.avgWinPrice}`, color: "#16c784" },
                  ].map(m => (
                    <div key={m.label} className={cn(SCARD, "text-center")}>
                      <div className="text-xl font-bold tracking-tight mb-1" style={{ color: m.color }}>{m.value}</div>
                      <div className="text-[9px] text-slate-600 font-medium uppercase tracking-wider">{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Trend + summary */}
                {analyticsData.summary && (
                  <div className={CARD}>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <div className={LABEL}>Analysis</div>
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide",
                        analyticsData.trend === "improving" ? "bg-[#16c784]/15 text-[#16c784]" :
                        analyticsData.trend === "declining" ? "bg-red-400/15 text-red-400" :
                        "bg-amber-400/15 text-amber-400"
                      )}>
                        {analyticsData.trend}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed mb-1">{analyticsData.summary}</p>
                    {analyticsData.trendReason && (
                      <p className="text-xs text-slate-500 leading-relaxed">{analyticsData.trendReason}</p>
                    )}
                  </div>
                )}

                {/* p-Control Chart */}
                {analyticsData.controlChart?.length > 1 && (
                  <div className={CARD}>
                    <div className={LABEL}>Win Rate Control Chart (p-chart)</div>
                    <p className="text-[10px] text-slate-600 mb-3">Dashed red lines = ±3σ control limits (UCL/LCL)</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={analyticsData.controlChart} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="race" tick={{ fontSize: 9, fill: "#475569" }} label={{ value: "Race #", position: "insideBottomRight", offset: -4, fontSize: 9, fill: "#475569" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#475569" }} unit="%" />
                        <Tooltip
                          contentStyle={{ background: "#111115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                          labelFormatter={v => `Race ${v}`}
                          formatter={(value, name) => [
                            `${value}%`,
                            name === "winRate" ? "Win Rate" : name === "ucl" ? "UCL" : "LCL",
                          ]}
                        />
                        <ReferenceLine
                          y={analyticsData.controlChart[analyticsData.controlChart.length - 1]?.ucl}
                          stroke="#f87171" strokeDasharray="5 3" strokeOpacity={0.55}
                        />
                        <ReferenceLine
                          y={analyticsData.controlChart[analyticsData.controlChart.length - 1]?.lcl}
                          stroke="#f87171" strokeDasharray="5 3" strokeOpacity={0.55}
                        />
                        <Line type="monotone" dataKey="winRate" stroke="#16c784" strokeWidth={2} dot={{ fill: "#16c784", r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                    {analyticsData.lagAnalysis && (
                      <p className="text-[10px] text-slate-600 mt-2">{analyticsData.lagAnalysis}</p>
                    )}
                  </div>
                )}

                {/* By Grade + By Race Type */}
                <div className="grid sm:grid-cols-2 gap-4">
                  {analyticsData.byGrade?.length > 0 && (
                    <div className={CARD}>
                      <div className={LABEL}>Win Rate by Grade</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={analyticsData.byGrade} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                          <XAxis dataKey="grade" tick={{ fontSize: 10, fill: "#475569" }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#475569" }} unit="%" />
                          <Tooltip
                            contentStyle={{ background: "#111115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                            formatter={(value, _name, props) => [`${value}% (${props.payload.wins}/${props.payload.total})`, "Win Rate"]}
                          />
                          <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                            {analyticsData.byGrade.map((entry, i) => (
                              <Cell key={i} fill={GRADE_COLOR[entry.grade] || "#64748b"} fillOpacity={0.8} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {analyticsData.byRaceType?.length > 0 && (
                    <div className={CARD}>
                      <div className={LABEL}>Win Rate by Race Type</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={analyticsData.byRaceType} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                          <XAxis dataKey="type" tick={{ fontSize: 9, fill: "#475569" }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#475569" }} unit="%" />
                          <Tooltip
                            contentStyle={{ background: "#111115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                            formatter={(value, _name, props) => [`${value}% (${props.payload.wins}/${props.payload.total})`, "Win Rate"]}
                          />
                          <Bar dataKey="winRate" fill="#60a5fa" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Signal reliability */}
                {analyticsData.signals?.length > 0 && (
                  <div className={CARD}>
                    <div className={LABEL}>Signal Reliability</div>
                    <ResponsiveContainer width="100%" height={Math.max(120, analyticsData.signals.length * 40)}>
                      <BarChart data={analyticsData.signals} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 0 }}>
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: "#475569" }} unit="%" />
                        <YAxis type="category" dataKey="signal" tick={{ fontSize: 9, fill: "#94a3b8" }} width={84} />
                        <Tooltip
                          contentStyle={{ background: "#111115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                          formatter={(value, _name, props) => [`${value}% (${props.payload.wins}/${props.payload.total})`, "Win Rate"]}
                        />
                        <Bar dataKey="winRate" fill="#a78bfa" fillOpacity={0.8} radius={[0, 4, 4, 0]}>
                          {analyticsData.signals.map((entry, i) => (
                            <Cell key={i} fill={entry.winRate >= 70 ? "#16c784" : entry.winRate >= 40 ? "#a78bfa" : "#f87171"} fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Key findings + recommendations */}
                {analyticsData.keyFindings?.length > 0 && (
                  <div className={CARD}>
                    <div className={LABEL}>Key Findings</div>
                    <div className="space-y-2 mb-4">
                      {analyticsData.keyFindings.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <span className="text-[#16c784] shrink-0 font-bold mt-0.5">→</span>
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                    {analyticsData.recommendations?.length > 0 && (
                      <>
                        <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-2 font-semibold">Recommendations</div>
                        <div className="space-y-2">
                          {analyticsData.recommendations.map((r, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-blue-300">
                              <span className="shrink-0 font-bold mt-0.5">↗</span>
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between flex-wrap gap-2 pt-4 border-t border-white/[0.04] mt-2">
          <div className="text-[9px] text-slate-700 tracking-widest uppercase">SSM Elite PPF v3.3 · SA 5/3/2026</div>
          <div className="text-[9px] text-red-900/70 tracking-wider">For entertainment only · Gamble responsibly</div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════
          LEARN MODAL
      ══════════════════════════════════════════════════════════════ */}
      {learnOpen && learnData && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setLearnOpen(false)}>
          <div className="bg-[#0a0a0f] border border-[#16c784]/20 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">

            <div className="flex justify-between items-center mb-5">
              <div className="text-xs font-bold text-[#16c784] uppercase tracking-widest">⚡ Pattern Analysis</div>
              <button onClick={() => setLearnOpen(false)} className="text-slate-600 hover:text-slate-300 text-xl leading-none transition-colors">✕</button>
            </div>

            {/* Summary */}
            <div className="bg-[#16c784]/[0.05] border border-[#16c784]/15 rounded-xl p-4 mb-5 text-sm text-slate-300 leading-relaxed">
              <span className="text-[#16c784] font-bold">{learnData.winRate} wins · </span>
              {learnData.summary}
            </div>

            {/* Patterns */}
            {learnData.patterns?.length > 0 && (
              <div className="mb-5">
                <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-3 font-semibold">Signal Patterns</div>
                <div className="divide-y divide-white/[0.04]">
                  {learnData.patterns.map((p, i) => (
                    <div key={i} className="flex items-start justify-between py-3 gap-3">
                      <div>
                        <span className="text-blue-300 font-semibold text-xs">{p.signal}</span>
                        <span className="text-slate-400 text-xs"> — {p.finding}</span>
                      </div>
                      <span className={cn(
                        "text-[9px] px-2 py-0.5 rounded ml-2 shrink-0 font-bold uppercase tracking-wide",
                        p.confidence === "HIGH"   ? "bg-[#16c784]/15 text-[#16c784]" :
                        p.confidence === "MEDIUM" ? "bg-amber-400/15 text-amber-400" :
                        "bg-white/[0.05] text-slate-500"
                      )}>
                        {p.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weight Adjustments */}
            {learnData.adjustments?.length > 0 && (
              <div className="mb-5">
                <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-3 font-semibold">
                  Weight Adjustments — click to select
                </div>
                <div className="space-y-2">
                  {learnData.adjustments.map((a, i) => {
                    const sel = learnSelected.includes(i);
                    const up  = a.suggestedWeight > a.currentWeight;
                    return (
                      <div key={i}
                        onClick={() => setLearnSelected(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i])}
                        className={cn(
                          "cursor-pointer flex justify-between items-center px-4 py-3 rounded-xl border transition-colors",
                          sel
                            ? "border-[#16c784]/30 bg-[#16c784]/[0.06]"
                            : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                        )}>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-blue-300">{a.raceType} · {a.module}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{a.reason}</div>
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <span className="text-slate-500 text-xs">{a.currentWeight} → </span>
                          <span className={cn("font-bold text-sm", up ? "text-[#16c784]" : "text-red-400")}>
                            {a.suggestedWeight}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* New Rules */}
            {learnData.newRules?.length > 0 && (
              <div className="mb-5">
                <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-3 font-semibold">Rule Reinforcements</div>
                <div className="space-y-2">
                  {learnData.newRules.map((r, i) => (
                    <div key={i} className="px-4 py-3 rounded-xl bg-blue-400/[0.04] border border-blue-400/[0.12]">
                      <div className="text-xs text-blue-300 font-medium">{r.rule}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{r.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Apply */}
            <div className="flex gap-3">
              <button
                onClick={applyCalibration}
                disabled={learnSelected.length === 0}
                className={cn(
                  "flex-1 py-2.5 text-xs font-semibold rounded-xl border transition-colors",
                  learnSelected.length > 0
                    ? "border-[#16c784]/30 bg-[#16c784]/[0.1] text-[#16c784] hover:bg-[#16c784]/[0.18]"
                    : "opacity-40 cursor-not-allowed border-white/[0.07] text-slate-500 bg-transparent"
                )}>
                Apply {learnSelected.length} Calibration{learnSelected.length !== 1 ? "s" : ""} to Formula
              </button>
              <Ghost color="muted" onClick={() => setLearnOpen(false)} className="px-6">Cancel</Ghost>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
