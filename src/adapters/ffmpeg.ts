import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "../lib/env";

/**
 * ffmpeg ラッパー — 音声抽出・音量統計・フレーム抽出。
 * すべて一時ディレクトリで処理し、呼び出し側にBufferを返す。
 */

function run(args: string[], input?: Buffer): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env().FFMPEG_PATH, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (d) => out.push(d));
    proc.stderr.on("data", (d) => err.push(d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr });
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
    if (input) {
      proc.stdin.on("error", () => {}); // ffmpegが早期closeした場合のEPIPE防止
      proc.stdin.end(input);
    } else {
      proc.stdin.end();
    }
  });
}

async function withTempFile<T>(data: Buffer, ext: string, fn: (p: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pda-ffmpeg-"));
  const p = path.join(dir, `input.${ext}`);
  await fs.writeFile(p, data);
  try {
    return await fn(p);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** webm等の録画から 16kHz mono WAV を抽出する */
export async function extractAudio(video: Buffer, ext = "webm"): Promise<Buffer> {
  return withTempFile(video, ext, async (p) => {
    const { stdout } = await run([
      "-i", p,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-f", "wav",
      "pipe:1",
    ]);
    return stdout;
  });
}

/** メディアの再生時間（秒）— デコードして実時間を計測（webmはヘッダにdurationが無いことがある） */
export async function probeDuration(media: Buffer, ext = "webm"): Promise<number> {
  return withTempFile(media, ext, async (p) => {
    const { stderr } = await run(["-i", p, "-f", "null", "-"]).catch((e: Error) => ({
      stdout: Buffer.alloc(0),
      stderr: e.message,
    }));
    const m = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
    if (m && m.length) {
      const last = m[m.length - 1]!.match(/time=(\d+):(\d+):(\d+\.\d+)/)!;
      return parseInt(last[1]!, 10) * 3600 + parseInt(last[2]!, 10) * 60 + parseFloat(last[3]!);
    }
    return 0;
  });
}

export interface LoudnessStats {
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
}

/** 平均・最大音量（volumedetect） */
export async function loudnessStats(audio: Buffer, ext = "wav"): Promise<LoudnessStats> {
  return withTempFile(audio, ext, async (p) => {
    const { stderr } = await run(["-i", p, "-af", "volumedetect", "-f", "null", "-"]).catch(
      (e: Error) => ({ stdout: Buffer.alloc(0), stderr: e.message }),
    );
    const mean = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?) dB/);
    const max = stderr.match(/max_volume:\s*(-?\d+(\.\d+)?) dB/);
    return {
      meanVolumeDb: mean ? parseFloat(mean[1]!) : null,
      maxVolumeDb: max ? parseFloat(max[1]!) : null,
    };
  });
}

/**
 * フレーム抽出（既定 0.5fps・幅480px JPEG）。
 * 戻り値はタイムスタンプ付きJPEG（アイコンタクト判定用）。
 */
export async function extractFrames(
  video: Buffer,
  ext = "webm",
  fps = 0.5,
  maxFrames = 120,
): Promise<Array<{ jpeg: Buffer; timestampSec: number }>> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pda-frames-"));
  const input = path.join(dir, `input.${ext}`);
  await fs.writeFile(input, video);
  try {
    await run([
      "-i", input,
      "-vf", `fps=${fps},scale=480:-1`,
      "-q:v", "5",
      "-frames:v", String(maxFrames),
      path.join(dir, "frame-%04d.jpg"),
    ]);
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith("frame-")).sort();
    const frames: Array<{ jpeg: Buffer; timestampSec: number }> = [];
    for (const [i, f] of files.entries()) {
      frames.push({
        jpeg: await fs.readFile(path.join(dir, f)),
        timestampSec: +(i / fps).toFixed(1),
      });
    }
    return frames;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
