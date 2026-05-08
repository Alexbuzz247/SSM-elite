# SSM Elite Race Analyzer — Project Reference

## Project Overview
SSM Elite is a personal horse racing handicapping tool built in React, deployed on Vercel.
It takes horse past performance (PP) data, runs it through a multi-module scoring pipeline
powered by Claude AI (claude-sonnet-4-20250514), and outputs structured WIN/PLACE/SHOW picks
with ticket structure.

**Live URL:** https://ssm-elite.vercel.app
**Stack:** React (CRA) · Vercel Serverless Functions · Anthropic API
**Version:** v3.3 — Validated SA 5/3/2026

---

## File Structure

```
SSM-elite/
  src/
    App.js          ← Full frontend (single file, React)
  api/
    analyze.js      ← Main pipeline — sends race data to Claude API
    flags.js        ← Bounce-back flag storage (in-memory, seeded with defaults)
    results.js      ← Race result log (in-memory, seeded with defaults)
    upload.js       ← DRF sheet parser — accepts PDF/image, extracts horse data via Claude vision
  vercel.json       ← Deployment config
  package.json
  CLAUDE.md         ← This file
```

---

## Deploy Workflow
1. Make changes locally
2. Test with `npm start`
3. Deploy: `vercel --prod --yes` (run from project root in PowerShell with PATH refreshed)

