import { assert, describe, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import { ZR_KEY_DOWN, ZR_KEY_TAB, ZR_MOD_CTRL } from "../../keybindings/keyCodes.js";
import { ui } from "../../widgets/ui.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

async function bootWithResize(
  backend: StubBackend,
  app: Readonly<{ start: () => Promise<void> }>,
): Promise<void> {
  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 100, rows: 30 }],
      }),
    }),
  );
  await flushMicrotasks(20);
  backend.resolveNextFrame();
  await flushMicrotasks(10);
}

describe("createApp routes integration", () => {
  test("full lifecycle routing: initial route, keybinding navigation, push/back", async () => {
    const backend = new StubBackend();
    const rendered: string[] = [];

    const app = createApp({
      backend,
      initialState: Object.freeze({ count: 0 }),
      routes: [
        {
          id: "home",
          title: "Home",
          keybinding: "ctrl+1",
          screen: () => {
            rendered.push("home");
            return ui.button({ id: "home-btn", label: "Home" });
          },
        },
        {
          id: "logs",
          title: "Logs",
          keybinding: "ctrl+2",
          screen: () => {
            rendered.push("logs");
            return ui.button({ id: "logs-btn", label: "Logs" });
          },
        },
        {
          id: "settings",
          title: "Settings",
          keybinding: "ctrl+3",
          screen: (params) => {
            const pane = (params as Readonly<{ pane?: string }>).pane;
            rendered.push(`settings:${pane ?? "none"}`);
            return ui.button({ id: "settings-btn", label: "Settings" });
          },
        },
      ],
      initialRoute: "home",
    });

    assert.ok(app.router);

    await bootWithResize(backend, app);

    assert.equal(app.router?.currentRoute().id, "home");
    assert.equal(rendered.includes("home"), true);

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 2, key: 50, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(20);

    assert.equal(app.router?.currentRoute().id, "logs");
    assert.equal(backend.requestedFrames.length, 2);

    backend.resolveNextFrame();
    await flushMicrotasks(10);

    app.router?.navigate("settings", Object.freeze({ pane: "network" }));
    await flushMicrotasks(20);

    assert.deepEqual(app.router?.currentRoute(), {
      id: "settings",
      params: Object.freeze({ pane: "network" }),
    });

    backend.resolveNextFrame();
    await flushMicrotasks(10);

    app.router?.back();
    await flushMicrotasks(20);

    assert.equal(app.router?.currentRoute().id, "logs");
    assert.equal(app.router?.canGoBack(), true);
    assert.deepEqual(app.router?.history(), [
      { id: "home", params: Object.freeze({}) },
      { id: "logs", params: Object.freeze({}) },
    ]);

    backend.resolveNextFrame();
    await flushMicrotasks(10);

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 9, key: 56, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(10);

    // No route bound to ctrl+8.
    assert.equal(app.router?.currentRoute().id, "logs");

    app.dispose();
  });

  test("route transitions recompute layout indexes", async () => {
    const backend = new StubBackend();
    let lastLayoutIds: readonly string[] = Object.freeze([]);

    const app = createApp({
      backend,
      initialState: Object.freeze({}),
      config: {
        internal_onLayout: (snapshot) => {
          lastLayoutIds = Object.freeze(Array.from(snapshot.idRects.keys()).sort());
        },
      },
      routes: [
        {
          id: "home",
          title: "Home",
          keybinding: "ctrl+1",
          screen: () =>
            ui.column({ id: "home-layout", gap: 1 }, [
              ui.button({ id: "home-btn", label: "Home" }),
            ]),
        },
        {
          id: "logs",
          title: "Logs",
          keybinding: "ctrl+2",
          screen: () =>
            ui.column({ id: "logs-layout", gap: 1 }, [
              ui.button({ id: "logs-btn", label: "Logs" }),
            ]),
        },
      ],
      initialRoute: "home",
    });

    await bootWithResize(backend, app);

    assert.equal(lastLayoutIds.includes("home-btn"), true);
    assert.equal(lastLayoutIds.includes("logs-btn"), false);

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 2, key: 50, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(20);

    backend.resolveNextFrame();
    await flushMicrotasks(10);

    assert.equal(app.router?.currentRoute().id, "logs");
    assert.equal(lastLayoutIds.includes("home-btn"), false);
    assert.equal(lastLayoutIds.includes("logs-btn"), true);

    app.dispose();
  });

  test("replaceRoutes refreshes route keybindings and disables removed shortcuts", async () => {
    const backend = new StubBackend();

    const app = createApp({
      backend,
      initialState: Object.freeze({}),
      routes: [
        {
          id: "home",
          title: "Home",
          keybinding: "ctrl+1",
          screen: () => ui.button({ id: "home-btn", label: "Home" }),
        },
        {
          id: "logs",
          title: "Logs",
          keybinding: "ctrl+2",
          screen: () => ui.button({ id: "logs-btn", label: "Logs" }),
        },
      ],
      initialRoute: "home",
    });

    await bootWithResize(backend, app);

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 2, key: 50, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);
    assert.equal(app.router?.currentRoute().id, "logs");

    app.replaceRoutes([
      {
        id: "home",
        title: "Home",
        keybinding: "ctrl+7",
        screen: () => ui.button({ id: "home-btn", label: "Home v2" }),
      },
      {
        id: "logs",
        title: "Logs",
        keybinding: "ctrl+8",
        screen: () => ui.button({ id: "logs-btn", label: "Logs v2" }),
      },
      {
        id: "settings",
        title: "Settings",
        keybinding: "ctrl+3",
        screen: () => ui.button({ id: "settings-btn", label: "Settings v2" }),
      },
    ]);
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);
    assert.equal(app.router?.currentRoute().id, "logs");

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 3, key: 50, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(20);
    assert.equal(app.router?.currentRoute().id, "logs");

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 4, key: 51, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);
    assert.equal(app.router?.currentRoute().id, "settings");

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 5, key: 55, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);
    assert.equal(app.router?.currentRoute().id, "home");

    app.dispose();
  });

  test("replaceRoutes remaps history when current routes are removed", async () => {
    const backend = new StubBackend();

    const app = createApp({
      backend,
      initialState: Object.freeze({}),
      routes: [
        {
          id: "home",
          keybinding: "ctrl+1",
          screen: () => ui.text("Home"),
        },
        {
          id: "logs",
          keybinding: "ctrl+2",
          screen: () => ui.text("Logs"),
        },
      ],
      initialRoute: "logs",
    });

    await bootWithResize(backend, app);

    app.router?.navigate("home");
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);
    assert.equal(app.router?.currentRoute().id, "home");

    app.replaceRoutes([
      {
        id: "settings",
        keybinding: "ctrl+3",
        screen: () => ui.text("Settings"),
      },
    ]);
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);

    assert.equal(app.router?.currentRoute().id, "settings");
    assert.deepEqual(app.router?.history(), [{ id: "settings", params: Object.freeze({}) }]);

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 8, key: 49, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(20);

    // Removed shortcut stays inert after route replacement.
    assert.equal(app.router?.currentRoute().id, "settings");

    app.dispose();
  });

  test("back() restores focus from previous route snapshot", async () => {
    const backend = new StubBackend();
    let sampledFocusedId: string | null = null;

    const app = createApp({
      backend,
      initialState: Object.freeze({}),
      routes: [
        {
          id: "home",
          title: "Home",
          screen: () =>
            ui.focusZone({ id: "home-zone", navigation: "linear", wrapAround: true }, [
              ui.button({ id: "home-1", label: "One" }),
              ui.button({ id: "home-2", label: "Two" }),
            ]),
        },
        {
          id: "logs",
          title: "Logs",
          screen: () => ui.button({ id: "logs-1", label: "Logs" }),
        },
      ],
      initialRoute: "home",
    });

    app.keys({
      "ctrl+9": (ctx) => {
        sampledFocusedId = ctx.focusedId;
      },
    });

    await bootWithResize(backend, app);

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [
            { kind: "key", timeMs: 10, key: ZR_KEY_TAB, action: "down" },
            { kind: "key", timeMs: 11, key: ZR_KEY_DOWN, action: "down" },
          ],
        }),
      }),
    );
    await flushMicrotasks(20);

    backend.resolveNextFrame();
    await flushMicrotasks(10);

    app.router?.navigate("logs");
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);

    app.router?.back();
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 20, key: 57, mods: ZR_MOD_CTRL, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(10);

    assert.equal(sampledFocusedId, "home-2");

    app.dispose();
  });

  test("route guards can block navigation until state changes", async () => {
    const backend = new StubBackend();
    const rendered: string[] = [];

    const app = createApp({
      backend,
      initialState: Object.freeze({ isAdmin: false }),
      routes: [
        {
          id: "home",
          screen: () => {
            rendered.push("home");
            return ui.text("Home");
          },
        },
        {
          id: "admin",
          guard: (_params, state) => state.isAdmin,
          screen: () => {
            rendered.push("admin");
            return ui.text("Admin");
          },
        },
      ],
      initialRoute: "home",
    });

    await bootWithResize(backend, app);

    app.router?.navigate("admin");
    await flushMicrotasks(20);

    assert.equal(app.router?.currentRoute().id, "home");
    assert.equal(rendered.includes("admin"), false);

    app.update((prev) => Object.freeze({ ...prev, isAdmin: true }));
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);

    app.router?.navigate("admin");
    await flushMicrotasks(20);

    assert.equal(app.router?.currentRoute().id, "admin");

    app.dispose();
  });

  test("route guard redirects before committing target route", async () => {
    const backend = new StubBackend();
    const rendered: string[] = [];

    const app = createApp({
      backend,
      initialState: Object.freeze({ isAdmin: false }),
      routes: [
        {
          id: "home",
          screen: () => {
            rendered.push("home");
            return ui.text("Home");
          },
        },
        {
          id: "logs",
          screen: () => {
            rendered.push("logs");
            return ui.text("Logs");
          },
        },
        {
          id: "admin",
          guard: (_params, state) => (state.isAdmin ? true : Object.freeze({ redirect: "home" })),
          screen: () => {
            rendered.push("admin");
            return ui.text("Admin");
          },
        },
      ],
      initialRoute: "logs",
    });

    await bootWithResize(backend, app);

    app.router?.navigate("admin");
    await flushMicrotasks(20);

    assert.equal(app.router?.currentRoute().id, "home");
    assert.deepEqual(app.router?.history(), [
      { id: "logs", params: Object.freeze({}) },
      { id: "home", params: Object.freeze({}) },
    ]);
    assert.equal(rendered.includes("admin"), false);

    app.dispose();
  });

  test("nested child routes render parent shell outlet", async () => {
    const backend = new StubBackend();
    let lastLayoutIds: readonly string[] = Object.freeze([]);

    const app = createApp({
      backend,
      initialState: Object.freeze({}),
      config: {
        internal_onLayout: (snapshot) => {
          lastLayoutIds = Object.freeze(Array.from(snapshot.idRects.keys()).sort());
        },
      },
      routes: [
        {
          id: "home",
          screen: () => ui.button({ id: "home-btn", label: "Home" }),
        },
        {
          id: "settings",
          screen: (_params, ctx) =>
            ui.column({ id: "settings-shell", gap: 1 }, [
              ui.button({ id: "settings-shell-btn", label: "Settings" }),
              ctx.outlet ?? ui.text("No outlet"),
            ]),
          children: [
            {
              id: "profile",
              screen: () => ui.button({ id: "profile-btn", label: "Profile" }),
            },
            {
              id: "appearance",
              screen: () => ui.button({ id: "appearance-btn", label: "Appearance" }),
            },
          ],
        },
      ],
      initialRoute: "settings",
    });

    await bootWithResize(backend, app);

    assert.equal(lastLayoutIds.includes("settings-shell-btn"), true);
    assert.equal(lastLayoutIds.includes("profile-btn"), false);
    assert.equal(lastLayoutIds.includes("appearance-btn"), false);

    app.router?.navigate("profile");
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);

    assert.equal(app.router?.currentRoute().id, "profile");
    assert.equal(lastLayoutIds.includes("settings-shell-btn"), true);
    assert.equal(lastLayoutIds.includes("profile-btn"), true);
    assert.equal(lastLayoutIds.includes("appearance-btn"), false);

    app.router?.navigate("appearance");
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);

    assert.equal(app.router?.currentRoute().id, "appearance");
    assert.equal(lastLayoutIds.includes("settings-shell-btn"), true);
    assert.equal(lastLayoutIds.includes("profile-btn"), false);
    assert.equal(lastLayoutIds.includes("appearance-btn"), true);

    app.dispose();
  });

  test("nested child navigation evaluates parent guard before child route", async () => {
    const backend = new StubBackend();
    const rendered: string[] = [];

    const app = createApp({
      backend,
      initialState: Object.freeze({ canAccessSettings: false }),
      routes: [
        {
          id: "home",
          screen: () => {
            rendered.push("home");
            return ui.text("Home");
          },
        },
        {
          id: "settings",
          guard: (_params, state) =>
            state.canAccessSettings ? true : Object.freeze({ redirect: "home" }),
          screen: (_params, ctx) =>
            ui.column({ id: "settings-shell", gap: 1 }, [
              ui.text("Settings"),
              ctx.outlet ?? ui.text("None"),
            ]),
          children: [
            {
              id: "profile",
              screen: () => {
                rendered.push("profile");
                return ui.text("Profile");
              },
            },
          ],
        },
      ],
      initialRoute: "home",
    });

    await bootWithResize(backend, app);

    app.router?.navigate("profile");
    await flushMicrotasks(20);

    assert.equal(app.router?.currentRoute().id, "home");
    assert.equal(rendered.includes("profile"), false);

    app.update((prev) => Object.freeze({ ...prev, canAccessSettings: true }));
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(10);

    app.router?.navigate("profile");
    await flushMicrotasks(20);

    assert.equal(app.router?.currentRoute().id, "profile");
    assert.equal(rendered.includes("profile"), true);

    app.dispose();
  });

  test("router rejects unknown route ids", () => {
    const backend = new StubBackend();
    const app = createApp({
      backend,
      initialState: Object.freeze({}),
      routes: [
        {
          id: "home",
          screen: () => ui.text("Home"),
        },
      ],
      initialRoute: "home",
    });

    assert.throws(
      () => app.router?.navigate("missing"),
      (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
    );
  });

  test("navigate during route render is rejected and captured by top-level error screen", async () => {
    const backend = new StubBackend();
    const fatalCodes: string[] = [];

    const app = createApp({
      backend,
      initialState: Object.freeze({}),
      routes: [
        {
          id: "home",
          screen: (_params, ctx) => {
            ctx.router.navigate("logs");
            return ui.text("Home");
          },
        },
        {
          id: "logs",
          screen: () => ui.text("Logs"),
        },
      ],
      initialRoute: "home",
    });

    app.onEvent((ev) => {
      if (ev.kind === "fatal") {
        fatalCodes.push(ev.code);
      }
    });

    await app.start();

    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }],
        }),
      }),
    );
    await flushMicrotasks(20);

    assert.deepEqual(fatalCodes, []);
    assert.equal(backend.stopCalls, 0);
    assert.equal(backend.disposeCalls, 0);
  });
});
