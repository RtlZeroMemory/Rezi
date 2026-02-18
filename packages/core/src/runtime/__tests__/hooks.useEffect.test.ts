import { assert, describe, test } from "@rezi-ui/testkit";
import type { CompositeInstanceState, EffectState, HookContext } from "../instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../instances.js";

type HookProgram = (hooks: HookContext) => void;

function createHarness(instanceId = 1): {
  render: (program: HookProgram) => readonly EffectState[];
  runPending: (effects: readonly EffectState[]) => void;
  unmount: () => boolean;
  getNeedsRender: () => boolean;
  getInvalidateCount: () => number;
  getState: () => CompositeInstanceState;
} {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, "HookHardeningWidget");

  let invalidateCount = 0;

  const getState = (): CompositeInstanceState => {
    const state = registry.get(instanceId);
    if (!state) {
      throw new Error("test harness: missing instance state");
    }
    return state;
  };

  const render = (program: HookProgram): readonly EffectState[] => {
    registry.beginRender(instanceId);
    const hooks = createHookContext(getState(), () => {
      invalidateCount++;
      registry.invalidate(instanceId);
    });

    program(hooks);
    return registry.endRender(instanceId);
  };

  return {
    render,
    runPending: (effects: readonly EffectState[]) => {
      runPendingEffects(effects);
    },
    unmount: () => registry.delete(instanceId),
    getNeedsRender: () => getState().needsRender,
    getInvalidateCount: () => invalidateCount,
    getState,
  };
}

