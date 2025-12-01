import { createClient } from 'redis';
import rewards from '../public/rewards.json' assert { type: 'json' };

let client;
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
    const c = await getClient();
    let countsRaw = await c.get('counts');
    let counts = countsRaw ? JSON.parse(countsRaw) : {};

    if (!counts[day]) counts[day] = { count: 0, emails: [] };

    if (counts[day].emails.includes(email.toLowerCase())) {
      return res.status(409).json({ error: 'Email už použil odměnu' });
    }

    const limit = rewards.days[day].dailyLimit;
    if (counts[day].count >= limit) {
      return res.status(409).json({ error: 'Denní limit vyčerpán' });
    }

    const code = rewards.days[day].codes[counts[day].count];
    counts[day].count++;
    counts[day].emails.push(email.toLowerCase());

    await c.set('counts', JSON.stringify(counts));

    res.status(200).json({
      code,
      title: rewards.days[day].title,
      description: rewards.days[day].description
    });
  } catch (err) {
    res.status(500).json({ error: 'Chyba při zápisu do Redis', details: err.message });
  }
}
