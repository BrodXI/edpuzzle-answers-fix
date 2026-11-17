//Copyright (C) 2023 ading2210
//see README.md for more information
import { assignment_mode, construct_headers, content_loaded, fetch_with_auth, get_attempt, questions } from "./main.js";
import * as video_skipper from "./skipper.js";
import {hasVerifiedAnswers} from "./media.mjs";

answers_button.disabled = !content_loaded;

export async function answer_questions() {
  if (!hasVerifiedAnswers(questions)) {
    alert("Automatic answering is unavailable because verified answers were not provided for every multiple-choice question.");
    return;
  }
  answers_button.value = "Submitting answers...";

  skipper_button.disabled = true;
  answers_button.disabled = true;

  try {
    let attempt = await get_attempt();
    await video_skipper.skip_video(attempt, false);

    let filtered_questions = filter_questions(questions);
    await post_answers(attempt, filtered_questions);

    answers_button.value = "Answers submitted successfully.";
    opener.location.reload();
  }
  catch (error) {
    console.error("Automatic answering failed:", error);
    answers_button.value = "Automatic answering failed. Retry?";
    alert(`Could not submit answers: ${error.message}`);
    answers_button.disabled = false;
    skipper_button.disabled = false;
  }
}

function filter_questions(questions) {
  let filtered_questions = [];

  for (let i = 0; i < questions.length; i++) {
    let question = questions[i];
    if (question.type != "multiple-choice") continue;

    if (filtered_questions.length == 0)
      filtered_questions.push([question]);
    else if (filtered_questions[filtered_questions.length - 1][0].time == question.time)
      filtered_questions[filtered_questions.length - 1].push(question);
    else
      filtered_questions.push([question]);
  }

  return filtered_questions;
}

async function post_answers(attempt, filtered_questions) {
  let attempt_id = attempt._id || attempt.id;
  for (let i = 0; i < filtered_questions.length; i++) {
    let question_part = filtered_questions[i];
    await post_answer(attempt_id, question_part);
    answers_button.value = `Submitting answers (${i + 1}/${filtered_questions.length})...`;
  }
}

async function post_answer(attempt_id, questions_part) {
  let answers_url = `https://edpuzzle.com/api/v3/attempts/${attempt_id}/answers`;
  let content = {answers: []};

  if (assignment_mode === "new") {
    answers_url = `https://edpuzzle.com/api/v3/learning/submissions/${attempt_id}/answers`;
    content = {
      answerQuestions: [],
      answerSaveStatus: "answered"
    };
  }
  for (let i = 0; i < questions_part.length; i++) {
    let question = questions_part[i];
    let correct_choices = [];
    for (let j = 0; j < question.choices.length; j++) {
      let choice = question.choices[j];
      if (choice.isCorrect)
        correct_choices.push(choice._id);
    }
    if (assignment_mode === "new") {
      content.answerQuestions.push({
        questionData: {
          choiceIds: correct_choices
        },
        questionId: question._id,
        questionType: "multiple-choice"
      });
    }
    else {
      content.answers.push({
        questionId: question._id,
        choices: correct_choices,
        type: "multiple-choice"
      });
    }
  }

  let response = await fetch_with_auth(answers_url, {
    method: "POST",
    headers: await construct_headers(),
    body: JSON.stringify(content)
  });

  if (response.status === 429)
    throw new Error("Edpuzzle is rate-limiting requests. Please retry later.");
  if (!response.ok)
    throw new Error(`Edpuzzle rejected the answer submission (HTTP ${response.status}).`);
}
