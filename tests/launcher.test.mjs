import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import vm from "node:vm";

const text = file => readFileSync(new URL(file, import.meta.url), "utf8");

test("bookmarklet points to BrodXI's built release assets", () => {
  const bookmarklet = text("../bookmarklet.js").trim();
  assert.match(bookmarklet, /^javascript:/);
  assert.match(bookmarklet, /BrodXI\/edpuzzle-answers-fix@main\/release\/script\.js/);
  assert.doesNotMatch(bookmarklet, /ading2210\/edpuzzle-answers@/);
});

test("userscript points to the same fork release", () => {
  const userscript = text("../edpuzzle.user.js");
  assert.match(userscript, /BrodXI\/edpuzzle-answers-fix@main\/release\/script\.js/);
  assert.match(userscript, /raw\.githubusercontent\.com\/BrodXI\/edpuzzle-answers-fix/);
});

test("source launcher points to the fork, not the upstream mirror for code", () => {
  const loader = text("../script.js");
  assert.match(loader, /BrodXI\/edpuzzle-answers-fix@main\/release/);
  assert.match(loader, /response\.ok/);
  assert.doesNotMatch(loader, /mirrors\s*=/);
});

test("the fork keeps the public media service separate from its asset host", () => {
  const loader = text("../script.js");
  const popup = text("../open.js");
  const main = text("../app/main.js");
  assert.match(loader, /window\.media_api_url = public_media_api_url/);
  assert.match(popup, /popup\.document\.media_api_url/);
  assert.match(main, /media_api_url \+ `\/api\/media/);
});

test("loader actually fetches fork assets and runs the downloaded launcher", async () => {
  const requested = [];
  const messages = [];
  const context = vm.createContext({
    window: {location: {hostname: "edpuzzle.com"}},
    document: {},
    alert: message => messages.push(message),
    fetch: async (url, options) => {
      requested.push({url, options});
      return {ok: true, text: async () => "window.__launched = true;"};
    }
  });
  vm.runInContext(text("../script.js"), context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requested.length, 1);
  assert.match(requested[0].url, /BrodXI\/edpuzzle-answers-fix@main\/release\/open\.js$/);
  assert.equal(context.window.base_url + "/open.js", requested[0].url);
  assert.equal(context.window.media_api_url, "https://edpuzzle.hgci.org");
  assert.equal(context.window.__launched, true);
  assert.deepEqual(messages, []);
});
