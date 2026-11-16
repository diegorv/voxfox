import { DEFAULTS, VOICES, VOICE_GROUPS, getSettings, SHORTCUT_LABEL } from "./settings.js";

const $ = (id) => document.getElementById(id);
const voiceSel = $("voice");
const speed = $("speed");
const speedOut = $("speedOut");
const engine = $("engine");
const saved = $("saved");

for (const group of VOICE_GROUPS) {
  const og = document.createElement("optgroup");
  og.label = group.label;
  for (const v of VOICES.filter((v) => v.accent === group.accent)) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = `${v.name} · ${v.gender === "F" ? "female" : "male"}${v.grade ? ` · grade ${v.grade}` : ""}`;
    og.append(o);
  }
  voiceSel.append(og);
}

const s = await getSettings();
voiceSel.value = s.voice;
speed.value = s.speed;
speedOut.textContent = `${Number(s.speed).toFixed(2)}×`;
engine.value = s.engine;

let savedTimer;
async function save(patch) {
  await chrome.storage.sync.set(patch);
  saved.textContent = "Saved";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (saved.textContent = ""), 1200);
}

// "Voices in the player" checklist. The narrator's box is locked on, so the
// player's menu always contains the voice that is reading.
const enabled = new Set(s.enabledVoices ?? VOICES.map((v) => v.id));
const checks = new Map();
const enabledList = () => VOICES.map((v) => v.id).filter((id) => enabled.has(id));
for (const group of VOICE_GROUPS) {
  const fs = document.createElement("fieldset");
  fs.innerHTML = `<legend>${group.label}</legend><div class="checks"></div>`;
  for (const v of VOICES.filter((v) => v.accent === group.accent)) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = v.id;
    box.addEventListener("change", () => {
      box.checked ? enabled.add(v.id) : enabled.delete(v.id);
      save({ enabledVoices: enabledList() });
    });
    const name = document.createElement("span");
    name.textContent = `${v.name} ${v.gender === "F" ? "♀" : "♂"}`;
    label.append(box, name);
    fs.querySelector(".checks").append(label);
    checks.set(v.id, box);
  }
  $("voiceList").append(fs);
}

function syncChecks() {
  enabled.add(voiceSel.value);
  for (const [id, box] of checks) {
    box.checked = enabled.has(id);
    box.disabled = id === voiceSel.value;
    box.parentElement.title = box.disabled ? "The narrator is always in the player" : "";
  }
}
syncChecks();

voiceSel.addEventListener("change", () => {
  syncChecks();
  save({ voice: voiceSel.value, enabledVoices: enabledList() });
});
speed.addEventListener("input", () => (speedOut.textContent = `${Number(speed.value).toFixed(2)}×`));
speed.addEventListener("change", () => save({ speed: Number(speed.value) }));
engine.addEventListener("change", () => save({ engine: engine.value }));

$("preview").addEventListener("click", () => {
  const v = VOICES.find((x) => x.id === voiceSel.value) ?? VOICES[0];
  chrome.runtime.sendMessage({
    type: "voxfox:preview",
    voice: v.id,
    speed: Number(speed.value) || DEFAULTS.speed,
    text: v.accent === "Brazilian"
      ? `Oi, eu sou ${v.gender === "F" ? "a" : "o"} ${v.name}. Com o VoxFox, qualquer página vira algo que você pode ouvir.`
      : `Hi, I'm ${v.name}. With VoxFox, any page becomes something you can listen to.`,
  });
});

const dlBtn = $("download");
const dlStatus = $("dlStatus");
const dlFill = $("dlFill");
dlBtn.addEventListener("click", () => {
  dlBtn.disabled = true;
  dlStatus.textContent = "Starting…";
  chrome.runtime.sendMessage({ type: "voxfox:preload" });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "model") return;
  if (msg.modelReady) {
    dlBtn.disabled = true;
    dlBtn.textContent = "Voice model ready";
    dlStatus.textContent = `Running on ${msg.device === "webgpu" ? "GPU (WebGPU)" : "CPU (WASM)"}`;
    dlFill.style.width = "100%";
  } else if (msg.downloadProgress != null) {
    dlBtn.disabled = true;
    dlStatus.textContent = `Downloading… ${Math.round(msg.downloadProgress * 100)}%`;
    dlFill.style.width = `${msg.downloadProgress * 100}%`;
  }
});

// Ask a running engine (if any) to report its status.
chrome.runtime.sendMessage({ type: "voxfox:modelStatus" }).catch(() => {});

chrome.commands?.getAll?.().then((cmds) => {
  const c = cmds.find((c) => c.name === "_execute_action");
  $("shortcut").textContent = c?.shortcut || SHORTCUT_LABEL;
});
