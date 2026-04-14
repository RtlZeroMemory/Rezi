import { assert, test } from "@rezi-ui/testkit";
import {
  createReferenceInputModalFixture,
  createReferenceSelectKeyboardCyclerFixture,
  createReferenceTextareaMultilineFixture,
  referenceInputModalScenario,
  referenceSelectKeyboardCyclerScenario,
  referenceTextareaMultilineScenario,
  runSemanticScenario,
} from "../index.js";

test("reference scenario: input editing still pauses behind modal and resumes after close", async () => {
  const result = await runSemanticScenario({
    scenario: referenceInputModalScenario,
    createFixture: createReferenceInputModalFixture,
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.mismatches, []);
});

test("reference scenario: textarea editing preserves multiline behavior", async () => {
  const result = await runSemanticScenario({
    scenario: referenceTextareaMultilineScenario,
    createFixture: createReferenceTextareaMultilineFixture,
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.mismatches, []);
});

test("reference scenario: select keyboard cycling skips disabled options", async () => {
  const result = await runSemanticScenario({
    scenario: referenceSelectKeyboardCyclerScenario,
    createFixture: createReferenceSelectKeyboardCyclerFixture,
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.mismatches, []);
});
