// Brazilian Portuguese phonemization must match what Kokoro's reference pipeline
// (misaki 0.9.4, EspeakG2P(language="pt-br")) produces, using the slimmed eSpeak
// build that ships in the extension. Run with: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { slimEspeak } from "../scripts/espeak-pt.mjs";
import { createPtPhonemizer } from "../src/phonemize-pt.js";

// Generated with misaki 0.9.4 + espeak-ng 1.52 (espeakng-loader 0.2.4).
const REFERENCE = [
  {
    text: "Olá, tudo bem? A tia do Rio de Janeiro comprou dezesseis pães.",
    phonemes: "olˈa, tˈudʊ bˈAŋ? a ʧˈiæ dʊ xˈiʊ ʤy ʒˌænˈAɾʊ komprˈow dˌezesˈAs pˈɐ\u0303ys.",
  },
  {
    text: "Em 1998, o Brasil tinha 170 milhões de habitantes (segundo o IBGE).",
    phonemes: "ˈAŋ mˈiʊ nˈɔvysˈAŋtʊzˌi novˈAŋtæiˈoɪtʊ, ʊ brazˈiʊ ʧˌiɲæ sˈAŋtuˌi setˈAŋtæ miljˈo\u0303jz ʤy ˌabitˈɐ\u0303ŋʧys (sˌeɡˈu\u0303ŋdw u ˈibʒy).",
  },
  {
    text: "Não sei se você já ouviu falar, mas a raposa-vermelha é um animal incrível!",
    phonemes: "nˌɐ\u0303ʊ\u0303 sˈA sy vosˌe ʒˈa owvˈiʊ falˈar, maz a xˌapˈozævˌeɾəmˈeljæ ɛ u\u0303ŋ ˌænimˈW ˌiŋkrˈiveʊ!",
  },
];

const { js, data } = slimEspeak();
const dir = mkdtempSync(path.join(tmpdir(), "voxfox-espeak-"));
writeFileSync(path.join(dir, "espeak-ng.mjs"), js);
writeFileSync(path.join(dir, "espeak-ng.data"), data);
const { default: createModule } = await import(pathToFileURL(path.join(dir, "espeak-ng.mjs")).href);
const phonemize = createPtPhonemizer(createModule);

test("slimmed eSpeak data stays small", () => {
  assert.ok(data.length < 2_000_000, `espeak-ng.data is ${data.length} bytes`);
});

for (const { text, phonemes } of REFERENCE) {
  test(`matches misaki: ${text.slice(0, 30)}…`, async () => {
    assert.equal(await phonemize(text), phonemes);
  });
}
