import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import ffmpeg from 'fluent-ffmpeg';
import { createWorker } from 'tesseract.js';

// use the system ffmpeg installed via the Dockerfile
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');

function extractFrames(videoPath, framesDir, fps = 1) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(framesDir, { recursive: true });
    ffmpeg(videoPath)
      .outputOptions([`-vf fps=${fps}`])
      .output(path.join(framesDir, 'frame-%03d.png'))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// basic levenshtein distance — used to catch OCR misreads like l→1, O→0, etc.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
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

// checks if a username appears in the OCR word list, exact or within edit distance
function matchUsername(username, ocrWords) {
  const needle = username.toLowerCase();
  // 1 typo allowed for short names, 2 for names 8+ chars
  const tolerance = needle.length >= 8 ? 2 : 1;
  for (const raw of ocrWords) {
    const word = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!word || Math.abs(word.length - needle.length) > tolerance) continue;
    if (word === needle) return true;
    if (levenshtein(needle, word) <= tolerance) return true;
  }
  return false;
}

export async function scanVideoForUsernames(videoPath, knownUsernames) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raidscan-'));
  const framesDir = path.join(tmpDir, 'frames');

  try {
    // 1 frame per second gives a lot more coverage than 0.5
    await extractFrames(videoPath, framesDir, 1);

    const frameFiles = fs
      .readdirSync(framesDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => path.join(framesDir, f));

    const worker = await createWorker('eng');

    // restrict tesseract to chars that can actually appear in Roblox usernames
    // this cuts down on garbage characters and improves accuracy a lot
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_',
    });

    const allWords = [];

    for (const frame of frameFiles) {
      const { data: { text } } = await worker.recognize(frame);
      if (text && text.trim()) {
        const words = text.trim().split(/\s+/);
        allWords.push(...words);
      }
    }

    await worker.terminate();

    // deduplicate words so we're not doing redundant comparisons
    const uniqueWords = [...new Set(allWords.map((w) => w.toLowerCase()))];

    const detected = knownUsernames.filter((username) =>
      matchUsername(username, uniqueWords)
    );

    return { detected, rawWords: uniqueWords };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
