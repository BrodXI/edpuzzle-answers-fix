// Copyright (C) 2026 BrodXI and contributors
// AGPL-3.0-only. A self-contained, browser-local Edpuzzle companion.
// No server, passwords, token requests, teacher endpoints or external APIs.
(function (win) {
  "use strict";

  const HOST_ID = "brodxi-edpuzzle-companion";
  const STOP_WORDS = new Set([
    "what", "which", "where", "when", "who", "why", "how", "this", "that",
    "they", "them", "with", "from", "your", "their", "have", "does", "did",
    "the", "and", "for", "are", "was", "were", "you", "not", "all", "can",
    "about", "into", "each", "most", "best", "answer", "question", "video"
  ]);

  function normalize(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function keywords(text) {
    return [...new Set((normalize(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
      .filter(word => !STOP_WORDS.has(word)))];
  }

  function relevantPassages(question, transcript, limit = 4) {
    const searchTerms = keywords(question);
    const parts = String(transcript || "").replace(/\r/g, "")
      .split(/(?<=[.!?])\s+|\n+/u)
      .map(normalize).filter(part => part.length >= 15);
    if (!searchTerms.length || !parts.length) return [];
    const results = parts.map((text, index) => {
      const words = new Set(keywords(text));
      const score = searchTerms.reduce((n, term) => n + (words.has(term) ? 1 : 0), 0);
      return {text: text.slice(0, 600), score, index};
    }).filter(result => result.score > 0);
    results.sort((a, b) => b.score - a.score || a.index - b.index);
    return results.slice(0, Math.max(1, Math.min(limit, 8)));
  }

  function isVisible(element, view) {
    if (!element || typeof element.getBoundingClientRect !== "function") return false;
    if (element.closest?.('[aria-hidden="true"], [hidden]')) return false;
    const rect = element.getBoundingClientRect();
    const style = view.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 &&
      style.display !== "none" && style.visibility !== "hidden";
  }

  function findVideo(doc, view) {
    return [...doc.querySelectorAll("video")].find(video => isVisible(video, view)) || null;
  }

  function visibleQuestion(doc, view) {
    const selected = normalize(view.getSelection?.()?.toString());
    if (selected.length >= 8) return selected.slice(0, 3000);
    const roots = doc.querySelectorAll(
      '[role="dialog"], dialog[open], [aria-modal="true"], [data-testid*="question"], [class*="QuestionModal"], [class*="question-modal"]'
    );
    const visible = [...roots].filter(root => isVisible(root, view))
      .map(root => normalize(root.innerText || root.textContent || ""))
      .filter(text => text.length >= 8 && text.length <= 3000);
    // Prefer the smallest complete question dialog, rather than the entire page.
    visible.sort((a, b) => a.length - b.length);
    return visible[0] || "";
  }

  function accessibleCaptions(doc, view) {
    const videos = [...doc.querySelectorAll("video")].filter(v => isVisible(v, view));
    const captions = [];
    for (const video of videos) {
      for (const track of video.textTracks || []) {
        if (!track.cues) continue;
        for (const cue of track.cues) {
          const text = normalize(cue.text.replace(/<[^>]*>/g, ""));
          if (text && captions[captions.length - 1] !== text) captions.push(text);
        }
      }
    }
    return captions.join("\n").slice(0, 50000);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {keywords, relevantPassages, visibleQuestion, accessibleCaptions};
    return;
  }
  if (!win?.document) return;
  const doc = win.document;
  const existing = doc.getElementById(HOST_ID);
  if (existing) { existing.remove(); return; }

  const host = doc.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all:initial;position:fixed;right:18px;top:18px;z-index:2147483647";
  const shadow = host.attachShadow({mode: "open"});
  shadow.innerHTML = `
    <style>
      :host { color-scheme: dark; font: 13px/1.5 system-ui, Arial, sans-serif; }
      * { box-sizing: border-box; }
      .panel { width: min(380px, calc(100vw - 20px)); max-height: calc(100vh - 35px); overflow: auto;
        padding: 14px; color: #f3f4f6; background: #111827; border: 1px solid #64748b;
        border-radius: 13px; box-shadow: 0 12px 42px #0009; }
      header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      h2 { font-size:16px; margin:0; color:white; }
      h3 { font-size:13px; margin:12px 0 6px; color:#dbeafe; }
      p { margin:5px 0; }
      button, input, textarea { font: inherit; }
      button { background:#334155; border:1px solid #64748b; border-radius:6px;
        padding:6px 9px; color:white; cursor:pointer; }
      button:hover { background:#475569; }
      button:disabled { opacity:.45; cursor:not-allowed; }
      button.primary { background:#1d4ed8; border-color:#2563eb; }
      .controls { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
      .controls input { width:100px; accent-color:#60a5fa; }
      .value { min-width:38px; display:inline-block; font-variant-numeric:tabular-nums; }
      textarea { background:#0f172a; border:1px solid #475569; border-radius:6px; color:white;
        width:100%; min-height:74px; padding:7px; resize:vertical; }
      #captions { min-height:85px; }
      #result { min-height:54px; white-space:pre-wrap; word-break:break-word;
        background:#0f172a; border-radius:7px; padding:8px; border:1px solid #334155; }
      #status { color:#cbd5e1; }
      small { color:#cbd5e1; }
      .divider { border-top:1px solid #334155; margin:13px 0; }
      #close { background:transparent; }
    </style>
    <div class="panel" role="region" aria-label="Free Edpuzzle companion">
      <header><h2>Edpuzzle Companion</h2><button id="close" title="Close">✕</button></header>
      <small>Free • Runs locally in your browser • No login collection</small>
      <div class="divider"></div>
      <h3>Video controls</h3>
      <div class="controls">
        <button id="toggle">Play / Pause</button>
        <button id="seek">Seek near end</button>
        <label for="speed">Speed</label>
        <input type="range" id="speed" min="0.5" max="4" step="0.25" value="1"/>
        <span class="value" id="speed-value">1×</span>
      </div>
      <small>Only accessible video elements are controllable. Seeking does not mark an assignment complete.</small>
      <div class="divider"></div>
      <h3>Question helper</h3>
      <div class="controls"><button id="capture">Capture selected/current question</button></div>
      <textarea id="question" placeholder="Select question text on the page and click Capture, or paste it here. Multiple-choice options can go here too."></textarea>
      <h3>Video transcript / captions</h3>
      <div class="controls"><button id="captions-button">Read available captions</button></div>
      <textarea id="captions" placeholder="Paste a transcript or subtitle text here. Accessible HTML video captions can be imported automatically."></textarea>
      <div class="controls" style="margin:9px 0">
        <button id="find" class="primary">Find relevant passages</button>
        <button id="ai">Ask free on-device AI</button>
      </div>
      <div id="result" aria-live="polite">Relevant transcript excerpts and AI suggestions appear here.</div>
      <p id="status" role="status">This tool cannot access protected answer keys or promise a correct answer.</p>
    </div>`;
  (doc.body || doc.documentElement).append(host);

  const el = id => shadow.getElementById(id);
  const status = text => { el("status").textContent = text; };
  const result = text => { el("result").textContent = text; };
  el("close").addEventListener("click", () => host.remove());
  el("capture").addEventListener("click", () => {
    const question = visibleQuestion(doc, win);
    if (!question) {
      status("No visible question detected. Select its text on the page or paste it into the box.");
      return;
    }
    el("question").value = question;
    status("Question captured from the current page. Review the text for accuracy.");
  });
  el("captions-button").addEventListener("click", () => {
    const captions = accessibleCaptions(doc, win);
    if (!captions) {
      status("No accessible video captions found. If the player is inside a separate site/iframe, paste its transcript manually.");
      return;
    }
    el("captions").value = captions;
    status("Imported captions exposed by the current video element.");
  });
  el("toggle").addEventListener("click", async () => {
    const video = findVideo(doc, win);
    if (!video) { status("No accessible video here. Use the embedded player's own controls."); return; }
    try {
      if (video.paused) await video.play();
      else video.pause();
      status(video.paused ? "Paused." : "Playing.");
    } catch (error) { status(`Player rejected the action: ${error.message}`); }
  });
  el("speed").addEventListener("input", () => {
    const speed = Number(el("speed").value);
    el("speed-value").textContent = `${speed}×`;
    const video = findVideo(doc, win);
    if (video) {
      video.playbackRate = speed;
      status(`Requested ${speed}× playback. The site may reset this setting.`);
    } else status("No accessible video element. Speed control may be handled inside an embedded player.");
  });
  el("seek").addEventListener("click", () => {
    const video = findVideo(doc, win);
    if (!video || !Number.isFinite(video.duration) || video.duration <= 1) {
      status("Seeking isn't available for this embedded player.");
      return;
    }
    try {
      video.currentTime = Math.max(0, video.duration - 1);
      status("Requested a seek near the end. This does not submit or complete the assignment.");
    } catch (error) { status(`The video does not permit seeking: ${error.message}`); }
  });
  el("find").addEventListener("click", () => {
    const question = el("question").value;
    const captions = el("captions").value;
    if (!normalize(question) || !normalize(captions)) {
      result("Add both a question and video transcript to search for supporting passages.");
      return;
    }
    const matches = relevantPassages(question, captions);
    result(matches.length ? matches.map((match, n) => `${n + 1}. ${match.text}`).join("\n\n") :
      "No strong keyword matches in the provided transcript. Try different wording or read the surrounding video section.");
  });
  el("ai").addEventListener("click", async () => {
    const question = normalize(el("question").value);
    if (!question) { status("Add or capture a question before asking AI."); return; }
    if (!win.LanguageModel?.create) {
      status("Free on-device AI isn't supported by this browser. Transcript matching still works, without any external service.");
      return;
    }
    const button = el("ai");
    button.disabled = true;
    status("Running the browser's on-device AI. Answers can be wrong; review them.");
    let session;
    try {
      // Create directly from a user click to satisfy transient-activation rules.
      session = await win.LanguageModel.create();
      const context = el("captions").value.slice(0, 14000);
      const prompt = [
        "Help a student understand a video question. Give a concise reasoned suggestion, not a guaranteed answer.",
        "If there is not enough evidence to answer, say so clearly. Never pretend to have the teacher answer key.",
        "Question and options:", question.slice(0, 2500),
        "Video transcript (may be empty):", context || "[No transcript provided]"
      ].join("\n\n");
      const suggestion = await session.prompt(prompt);
      result(String(suggestion).slice(0, 9000));
      status("Generated locally by your browser. No transcript or question was sent to our servers.");
    } catch (error) {
      status(`On-device AI unavailable: ${error.message}. Try transcript matching instead.`);
    } finally {
      session?.destroy?.();
      button.disabled = false;
    }
  });
})(typeof window !== "undefined" ? window : undefined);
