//Copyright (C) 2026 ading2210
//see README.md for more information

// Load the fork's built browser files, not the original project's mirrors.

const release_url = "https://cdn.jsdelivr.net/gh/BrodXI/edpuzzle-answers-fix@main/release";
const public_media_api_url = "https://edpuzzle.hgci.org";

async function load_fork(asset_url) {
  const response = await fetch(asset_url + "/open.js", {cache: "no-cache"});
  if (!response.ok)
    throw new Error(`Could not download fork launcher (HTTP ${response.status}).`);
  const code = await response.text();
  window.base_url = asset_url;
  // The old public service is a fallback for publicly available media only.
  // Authentication data is never forwarded to this service.
  window.media_api_url = public_media_api_url;
  (0, eval)(code);
}

async function init() {
  if (window.location.hostname === "cdn.jsdelivr.net") {
    alert(
      "To use this, drag this button into your bookmarks bar. Then, run it when you're on an Edpuzzle assignment."
    );
    return;
  }
  try {
    await load_fork(document.dev_env || release_url);
  }
  catch (error) {
    alert(`Could not load the fork's JavaScript: ${error.message}. The site may block bookmarklets through its Content Security Policy.`);
  }
}

init();
