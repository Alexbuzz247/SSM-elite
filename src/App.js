import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FLAG_COLORS = {
  RED: { color: "#ff4757", bg: "rgba(255,71,87,0.12)", emoji: "🔴" },
  YELLOW: { color: "#f7b731", bg: "rgba(247,183,49,0.12)", emoji: "🟡" },
  GREEN: { color: "#00ff87", bg: "rgba(0,255,135,0.12)", emoji: "🟢" },
  "WIDE WIN": { color: "#a29bfe", bg: "rgba(162,155,254,0.12)", emoji: "🏆" },
};

const GRADE_COLORS = {
  "A+": "#00ff87", A: "#00ff87", "B+": "#60efff", B: "#60efff",
  "C+": "#f7b731", C: "#f7b731", D: "#ff4757",
};

const SURFACES = ["Dirt", "Turf", "Synthetic"];
const RACE_TYPES = [
  { value: "CLM", label: "CLM — Claiming" },
  { value: "MCL", label: "MCL — Maiden Claiming" },
  { value: "MSW", label: "MSW — Maiden Special Weight" },
  { value: "ALW", label: "ALW — Allowance" },
  { value: "OC", label: "OC/AOC — Optional Claiming" },
  { value: "STK", label: "STK — Stakes" },
  { value: "G1", label: "G1 — Grade 1" },
  { value: "G2", label: "G2 — Grade 2" },
  { value: "G3", label: "G3 — Grade 3" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const API = {
  upload: async (fileData, fileType) => {
    const r = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileData, fileType }),
    });
    if (!r.ok) throw new Error((await r.json()).error || "Upload failed");
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
  getFlags: async () => {
    const r = await fetch("/api/flags");
    return r.json();
  },
  addFlag: async (flag) => {
    const r = await fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flag),
    });
    return r.json();
  },
  removeFlag: async (id) => {
    await fetch(`/api/flags?id=${id}`, { method: "DELETE" });
  },
  getResults: async () => {
    const r = await fetch("/api/results");
    return r.json();
  },
  addResult: async (result) => {
    const r = await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    return r.json();
  },
};

// ─── STYLE TOKENS ─────────────────────────────────────────────────────────────

const S = {
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(0,255,135,0.15)",
    borderRadius: 6,
    padding: 20,
  },
  label: {
    fontSize: 9,
    letterSpacing: "0.25em",
    textTransform: "uppercase",
    color: "#00ff87",
    marginBottom: 12,
  },
  input: {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 3,
    padding: "8px 10px",
    color: "#e8eaf0",
    fontSize: 12,
    fontFamily: "'Courier New', monospace",
    boxSizing: "border-box",
    outline: "none",
  },
  fieldLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: "0.1em",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  btn: (color = "#00ff87", active = true) => ({
    padding: "10px 20px",
    fontSize: 11,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    cursor: active ? "pointer" : "not-allowed",
    border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
    background: active ? `${color}18` : "transparent",
    color: active ? color : "rgba(255,255,255,0.3)",
    borderRadius: 3,
    fontFamily: "'Courier New', monospace",
    transition: "all 0.2s",
  }),
};

