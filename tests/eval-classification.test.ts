import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluationChecksSchema, scoreEvaluationOutput } from "../lib/evals";
test("classification check compares the whole first line rather than a later mention or substring", () => {
  const checks = evaluationChecksSchema.parse({firstLineEquals:"CONFIRMED"});
  assert.equal(scoreEvaluationOutput("confirmed\nThe user explicitly agreed.", checks).status,"passed");
  assert.equal(scoreEvaluationOutput("SUGGESTION\nThis is not CONFIRMED.", checks).status,"failed");
  assert.equal(scoreEvaluationOutput("UNCONFIRMED\nNeeds review.", checks).status,"failed");
  assert.equal(scoreEvaluationOutput("CONFIRMED BUT UNCLEAR\nReview.", checks).status,"failed");
});
