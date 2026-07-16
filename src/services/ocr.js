import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import ffmpeg from 'fluent-ffmpeg';
import { createWorker } from 'tesseract.js';

// fluent-ffmpeg locates the ffmpeg binary from PATH automatically.
// Do not hardcode the path — it differs between Alpine Docker (/usr/bin/ffmpeg)
// and Nix-based environments used by Railway's nixpacks builder.

function extractFrames(videoPath, framesDir, fps = 2) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(framesDir, { recursive: true });
    ffmpeg(videoPath)
      .outputOptions([`-vf fps=${fps}`])
      .output(path.join(framesDir, 'frame-%04d.png'))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Match a single username against the set of extracted words/lines.
 * Strategy (in order of cost):
 *   1. Exact match (case-insensitive)
 *   2. Substring — OCR word contains the full username
 *   3. Substring — username contains the OCR word (partial visibility)
 *   4. Levenshtein within tolerance
 */
function matchUsername(username, ocrWords, ocrLines) {
  const needle = username.toLowerCase();
  // tolerance: 1 typo for names < 8 chars, 2 for longer names
  const tolerance = needle.length >= 8 ? 2 : 1;

  // Fast exact pass over deduplicated words
  for (const raw of ocrWords) {
    const word = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!word) continue;
    if (word === needle) return true;
  }

  // Substring pass — check each cleaned word
  for (const raw of ocrWords) {
    const word = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!word || word.length < 3) continue;
    // word contains username (e.g. "playerROBLOXNAME" or "ROBLOXNAME_tag")
    if (word.includes(needle)) return true;
    // username contains word (partial OCR read of longer name)
    if (needle.length >= 5 && needle.includes(word) && word.length >= Math.ceil(needle.length * 0.6)) return true;
  }

  // Line-level pass — check raw OCR lines for embedded usernames
  for (const line of ocrLines) {
    const cleaned = line.toLowerCase().replace(/[^a-z0-9_ ]/g, '');
    if (cleaned.includes(needle)) return true;
  }

  // Fuzzy levenshtein pass (most expensive — last)
  for (const raw of ocrWords) {
    const word = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!word || Math.abs(word.length - needle.length) > tolerance) continue;
    if (levenshtein(needle, word) <= tolerance) return true;
  }

  return false;
}

/**
 * OCR a single frame file with a pre-initialized worker.
 * Returns { words: string[], lines: string[] }
 */
async function recognizeFrame(worker, framePath) {
  const { data: { text } } = await worker.recognize(framePath);
  if (!text || !text.trim()) return { words: [], lines: [] };
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const words = text.trim().split(/\s+/);
  return { words, lines };
}

export async function scanVideoForUsernames(videoPath, knownUsernames) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raidscan-'));
  const framesDir = path.join(tmpDir, 'frames');

  try {
    // 2 fps — double the coverage vs the original 1 fps
    await extractFrames(videoPath, framesDir, 2);

    const frameFiles = fs
      .readdirSync(framesDir)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(framesDir, f));

    if (frameFiles.length === 0) return { detected: [], rawWords: [] };

    // Use up to 4 parallel workers for speed
    const CONCURRENCY = Math.min(4, frameFiles.length);
    const workers = await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        const w = await createWorker('eng');
        // PSM 11 = sparse text, best for game HUDs with scattered names
        await w.setParameters({
          tessedit_pageseg_mode: '11',
          tessedit_char_whitelist:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_',
        });
        return w;
      })
    );

    const allWords = [];
    const allLines = [];

    // Process frames in batches of CONCURRENCY
    for (let i = 0; i < frameFiles.length; i += CONCURRENCY) {
      const batch = frameFiles.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((f, idx) => recognizeFrame(workers[idx % CONCURRENCY], f))
      );
      for (const { words, lines } of results) {
        allWords.push(...words);
        allLines.push(...lines);
      }
    }

    await Promise.all(workers.map((w) => w.terminate()));

    // Deduplicate for the expensive fuzzy pass
    const uniqueWords = [...new Set(allWords.map((w) => w.toLowerCase().replace(/[^a-z0-9_]/g, '')).filter(Boolean))];
    const uniqueLines = [...new Set(allLines.map((l) => l.toLowerCase()))];

    const detected = knownUsernames.filter((username) =>
      matchUsername(username, uniqueWords, uniqueLines)
    );

    return { detected, rawWords: uniqueWords };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
