import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';

let client;

// Pomocná funkce pro připojení k Redis
async function getClient() {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', err => console.error('Redis Client Error', err));
    await client.connect();
  }
  return client;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Použij POST' });
  }

  try {
    const { day, email } = req.body;
    if (!day || !email) {
      return res.status(400).json({ error: 'Chybí den nebo email' });
    }

    // Načti rewards.json ze složky public
    const rewardsPath = path.join(process.cwd(), 'public', 'rewards.json');
    const rewards = JSON.parse(fs.readFileSync(rewardsPath, 'utf8'));

    const c = await getClient();
    let countsRaw = await c.get('counts');
    let counts = countsRaw ? JSON.parse(countsRaw) : {};

    const dayStr = String(day);
    if (!counts[dayStr]) counts[dayStr] = { count: 0, emails: [] };

    const emailLower = email.toLowerCase();
    if (counts[dayStr].emails.includes(emailLower)) {
      return res.status(409).json({ error: 'Email už použil odměnu' });
    }

    const dayCfg = rewards.days[dayStr];
    if (!dayCfg) {
      return res.status(400).json({ error: 'Pro tento den není nastavena odměna' });
    }

    const limit = dayCfg.dailyLimit || 3;
    if (counts[dayStr].count >= limit) {
      return res.status(409).json({ error: 'Denní limit vyčerpán' });
    }

    const code = dayCfg.codes[counts[dayStr].count];
    counts[dayStr].count++;
    counts[dayStr].emails.push(emailLower);

    await c.set('counts', JSON.stringify(counts));

    return res.status(200).json({
      code,
      title: dayCfg.title,
      description: dayCfg.description,
      remaining: Math.max(limit - counts[dayStr].count, 0)
    });
  } catch (err) {
    console.error('Chyba v claim handleru:', err);
    res.status(500).json({ error: 'Chyba při zpracování požadavku', details: err.message });
  }
}
