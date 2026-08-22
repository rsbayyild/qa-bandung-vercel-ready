import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chunkDir = path.join(root, 'bootstrap');
const parts = fs.readdirSync(chunkDir)
  .filter((name) => /^part-\d+$/.test(name))
  .sort();

if (!parts.length) throw new Error('No bootstrap source chunks found');

const b64 = parts.map((name) => fs.readFileSync(path.join(chunkDir, name), 'utf8')).join('');
const archive = path.join(os.tmpdir(), `qa-bandung-${process.pid}.tgz`);
fs.writeFileSync(archive, Buffer.from(b64, 'base64'));
execFileSync('tar', ['-xzf', archive, '-C', root], { stdio: 'inherit' });
fs.unlinkSync(archive);
console.log(`Prepared frontend source from ${parts.length} bootstrap chunks.`);
