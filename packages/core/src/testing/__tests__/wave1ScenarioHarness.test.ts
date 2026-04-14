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

test("wave1 shared scenario: input editing still pauses behind modal and resumes after close", async () => {
  const result = await runSemanticScenario({
    scenario: referenceInputModalScenario,
    createFixture: createReferenceInputModalFixture,
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.mismatches, []);
});

test("wave1 shared scenario: textarea editing preserves multiline behavior", async () => {
  const result = await runSemanticScenario({
    scenario: referenceTextareaMultilineScenario,
    createFixture: createReferenceTextareaMultilineFixture,
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.mismatches, []);
});

test("wave1 shared scenario: select keyboard cycling skips disabled options", async () => {
  const result = await runSemanticScenario({
    scenario: referenceSelectKeyboardCyclerScenario,
    createFixture: createReferenceSelectKeyboardCyclerFixture,
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.mismatches, []);
});
