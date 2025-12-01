// api/claim.js
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Použij POST' });
  }
  const { day, email } = req.body;
  const rewards = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'rewards.txt'), 'utf8'));
  const countsFile = path.join(process.cwd(), 'counts.json');
  let counts = {};
  try { counts = JSON.parse(fs.readFileSync(countsFile, 'utf8')); } catch {}
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
  fs.writeFileSync(countsFile, JSON.stringify(counts, null, 2));
  res.status(200).json({ code, title: rewards.days[day].title, description: rewards.days[day].description });
}