describe("runtime hooks useEffect hardening", () => {
  test("schedules [] effect on initial render but does not run until pending effects execute", () => {
    const h = createHarness();
    let ran = false;

    const pending = h.render((hooks) => {
      hooks.useEffect(() => {
        ran = true;
      }, []);
    });

    assert.equal(pending.length, 1);
    assert.equal(ran, false);

    h.runPending(pending);
    assert.equal(ran, true);
  });

  test("[] effect does not rerun on stable rerenders", () => {
    const h = createHarness();
    let runCount = 0;

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, []);
    });
    h.runPending(pending);

    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, []);
    });
    h.runPending(pending);

    assert.equal(runCount, 1);
    assert.equal(pending.length, 0);
  });

  test("[] effect cleanup runs on unmount after effect executed", () => {
    const h = createHarness();
    let cleanupCount = 0;

    const pending = h.render((hooks) => {
      hooks.useEffect(() => {
        return () => {
          cleanupCount++;
        };
      }, []);
    });
    h.runPending(pending);

    assert.equal(cleanupCount, 0);
    assert.equal(h.unmount(), true);
    assert.equal(cleanupCount, 1);
  });

  test("[] effect cleanup does not run when pending effect was never executed", () => {
    const h = createHarness();
    let cleanupCount = 0;

    h.render((hooks) => {
      hooks.useEffect(() => {
        return () => {
          cleanupCount++;
        };
      }, []);
    });

    assert.equal(h.unmount(), true);
    assert.equal(cleanupCount, 0);
  });

  test("deps effect reruns only when dependency value changes", () => {
    const h = createHarness();
    let dep = 1;
    let runCount = 0;

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, [dep]);
    });
    h.runPending(pending);

    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, [dep]);
    });
    h.runPending(pending);

    dep = 2;
    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, [dep]);
    });
    h.runPending(pending);

    assert.equal(runCount, 2);
  });

  test("deps effect cleanup runs before refire when dependency changes", () => {
    const h = createHarness();
    let dep = 1;
    const events: string[] = [];

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        const snapshot = dep;
        events.push(`effect-${String(snapshot)}`);
        return () => {
          events.push(`cleanup-${String(snapshot)}`);
        };
      }, [dep]);
    });
    h.runPending(pending);

    dep = 2;
    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        const snapshot = dep;
        events.push(`effect-${String(snapshot)}`);
        return () => {
          events.push(`cleanup-${String(snapshot)}`);
        };
      }, [dep]);
    });

    assert.deepEqual(events, ["effect-1", "cleanup-1"]);

    h.runPending(pending);
    assert.deepEqual(events, ["effect-1", "cleanup-1", "effect-2"]);
  });

  test("deps effect cleanup sees previous dependency snapshot", () => {
    const h = createHarness();
    let dep = 10;
    const cleaned: number[] = [];

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        const snapshot = dep;
        return () => {
          cleaned.push(snapshot);
        };
      }, [dep]);
    });
    h.runPending(pending);

    dep = 20;
    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        const snapshot = dep;
        return () => {
          cleaned.push(snapshot);
        };
      }, [dep]);
    });
    h.runPending(pending);

    assert.deepEqual(cleaned, [10]);
  });

  test("deps effect reruns when dependency array length changes", () => {
    const h = createHarness();
    let extra = false;
    let runCount = 0;

    let pending = h.render((hooks) => {
      hooks.useEffect(
        () => {
          runCount++;
        },
        extra ? [1, 2] : [1],
      );
    });
    h.runPending(pending);

    extra = true;
    pending = h.render((hooks) => {
      hooks.useEffect(
        () => {
          runCount++;
        },
        extra ? [1, 2] : [1],
      );
    });
    h.runPending(pending);

    assert.equal(runCount, 2);
  });

  test("deps comparison treats NaN as equal via Object.is", () => {
    const h = createHarness();
    let dep = Number.NaN;
    let runCount = 0;

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, [dep]);
    });
    h.runPending(pending);

    dep = Number.NaN;
    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, [dep]);
    });
    h.runPending(pending);

    assert.equal(runCount, 1);
  });

  test("deps comparison treats +0 and -0 as different via Object.is", () => {
    const h = createHarness();
    let dep = 0;
    let runCount = 0;

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, [dep]);
    });
    h.runPending(pending);

    dep = -0;
    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        runCount++;
      }, [dep]);
    });
    h.runPending(pending);

    assert.equal(runCount, 2);
  });

  test("no-deps effect runs after every render", () => {
    const h = createHarness();
    let runCount = 0;

    for (let i = 0; i < 3; i++) {
      const pending = h.render((hooks) => {
        hooks.useEffect(() => {
          runCount++;
        });
      });
      h.runPending(pending);
    }

    assert.equal(runCount, 3);
  });

  test("no-deps effect cleanup runs before every re-fire", () => {
    const h = createHarness();
    const events: string[] = [];

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        events.push("effect-1");
        return () => {
          events.push("cleanup-1");
        };
      });
    });
    h.runPending(pending);

    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        events.push("effect-2");
        return () => {
          events.push("cleanup-2");
        };
      });
    });

    assert.deepEqual(events, ["effect-1", "cleanup-1"]);

    h.runPending(pending);
    assert.deepEqual(events, ["effect-1", "cleanup-1", "effect-2"]);
  });

  test("no-deps effect cleanup on unmount uses latest cleanup", () => {
    const h = createHarness();
    const events: string[] = [];

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        events.push("effect-1");
        return () => {
          events.push("cleanup-1");
        };
      });
    });
    h.runPending(pending);

    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        events.push("effect-2");
        return () => {
          events.push("cleanup-2");
        };
      });
    });
    h.runPending(pending);

    h.unmount();

    assert.deepEqual(events, ["effect-1", "cleanup-1", "effect-2", "cleanup-2"]);
  });

  test("effect-triggered state update invalidates once and converges without loop", () => {
    const h = createHarness();
    let renderCount = 0;
    let effectCount = 0;

    for (let i = 0; i < 5; i++) {
      const pending = h.render((hooks) => {
        const [count, setCount] = hooks.useState(0);
        hooks.useEffect(() => {
          effectCount++;
          if (count === 0) {
            setCount(1);
          }
        }, [count]);
      });
      renderCount++;
      h.runPending(pending);

      if (!h.getNeedsRender()) {
        break;
      }
    }

    assert.equal(renderCount, 2);
    assert.equal(effectCount, 2);
    assert.equal(h.getInvalidateCount(), 1);
    assert.equal(h.getNeedsRender(), false);
  });

  test("effect-triggered setState with same value does not invalidate", () => {
    const h = createHarness();

    const pending = h.render((hooks) => {
      const [, setCount] = hooks.useState(5);
      hooks.useEffect(() => {
        setCount(5);
      }, []);
    });

    h.runPending(pending);

    assert.equal(h.getInvalidateCount(), 0);
    assert.equal(h.getNeedsRender(), false);
  });

  test("multiple effects execute in declaration order", () => {
    const h = createHarness();
    const events: string[] = [];

    const pending = h.render((hooks) => {
      hooks.useEffect(() => {
        events.push("effect-a");
      }, []);
      hooks.useEffect(() => {
        events.push("effect-b");
      }, []);
      hooks.useEffect(() => {
        events.push("effect-c");
      }, []);
    });

    h.runPending(pending);
    assert.deepEqual(events, ["effect-a", "effect-b", "effect-c"]);
  });

  test("multiple changed effects run cleanups in declaration order before re-fire", () => {
    const h = createHarness();
    let dep = 1;
    const events: string[] = [];

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        const snapshot = dep;
        events.push(`effect-a-${String(snapshot)}`);
        return () => {
          events.push(`cleanup-a-${String(snapshot)}`);
        };
      }, [dep]);

      hooks.useEffect(() => {
        const snapshot = dep;
        events.push(`effect-b-${String(snapshot)}`);
        return () => {
          events.push(`cleanup-b-${String(snapshot)}`);
        };
      }, [dep]);
    });
    h.runPending(pending);

    dep = 2;
    pending = h.render((hooks) => {
      hooks.useEffect(() => {
        const snapshot = dep;
        events.push(`effect-a-${String(snapshot)}`);
        return () => {
          events.push(`cleanup-a-${String(snapshot)}`);
        };
      }, [dep]);

      hooks.useEffect(() => {
        const snapshot = dep;
        events.push(`effect-b-${String(snapshot)}`);
        return () => {
          events.push(`cleanup-b-${String(snapshot)}`);
        };
      }, [dep]);
    });

    assert.deepEqual(events, ["effect-a-1", "effect-b-1", "cleanup-a-1", "cleanup-b-1"]);

    h.runPending(pending);

    assert.deepEqual(events, [
      "effect-a-1",
      "effect-b-1",
      "cleanup-a-1",
      "cleanup-b-1",
      "effect-a-2",
      "effect-b-2",
    ]);
  });

  test("unmount runs effect cleanups in reverse declaration order", () => {
    const h = createHarness();
    const events: string[] = [];

    const pending = h.render((hooks) => {
      hooks.useEffect(() => {
        return () => {
          events.push("cleanup-a");
        };
      }, []);
      hooks.useEffect(() => {
        return () => {
          events.push("cleanup-b");
        };
      }, []);
      hooks.useEffect(() => {
        return () => {
          events.push("cleanup-c");
        };
      }, []);
    });
    h.runPending(pending);

    h.unmount();

    assert.deepEqual(events, ["cleanup-c", "cleanup-b", "cleanup-a"]);
  });

  test("unmount reverse cleanup continues when one cleanup throws", () => {
    const h = createHarness();
    const events: string[] = [];

    const pending = h.render((hooks) => {
      hooks.useEffect(() => {
        return () => {
          events.push("cleanup-a");
        };
      }, []);
      hooks.useEffect(() => {
        return () => {
          events.push("cleanup-b");
          throw new Error("expected cleanup failure");
        };
      }, []);
      hooks.useEffect(() => {
        return () => {
          events.push("cleanup-c");
        };
      }, []);
    });
    h.runPending(pending);

    assert.doesNotThrow(() => {
      h.unmount();
    });

    assert.deepEqual(events, ["cleanup-c", "cleanup-b", "cleanup-a"]);
  });

  test("async cleanup function is invoked during unmount", async () => {
    const h = createHarness();
    let invoked = false;
    let settled = false;

    const pending = h.render((hooks) => {
      hooks.useEffect(() => {
        return async () => {
          invoked = true;
          await Promise.resolve();
          settled = true;
        };
      }, []);
    });
    h.runPending(pending);

    h.unmount();

    assert.equal(invoked, true);
    await Promise.resolve();
    assert.equal(settled, true);
  });

  test("cleanup error is swallowed when deps change", () => {
    const h = createHarness();
    let dep = 1;
    let cleanupCalls = 0;

    let pending = h.render((hooks) => {
      hooks.useEffect(() => {
        return () => {
          cleanupCalls++;
          throw new Error("cleanup failure");
        };
      }, [dep]);
    });
    h.runPending(pending);

    dep = 2;
    assert.doesNotThrow(() => {
      pending = h.render((hooks) => {
        hooks.useEffect(() => {
          return () => {
            cleanupCalls++;
          };
        }, [dep]);
      });
    });

    assert.equal(cleanupCalls, 1);
    h.runPending(pending);
  });

  test("cleanup error is swallowed during unmount", () => {
    const h = createHarness();
    let cleanupCalls = 0;

    const pending = h.render((hooks) => {
      hooks.useEffect(() => {
        return () => {
          cleanupCalls++;
          throw new Error("cleanup failure");
        };
      }, []);
    });
    h.runPending(pending);

    assert.doesNotThrow(() => {
      h.unmount();
    });
    assert.equal(cleanupCalls, 1);
  });

  test("pending effects list returned by endRender is frozen", () => {
    const h = createHarness();

    const pending = h.render((hooks) => {
      hooks.useEffect(() => {}, []);
    });

    assert.equal(Object.isFrozen(pending), true);
    assert.throws(() => {
      (pending as EffectState[]).push(pending[0] as EffectState);
    });
  });

  test("cleanup is unavailable until a pending effect callback has executed", () => {
    const h = createHarness();
    let dep = 1;
    let cleanupCalls = 0;

    h.render((hooks) => {
      hooks.useEffect(() => {
        return () => {
          cleanupCalls++;
        };
      }, [dep]);
    });

    dep = 2;
    const pending = h.render((hooks) => {
      hooks.useEffect(() => {
        return () => {
          cleanupCalls++;
        };
      }, [dep]);
    });

    assert.equal(cleanupCalls, 0);

    h.runPending(pending);
    h.unmount();

    assert.equal(cleanupCalls, 1);
  });
});
