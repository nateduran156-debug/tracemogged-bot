import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import ffmpeg from 'fluent-ffmpeg';
import { createWorker } from 'tesseract.js';

// use the system ffmpeg installed via the Dockerfile
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');

/**
 * Extract frames from a video at a fixed interval (fps) into a temp dir.
 */
function extractFrames(videoPath, framesDir, fps = 0.5) {
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

/**
 * Run OCR on a video and try to match text against a list of known usernames.
 * Returns { detected: string[], rawText: string[] }
 *
 * NOTE: OCR-based attendance detection is best-effort only and is NOT
 * guaranteed to be 100% accurate. Staff must review results before approving.
 */
export async function scanVideoForUsernames(videoPath, knownUsernames) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raidscan-'));
  const framesDir = path.join(tmpDir, 'frames');

  try {
    await extractFrames(videoPath, framesDir);

    const frameFiles = fs
      .readdirSync(framesDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => path.join(framesDir, f));

    const worker = await createWorker('eng');
    const rawText = [];

    for (const frame of frameFiles) {
      const {
        data: { text },
      } = await worker.recognize(frame);
      if (text && text.trim()) rawText.push(text);
    }

    await worker.terminate();

    const combinedText = rawText.join('\n').toLowerCase();

    const detected = knownUsernames.filter((username) => {
      const needle = username.toLowerCase();
      return combinedText.includes(needle);
    });

    return { detected, rawText };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
