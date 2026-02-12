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
  test("does not throw when used outside render() root", () => {
    const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
    const container = createRootContainer(root);

    function App() {
      const { exit } = useApp();
      exit();
      return <Text>hi</Text>;
    }

    updateRootContainer(container, <App />);
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
        },
      },
      <App />,
    );
    updateRootContainer(container, wrapped);

    assert.equal(seen?.message, "boom");
  });
});
