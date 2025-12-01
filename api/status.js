// api/status.js
import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

export default async function handler(req, res) {
  try {
    const countsRaw = await client.get('counts');
    const counts = countsRaw ? JSON.parse(countsRaw) : {};
    res.status(200).json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Chyba při čtení z Redis' });
  }
}
