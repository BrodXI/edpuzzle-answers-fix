import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const {keywords, relevantPassages} = require("../companion/companion.js");

test("relevance search ranks transcript excerpts without pretending to know answers", () => {
  const transcript = [
    "The mitochondrion uses oxygen for aerobic respiration to produce ATP.",
    "The cell membrane controls the movement of material into cells.",
    "During respiration the mitochondrion releases energy as ATP."
  ].join("\n");
  const results = relevantPassages("What organelle performs aerobic respiration and makes ATP?", transcript);
  assert.equal(results.length, 2);
  assert.match(results[0].text, /mitochondrion/i);
  assert.ok(results[0].score >= results[1].score);
  assert.equal(relevantPassages("", transcript).length, 0);
  assert.equal(keywords("the the and membrane").join(","), "membrane");
});

test("bookmarklet is standalone and does not call remote servers", () => {
  const bookmarklet = readFileSync(new URL("../companion/companion.bookmarklet.txt", import.meta.url), "utf8").trim();
  assert.match(bookmarklet, /^javascript:(?:!function|\()/);
  assert.doesNotMatch(bookmarklet, /https?:\/\//);
  assert.doesNotMatch(bookmarklet, /\bfetch\s*\(/);
  assert.doesNotMatch(bookmarklet, /\beval\s*\(/);
  assert.ok(bookmarklet.length < 30000, `Unexpectedly large bookmarklet: ${bookmarklet.length}`);
});

test("bookmarklet creates an overlay, controls visible video and supports on-device AI", async () => {
  const listeners = new Map();
  const nodes = new Map();
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: "", value: "", disabled: false,
      addEventListener: (name, handler) => listeners.set(`${id}:${name}`, handler)
    });
    return nodes.get(id);
  };
  let mounted = null;
  let destroyed = false;
  const video = {
    closest: () => null,
    getBoundingClientRect: () => ({width: 400, height: 300}),
    textTracks: [{cues: [{text: "Mitochondria make ATP."}]}],
    duration: 125,
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    async play() { this.paused = false; },
    pause() { this.paused = true; }
  };
  const doc = {
    getElementById: () => mounted,
    createElement: () => ({
      id: "", style: {},
      attachShadow: () => ({innerHTML: "", getElementById: getNode}),
      remove() { mounted = null; }
    }),
    body: {append(element) { mounted = element; }},
    querySelectorAll: selector => selector === "video" ? [video] : []
  };
  const sandbox = {
    window: {
      document: doc,
      getSelection: () => ({toString: () => "What is cellular respiration?"}),
      getComputedStyle: () => ({display: "block", visibility: "visible"}),
      LanguageModel: {
        async create() {
          return {
            async prompt() { return "Respiration generates ATP through cellular processes."; },
            destroy() { destroyed = true; }
          };
        }
      }
    }
  };
  const bookmarklet = readFileSync(new URL("../companion/companion.bookmarklet.txt", import.meta.url), "utf8").trim();
  const script = bookmarklet.slice("javascript:".length);
  vm.runInNewContext(script, sandbox);
  assert.ok(mounted, "Panel must mount on first invocation");
  listeners.get("capture:click")();
  assert.equal(getNode("question").value, "What is cellular respiration?");
  getNode("captions").value = "Cellular respiration produces ATP in mitochondria.";
  listeners.get("find:click")();
  assert.match(getNode("result").textContent, /ATP/);
  listeners.get("captions-button:click")();
  assert.match(getNode("captions").value, /Mitochondria/);
  getNode("speed").value = "1.75";
  listeners.get("speed:input")();
  assert.equal(video.playbackRate, 1.75);
  listeners.get("seek:click")();
  assert.equal(video.currentTime, 124);
  await listeners.get("toggle:click")();
  assert.equal(video.paused, false);
  await listeners.get("ai:click")();
  assert.match(getNode("result").textContent, /Respiration generates ATP/);
  assert.equal(destroyed, true);
  vm.runInNewContext(script, sandbox);
  assert.equal(mounted, null, "Second invocation must close panel");
});
