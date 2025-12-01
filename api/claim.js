// api/claim.js
import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Použij POST' });
  }

  const { day, email } = req.body;
  const rewards = await import('../../rewards.json'); // převedený rewards.txt na JSON

  let countsRaw = await client.get('counts');
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

  await client.set('counts', JSON.stringify(counts));

  res.status(200).json({
    code,
    title: rewards.days[day].title,
    description: rewards.days[day].description
  });
}
