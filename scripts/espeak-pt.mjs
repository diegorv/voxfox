// Cuts @echogarden/espeak-ng-emscripten down to the files Brazilian Portuguese
// phonemization needs (~0.7 MB instead of 24 MB). Emscripten's file packager lists
// every file of espeak-ng.data, with byte offsets, in one loadPackage({...}) literal
// inside espeak-ng.js; we rewrite that literal to match a smaller data file.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const DATA_DIR = "/usr/share/espeak-ng-data/";
const KEEP = new Set(["phontab", "phonindex", "phondata", "intonations", "pt_dict", "lang/roa/pt", "lang/roa/pt-BR"]);

export const ESPEAK_JS = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@echogarden/espeak-ng-emscripten/package.json")),
  "espeak-ng.js",
);

export function slimEspeak() {
  const js = readFileSync(ESPEAK_JS, "utf8");
  const full = readFileSync(path.join(path.dirname(ESPEAK_JS), "espeak-ng.data"));

  const literal = /loadPackage\(\{files:\[(.*?)\],remote_package_size:(\d+)\}\)/s;
  const m = js.match(literal);
  if (!m || Number(m[2]) !== full.length) throw new Error("espeak-ng.js package metadata not found; check the @echogarden/espeak-ng-emscripten version");

  const files = [...m[1].matchAll(/\{filename:"([^"]+)",start:(\d+),end:(\d+)\}/g)]
    .map(([, filename, start, end]) => ({ filename, start: Number(start), end: Number(end) }))
    .filter((f) => KEEP.has(f.filename.slice(DATA_DIR.length)));
  if (files.length !== KEEP.size) throw new Error(`expected ${KEEP.size} eSpeak data files, found ${files.length}`);

  let offset = 0;
  const parts = [];
  const entries = files.map((f) => {
    parts.push(full.subarray(f.start, f.end));
    const entry = `{filename:"${f.filename}",start:${offset},end:${offset + f.end - f.start}}`;
    offset += f.end - f.start;
    return entry;
  });

  return {
    js: js.replace(literal, () => `loadPackage({files:[${entries.join(",")}],remote_package_size:${offset}})`),
    data: Buffer.concat(parts),
  };
}
