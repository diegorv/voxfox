// Loads the model and speaks through the bundled worker, then fails if anything was
// logged as a warning or error: Chrome lists those on the extension's Errors page.
// Run after `npm run build`: node test/console-check.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const pdir = `${homedir()}/.cache/puppeteer/chrome`;
const exe = process.env.CHROME_PATH || readdirSync(pdir).sort().reverse()
  .map((v) => `${pdir}/${v}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find(existsSync);
const browser = await puppeteer.launch({ executablePath: exe, headless: false, pipe: true, enableExtensions: [path.resolve("dist")], args: ["--enable-unsafe-webgpu"] });

const noise = [];
try {
  const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker")).worker();
  // Close the options page that opens on install (as e2e.mjs does) before testing.
  await new Promise((r) => setTimeout(r, 800));
  for (const p of await browser.pages()) if (p.url().includes("options.html")) await p.close();
  const page = await browser.newPage();
  const record = (where) => (m) => {
    if (["warn", "warning", "error"].includes(m.type())) noise.push(`[${where} ${m.type()}] ${m.text()}`);
  };
  page.on("console", record("page"));
  page.on("workercreated", (w) => w.on("console", record("worker")));
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/offscreen.html`);

  for (const engine of ["auto", "wasm"]) {
    const results = await page.evaluate(async (engine) => {
      const w = new Worker("tts-worker.js", { type: "module" });
      const speak = (id, voice, text) => new Promise((resolve) => {
        w.onmessage = (e) => {
          if (e.data.type === "audio" && e.data.id === id) resolve({ voice, seconds: +(e.data.samples.length / e.data.sampleRate).toFixed(2) });
          if (e.data.type === "error") resolve({ voice, error: e.data.message });
        };
        w.postMessage({ type: "generate", id, engine, voice, speed: 1, text });
      });
      const out = [await speak(1, "af_heart", "A short English sentence."), await speak(2, "pf_dora", "Uma frase curta em português.")];
      w.terminate();
      return out;
    }, engine);
    console.log(engine, results);
    if (results.some((r) => r.error || !(r.seconds > 0.5))) throw new Error(`speech failed on ${engine}`);
  }
} finally {
  await browser.close();
}

if (noise.length) {
  console.error(`${noise.length} warning/error message(s):\n${noise.join("\n")}`);
  process.exit(1);
}
console.log("no warnings or errors ✅");
