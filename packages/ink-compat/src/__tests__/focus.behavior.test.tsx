import { strict as assert } from "node:assert";
import test from "node:test";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Text, useFocus, useFocusManager, useInput } from "../index.js";
import { type RenderTestingResult, flushTurns, renderTesting, stripAnsi } from "./helpers.js";

type FocusId = "alpha" | "beta" | "gamma";

type FocusState = Readonly<Record<FocusId, boolean>>;

type FocusNodeProps = Readonly<{
  id: FocusId;
  autoFocus?: boolean;
  isActive?: boolean;
  onFocusChange: (id: FocusId, isFocused: boolean) => void;
  onFocusRegister?: (focus: (id: string) => void) => void;
}>;

function currentFocused(state: FocusState): FocusId | "none" {
  if (state.alpha) return "alpha";
  if (state.beta) return "beta";
  if (state.gamma) return "gamma";
  return "none";
}

function FocusNode(props: FocusNodeProps): null {
  const { id, onFocusChange, onFocusRegister } = props;
  const focusOptions: Parameters<typeof useFocus>[0] = {
    id,
    isActive: props.isActive ?? true,
  };

  if (props.autoFocus !== undefined) {
    focusOptions.autoFocus = props.autoFocus;
  }

  const { isFocused, focus } = useFocus(focusOptions);

  useEffect(() => {
    onFocusChange(id, isFocused);
  }, [id, isFocused, onFocusChange]);

  useEffect(() => {
    onFocusRegister?.(focus);
  }, [focus, onFocusRegister]);

  return null;
}

type FocusHarnessSnapshot = Readonly<{
  focused: FocusId | "none";
  gammaActive: boolean;
  focusEnabled: boolean;
}>;

function FocusHarness(): React.JSX.Element {
  const focusManager = useFocusManager();
  const alphaFocusRef = useRef<((id: string) => void) | null>(null);

  const [state, setState] = useState<FocusState>({
    alpha: false,
    beta: false,
    gamma: false,
  });
  const [gammaActive, setGammaActive] = useState(true);
  const [focusEnabled, setFocusEnabled] = useState(true);

  const onFocusChange = useCallback((id: FocusId, isFocused: boolean) => {
    setState((previous) => {
      if (previous[id] === isFocused) {
        return previous;
      }

      return {
        ...previous,
        [id]: isFocused,
      };
    });
  }, []);

  useInput((input, key) => {
    if (key.tab) {
      return;
    }

    if (input === "n") {
      focusManager.focusNext();
      return;
    }

    if (input === "p") {
      focusManager.focusPrevious();
      return;
    }

    if (input === "m") {
      focusManager.focus("gamma");
      return;
    }

    if (input === "u") {
      alphaFocusRef.current?.("beta");
      return;
    }

    if (input === "d") {
      focusManager.disableFocus();
      setFocusEnabled(false);
      return;
    }

    if (input === "e") {
      focusManager.enableFocus();
      setFocusEnabled(true);
      return;
    }

    if (input === "x") {
      setGammaActive((value) => !value);
    }
  });

  return (
    <>
      <FocusNode
        id="alpha"
        autoFocus
        onFocusChange={onFocusChange}
        onFocusRegister={(focus) => {
          alphaFocusRef.current = focus;
        }}
      />
      <FocusNode id="beta" onFocusChange={onFocusChange} />
      <FocusNode id="gamma" isActive={gammaActive} onFocusChange={onFocusChange} />
      <Text>
        {`focused=${currentFocused(state)};gammaActive=${gammaActive ? 1 : 0};focusEnabled=${focusEnabled ? 1 : 0}`}
      </Text>
    </>
  );
}

function parseSnapshot(frame: string): FocusHarnessSnapshot {
  const match = frame.match(
    /^focused=(alpha|beta|gamma|none);gammaActive=(0|1);focusEnabled=(0|1)$/,
  );
  assert.ok(match, `Unexpected frame: ${frame}`);

  return {
    focused: match[1] as FocusHarnessSnapshot["focused"],
    gammaActive: match[2] === "1",
    focusEnabled: match[3] === "1",
  };
}

async function readSnapshot(app: RenderTestingResult): Promise<FocusHarnessSnapshot> {
  await flushTurns(6);
  return parseSnapshot(stripAnsi(app.lastFrame()));
}

async function writeAndRead(
  app: RenderTestingResult,
  sequence: string,
): Promise<FocusHarnessSnapshot> {
  app.stdin.write(sequence);
  return readSnapshot(app);
}

test("focus_tab_and_manual_transitions_are_deterministic (IKINV-006)", async () => {
  const app = renderTesting(<FocusHarness />);

  let snapshot = await readSnapshot(app);
  assert.equal(snapshot.focused, "alpha");

  snapshot = await writeAndRead(app, "\t");
  assert.equal(snapshot.focused, "beta");

  snapshot = await writeAndRead(app, "\t");
  assert.equal(snapshot.focused, "gamma");

  snapshot = await writeAndRead(app, "\t");
  assert.equal(snapshot.focused, "alpha");

  snapshot = await writeAndRead(app, "n");
  assert.equal(snapshot.focused, "beta");

  snapshot = await writeAndRead(app, "p");
  assert.equal(snapshot.focused, "alpha");

  snapshot = await writeAndRead(app, "m");
  assert.equal(snapshot.focused, "gamma");

  snapshot = await writeAndRead(app, "u");
  assert.equal(snapshot.focused, "beta");

  app.unmount();
  app.cleanup();
});

test("focus_enable_disable_and_activation_flow (IKINV-006)", async () => {
  const app = renderTesting(<FocusHarness />);

  let snapshot = await readSnapshot(app);
  assert.equal(snapshot.focused, "alpha");
  assert.equal(snapshot.gammaActive, true);
  assert.equal(snapshot.focusEnabled, true);

  snapshot = await writeAndRead(app, "m");
  assert.equal(snapshot.focused, "gamma");

  snapshot = await writeAndRead(app, "x");
  assert.equal(snapshot.gammaActive, false);
  assert.equal(snapshot.focused, "none");

  snapshot = await writeAndRead(app, "\t");
  assert.equal(snapshot.focused, "alpha");

  snapshot = await writeAndRead(app, "x");
  assert.equal(snapshot.gammaActive, true);

  snapshot = await writeAndRead(app, "m");
  assert.equal(snapshot.focused, "gamma");

  snapshot = await writeAndRead(app, "d");
  assert.equal(snapshot.focusEnabled, false);
  assert.equal(snapshot.focused, "gamma");

  snapshot = await writeAndRead(app, "\t");
  assert.equal(snapshot.focused, "gamma");

  snapshot = await writeAndRead(app, "e");
  assert.equal(snapshot.focusEnabled, true);

  snapshot = await writeAndRead(app, "\t");
  assert.equal(snapshot.focused, "alpha");

  app.unmount();
  app.cleanup();
});
