// Runs Kokoro inside a dedicated Web Worker so speech generation never blocks
// audio playback or the offscreen document's message handling.
import { KokoroTTS, env } from "kokoro-js";
import { AutoTokenizer, StyleTextToSpeech2Model } from "@huggingface/transformers";
import createEspeak from "@echogarden/espeak-ng-emscripten";
import { createPtPhonemizer } from "./phonemize-pt.js";

const phonemizePt = createPtPhonemizer(createEspeak);

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// Load the ONNX Runtime WASM binaries from the extension package rather than a CDN.
env.wasmPaths = new URL("./ort/", self.location.href).href;

// transformers.js warns for every model file the Hugging Face CDN serves without
// Content-Length (utils/hub.js, readResponse); the download works regardless, and
// Chrome would list each warning on the extension's Errors page.
const warn = console.warn;
console.warn = (...args) => {
  if (!String(args[0]).startsWith("Unable to determine content-length")) warn(...args);
};

// Same as KokoroTTS.from_pretrained, which has no way to pass session options.
// ONNX Runtime logs warnings by default (logSeverityLevel 2), such as
// VerifyEachNodeIsAssignedToAnEp for every WebGPU session; 3 keeps errors only.
async function fromPretrained(options) {
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(MODEL_ID, { ...options, session_options: { logSeverityLevel: 3 } }),
    AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: options.progress_callback }),
  ]);
  return new KokoroTTS(model, tokenizer);
}

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
      tts = await fromPretrained({ dtype, device, progress_callback });
    } catch (err) {
      if (device !== "webgpu") throw err;
      console.warn("[VoxFox] WebGPU init failed, falling back to WASM", err);
      device = "wasm";
      tts = await fromPretrained({ dtype: "q8", device, progress_callback });
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
