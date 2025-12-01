// api/status.js
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const countsFile = path.join(process.cwd(), 'counts.json');
  let counts = {};
  try {
    counts = JSON.parse(fs.readFileSync(countsFile, 'utf8'));
  } catch {}
  res.status(200).json(counts);
}
