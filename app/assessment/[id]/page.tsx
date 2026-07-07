"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

type Step = "loading" | "check" | "motion" | "prep" | "listening" | "recording" | "uploading" | "processing" | "failed";

interface AssessmentInfo {
  id: string;
  role: "PM" | "LO";
  motion: string;
  status: string;
}

const PREP_SECONDS = 300;
const SPEECH_SECONDS = 180;
const AUTO_STOP_SECONDS = 215; // 3:35 で自動停止（許容範囲3:30の判定を可能にする）

function fmt(sec: number): string {
  const s = Math.max(Math.ceil(sec), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function AssessmentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const router = useRouter();
  const [info, setInfo] = useState<AssessmentInfo | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(PREP_SECONDS);
  const [memo, setMemo] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [pmAudioUrl, setPmAudioUrl] = useState("");
  const [pmPlayed, setPmPlayed] = useState(false);
  const [pmPlaying, setPmPlaying] = useState(false);
  const [progressLabel, setProgressLabel] = useState("採点を待っています…");

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 初期ロード
  useEffect(() => {
    api<AssessmentInfo>(`/api/v1/assessments/${id}`)
      .then((a) => {
        setInfo(a);
        if (a.status === "created") setStep("check");
        else if (a.status === "scored") router.push(`/report/${id}`);
        else if (a.status === "processing") setStep("processing");
        else setStep("check");
      })
      .catch((e) => setError((e as Error).message));
  }, [id, router]);

  // カメラ・マイク取得
  const initMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      // マイクレベルメーター
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        setMicLevel(Math.min(data.reduce((a, b) => a + b, 0) / data.length / 60, 1));
        if (streamRef.current) requestAnimationFrame(tick);
      };
      tick();
      return true;
    } catch {
      setError("カメラ・マイクにアクセスできません。ブラウザの許可設定を確認してください。");
      return false;
    }
  }, []);

  useEffect(() => {
    if (step === "check") void initMedia();
    return () => {
      // ページ離脱時にメディアを解放
      if (step === "processing" || step === "failed") {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [step, initMedia]);

  // 録画中の誤離脱防止
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (["prep", "listening", "recording", "uploading"].includes(step)) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step]);

  function startCountdown(seconds: number, onDone: () => void) {
    if (timerRef.current) clearInterval(timerRef.current);
    const endAt = Date.now() + seconds * 1000;
    setRemaining(seconds);
    timerRef.current = setInterval(() => {
      const left = (endAt - Date.now()) / 1000;
      setRemaining(left);
      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        onDone();
      }
    }, 250);
  }

  // ── 準備開始 ──
  async function startPrep() {
    try {
      await api(`/api/v1/assessments/${id}/prep/start`, { method: "POST" });
      setStep("prep");
      startCountdown(PREP_SECONDS, () => void afterPrep());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function afterPrep() {
    if (info?.role === "LO") {
      try {
        await api(`/api/v1/assessments/${id}/listening/start`, { method: "POST" });
      } catch {
        /* 既にlistening */
      }
      setStep("listening");
      void pollPmSpeech();
    } else {
      void startRecording();
    }
  }

  // ── LO: PMスピーチ ──
  async function pollPmSpeech() {
    for (let i = 0; i < 60; i++) {
      try {
        const res = await api<{ ready: boolean; audioUrl?: string }>(
          `/api/v1/assessments/${id}/pm-speech`,
          { method: "POST" },
        );
        if (res.ready && res.audioUrl) {
          setPmAudioUrl(res.audioUrl);
          return;
        }
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setError("PMスピーチの生成に時間がかかっています。ページを再読み込みしてください。");
  }

  // ── 録画 ──
  async function startRecording() {
    if (!streamRef.current) {
      const okMedia = await initMedia();
      if (!okMedia) return;
    }
    try {
      await api(`/api/v1/assessments/${id}/recording/start`, { method: "POST" });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const recorder = new MediaRecorder(streamRef.current!, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => void upload();
    recorderRef.current = recorder;
    recorder.start(1000);
    setStep("recording");
    startCountdown(AUTO_STOP_SECONDS, () => stopRecording());
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  async function upload() {
    setStep("uploading");
    try {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const res = await fetch(`/api/v1/assessments/${id}/media`, {
        method: "POST",
        headers: { "Content-Type": "video/webm" },
        body: blob,
      });
      if (!res.ok) {
        const p = await res.json().catch(() => null);
        throw new Error(p?.error?.message ?? "アップロードに失敗しました");
      }
      await api(`/api/v1/assessments/${id}/submit`, { method: "POST" });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStep("processing");
      watchProgress();
    } catch (e) {
      setError((e as Error).message);
      setStep("failed");
    }
  }

  // ── 採点進捗（SSE） ──
  function watchProgress() {
    const es = new EventSource(`/api/v1/assessments/${id}/events`);
    const labels: Record<string, string> = {
      extract: "音声を抽出しています…",
      transcribe: "スピーチを文字起こししています…",
      metrics: "話し方を分析しています…",
      vision: "アイコンタクトを分析しています…",
      judge: "PDAルーブリックで採点しています…",
      comments: "コメントを作成しています…",
      report: "レポートを作成しています…",
      cleanup: "仕上げをしています…",
    };
    es.addEventListener("progress", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        status: string;
        detail?: { currentStep?: string };
      };
      if (data.detail?.currentStep && labels[data.detail.currentStep]) {
        setProgressLabel(labels[data.detail.currentStep]!);
      }
      if (data.status === "scored") {
        es.close();
        router.push(`/report/${id}`);
      }
      if (data.status === "failed") {
        es.close();
        setStep("failed");
      }
    });
    es.onerror = () => {
      es.close();
      // 接続断時はポーリングにフォールバック
      const poll = setInterval(async () => {
        try {
          const a = await api<AssessmentInfo>(`/api/v1/assessments/${id}`);
          if (a.status === "scored") {
            clearInterval(poll);
            router.push(`/report/${id}`);
          } else if (a.status === "failed") {
            clearInterval(poll);
            setStep("failed");
          }
        } catch {
          /* keep polling */
        }
      }, 3000);
    };
  }

  // ─────────── 画面 ───────────

  if (!info && !error) return <main className="p-10 text-center text-slate-400">読み込み中…</main>;

  const prepWarning = step === "prep" && remaining <= 30;
  const recElapsed = SPEECH_SECONDS - (remaining - (AUTO_STOP_SECONDS - SPEECH_SECONDS));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1b2a5e]">
          {info?.role === "PM" ? "PM Assessment" : "LO Assessment"}
        </h1>
        {["check", "motion"].includes(step) && (
          <a href="/" className="text-sm text-slate-500 hover:underline">ホームに戻る</a>
        )}
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* ステップ1: 機材チェック */}
      {step === "check" && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">1. カメラ・マイクの確認</h2>
          <video ref={videoRef} autoPlay muted playsInline className="mb-3 w-full rounded-lg bg-black" />
          <div className="mb-4">
            <span className="text-sm text-slate-500">マイクレベル（話してみてください）</span>
            <div className="mt-1 h-3 w-full rounded bg-slate-200">
              <div
                className="h-3 rounded bg-green-500 transition-all"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          </div>
          <div className="mb-4 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed">
            <p className="font-semibold">受験の流れ</p>
            <p>
              論題表示 → 準備 5分 →{info?.role === "LO" && " AIのPMスピーチを聞く（約3分）→"} スピーチ 3分（録画）→ AI採点（2〜4分）→ レポート表示
            </p>
            <p className="mt-2 text-xs text-slate-500">
              ※ 録画はAI採点のためだけに使われ、採点完了後に自動削除されます（管理者設定で保存される場合は事前に案内されます）。
            </p>
          </div>
          <button
            onClick={() => setStep("motion")}
            disabled={!streamRef.current}
            className="w-full rounded-lg bg-[#1b2a5e] py-3 font-semibold text-white disabled:opacity-50"
          >
            確認できた — 論題を見る
          </button>
        </section>
      )}

      {/* ステップ2: 論題 */}
      {step === "motion" && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">2. 論題（Motion）</h2>
          <p className="mb-6 rounded-xl bg-[#1b2a5e] p-6 text-center text-xl font-bold text-white">
            {info?.motion}
          </p>
          <p className="mb-4 text-sm text-slate-600">
            「準備を開始」を押すと5分の準備時間が始まります。準備時間中はメモを取れます。
            {info?.role === "LO" && " 準備時間のあと、AIのPMスピーチを聞いてから反論スピーチを行います。"}
          </p>
          <button
            onClick={startPrep}
            className="w-full rounded-lg bg-[#1b2a5e] py-3 font-semibold text-white"
          >
            準備を開始する（5:00）
          </button>
        </section>
      )}

      {/* ステップ3: 準備 */}
      {step === "prep" && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">3. 準備時間</h2>
            <span className={`rounded-lg px-4 py-2 text-2xl font-bold ${prepWarning ? "bg-red-100 text-red-700" : "bg-slate-100"}`}>
              {fmt(remaining)}
            </span>
          </div>
          <p className="mb-2 rounded-lg bg-slate-50 p-3 text-sm font-semibold">{info?.motion}</p>
          <p className="mb-2 text-xs text-slate-500">
            メモ（この端末内だけで使われ、採点には影響しません）
            {info?.role === "PM"
              ? " — 構成: 定義（必要なら）/ Point 1 / Point 2 / Point 1 の詳しい説明"
              : " — 構成: Government Point 1 への反論 / Opposition Point 1 / Point 2 / Point 1 の詳しい説明"}
          </p>
          <textarea
            className="mb-4 h-48 w-full rounded-lg border border-slate-300 p-3 text-sm"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="ここにメモを書けます…"
          />
          <button
            onClick={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              void afterPrep();
            }}
            className="w-full rounded-lg border border-[#1b2a5e] py-3 font-semibold text-[#1b2a5e]"
          >
            早めに次へ進む
          </button>
        </section>
      )}

      {/* ステップ3.5 (LO): PMスピーチ再生 */}
      {step === "listening" && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">4. AIのPMスピーチを聞く</h2>
          <p className="mb-4 text-sm text-slate-600">
            肯定側（PM）のスピーチです。メモを取りながら聞き、終わったら反論スピーチを始めてください。（早送りはできません）
          </p>
          {!pmAudioUrl ? (
            <p className="mb-4 animate-pulse rounded-lg bg-slate-50 p-6 text-center text-slate-500">
              PMスピーチを準備しています…
            </p>
          ) : (
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-slate-50 p-4">
              <button
                onClick={() => {
                  if (!audioRef.current) return;
                  if (pmPlaying) {
                    audioRef.current.pause();
                    setPmPlaying(false);
                  } else {
                    void audioRef.current.play();
                    setPmPlaying(true);
                  }
                }}
                className="rounded-full bg-[#1b2a5e] px-6 py-3 font-semibold text-white"
              >
                {pmPlaying ? "一時停止" : pmPlayed ? "もう一度再生" : "再生する"}
              </button>
              <span className="text-sm text-slate-500">
                {pmPlayed ? "再生が終わりました。反論スピーチを始められます。" : "再生ボタンを押してください"}
              </span>
              <audio
                ref={audioRef}
                src={pmAudioUrl}
                onEnded={() => {
                  setPmPlayed(true);
                  setPmPlaying(false);
                }}
              />
            </div>
          )}
          <textarea
            className="mb-4 h-32 w-full rounded-lg border border-slate-300 p-3 text-sm"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="反論メモ…"
          />
          <button
            onClick={() => void startRecording()}
            disabled={!pmPlayed}
            className="w-full rounded-lg bg-[#7a1f2b] py-3 font-semibold text-white disabled:opacity-40"
          >
            LOスピーチを開始する（録画スタート）
          </button>
        </section>
      )}

      {/* ステップ4: 録画 */}
      {step === "recording" && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-600" />
              スピーチ中（録画しています）
            </h2>
            <span className="rounded-lg bg-slate-900 px-4 py-2 text-2xl font-bold text-white">
              {fmt(Math.max(recElapsed, 0))} / 3:00
            </span>
          </div>
          <p className="mb-2 rounded-lg bg-slate-50 p-3 text-sm font-semibold">{info?.motion}</p>
          <video ref={(el) => {
            videoRef.current = el;
            if (el && streamRef.current && el.srcObject !== streamRef.current) {
              el.srcObject = streamRef.current;
            }
          }} autoPlay muted playsInline className="mb-2 w-full rounded-lg bg-black" />
          <div className="mb-4 flex justify-between text-xs text-slate-500">
            <span>1:30 〜 スコア対象</span>
            <span>2:30 〜 規定範囲</span>
            <span>3:30 で終了（3:35 自動停止）</span>
          </div>
          {memo && (
            <details className="mb-4 rounded-lg bg-amber-50 p-3 text-sm">
              <summary className="cursor-pointer font-semibold">メモを見る</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans">{memo}</pre>
            </details>
          )}
          <button
            onClick={stopRecording}
            className="w-full rounded-lg bg-red-600 py-3 font-semibold text-white"
          >
            スピーチを終了する
          </button>
        </section>
      )}

      {/* アップロード・採点中 */}
      {(step === "uploading" || step === "processing") && (
        <section className="rounded-2xl bg-white p-10 text-center shadow">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#1b2a5e]" />
          <h2 className="mb-2 text-lg font-semibold">
            {step === "uploading" ? "録画をアップロードしています…" : "AI採点中です"}
          </h2>
          {step === "processing" && <p className="text-sm text-slate-500">{progressLabel}</p>}
          <p className="mt-4 text-xs text-slate-400">このままお待ちください（通常2〜4分）。</p>
        </section>
      )}

      {step === "failed" && (
        <section className="rounded-2xl bg-white p-10 text-center shadow">
          <h2 className="mb-2 text-lg font-semibold text-red-700">採点処理に失敗しました</h2>
          <p className="mb-6 text-sm text-slate-500">
            申し訳ありません。システムの問題により採点できませんでした。管理者に通知されています。
            もう一度受験するか、時間をおいてお試しください。
          </p>
          <a href="/" className="rounded-lg bg-[#1b2a5e] px-6 py-3 font-semibold text-white">
            ホームに戻る
          </a>
        </section>
      )}
    </main>
  );
}
