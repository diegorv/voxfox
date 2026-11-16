// Brazilian Portuguese grapheme-to-phoneme, mirroring Kokoro's reference pipeline:
// misaki's EspeakG2P(language="pt-br") (misaki/espeak.py, v0.9.4). kokoro-js only
// phonemizes English, so Portuguese voices go through this instead.

// Same punctuation split kokoro-js uses: punctuation passes through untouched,
// the text between it is phonemized.
const PUNCTUATION = /(\s*[;:,.!?¡¿—…"«»“”(){}[\]]+\s*)+/g;

// misaki's EspeakG2P.e2m, applied in the same (sorted) order. "^" ties the
// characters of one multi-letter eSpeak phoneme, so "t^ʃ" never matches t + ʃ.
const E2M = Object.entries({
  "a^ɪ": "I", "a^ʊ": "W",
  "d^z": "ʣ", "d^ʒ": "ʤ",
  "e^ɪ": "A",
  "o^ʊ": "O", "ə^ʊ": "Q",
  "s^s": "S",
  "t^s": "ʦ", "t^ʃ": "ʧ",
  "ɔ^ɪ": "Y",
}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

// Spacing modifiers (stress marks, ː) and combining diacritics never get a tie,
// matching eSpeak's own tie insertion.
const isModifier = (c) => c >= "ʰ" && c <= "ͯ";

function tie(phoneme) {
  let out = "";
  for (const c of phoneme) {
    if (out && !isModifier(c) && !isModifier(out.at(-1))) out += "^";
    out += c;
  }
  return out;
}

// eSpeak returns phonemes separated by "_", words by " " and clauses by " | ".
function toKokoro(espeakOutput) {
  let ps = espeakOutput
    .split(" | ")
    .join(" ")
    .split(" ")
    .map((word) => word.split("_").filter(Boolean).map(tie).join(""))
    .filter(Boolean)
    .join(" ");
  for (const [from, to] of E2M) ps = ps.replaceAll(from, to);
  return ps.replaceAll("^", "").replaceAll("-", "");
}

// createModule: the default export of @echogarden/espeak-ng-emscripten.
export function createPtPhonemizer(createModule) {
  let ready = null;
  const init = () =>
    (ready ??= createModule().then((m) => {
      const worker = new m.eSpeakNGWorker();
      if (worker.set_voice("pt-br") !== 0) throw new Error("eSpeak pt-br voice failed to load");
      const decoder = new TextDecoder();
      return (text) => {
        // text_to_phonemes returns a C string in wasm memory.
        const ptr = m.getPointer(worker.text_to_phonemes(text, 1));
        const heap = m.HEAPU8;
        let end = ptr;
        while (heap[end]) end++;
        return decoder.decode(heap.subarray(ptr, end));
      };
    }));

  return async function phonemize(text) {
    const espeak = await init();
    let out = "";
    let last = 0;
    for (const match of text.matchAll(PUNCTUATION)) {
      out += toKokoro(espeak(text.slice(last, match.index))) + match[0];
      last = match.index + match[0].length;
    }
    if (last < text.length) out += toKokoro(espeak(text.slice(last)));
    return out.trim();
  };
}
