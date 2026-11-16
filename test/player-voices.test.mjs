// Which voices the floating player's menu lists, given the "Voices in the player" setting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VOICES, playerVoices } from "../src/settings.js";

const ids = (voices) => voices.map((v) => v.id);

test("lists every voice when the setting was never saved", () => {
  assert.deepEqual(ids(playerVoices(null, "af_heart")), ids(VOICES));
});

test("lists only enabled voices, in catalog order", () => {
  assert.deepEqual(ids(playerVoices(["pm_alex", "bf_emma", "pf_dora"], "bf_emma")), ["bf_emma", "pf_dora", "pm_alex"]);
});

test("always includes the current voice, so the menu can show it", () => {
  assert.deepEqual(ids(playerVoices(["pf_dora"], "af_bella")), ["af_bella", "pf_dora"]);
});

test("ignores unknown ids", () => {
  assert.deepEqual(ids(playerVoices(["xx_gone", "pf_dora"], "pf_dora")), ["pf_dora"]);
});
