# SSM Elite Race Analyzer v3.3

Professional horse racing handicapping system — validated Santa Anita 5/3/2026.

## Deploy to Vercel in 5 Steps

### Step 1 — GitHub
1. Go to github.com → New repository → name it `ssm-elite`
2. Upload all these files keeping the exact folder structure:
   ```
   ssm-elite/
   ├── api/
   │   ├── analyze.js
   │   ├── flags.js
   │   └── results.js
   ├── public/
   │   └── index.html
   ├── src/
   │   ├── App.js
   │   └── index.js
   ├── package.json
   └── vercel.json
   ```

### Step 2 — Vercel
1. Go to vercel.com → Sign up free (use GitHub login)
2. Click "Add New Project"
3. Import your `ssm-elite` GitHub repo
4. Vercel auto-detects React — no config needed

### Step 3 — Add API Key (CRITICAL)
1. In Vercel project → Settings → Environment Variables
2. Add new variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key (from console.anthropic.com)
3. Click Save

### Step 4 — Deploy
1. Click Deploy
2. Wait ~60 seconds
3. Vercel gives you a URL like `ssm-elite.vercel.app`

### Step 5 — Use It
Open the URL on your phone at the track. Bookmark it.

---

## What's Included

**3 Tabs:**
- 🏇 **Analyze** — Paste race info + PP data → full SSM Elite v3.3 pipeline runs via Claude API
- 🚩 **Flags** — Manage bounce-back flags (add/remove, auto-loaded into every analysis)
- 📊 **Results** — Log race outcomes, track win rate, avg price, PCO+TEO record

**3 API Routes:**
- `/api/analyze` — Secure Claude API call (key never exposed to browser)
- `/api/flags` — Bounce-back flag storage (GET/POST/DELETE)
- `/api/results` — Race results log (GET/POST)

**Pre-loaded Data:**
- All validated bounce-back flags from SA 5/2-5/3/2026
- Full results log from 5/3/2026 card
- System stats (win rate, avg price, PCO+TEO record)

---

## System Performance (5/3/2026)
- Win Rate: 67% (4/6 resolved races)
- Board Rate: 83%
- PCO+TEO Rule: 3/3 (100%) — Quick Kate $7.40, Clever Clover $11.00, He's a Gangster $11.20
- Hg Gate Rule: 3/3 (100%)
- Avg Win Price: $9.20

## Validated Rules
- PCO+TEO claiming = WIN pick always, FPAD immune
- Hg most recent + 10 days + dirt sprint = GR 95
- TMSEP (turf maiden sprint experience +5/+10/+15)
- Pattern E ≤2 starts = CT 68 not 55
- Walked off + different race type = -3PP only
- Small field ≤5 runners = raise SMD kill threshold +5

---

## Upgrading (Future Races)
Every time you update the system prompt with new calibrations:
1. Edit `api/analyze.js` — update `SSM_SYSTEM_PROMPT`
2. Commit to GitHub
3. Vercel auto-deploys in 30 seconds

## Adding Persistent Storage (Optional Upgrade)
For flags/results to survive redeploys:
1. Vercel Dashboard → Storage → Create KV Database
2. Connect to your project
3. Replace the in-memory arrays in `flags.js` and `results.js` with KV calls:
   ```js
   import { kv } from '@vercel/kv';
   const flags = await kv.get('flags') || [];
   await kv.set('flags', updatedFlags);
   ```

---

*For entertainment purposes only. Please gamble responsibly.*
