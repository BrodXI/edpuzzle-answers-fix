// Copyright (C) 2026 ading2210 and contributors
// See README.md for the AGPL license and project attribution.

export function hasVerifiedAnswers(questions) {
  if (!Array.isArray(questions)) return false;
  const multipleChoice = questions.filter(question => question.type === "multiple-choice");
  return multipleChoice.length > 0 && multipleChoice.every(question =>
    Array.isArray(question.choices) &&
    question.choices.some(choice => choice.isCorrect === true)
  );
}

// Some assigned lessons include the learner-visible questions directly in the
// assignment payload. Only use complete, explicitly supplied question data.
export function hasDisplayableQuestions(questions) {
  return Array.isArray(questions) && questions.length > 0 && questions.every(question => {
    if (!question || !Array.isArray(question.body) || !question.body[0])
      return false;
    if (!Number.isFinite(question.time) || typeof question.type !== "string")
      return false;
    if (question.type === "multiple-choice")
      return Array.isArray(question.choices) && question.choices.every(choice =>
        Array.isArray(choice.body) && choice.body[0]
      );
    return true;
  });
}

// Uses the account already signed in on edpuzzle.com. The caller must make
// this request in the Edpuzzle page context, not forward a session to our API.
export async function loadMedia({mediaId, fetchAccount, fetchPublic, assignmentMedia = null}) {
  if (typeof mediaId !== "string" || !mediaId.trim())
    throw new Error("The assignment does not contain a valid media ID.");

  let accountMedia = null;
  let accountError = null;
  try {
    const url = `https://edpuzzle.com/api/v3/media/${encodeURIComponent(mediaId)}`;
    const response = await fetchAccount(url, {credentials: "same-origin"});
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data?.questions)) accountMedia = data;
    }
    else {
      accountError = new Error(`Edpuzzle returned HTTP ${response.status} for this account.`);
      accountError.status = response.status;
    }
  }
  catch (error) {
    accountError = error;
  }

  // Prefer the signed-in user's authorized data. Only try the existing public
  // endpoint if answer keys are unavailable; never transmit cookies or tokens.
  if (accountMedia && hasVerifiedAnswers(accountMedia.questions))
    return {media: accountMedia, source: "account"};

  let publicError = null;
  try {
    const publicMedia = await fetchPublic(mediaId);
    if (Array.isArray(publicMedia?.questions) &&
        (hasVerifiedAnswers(publicMedia.questions) || !accountMedia)) {
      return {media: publicMedia, source: "public"};
    }
  }
  catch (error) {
    publicError = error;
  }

  // A private assignment may expose questions to its learner but not reveal
  // which choices are correct. Never invent or infer protected answer keys.
  if (accountMedia)
    return {media: accountMedia, source: "account-limited"};

  // This data has already been returned by Edpuzzle as part of the learner's
  // own assignment. It is not a fallback to a teacher-only endpoint.
  const visibleMedia = [assignmentMedia, assignmentMedia?.content, assignmentMedia?.media]
    .find(candidate => hasDisplayableQuestions(candidate?.questions));
  if (visibleMedia)
    return {media: visibleMedia, source: "assignment-limited"};

  if (accountError?.status === 403) {
    throw new Error(
      "Edpuzzle denied direct access to this lesson's media (HTTP 403). " +
      "The public media service also could not retrieve it. " +
      "If the video plays in your original Edpuzzle tab, your login is probably fine: " +
      "the media API can have different permissions. " +
      "This script cannot obtain protected answer keys. " +
      "Confirm you're in the assigned class and using its assignment link."
    );
  }

  const details = [accountError?.message, publicError?.message].filter(Boolean).join(" ");
  throw new Error(`Could not load this media with your Edpuzzle session or the public service. ${details}`.trim());
}
