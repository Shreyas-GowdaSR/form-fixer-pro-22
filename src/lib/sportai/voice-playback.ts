/** Streams PCM speech from /api/tts and plays it progressively in the browser. */
export interface VoicePlayback {
  stop: () => void;
  done: Promise<void>;
}

export async function speak(text: string, signal?: AbortSignal): Promise<VoicePlayback> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  const sources: AudioBufferSourceNode[] = [];
  let playhead = 0;
  let pending = new Uint8Array(0);
  let stopped = false;

  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort());

  const play = (incoming: Uint8Array) => {
    if (stopped) return;
    const bytes = new Uint8Array(pending.length + incoming.length);
    bytes.set(pending);
    bytes.set(incoming, pending.length);
    const usable = bytes.length - (bytes.length % 2);
    pending = bytes.slice(usable);
    if (usable === 0) return;
    const samples = new Int16Array(bytes.buffer, 0, usable / 2);
    const floats = Float32Array.from(samples, (s) => s / 32768);
    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.copyToChannel(floats, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    playhead = playhead === 0 ? ctx.currentTime + 0.08 : Math.max(playhead, ctx.currentTime);
    source.start(playhead);
    playhead += buffer.duration;
    sources.push(source);
  };

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: controller.signal,
  });
  if (!res.ok || !res.body) {
    await ctx.close().catch(() => {});
    throw new Error((await res.text().catch(() => "")) || "Could not generate the voice feedback.");
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let carry = "";

  const done = (async () => {
    try {
      while (true) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        carry += value;
        const chunks = carry.split("\n\n");
        carry = chunks.pop() ?? "";
        for (const chunk of chunks) {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let evt: { type?: string; audio?: string };
            try {
              evt = JSON.parse(payload);
            } catch {
              continue;
            }
            if (evt.type !== "speech.audio.delta" || !evt.audio) continue;
            const bin = atob(evt.audio);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            play(bytes);
          }
        }
      }
      const remaining = Math.max(0, playhead - ctx.currentTime);
      await new Promise((r) => setTimeout(r, remaining * 1000 + 120));
    } finally {
      if (!stopped) await ctx.close().catch(() => {});
    }
  })();

  return {
    stop: () => {
      stopped = true;
      controller.abort();
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      });
      void ctx.close().catch(() => {});
    },
    done,
  };
}
