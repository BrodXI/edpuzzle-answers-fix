import assert from "node:assert/strict";
import test from "node:test";
import {hasDisplayableQuestions, hasVerifiedAnswers, loadMedia} from "../app/media.mjs";

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
  }), /media API can have different permissions/);
});

test("uses learner-visible questions embedded in the assignment after both 403s", async () => {
  const visibleQuestion = {...question(false), time: 20, body: [{text: "Learner-visible question"}]};
  visibleQuestion.choices = visibleQuestion.choices.map(choice => ({
    ...choice, body: [{text: "An option"}]
  }));
  const result = await loadMedia({
    mediaId: "private123",
    assignmentMedia: {content: {questions: [visibleQuestion]}},
    fetchAccount: async () => response(403, {}),
    fetchPublic: async () => { throw new Error("HTTP 403"); }
  });
  assert.equal(result.source, "assignment-limited");
  assert.equal(result.media.questions.length, 1);
  assert.equal(hasVerifiedAnswers(result.media.questions), false);
});

test("rejects incomplete embedded questions rather than showing fake data", async () => {
  assert.equal(hasDisplayableQuestions([{type: "multiple-choice", choices: []}]), false);
  await assert.rejects(loadMedia({
    mediaId: "private123",
    assignmentMedia: {questions: [question(false)]},
    fetchAccount: async () => response(403, {}),
    fetchPublic: async () => { throw new Error("HTTP 403"); }
  }), /media API can have different permissions/);
});

test("rejects missing media IDs before making network calls", async () => {
  await assert.rejects(loadMedia({
    mediaId: "",
    fetchAccount: async () => { throw new Error("unexpected"); },
    fetchPublic: async () => { throw new Error("unexpected"); }
  }), /valid media ID/);
});
