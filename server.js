const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const REWARDS_FILE = path.join(__dirname, 'rewards.txt');
const COUNTS_FILE = path.join(__dirname, 'counts.json');
const EMAILS_LOG = path.join(__dirname, 'emails.txt');

function loadRewards() {
  try {
    const raw = fs.readFileSync(REWARDS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Nelze načíst rewards.txt', e);
    return null;
  }
}

function loadCounts() {
  try {
    if (!fs.existsSync(COUNTS_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(COUNTS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.error('Chyba při načítání counts.json', e);
    return {};
  }
}

function saveCounts(counts) {
  try {
    fs.writeFileSync(COUNTS_FILE, JSON.stringify(counts, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Chyba při zápisu counts.json', e);
    return false;
  }
}

app.get('/api/status', (req, res) => {
  const counts = loadCounts();
  res.json(counts);
});

app.post('/api/claim', (req, res) => {
  const { day, email } = req.body || {};
  if (!day || !email) {
    return res.status(400).json({ error: 'Chybí day nebo email' });
  }
  const rewards = loadRewards();
  if (!rewards) return res.status(500).json({ error: 'Konfigurace odměn nedostupná' });

  const dayStr = String(day);
  const dayCfg = rewards.days && rewards.days[dayStr];
  if (!dayCfg) return res.status(400).json({ error: 'Pro tento den není nastavena odměna' });

  const counts = loadCounts();
  if (!counts[dayStr]) {
    counts[dayStr] = { count: 0, emails: [] };
  }

  const usedEmails = counts[dayStr].emails || [];
  const emailLower = String(email).trim().toLowerCase();
  if (usedEmails.includes(emailLower)) {
    return res.status(409).json({ error: 'Tento e‑mail již dnes odměnu získal' });
  }

  const usedCount = counts[dayStr].count || 0;
  const limit = dayCfg.dailyLimit || 3;
  if (usedCount >= limit) {
    return res.status(409).json({ error: 'Dnešní limit je vyčerpán' });
  }

  const code = (dayCfg.codes && dayCfg.codes[usedCount]) || null;
  if (!code) {
    return res.status(409).json({ error: 'Kódy pro dnešek došly' });
  }

  counts[dayStr].count = usedCount + 1;
  counts[dayStr].emails = [...usedEmails, emailLower];

  const ok = saveCounts(counts);
  if (!ok) {
    return res.status(500).json({ error: 'Chyba při ukládání stavu' });
  }

  const ts = new Date().toISOString();
  const line = `${ts} | Den ${dayStr} | ${emailLower} | Kód: ${code}\n`;
  try {
    fs.appendFileSync(EMAILS_LOG, line, 'utf8');
  } catch (e) {
    console.error('Chyba při zápisu do emails.txt', e);
  }

  return res.json({
    success: true,
    day: dayStr,
    code,
    title: dayCfg.title,
    description: dayCfg.description,
    remaining: Math.max(limit - counts[dayStr].count, 0)
  });
});

app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});

