import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import AppContext from "../context/AppContext.js";
import { Text, useApp } from "../index.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

describe("useApp()", () => {
  test("throws when used outside render() root", () => {
    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    function App() {
      const { exit, rerender } = useApp();
      rerender();
      exit();
      return <Text>hi</Text>;
    }

    assert.throws(() => {
      updateRootContainer(container, <App />);
    }, /AppContext missing/);
  });

  test("delegates exit() to AppContext", () => {
    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    let seen: Error | undefined;

    function App() {
      const { exit } = useApp();
      exit(new Error("boom"));
      return <Text>hi</Text>;
    }

    const wrapped = React.createElement(
      AppContext.Provider,
      {
        value: {
          exit: (e) => {
            seen = e;
          },
          rerender: () => {},
        },
      },
      <App />,
    );
    updateRootContainer(container, wrapped);

    assert.equal(seen?.message, "boom");
  });

  test("delegates rerender() to AppContext", () => {
    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    let calls = 0;

    function App() {
      const { rerender } = useApp();
      rerender();
      return <Text>hi</Text>;
    }

    const wrapped = React.createElement(
      AppContext.Provider,
      {
        value: {
          exit: () => {},
          rerender: () => {
            calls++;
          },
        },
      },
      <App />,
    );
    updateRootContainer(container, wrapped);

    assert.equal(calls, 1);
  });
});
