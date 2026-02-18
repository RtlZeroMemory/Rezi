import { assert, describe, test } from "@rezi-ui/testkit";
import type { StateUpdater } from "../../app/updateQueue.js";
import { bind, bindChecked, bindSelect, bindTransform } from "../bind.js";

function createStateHarness<S extends Record<string, unknown>>(
  initial: S,
): {
  getState: () => S;
  update: (updater: StateUpdater<S>) => void;
  getUpdateCount: () => number;
} {
  let state = initial;
  let updateCount = 0;
  return {
    getState: () => state,
    update: (updater) => {
      updateCount++;
      if (typeof updater === "function") {
        state = updater(state);
        return;
      }
      state = updater;
    },
    getUpdateCount: () => updateCount,
  };
}

describe("form.bind - input binding", () => {
  test("bind returns string value for existing string field", () => {
    const h = createStateHarness({ name: "Ada" });
    const props = bind(h.getState(), "name", h.update);
    assert.equal(props.value, "Ada");
  });

  test("bind converts numeric value to string", () => {
    const h = createStateHarness({ age: 42 });
    const props = bind(h.getState(), "age", h.update);
    assert.equal(props.value, "42");
  });

  test("bind converts undefined value to empty string", () => {
    const h = createStateHarness({ name: undefined as unknown as string });
    const props = bind(h.getState(), "name", h.update);
    assert.equal(props.value, "");
  });

  test("bind converts null value to empty string", () => {
    const h = createStateHarness({ name: null as unknown as string });
    const props = bind(h.getState(), "name", h.update);
    assert.equal(props.value, "");
  });

  test("bind onInput updates top-level field", () => {
    const h = createStateHarness({ name: "Ada" });
    const props = bind(h.getState(), "name", h.update);

    assert.ok(props.onInput);
    props.onInput?.("Grace", 5);
    assert.equal(h.getState().name, "Grace");
    assert.equal(h.getUpdateCount(), 1);
  });

  test("bind onInput updates nested field path", () => {
    const h = createStateHarness({
      profile: { address: { city: "Paris", country: "FR" }, role: "admin" },
      status: "active",
    });
    const before = h.getState();
    const beforeProfile = before.profile;
    const beforeAddress = before.profile.address;

    const props = bind(h.getState(), "profile.address.city", h.update);
    assert.ok(props.onInput);
    props.onInput?.("Berlin", 6);

    const after = h.getState();
    assert.equal(after.profile.address.city, "Berlin");
    assert.equal(after.profile.address.country, "FR");
    assert.equal(after.status, "active");
    assert.notEqual(after, before);
    assert.notEqual(after.profile, beforeProfile);
    assert.notEqual(after.profile.address, beforeAddress);
  });

  test("bind creates missing nested objects for path assignment", () => {
    const h = createStateHarness<{ address?: { city?: string } }>({});
    const props = bind(h.getState(), "address.city", h.update);
    assert.ok(props.onInput);
    props.onInput?.("Tokyo", 5);

    assert.deepEqual(h.getState(), { address: { city: "Tokyo" } });
  });

  test("bind preserves references on untouched branches", () => {
    const h = createStateHarness({
      left: { value: "A" },
      right: { value: "B" },
    });
    const beforeRight = h.getState().right;

    const props = bind(h.getState(), "left.value", h.update);
    assert.ok(props.onInput);
    props.onInput?.("AA", 2);

    const after = h.getState();
    assert.equal(after.left.value, "AA");
    assert.equal(after.right.value, "B");
    assert.equal(after.right, beforeRight);
  });

  test("bind ignores empty path string updates", () => {
    const h = createStateHarness({ name: "Ada" });
    const props = bind(h.getState(), "", h.update);
    assert.ok(props.onInput);
    props.onInput?.("Grace", 5);

    assert.deepEqual(h.getState(), { name: "Ada" });
  });
});

