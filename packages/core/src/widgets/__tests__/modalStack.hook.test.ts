import { assert, describe, test } from "@rezi-ui/testkit";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import { createWidgetContext } from "../composition.js";
import { ui } from "../ui.js";
import { useModalStack } from "../useModalStack.js";

function createHarness() {
  const registry = createCompositeInstanceRegistry();
  const instanceId = 1;
  registry.create(instanceId, "ModalStackHarness");

  return {
    render() {
      registry.beginRender(instanceId);
      const state = registry.get(instanceId);
      if (!state) throw new Error("test harness: missing instance state");
      const onInvalidate = () => {
        registry.invalidate(instanceId);
      };
      const hookCtx = createHookContext(state, onInvalidate);
      const ctx = createWidgetContext(
        "ModalStackHarness",
        0,
        hookCtx,
        undefined,
        {
          width: 80,
          height: 24,
          breakpoint: "md",
        },
        onInvalidate,
      );
      const stack = useModalStack(ctx);
      const pending = registry.endRender(instanceId);
      runPendingEffects(pending);
      return stack;
    },
  };
}

describe("useModalStack", () => {
  test("push/pop/current manage a LIFO stack", () => {
    const h = createHarness();
    let stack = h.render();
    assert.equal(stack.current(), null);
    assert.equal(stack.size, 0);

    stack.push("login", {
      title: "Login",
      content: ui.text("login"),
      actions: [ui.button({ id: "login-ok", label: "OK" })],
    });
    stack = h.render();
    assert.equal(stack.current(), "login");
    assert.equal(stack.size, 1);

    stack.push("mfa", {
      title: "2FA",
      content: ui.text("otp"),
      actions: [ui.button({ id: "mfa-ok", label: "OK" })],
    });
    stack = h.render();
    assert.equal(stack.current(), "mfa");
    assert.equal(stack.size, 2);

    stack.pop();
    stack = h.render();
    assert.equal(stack.current(), "login");
    assert.equal(stack.size, 1);
  });

  test("render returns stacked modals in insertion order", () => {
    const h = createHarness();
    let stack = h.render();

    stack.push("a", {
      title: "A",
      content: ui.text("A"),
      actions: [ui.button({ id: "a-ok", label: "OK" })],
    });
    stack = h.render();
    stack.push("b", {
      title: "B",
      content: ui.text("B"),
      actions: [ui.button({ id: "b-ok", label: "OK" })],
    });
    stack = h.render();

    const layers = stack.render();
    assert.equal(layers.length, 2);
    assert.equal(layers[0]?.kind, "modal");
    assert.equal(layers[1]?.kind, "modal");

    const topProps = layers[1]?.props as { returnFocusTo?: unknown };
    assert.equal(topProps.returnFocusTo, "a-ok");
  });

  test("pop bumps underlying modal key version to re-apply initial focus", () => {
    const h = createHarness();
    let stack = h.render();

    stack.push("a", {
      title: "A",
      content: ui.text("A"),
      actions: [ui.button({ id: "a-ok", label: "OK" })],
    });
    stack = h.render();
    stack.push("b", {
      title: "B",
      content: ui.text("B"),
      actions: [ui.button({ id: "b-ok", label: "OK" })],
    });
    stack = h.render();

    const before = stack.render();
    const beforeKey = (before[0]?.props as { key?: unknown }).key;
    assert.equal(beforeKey, "a-0");

    stack.pop();
    stack = h.render();
    const after = stack.render();
    const afterKey = (after[0]?.props as { key?: unknown }).key;
    assert.equal(afterKey, "a-1");
  });
});
