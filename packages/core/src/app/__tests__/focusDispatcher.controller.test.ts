import { assert, test } from "@rezi-ui/testkit";
import { createFocusDispatcher } from "../createApp/focusDispatcher.js";

test("focus dispatcher emits only when the focused id changes", () => {
  let focusedId: string | null = null;
  const seen: Array<string | null> = [];
  const dispatcher = createFocusDispatcher({
    getFocusedId: () => focusedId,
    getFocusInfo: () => ({ id: focusedId }),
    initialFocusedId: null,
    onHandlerError: () => {
      throw new Error("unexpected handler error");
    },
  });

  const unsubscribe = dispatcher.register((info) => {
    seen.push(info.id);
  });

  assert.equal(dispatcher.emitIfChanged(), true);
  assert.deepEqual(seen, []);

  focusedId = "first";
  assert.equal(dispatcher.emitIfChanged(), true);
  assert.deepEqual(seen, ["first"]);

  assert.equal(dispatcher.emitIfChanged(), true);
  assert.deepEqual(seen, ["first"]);

  unsubscribe();
  focusedId = "second";
  assert.equal(dispatcher.emitIfChanged(), true);
  assert.deepEqual(seen, ["first"]);
});

test("focus dispatcher reports handler failures and stops further fan-out", () => {
  const focusedId: string | null = "field";
  const errors: unknown[] = [];
  const seen: string[] = [];
  const dispatcher = createFocusDispatcher({
    getFocusedId: () => focusedId,
    getFocusInfo: () => ({ id: focusedId ?? "none" }),
    initialFocusedId: null,
    onHandlerError: (error: unknown) => {
      errors.push(error);
    },
  });

  dispatcher.register(() => {
    throw new Error("boom");
  });
  dispatcher.register((info) => {
    seen.push(info.id);
  });

  assert.equal(dispatcher.emitIfChanged(), false);
  assert.equal(errors.length, 1);
  assert.deepEqual(seen, []);
});