describe("form.bind - transform binding", () => {
  test("bindTransform uses custom get formatter", () => {
    const h = createStateHarness({ cents: 1234 });
    const props = bindTransform(h.getState(), "cents", h.update, {
      get: (value) => `$${(Number(value) / 100).toFixed(2)}`,
      set: (value) => Math.round(Number(value.replace("$", "")) * 100),
    });
    assert.equal(props.value, "$12.34");
  });

  test("bindTransform onInput uses custom set parser", () => {
    const h = createStateHarness({ qty: 1 });
    const props = bindTransform(h.getState(), "qty", h.update, {
      get: (value) => String(value),
      set: (value) => Number(value),
    });

    assert.ok(props.onInput);
    props.onInput?.("7", 1);
    assert.equal(h.getState().qty, 7);
  });

  test("bindTransform supports nested field paths", () => {
    const h = createStateHarness({ profile: { rank: 3 } });
    const props = bindTransform(h.getState(), "profile.rank", h.update, {
      get: (value) => `#${String(value)}`,
      set: (value) => Number(value.slice(1)),
    });

    assert.ok(props.onInput);
    props.onInput?.("#9", 2);
    assert.equal(h.getState().profile.rank, 9);
  });

  test("bindTransform creates nested path when missing", () => {
    const h = createStateHarness<{ metrics?: { score?: number } }>({});
    const props = bindTransform(h.getState(), "metrics.score", h.update, {
      get: (value) => String(value ?? 0),
      set: (value) => Number(value),
    });

    assert.ok(props.onInput);
    props.onInput?.("12", 2);
    assert.deepEqual(h.getState(), { metrics: { score: 12 } });
  });

  test("bindTransform get receives undefined for missing path", () => {
    const seen: unknown[] = [];
    const h = createStateHarness<{ profile?: { alias?: string } }>({});
    const props = bindTransform(h.getState(), "profile.alias", h.update, {
      get: (value) => {
        seen.push(value);
        return value === undefined ? "" : String(value);
      },
      set: (value) => value,
    });

    assert.equal(props.value, "");
    assert.deepEqual(seen, [undefined]);
  });
});

describe("form.bind - checkbox binding", () => {
  test("bindChecked coerces truthy and falsy values", () => {
    const a = createStateHarness({ remember: "yes" as unknown as boolean });
    const b = createStateHarness({ remember: 0 as unknown as boolean });

    assert.equal(bindChecked(a.getState(), "remember", a.update).checked, true);
    assert.equal(bindChecked(b.getState(), "remember", b.update).checked, false);
  });

  test("bindChecked onChange updates top-level boolean", () => {
    const h = createStateHarness({ remember: false });
    const props = bindChecked(h.getState(), "remember", h.update);
    assert.ok(props.onChange);
    props.onChange?.(true);
    assert.equal(h.getState().remember, true);
  });

  test("bindChecked onChange supports nested path assignment", () => {
    const h = createStateHarness<{ settings?: { marketing?: boolean } }>({});
    const props = bindChecked(h.getState(), "settings.marketing", h.update);
    assert.ok(props.onChange);
    props.onChange?.(true);

    assert.deepEqual(h.getState(), { settings: { marketing: true } });
  });
});

describe("form.bind - select binding", () => {
  test("bindSelect converts nullish field value to empty string", () => {
    const h = createStateHarness<{ country?: string }>({});
    const props = bindSelect(h.getState(), "country", h.update);
    assert.equal(props.value, "");
  });

  test("bindSelect reads nested field value", () => {
    const h = createStateHarness({ profile: { locale: "fr-FR" } });
    const props = bindSelect(h.getState(), "profile.locale", h.update);
    assert.equal(props.value, "fr-FR");
  });

  test("bindSelect onChange updates top-level field", () => {
    const h = createStateHarness({ country: "US" });
    const props = bindSelect(h.getState(), "country", h.update);
    assert.ok(props.onChange);
    props.onChange?.("DE");
    assert.equal(h.getState().country, "DE");
  });

  test("bindSelect onChange supports nested path", () => {
    const h = createStateHarness<{ profile?: { locale?: string } }>({});
    const props = bindSelect(h.getState(), "profile.locale", h.update);
    assert.ok(props.onChange);
    props.onChange?.("en-US");

    assert.deepEqual(h.getState(), { profile: { locale: "en-US" } });
  });

  test("bindSelect does not mutate previous nested object", () => {
    const h = createStateHarness({ profile: { locale: "en", timezone: "UTC" } });
    const beforeProfile = h.getState().profile;
    const props = bindSelect(h.getState(), "profile.locale", h.update);

    assert.ok(props.onChange);
    props.onChange?.("de");

    const after = h.getState();
    assert.equal(after.profile.locale, "de");
    assert.equal(after.profile.timezone, "UTC");
    assert.notEqual(after.profile, beforeProfile);
  });
});
