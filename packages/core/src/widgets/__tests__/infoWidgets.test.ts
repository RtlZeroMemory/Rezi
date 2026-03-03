import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../ui.js";

describe("informational widgets - edge cases", () => {
  test("empty preserves action and accepts empty strings", () => {
    const action = ui.button({ id: "retry", label: "Retry" });
    const vnode = ui.empty("", {
      icon: "status.info",
      description: "",
      action,
    });

    assert.equal(vnode.kind, "empty");
    assert.deepEqual(vnode.props, {
      title: "",
      icon: "status.info",
      description: "",
      action,
    });
  });

  test("errorDisplay preserves stack/retry callbacks", () => {
    const onRetry = () => undefined;
    const vnode = ui.errorDisplay("failure", {
      title: "Oops",
      stack: "line1\nline2",
      showStack: true,
      onRetry,
    });

    assert.equal(vnode.kind, "errorDisplay");
    assert.equal(vnode.props.message, "failure");
    assert.equal(vnode.props.stack, "line1\nline2");
    assert.equal(vnode.props.showStack, true);
    assert.equal(vnode.props.onRetry, onRetry);
  });

  test("callout supports all variant values", () => {
    const variants = ["info", "success", "warning", "error"] as const;
    for (const variant of variants) {
      const vnode = ui.callout("message", { variant, title: "title", icon: "status.info" });
      assert.equal(vnode.kind, "callout");
      assert.equal(vnode.props.variant, variant);
      assert.equal(vnode.props.message, "message");
    }
  });
});
