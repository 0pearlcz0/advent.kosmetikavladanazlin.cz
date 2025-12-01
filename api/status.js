import { createClient } from 'redis';

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
  try {
    const c = await getClient();
    const countsRaw = await c.get('counts');
    const counts = countsRaw ? JSON.parse(countsRaw) : {};
    res.status(200).json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Chyba při čtení z Redis', details: err.message });
  }
}