// ─── TABS ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "analyze", label: "🏇 Analyze" },
  { id: "flags", label: "🚩 Flags" },
  { id: "results", label: "📊 Results" },
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("analyze");
  const [raceInfo, setRaceInfo] = useState({
    track: "Santa Anita", raceNum: "", date: new Date().toLocaleDateString("en-US"),
    distance: "", surface: "Dirt", raceType: "CLM",
    purse: "", par: "", railFeet: "10", fieldSize: "",
  });
  const [horsesText, setHorsesText] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showInput, setShowInput] = useState(true);
  const [flags, setFlags] = useState([]);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [newFlag, setNewFlag] = useState({ horse: "", race: "", trip: "", flag: "RED", bonus: 8 });
  const [newResult, setNewResult] = useState({ pick: "", result: "WON", price: "", grade: "A", notes: "", race: "", date: "" });
  const [logOpen, setLogOpen] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    API.getFlags().then(d => setFlags(d.flags || [])).catch(() => {});
    API.getResults().then(d => { setResults(d.results || []); setStats(d.stats); }).catch(() => {});
  }, []);

  const flagsText = flags.map(f => `${f.horse} — ${f.flag} +${f.bonus}PP (${f.trip})`).join("\n");

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
      const surface = get("Surface");
      const raceType = get("Race Type");
      updatedRaceInfo = {
        track: get("Track"),
        raceNum: get("Race").replace(/\D/g, ""),
        date: get("Date"),
        distance: get("Distance"),
        surface: SURFACES.includes(surface) ? surface : "",
        raceType: RACE_TYPES.some(t => t.value === raceType) ? raceType : "",
        purse: get("Purse").replace(/\D/g, ""),
        fieldSize: get("Field Size"),
      };
      horsesData = parsed.replace(/RACE_INFO:[\s\S]*?\n\n(?=#)/, "").trim();
    }

    return { updatedRaceInfo, horsesData };
  }, []);

  const uploadDRF = useCallback(async (file) => {
    const MAX_MB = 8;
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`File too large (max ${MAX_MB}MB). Try a screenshot or smaller PDF.`);
      return;
    }
    setUploadLoading(true);
    setUploadError("");
    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { parsed } = await API.upload(fileData, file.type);
      const { updatedRaceInfo, horsesData } = parseUploadResult(parsed);

      setRaceInfo(prev => ({
        ...prev,
        ...Object.fromEntries(Object.entries(updatedRaceInfo).filter(([, v]) => v)),
      }));
      setHorsesText(horsesData);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [parseUploadResult]);

  const runAnalysis = async () => {
    if (!horsesText.trim()) { setError("Please enter horse/PP data."); return; }
    setLoading(true); setError(""); setAnalysis(""); setShowInput(false);
    try {
      const { analysis: text } = await API.analyze({ raceInfo, horsesText, flags: flagsText });
      setAnalysis(text);
    } catch (e) {
      setError(e.message);
      setShowInput(true);
    } finally {
      setLoading(false);
    }
  };

  const addFlag = async () => {
    if (!newFlag.horse) return;
    const { flag } = await API.addFlag(newFlag);
    setFlags(f => [...f, flag]);
    setNewFlag({ horse: "", race: "", trip: "", flag: "RED", bonus: 8 });
  };

  const removeFlag = async (id) => {
    await API.removeFlag(id);
    setFlags(f => f.filter(x => x.id !== id));
  };

  const addResult = async () => {
    if (!newResult.pick) return;
    const full = { ...newResult, track: raceInfo.track, date: raceInfo.date || newResult.date };
    const { entry } = await API.addResult(full);
    setResults(r => [entry, ...r]);
    setLogOpen(false);
    setNewResult({ pick: "", result: "WON", price: "", grade: "A", notes: "", race: "", date: "" });
  };

  // Parse key sections from analysis text
  const parseSection = (text, header) => {
    const re = new RegExp(`##\\s*${header}[^\n]*\\n([\\s\\S]*?)(?=##|$)`, "i");
    return text.match(re)?.[1]?.trim() || "";
  };

  const winLine = analysis.match(/WIN:\s*([^\n]+)/)?.[1]?.trim();
  const placeLine = analysis.match(/PLACE:\s*([^\n]+)/)?.[1]?.trim();
  const showLine = analysis.match(/SHOW:\s*([^\n]+)/)?.[1]?.trim();
  const ticketSection = parseSection(analysis, "Ticket Structure");
  const flagsSection = parseSection(analysis, "Active Flags");

  return (
    <div style={{ minHeight: "100vh", background: "#080c14", color: "#e8eaf0", fontFamily: "'Courier New', monospace", position: "relative" }}>

      {/* BG grid */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(0,255,135,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,135,0.025) 1px,transparent 1px)",
        backgroundSize: "40px 40px" }} />
      <div style={{ position: "fixed", top: -300, right: -300, width: 700, height: 700, borderRadius: "50%",
        background: "radial-gradient(circle,rgba(0,255,135,0.05) 0%,transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "0 auto", padding: "20px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid rgba(0,255,135,0.15)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, letterSpacing: "0.3em", color: "#00ff87" }}>SSM ELITE</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>RACE ANALYZER</span>
              <span style={{ fontSize: 9, letterSpacing: "0.2em", color: "#60efff", background: "rgba(96,239,255,0.1)", border: "1px solid rgba(96,239,255,0.25)", padding: "2px 8px", borderRadius: 2 }}>v3.3</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, letterSpacing: "0.08em" }}>
              PPF · VALIDATED SA 5/3/2026 · PCO+TEO 3/3 · HG RULE 3/3
            </div>
          </div>
          {stats && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: "WIN RATE", value: `${stats.winRate}%` },
                { label: "AVG PRICE", value: `$${stats.avgWinPrice}` },
                { label: "RACES", value: stats.total },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#00ff87" }}>{s.value}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em" }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              ...S.btn(t.id === "analyze" ? "#00ff87" : t.id === "flags" ? "#ff4757" : "#60efff", tab === t.id),
              borderColor: tab === t.id ? (t.id === "analyze" ? "#00ff87" : t.id === "flags" ? "#ff4757" : "#60efff") : "rgba(255,255,255,0.08)",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── ANALYZE TAB ───────────────────────────────────────── */}
        {tab === "analyze" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {showInput ? (
              <>
                {/* Race info */}
                <div style={S.card}>
                  <div style={S.label}>▸ Race Information</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
                    {[
                      { key: "track", label: "Track", ph: "Santa Anita" },
                      { key: "raceNum", label: "Race #", ph: "9" },
                      { key: "date", label: "Date", ph: "5/3/2026" },
                      { key: "distance", label: "Distance", ph: "1⅛M / 9f" },
                      { key: "purse", label: "Purse ($)", ph: "37000" },
                      { key: "par", label: "Beyer Par", ph: "84 or NA" },
                      { key: "railFeet", label: "Rail (ft)", ph: "10" },
                      { key: "fieldSize", label: "Field Size", ph: "8" },
                    ].map(f => (
                      <div key={f.key}>
                        <div style={S.fieldLabel}>{f.label}</div>
                        <input value={raceInfo[f.key]} onChange={e => setRaceInfo(p => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.ph} style={S.input} />
                      </div>
                    ))}
                    <div>
                      <div style={S.fieldLabel}>Surface</div>
                      <select value={raceInfo.surface} onChange={e => setRaceInfo(p => ({ ...p, surface: e.target.value }))}
                        style={{ ...S.input, background: "#0d1420" }}>
                        {SURFACES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={S.fieldLabel}>Race Type</div>
                      <select value={raceInfo.raceType} onChange={e => setRaceInfo(p => ({ ...p, raceType: e.target.value }))}
                        style={{ ...S.input, background: "#0d1420" }}>
                        {RACE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Active flags preview */}
                {flags.length > 0 && (
                  <div style={{ ...S.card, borderColor: "rgba(255,71,87,0.2)", background: "rgba(255,71,87,0.04)" }}>
                    <div style={{ ...S.label, color: "#ff4757" }}>▸ {flags.length} Active Bounce-Back Flags Loaded</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {flags.map(f => (
                        <div key={f.id} style={{
                          fontSize: 10, padding: "3px 10px", borderRadius: 2,
                          background: FLAG_COLORS[f.flag]?.bg, border: `1px solid ${FLAG_COLORS[f.flag]?.color}40`,
                          color: FLAG_COLORS[f.flag]?.color,
                        }}>
                          {FLAG_COLORS[f.flag]?.emoji} {f.horse} +{f.bonus}PP
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Horse data */}
                <div style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                    <div style={S.label}>▸ Horse / PP Data</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {uploadLoading && (
                        <span style={{ fontSize: 10, color: "#60efff", letterSpacing: "0.1em" }}>⟳ PARSING DRF...</span>
                      )}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadLoading}
                        style={{ ...S.btn("#60efff", !uploadLoading), padding: "6px 14px", fontSize: 10 }}
                      >
                        ↑ Upload DRF Sheet
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,image/*,.txt,.csv"
                        style={{ display: "none" }}
                        onChange={e => { if (e.target.files?.[0]) uploadDRF(e.target.files[0]); }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10, lineHeight: 1.5 }}>
                    Upload a DRF PDF or screenshot to auto-fill, or paste raw data below. More data = better analysis.
                  </div>
                  {uploadError && (
                    <div style={{ background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.3)", borderRadius: 4, padding: "8px 12px", fontSize: 11, color: "#ff4757", marginBottom: 10 }}>
                      {uploadError}
                    </div>
                  )}
                  <textarea value={horsesText} onChange={e => setHorsesText(e.target.value)}
                    placeholder={`#1 Lord Bullingdon — Trainer: McCarthy M, Jockey: Kimura K\nBest Beyers: 95, 86, 82, 80\nLast race: Won going away, no trip\nWorks: Apr29 SA 5f :482 H (4 days out)\n\n#2 Pioneer Prince — Trainer: O'Neill, Jockey: Maldonado\nBest Beyers: 87, 82, 82\nLast race: Drew away safely 1⅛M turf\n...`}
                    style={{ ...S.input, minHeight: 260, resize: "vertical", lineHeight: 1.6 }} />
                </div>

                {error && (
                  <div style={{ background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.3)", borderRadius: 4, padding: 14, fontSize: 12, color: "#ff4757" }}>
                    {error}
                  </div>
                )}

                <button onClick={runAnalysis} style={{
                  padding: "16px", fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
                  cursor: "pointer", border: "2px solid #00ff87", background: "rgba(0,255,135,0.1)",
                  color: "#00ff87", borderRadius: 4, fontFamily: "'Courier New', monospace", fontWeight: 700,
                }}>
                  ▶ RUN FULL SSM ELITE PIPELINE
                </button>
              </>
            ) : (
              <>
                {/* Loading */}
                {loading && (
                  <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
                    <div style={{ fontSize: 11, color: "#00ff87", letterSpacing: "0.2em", marginBottom: 8 }}>
                      ⟳ RUNNING SSM ELITE v3.3
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginBottom: 20 }}>
                      RTD → TMER → SMD → THM → PP → TJI → ARI → FPAD
                    </div>
                    <div style={{ height: 2, background: "rgba(0,255,135,0.1)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: "40%", background: "#00ff87", borderRadius: 2,
                        animation: "slide 1.4s ease-in-out infinite" }} />
                    </div>
                    <style>{`@keyframes slide{0%{transform:translateX(-150%)}100%{transform:translateX(400%)}}`}</style>
                  </div>
                )}

                {/* Results */}
                {!loading && analysis && (
                  <>
                    {/* Win/Place/Show cards */}
                    {(winLine || placeLine || showLine) && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
                        {[
                          { label: "🥇 WIN", value: winLine, c: "#00ff87" },
                          { label: "🥈 PLACE", value: placeLine, c: "#60efff" },
                          { label: "🥉 SHOW", value: showLine, c: "#f7b731" },
                        ].filter(x => x.value).map(x => (
                          <div key={x.label} style={{ background: `${x.c}0d`, border: `1px solid ${x.c}30`, borderLeft: `3px solid ${x.c}`, borderRadius: 4, padding: 16 }}>
                            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: x.c, marginBottom: 8 }}>{x.label}</div>
                            <div style={{ fontSize: 12, color: "#fff", lineHeight: 1.5 }}>{x.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ticket */}
                    {ticketSection && (
                      <div style={{ ...S.card, borderColor: "rgba(255,107,129,0.2)", background: "rgba(255,107,129,0.05)" }}>
                        <div style={{ ...S.label, color: "#ff6b81" }}>▸ Ticket Structure</div>
                        <pre style={{ fontSize: 12, color: "#e8eaf0", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0, fontFamily: "'Courier New', monospace" }}>
                          {ticketSection}
                        </pre>
                      </div>
                    )}

                    {/* Full analysis */}
                    <div style={S.card}>
                      <div style={{ ...S.label, color: "rgba(255,255,255,0.4)" }}>▸ Full Pipeline Analysis</div>
                      <div style={{ fontSize: 11.5, lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "'Courier New', monospace" }}>
                        {analysis.split("\n").map((line, i) => {
                          const isH = line.startsWith("##");
                          const isWin = /^WIN:|🥇/.test(line);
                          const isKill = /eliminat|kill|fpad kill/i.test(line);
                          const isImmune = /immune|pco\+teo/i.test(line);
                          const isAlert = /alert|confirmed|validated/i.test(line);
                          return (
                            <div key={i} style={{
                              color: isH ? "#00ff87" : isWin ? "#fff" : isKill ? "#ff4757" : isImmune ? "#ff6b81" : isAlert ? "#f7b731" : "#c8ccd8",
                              fontWeight: isH ? 700 : "normal",
                              borderBottom: isH ? "1px solid rgba(0,255,135,0.12)" : "none",
                              paddingBottom: isH ? 4 : 0,
                              marginTop: isH ? 12 : 0,
                            }}>{line || "\u00a0"}</div>
                          );
                        })}
                      </div>
                    </div>

                    {/* New flags from this race */}
                    {flagsSection && (
                      <div style={{ ...S.card, borderColor: "rgba(247,183,49,0.2)", background: "rgba(247,183,49,0.04)" }}>
                        <div style={{ ...S.label, color: "#f7b731" }}>▸ New Flags Generated</div>
                        <pre style={{ fontSize: 12, color: "#e8eaf0", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>
                          {flagsSection}
                        </pre>
                      </div>
                    )}

                    {/* Action row */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => { setShowInput(true); setAnalysis(""); }} style={S.btn()}>← New Race</button>
                      <button onClick={() => navigator.clipboard?.writeText(analysis)} style={S.btn("#60efff")}>Copy Analysis</button>
                      <button onClick={() => setLogOpen(true)} style={S.btn("#f7b731")}>+ Log Result</button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── FLAGS TAB ──────────────────────────────────────────── */}
        {tab === "flags" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={S.card}>
              <div style={{ ...S.label, color: "#ff4757" }}>▸ Add New Flag</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginBottom: 12 }}>
                {[
                  { key: "horse", label: "Horse Name", ph: "Tulavia's World" },
                  { key: "race", label: "Race", ph: "SA R7 5/3/26" },
                  { key: "trip", label: "Trip Notes", ph: "4-wide entire trip" },
                  { key: "bonus", label: "PP Bonus", ph: "8" },
                ].map(f => (
                  <div key={f.key}>
                    <div style={S.fieldLabel}>{f.label}</div>
                    <input value={newFlag[f.key]} onChange={e => setNewFlag(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.ph} style={S.input} />
                  </div>
                ))}
                <div>
                  <div style={S.fieldLabel}>Flag Type</div>
                  <select value={newFlag.flag} onChange={e => setNewFlag(p => ({ ...p, flag: e.target.value }))}
                    style={{ ...S.input, background: "#0d1420" }}>
                    {["RED", "YELLOW", "GREEN", "WIDE WIN"].map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={addFlag} style={{ ...S.btn("#ff4757"), padding: "10px 24px" }}>+ Add Flag</button>
            </div>

            <div style={S.card}>
              <div style={{ ...S.label, color: "#ff4757" }}>▸ Active Flags ({flags.length})</div>
              {flags.length === 0 && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "20px 0" }}>No active flags.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {flags.map(f => {
                  const fc = FLAG_COLORS[f.flag] || FLAG_COLORS.GREEN;
                  return (
                    <div key={f.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
                      background: fc.bg, border: `1px solid ${fc.color}30`, borderLeft: `3px solid ${fc.color}`,
                      borderRadius: 4, padding: "12px 14px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{f.horse}</span>
                          <span style={{ fontSize: 9, letterSpacing: "0.15em", color: fc.color, background: `${fc.color}20`,
                            padding: "2px 8px", borderRadius: 2 }}>{fc.emoji} {f.flag} +{f.bonus}PP</span>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{f.race}</span>
                        </div>
                        {f.trip && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>{f.trip}</div>}
                      </div>
                      <button onClick={() => removeFlag(f.id)} style={{ fontSize: 16, background: "none", border: "none",
                        cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: "0 4px", flexShrink: 0 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS TAB ────────────────────────────────────────── */}
        {tab === "results" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Stats row */}
            {stats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12 }}>
                {[
                  { label: "Win Rate", value: `${stats.winRate}%`, c: "#00ff87" },
                  { label: "Avg Win Price", value: `$${stats.avgWinPrice}`, c: "#00ff87" },
                  { label: "PCO+TEO", value: stats.pcoTeoRecord, c: "#ff6b81" },
                  { label: "Hg Gate Rule", value: stats.hgRuleRecord, c: "#60efff" },
                  { label: "Total Races", value: stats.total, c: "rgba(255,255,255,0.6)" },
                  { label: "Wins", value: stats.wins, c: "#00ff87" },
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, textAlign: "center", padding: 16 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.c, marginBottom: 4 }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em", textTransform: "uppercase" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Results log */}
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={S.label}>▸ Race Log</div>
                <button onClick={() => setLogOpen(o => !o)} style={{ ...S.btn("#60efff"), padding: "6px 14px", fontSize: 10 }}>
                  + Log Result
                </button>
              </div>

              {logOpen && (
                <div style={{ background: "rgba(96,239,255,0.05)", border: "1px solid rgba(96,239,255,0.2)", borderRadius: 4, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginBottom: 12 }}>
                    {[
                      { key: "race", label: "Race", ph: "R9" },
                      { key: "date", label: "Date", ph: "5/3/2026" },
                      { key: "pick", label: "WIN Pick", ph: "Lord Bullingdon" },
                      { key: "price", label: "Win Price", ph: "7.40" },
                      { key: "notes", label: "Notes", ph: "PCO+TEO fired" },
                    ].map(f => (
                      <div key={f.key}>
                        <div style={S.fieldLabel}>{f.label}</div>
                        <input value={newResult[f.key]} onChange={e => setNewResult(p => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.ph} style={S.input} />
                      </div>
                    ))}
                    <div>
                      <div style={S.fieldLabel}>Result</div>
                      <select value={newResult.result} onChange={e => setNewResult(p => ({ ...p, result: e.target.value }))}
                        style={{ ...S.input, background: "#0d1420" }}>
                        <option>WON</option><option>BOARD</option><option>MISS</option>
                      </select>
                    </div>
                    <div>
                      <div style={S.fieldLabel}>Grade</div>
                      <select value={newResult.grade} onChange={e => setNewResult(p => ({ ...p, grade: e.target.value }))}
                        style={{ ...S.input, background: "#0d1420" }}>
                        {["A+","A","B+","B","C+","C","D"].map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={addResult} style={{ ...S.btn("#60efff"), padding: "10px 24px" }}>Save Result</button>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map(r => {
                  const isWin = r.result === "WON";
                  const isBoard = r.result === "BOARD";
                  const rc = isWin ? "#00ff87" : isBoard ? "#60efff" : "#ff4757";
                  const gc = GRADE_COLORS[r.grade] || "rgba(255,255,255,0.5)";
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                      background: `${rc}08`, border: `1px solid ${rc}20`, borderLeft: `3px solid ${rc}`,
                      borderRadius: 4, padding: "10px 14px" }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", minWidth: 70 }}>{r.date}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", minWidth: 30 }}>{r.track} {r.race}</div>
                      <div style={{ flex: 1, fontSize: 12, color: "#fff", fontWeight: 600 }}>{r.pick}</div>
                      <div style={{ fontSize: 11, color: rc, fontWeight: 700, minWidth: 50 }}>
                        {isWin ? `✓ $${r.price}` : isBoard ? "BOARD" : "✗ MISS"}
                      </div>
                      <div style={{ fontSize: 10, color: gc, background: `${gc}20`, padding: "2px 8px", borderRadius: 2, minWidth: 28, textAlign: "center" }}>
                        {r.grade}
                      </div>
                      {r.notes && <div style={{ width: "100%", fontSize: 10, color: "rgba(255,255,255,0.35)", paddingLeft: 4 }}>{r.notes}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", letterSpacing: "0.12em" }}>SSM ELITE PPF v3.3 · SA 5/3/2026</div>
          <div style={{ fontSize: 9, color: "rgba(255,71,87,0.4)", letterSpacing: "0.1em" }}>FOR ENTERTAINMENT ONLY · GAMBLE RESPONSIBLY</div>
        </div>
      </div>
    </div>
  );
}
