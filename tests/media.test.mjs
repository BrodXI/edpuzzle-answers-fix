import assert from "node:assert/strict";
import test from "node:test";
import {hasVerifiedAnswers, loadMedia} from "../app/media.mjs";

const question = (correct = false) => ({
  type: "multiple-choice",
  choices: [{_id: "a", ...(correct ? {isCorrect: true} : {})}, {_id: "b"}]
});
const response = (status, data) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => data
});

test("only explicit correct-answer flags count as verified", () => {
  assert.equal(hasVerifiedAnswers([question(true)]), true);
  assert.equal(hasVerifiedAnswers([question(false)]), false);
  assert.equal(hasVerifiedAnswers([question(true), question(false)]), false);
  assert.equal(hasVerifiedAnswers([{type: "open-ended"}]), false);
  assert.equal(hasVerifiedAnswers(null), false);
});

test("uses authenticated account answers without contacting another service", async () => {
  let publicCalls = 0;
  const result = await loadMedia({
    mediaId: "a/b",
    fetchAccount: async (url, options) => {
      assert.equal(url, "https://edpuzzle.com/api/v3/media/a%2Fb");
      assert.equal(options.credentials, "same-origin");
      return response(200, {questions: [question(true)]});
    },
    fetchPublic: async () => { publicCalls++; throw new Error("Should not run"); }
  });
  assert.equal(result.source, "account");
  assert.equal(publicCalls, 0);
});

test("falls back to legacy public service when account lacks answer keys", async () => {
  const result = await loadMedia({
    mediaId: "123",
    fetchAccount: async () => response(200, {questions: [question(false)]}),
    fetchPublic: async () => ({questions: [question(true)]})
  });
  assert.equal(result.source, "public");
  assert.equal(hasVerifiedAnswers(result.media.questions), true);
});

test("preserves private questions when the public service returns 403", async () => {
  const privateMedia = {questions: [question(false)]};
  const result = await loadMedia({
    mediaId: "123",
    fetchAccount: async () => response(200, privateMedia),
    fetchPublic: async () => { throw new Error("HTTP 403"); }
  });
  assert.equal(result.source, "account-limited");
  assert.equal(result.media, privateMedia);
  assert.equal(hasVerifiedAnswers(result.media.questions), false);
});

test("supports public media when no Edpuzzle session exists", async () => {
  const result = await loadMedia({
    mediaId: "123",
    fetchAccount: async () => response(401, {}),
    fetchPublic: async () => ({questions: [question(true)]})
  });
  assert.equal(result.source, "public");
});

test("does not pretend inaccessible private media loaded", async () => {
  await assert.rejects(loadMedia({
    mediaId: "123",
    fetchAccount: async () => response(403, {}),
    fetchPublic: async () => { throw new Error("HTTP 403"); }
  }), /HTTP 403/);
});

test("rejects missing media IDs before making network calls", async () => {
  await assert.rejects(loadMedia({
    mediaId: "",
    fetchAccount: async () => { throw new Error("unexpected"); },
    fetchPublic: async () => { throw new Error("unexpected"); }
  }), /valid media ID/);
});
