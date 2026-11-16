// Runs Kokoro inside a dedicated Web Worker so speech generation never blocks
// audio playback or the offscreen document's message handling.
import { KokoroTTS, env } from "kokoro-js";
import createEspeak from "@echogarden/espeak-ng-emscripten";
import { createPtPhonemizer } from "./phonemize-pt.js";

const phonemizePt = createPtPhonemizer(createEspeak);

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// Load the ONNX Runtime WASM binaries from the extension package rather than a CDN.
env.wasmPaths = new URL("./ort/", self.location.href).href;

let tts = null;
let loading = null;
let device = null;

async function pickDevice(preference) {
  if (preference === "wasm") return "wasm";
  if (!("gpu" in navigator)) return "wasm";
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

function load(preference) {
  if (loading) return loading;
  loading = (async () => {
    device = await pickDevice(preference);
    // fp32 is recommended for WebGPU (fp16/q8 can sound off there); q8 is fast and small on CPU.
    const dtype = device === "webgpu" ? "fp32" : "q8";

    const files = new Map();
    let lastSent = 0;
    const progress_callback = (p) => {
      if (p.status === "progress" && p.total) {
        files.set(p.file, { loaded: p.loaded, total: p.total });
        const now = Date.now();
        if (now - lastSent < 150) return;
        lastSent = now;
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        postMessage({ type: "progress", loaded, total });
      }
    };

    try {
      tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype, device, progress_callback });
    } catch (err) {
      if (device !== "webgpu") throw err;
      console.warn("[VoxFox] WebGPU init failed, falling back to WASM", err);
      device = "wasm";
      tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device, progress_callback });
    }
    postMessage({ type: "ready", device });
    return tts;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load(msg.engine);
    } else if (msg.type === "generate") {
      const model = await load(msg.engine);
      const options = { voice: msg.voice, speed: msg.speed ?? 1 };
      // kokoro-js rejects non-English voices in generate(), but generate_from_ids()
      // takes any voice from the model repo, so Portuguese is phonemized here.
      const audio = msg.voice.startsWith("p")
        ? await model.generate_from_ids(model.tokenizer(await phonemizePt(msg.text), { truncation: true }).input_ids, options)
        : await model.generate(msg.text, options);
      const samples = audio.audio;
      postMessage(
        { type: "audio", id: msg.id, samples, sampleRate: audio.sampling_rate },
        [samples.buffer],
      );
    }
  } catch (err) {
    console.error("[VoxFox worker]", err);
    postMessage({ type: "error", id: msg.id, message: String(err?.message || err) });
  }
};
