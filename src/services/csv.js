import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config.js';

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function writeCsv(filename, headers, rows) {
  fs.mkdirSync(paths.reportDir, { recursive: true });
  const filePath = path.join(paths.reportDir, filename);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}