PATH refresh needed in current terminal session:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
```

---

## SSM Elite Pipeline — Core Formula

```
PP = BA + CF + ARI + SDF + PTF + TJI + THM - RUP
```

### Module Weights by Race Type (RTD sets these first)

| Race Type | Weights |
|---|---|
| MSW_SPRINT | Proto-PCO 0.35 · TJI 0.30 · ARI 0.20 · Chaos 0.15 |
| MSW_SPRINT_TURF | Proto-PCO 0.35 · TJI 0.28 · ARI 0.12 · TMSEP 0.10 · Chaos 0.15 |
| MSW_TURF_ROUTE | MSW Rule 0.40 · TJI 0.25 · ARI 0.15 · BA/CF 0.10 · Chaos 0.10 |
| CLM_DIRT_SPRINT | PCO+TEO 0.35 · TJI 0.30 · ARI 0.20 · BA/CF 0.10 · THM 0.05 |
| CLM_TURF_ROUTE | PCO 0.25 · TRSO 0.25 · ARI 0.20 · BA/CF 0.15 · TJI 0.10 · THM 0.05 |
| ALW_DIRT_SPRINT | ARI 0.30 · BA/CF 0.25 · TJI 0.20 · PCO 0.15 · THM 0.10 |
| ALW_TURF_SPRINT | BA/CF 0.35 · TJI 0.25 · ARI 0.20 · PCO 0.15 · THM 0.05 |
| ALW_TURF_LONG | TRSO 0.30 · BA/CF 0.25 · ARI 0.15 · PCO 0.15 · TJI 0.10 · THM 0.05 |
| STAKES_DIRT | BA/CF 0.35 · TJI 0.25 · ARI 0.10 · PCO 0.15 · THM 0.10 |
| STAKES_TURF_LONG | BA/CF 0.30 · TRSO 0.25 · TJI 0.20 · ARI 0.10 · PCO 0.10 · THM 0.05 |

---

## ARI Formula

```
ARI = (PFS + 1.5×CT + RW + GR + 0.75×WQ) / 5
```

### Santa Anita Pars
3f=:354 · 4f=:474 · 5f=:594 · 6f=1:12

### CT Patterns
A=100 · C=90 · B=85 · D=75 · E=55 (use 68 if 2 or fewer starts) · F=40

### Recency Windows (RW)
**Sprint:** 5-7d=100(peak) · 8-10d=85 · 4d=70 · 11-14d=75 · 15-21d=55 · 22-28d=45 · 29+d=40
**Route:** 7-10d=100(peak) · 5-7d=85 · 11-14d=85 · 15-21d=70 · 22-28d=55 · 29+d=40

### Gate Readiness (GR)
- Hg + 10 days + dirt sprint = 95
- Hg + turf route = 80
- Hg + turf sprint + 1+ turf starts = 72
- Hg + turf sprint + 0 turf starts = 60
- 2nd most recent Hg = 75
- 1 Hg in last 4 (not recent) = 65
- No Hg = 60

### Workout Quality (WQ)
Top 3%=100 · Top 10%=88 · Top 25%=75 · Top 50%=62 · Bottom 50%=45 · Dead Last=25

**WQ Multipliers:**
- 10+ career starts = ×1.40
- Turf route race = ×1.25
- Different track = −8 WQ, RW cap 80
- Different track + surface = −10 WQ

### ARI Floors
- Pattern A = minimum 78
- Sparse data (fewer than 3 works) = minimum 74
- Double bullet + 2+ top 10% works = A-tier floor + RW penalty reduced 40%

---

## TMSEP — Turf Maiden Sprint Experience Premium
*(Maiden turf sprints only)*

| Prior Turf Sprint Starts | Bonus |
|---|---|
| 3+ | +15 PP |
| 2 | +10 PP |
| 1 | +5 PP |
| 0 | 0 |

Validated: Tulavia's World won SA R7 5/3/2026 at $26.60

---

## SDF Post Bias — Santa Anita (Rail 10ft)

| Distance | Post Bias |
|---|---|
| 1M turf | 1-3 = +3 · 4-6 = 0 · 7+ = −3 |
| 1.25M turf | 1-4 = +3 · 5-7 = 0 · 8+ = −4 |
| 6F dirt | 1-2 = −2 · 3-6 = +2 · 7-8 = 0 |
| 7F dirt | 1-3 = +2 · 4-6 = +1 · 7+ = −1 |
| 1M dirt | 1-4 = +2 · 5-7 = 0 · 8+ = −1 |

**Surface familiarity:** 3+ starts on today's surface = +5 · 1-2 starts = +2 · 0 = 0

---

## PCO — Class Performance Overlay

| Type | Bonus |
|---|---|
| Type A same class | +8 CF |
| Type A class rise | +4 CF |
| Type A class drop | +8 CF |
| Type B | +2 CF |

### Proto-PCO (Maiden)
- A+ beaten < 1L = +25 (A-tier)
- A beaten 1-3L = +18 (A-tier)
- B beaten 3-5L = +12 (B-tier)
- C beaten 5-8L with move = +7 (C-tier)
- D beaten 5-8L no move = +3
- F debut or 8L+ = 0

---

## Critical Claiming Rule — PCO+TEO (Confirmed 3/3 on 5/3/2026)

**PCO Type A + TEO trainer = AUTOMATIC A-TIER MINIMUM + FPAD IMMUNE + WIN PICK ALWAYS**
- Cannot be killed. Cannot be demoted. No exceptions whatsoever.

**Confirmed winners:**
- Quick Kate $7.40 (Lewis Craig + Kimura)
- Clever Clover $11.00 (McCarthy Sean + Baze)
- He's a Gangster $11.20 (Eurton + Pereira)

---

## TJI — Trainer/Jockey Index

### Trainer Scores (Santa Anita)
| Trainer | Bonus |
|---|---|
| D'Amato Philip (turf route or maiden turf route) | +15 |
| D'Amato Philip (turf sprint) | +8 — NOT +15, route specialist only |
| D'Amato Philip (dirt) | +10 |
| Mandella Richard (any) | +13 |
| Baffert Bob (debut) | +18 |
| O'Neill Doug (any) | +7 |
| Powell Leonard (any) | +7 |
| McCarthy Michael (any) | +7 |
| McCarthy Sean (claiming) | +9 |
| Eurton Peter (claiming) | +9 |
| Papaprodromou George (any) | +6 |
| Sadler John (any) | +7 |
| Lewis Craig (any) | +7 |

### Jockey Tiers (Santa Anita)
| Tier | Jockeys | Bonus |
|---|---|---|
| Tier 1 | Ayuso · Jaramillo · Pereira · Espinoza | +10 pts — C-tier minimum on any horse |
| Tier 2 | Fresu · Kimura · Hernandez JJ · Frey K | +7-8 pts |
| Tier 3 | Baze · Belmont · Gonzalez | +5 pts |

### TJI Floor Rules
- Dual elite (top trainer + T1 jockey) = B-tier minimum
- Elite trainer + TEO debut = B-tier minimum
- Any T1 jockey = C-tier minimum
- PCO Type A + TEO claiming = A-tier minimum + FPAD immune

---

## TMER — Multi-Entry Rule
*(Always runs first before any scoring)*

- Clear jockey tier gap (2+ tiers apart): A-entry = +10 PP · B-entry = −5 PP
- Equal jockey tiers (same tier): A-entry = +3 PP · B-entry = −2 PP

---

## THM — Trip Handicapping Module

### Ground Lost Adjustments (Bonuses)
Single check=+4 · Double check=+8 · 3-wide sprint=+3 · 3-wide route=+5
4-wide sprint=+5 · 4-wide route=+8 · Slow start=+3 · Crowded/pulled=+3 · Tight stretch=+2
Won while 3+ wide → next start bonus = +10

### Negative THM Signals
- "Weakened" or "Flattened" = no bonus, fitness question
- "No kick" or "No final kick" = −5 PP stamina flag
- "Eased" or "Pulled up" = check FPAD context

---

## Bounce-Back Flags

| Flag | Bonus | Trigger |
|---|---|---|
| RED | +8 PP | Double check OR wide + close to winner |
| YELLOW | +5 PP | Single check + wide OR wide throughout |
| GREEN | +3 PP | Minor incident |
| WIDE WIN | +10 PP | Won while 3+ wide — next start |

---

## MSW Turf Route Rule v2
*(Activates ONLY for maiden turf 7f or more)*

| Prior Turf Routes | Result |
|---|---|
| 0 (debut) | −8 PP, underneath only |
| 1 prior — 3/3 conditions | +15 PP, WIN KEY |
| 1 prior — 2/3 conditions | +8 PP, exacta |
| 1 prior — 1/3 conditions | +3 PP, underneath |
| 1 prior — 0/3 conditions | −8 PP, ELIMINATE |
| 2 prior turf routes | +5 PP, standard |
| 3+ prior turf routes | 0 PP, veteran standard |

**Three conditions for one-prior horses:**
- C1: Beaten 2L or less (with trip excuse, extend to 5L)
- C2: Positive Response Index — positive words outweigh negative
- C3: First move or Mid move timing (NOT late move or no move)

---

## TRSO — Turf Route Stamina Override
*(Activates at 9f+ turf, normal or fast pace)*

| Score | Tier | PP Boost |
|---|---|---|
| 35+ | STAMINA_ELITE | +20% — multiple 9f+ wins, grinding trips |
| 20+ | STAMINA_GRINDER | +15% — one 9f+ win, fights in stretch |
| 10+ | STAMINA_OK | +8% — handles distance, no concerns |
| 0+ | STAMINA_NEUTRAL | 0% |
| −10+ | TRIP_CONCERN | −5% — no kick pattern or pace-dependent |
| Below −10 | TRIP_DEPENDENT | −10% — collapse-only wins |

**Running style at 9f+:** Stalker=+10 · Presser=+8 · Mid-pack=+5 · Closer=0 · Deep Closer=−10 · Pure Speed=−8

**Stamina sires (+10):** Galileo · Frankel · Dubawi · Sea the Stars · Lope de Vega · Shamardal · Montjeu
**Speed sires at 10f+ (−8):** Into Mischief · Candy Ride · Uncle Mo · Tapit at 11f+ · Quality Road

---

## FPAD — Fitness/Performance Assessment Detector

### Kill Conditions
1. Staleness: 37+ days since last work — absolute kill
2. Dead last work + Pattern E + 3+ starts = kill
3. Speed cliff: Beyer 15+ below par + 3+ starts + not elite trainer = kill
4. Class cliff: 3+ recent races 15+ below par + 5+ starts = kill
5. Post game: 9+ starts, 0 wins, Pattern E or F = kill
6. Physical injury / walked off with vanning or lameness = absolute kill
7. Small field (5 or fewer): raise Beyer kill threshold by 5 points (>15 becomes >20)

### FPAD Immunities (check BEFORE any kill)
- 2 or fewer career starts = immune to all Beyer-based kills
- PCO Type A + TEO claiming = immune to ALL kills
- Elite trainers (Baffert / D'Amato / O'Neill / Mandella / Powell / McCarthy / Sadler / Eurton) = always immune
- Class drop 25%+ + walked off = REDUCE ONLY −5 PP, never eliminate
- STAMINA_ELITE 9f+ turf = immune to FPAD

### FPAD Context Rules
- Walked off + physical injury = KILL absolute
- Walked off + class drop = −5 PP reduce only
- Walked off + same class = −8 PP C-tier caution
- Walked off + completely different race type = −3 PP only
- Beyer earned at higher class = reduce Beyer penalty by 50%

---

## Validated Performance Log — SA 5/3/2026

| Race | Pick | Result | Price | Notes |
|---|---|---|---|---|
| R3 Santa Barbara Stakes | Hey Jessie | WIN | $7.00 | STAKES_TURF_LONG, McCarthy Sean+Jaramillo dual elite A+ |
| R4 | Quick Kate | WIN | $7.40 | PCO+TEO Lewis Craig+Kimura confirmed A+ |
| R5 | Romantic Ride | MISS | — | RTD surface error (was dirt not turf). Maker and Sons $54 won. Calibration added. |
| R6 | Clever Clover | WIN | $11.00 | PCO+TEO McCarthy Sean+Baze confirmed A+. Exacta cashed. |
| R7 | Caves | MISS | — | Tulavia's World $26.60 won. TMSEP module added — corrects miss retroactively. |
| R8 | He's a Gangster | WIN | $11.20 | PCO+TEO Eurton+Pereira confirmed A+. 3/3 PCO+TEO on the day. |

**Record:** 4/6 wins · PCO+TEO 3/3 (100%) · HG Rule 3/3 (100%)

---

## Default Bounce-Back Flags (Seeded)

| Horse | Race | Trip | Flag | Bonus |
|---|---|---|---|---|
| Constitution Andi | SA R11 5/2/26 | Checked twice early, ran 3rd | RED | 8 |
| Plagarist | SA R11 5/2/26 | 4-wide entire trip, 6th | YELLOW | 5 |
| Yacowlef (Ire) | SA R2 5/2/26 | 3-wide turn, no rally | YELLOW | 3 |
| Mizumi | SA R1 5/2/26 | WON 3-wide on debut | WIDE WIN | 10 |
| Soul Sister | SA R9 5/2/26 | Checked 3/8 + 2-wide | RED | 6 |
| Nerida (Fr) | SA R9 5/2/26 | Slow start + traffic 1/4 and 1/8 | RED | 7 |
| Meeking | SA R4 5/2/26 | Crowded + pulled + 2-4 wide | RED | 12 |
| Miss Practical | SA R5 5/2/26 | Off slow + 3-deep + tight stretch | RED | 10 |
| Redheaded Reba | SA R6 5/2/26 | Off slow + 3-wide, lost by short head | RED | 6 |
| Novinophobia | SA R4 5/2/26 | Won 4-wide — WIDE WIN | WIDE WIN | 10 |
| Lookin At Diamond | SA R9 5/2/26 | Won 3-4 wide — WIDE WIN | WIDE WIN | 10 |
| Caves | SA R7 5/3/26 | D'Amato debut, missed — watch next | GREEN | 3 |
| Cailin Dana | SA R3 5/3/26 | 2nd in stakes — consistent grinder | YELLOW | 5 |
| Resolve | SA R3 5/3/26 | 4th — TMER B-entry confirmed | GREEN | 3 |

---

## Output Format (Claude Response Structure)

Every analysis must follow this exact structure:

```
## STEP 0: Surface Verification
## RTD: [race code]
## Weights: [module weights]
## TMER
## SMD — Finish Ability
## Filter Results
## Field Rankings
## Final Call
WIN: ...
PLACE: ...
SHOW: ...
UNDERNEATH: ...
ELIMINATE: ...
## Ticket Structure
## Active Flags
```

---

## Known Issues / Notes
- Vercel serverless functions are stateless — flags and results reset on redeploy
- DRF upload max file size: 3MB (base64 encoding adds ~33% overhead; Vercel body limit is 4.5MB)
- Supported upload formats: PDF, JPG, PNG, TXT, CSV
- `anthropic-beta: pdfs-2024-09-25` header required for PDF parsing in Claude API
