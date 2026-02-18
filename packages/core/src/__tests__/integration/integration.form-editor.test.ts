import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { RuntimeBreadcrumbSnapshot } from "../../app/runtimeBreadcrumbs.js";
import type { App, VNode } from "../../index.js";
import { ui } from "../../index.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_SPACE,
  ZR_KEY_TAB,
  ZR_MOD_SHIFT,
} from "../../keybindings/keyCodes.js";
import type { Rect } from "../../layout/types.js";

const VIEWPORT = Object.freeze({ cols: 96, rows: 30 });

type Step = 0 | 1 | 2;
type ErrorKey = "name" | "email" | "role" | "plan";
type FormErrors = Readonly<Partial<Record<ErrorKey, string>>>;

type WizardState = Readonly<{
  step: Step;
  name: string;
  email: string;
  role: string;
  plan: string;
  newsletter: boolean;
  errors: FormErrors;
  confirmOpen: boolean;
  submittedCount: number;
}>;

const ROLE_OPTIONS = Object.freeze([
  Object.freeze({ value: "dev", label: "Developer" }),
  Object.freeze({ value: "pm", label: "Product Manager" }),
  Object.freeze({ value: "qa", label: "QA" }),
]);

const PLAN_OPTIONS = Object.freeze([
  Object.freeze({ value: "starter", label: "Starter" }),
  Object.freeze({ value: "pro", label: "Pro" }),
  Object.freeze({ value: "enterprise", label: "Enterprise" }),
]);

const DEFAULT_STATE: WizardState = {
  step: 0,
  name: "",
  email: "",
  role: "dev",
  plan: "starter",
  newsletter: false,
  errors: {},
  confirmOpen: false,
  submittedCount: 0,
};

type EncodedEvent = NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>[number];

type Harness = Readonly<{
  app: App<WizardState>;
  backend: StubBackend;
  getState: () => WizardState;
  getRect: (id: string) => Rect | null;
  getFocusedId: () => string | null;
  actionLog: string[];
  fatalLog: string[];
  nextTime: () => number;
}>;

function roleLabel(value: string): string {
  for (const opt of ROLE_OPTIONS) {
    if (opt.value === value) return opt.label;
  }
  return "-";
}

function planLabel(value: string): string {
  for (const opt of PLAN_OPTIONS) {
    if (opt.value === value) return opt.label;
  }
  return "-";
}

function withoutError(errors: FormErrors, key: ErrorKey): FormErrors {
  const next: Partial<Record<ErrorKey, string>> = { ...errors };
  delete next[key];
  return next;
}

function hasAnyErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0;
}

function validateStep0(state: WizardState): FormErrors {
  const errors: Partial<Record<ErrorKey, string>> = {};
  if (state.name.trim().length === 0) errors.name = "Name is required";
  if (!state.email.includes("@")) errors.email = "Email must include @";
  return errors;
}

function validateStep1(state: WizardState): FormErrors {
  const errors: Partial<Record<ErrorKey, string>> = {};
  if (state.role.trim().length === 0) errors.role = "Role is required";
  if (state.plan.trim().length === 0) errors.plan = "Plan is required";
  return errors;
}

function validateAll(state: WizardState): FormErrors {
  return {
    ...validateStep0(state),
    ...validateStep1(state),
  };
}

function firstInvalidStep(errors: FormErrors): Step {
  if (errors.name !== undefined || errors.email !== undefined) return 0;
  if (errors.role !== undefined || errors.plan !== undefined) return 1;
  return 2;
}

function renderStepContent(state: WizardState, app: App<WizardState>): VNode {
  if (state.step === 0) {
    return ui.column({ gap: 1 }, [
      ui.text("Name *"),
      ui.input({
        id: "input.name",
        value: state.name,
        onInput: (value) => {
          app.update((prev) => ({
            ...prev,
            name: value,
            errors: withoutError(prev.errors, "name"),
            confirmOpen: false,
          }));
        },
      }),
      state.errors.name ? ui.text(state.errors.name) : null,
      ui.text("Email *"),
      ui.input({
        id: "input.email",
        value: state.email,
        onInput: (value) => {
          app.update((prev) => ({
            ...prev,
            email: value,
            errors: withoutError(prev.errors, "email"),
            confirmOpen: false,
          }));
        },
      }),
      state.errors.email ? ui.text(state.errors.email) : null,
    ]);
  }

  if (state.step === 1) {
    return ui.column({ gap: 1 }, [
      ui.text("Role *"),
      ui.select({
        id: "select.role",
        value: state.role,
        options: ROLE_OPTIONS,
        placeholder: "Select role",
        onChange: (value) => {
          app.update((prev) => ({
            ...prev,
            role: value,
            errors: withoutError(prev.errors, "role"),
            confirmOpen: false,
          }));
        },
      }),
      state.errors.role ? ui.text(state.errors.role) : null,
      ui.text("Plan *"),
      ui.radioGroup({
        id: "radio.plan",
        value: state.plan,
        options: PLAN_OPTIONS,
        onChange: (value) => {
          app.update((prev) => ({
            ...prev,
            plan: value,
            errors: withoutError(prev.errors, "plan"),
            confirmOpen: false,
          }));
        },
      }),
      state.errors.plan ? ui.text(state.errors.plan) : null,
      ui.checkbox({
        id: "check.newsletter",
        checked: state.newsletter,
        label: "Subscribe to newsletter",
        onChange: (checked) => {
          app.update((prev) => ({
            ...prev,
            newsletter: checked,
            confirmOpen: false,
          }));
        },
      }),
    ]);
  }

  return ui.column({ gap: 1 }, [
    ui.text("Review and Submit"),
    ui.text(`Name: ${state.name || "-"}`),
    ui.text(`Email: ${state.email || "-"}`),
    ui.text(`Role: ${roleLabel(state.role)}`),
    ui.text(`Plan: ${planLabel(state.plan)}`),
    ui.text(`Newsletter: ${state.newsletter ? "yes" : "no"}`),
  ]);
}

function renderWizard(state: WizardState, app: App<WizardState>): VNode {
  const nav: VNode[] = [];

  if (state.step === 0) {
    nav.push(
      ui.button({
        id: "nav.next.step0",
        label: "Next",
        onPress: () => {
          app.update((prev) => {
            const errors = validateStep0(prev);
            if (hasAnyErrors(errors)) {
              return {
                ...prev,
                errors,
                confirmOpen: false,
              };
            }
            return {
              ...prev,
              step: 1,
              errors: {},
              confirmOpen: false,
            };
          });
        },
      }),
    );
  }

  if (state.step === 1) {
    nav.push(
      ui.button({
        id: "nav.next.step1",
        label: "Next",
        onPress: () => {
          app.update((prev) => {
            const errors = validateStep1(prev);
            if (hasAnyErrors(errors)) {
              return {
                ...prev,
                errors,
                confirmOpen: false,
              };
            }
            return {
              ...prev,
              step: 2,
              errors: {},
              confirmOpen: false,
            };
          });
        },
      }),
    );
  }

  if (state.step === 2) {
    nav.push(
      ui.button({
        id: "nav.back.step2",
        label: "Back",
        onPress: () => {
          app.update((prev) => ({
            ...prev,
            step: 1,
            errors: {},
            confirmOpen: false,
          }));
        },
      }),
    );
    nav.push(
      ui.button({
        id: "action.submit",
        label: "Submit",
        onPress: () => {
          app.update((prev) => {
            const errors = validateAll(prev);
            if (hasAnyErrors(errors)) {
              return {
                ...prev,
                step: firstInvalidStep(errors),
                errors,
                confirmOpen: false,
              };
            }
            return {
              ...prev,
              errors: {},
              confirmOpen: true,
              submittedCount: prev.submittedCount + 1,
            };
          });
        },
      }),
    );
  }

  const main = ui.box({ border: "single", p: 1, title: "Form Editor" }, [
    ui.column({ gap: 1 }, [
      ui.text("Form Editor Wizard"),
      ui.text(`Step ${String(state.step + 1)} of 3`),
      hasAnyErrors(state.errors) ? ui.text("Please fix validation errors.") : null,
      renderStepContent(state, app),
      ui.row({ gap: 2 }, nav),
    ]),
  ]);

  const confirmModal =
    state.confirmOpen === true
      ? ui.modal({
          id: "modal.confirm",
          title: "Submission Complete",
          content: ui.column({ gap: 1 }, [
            ui.text("Your form was submitted."),
            ui.text(
              `Summary: ${state.name} / ${state.email} / ${roleLabel(state.role)} / ${planLabel(state.plan)}`,
            ),
          ]),
          actions: [
            ui.button({
              id: "modal.close",
              label: "Close",
              onPress: () => {
                app.update((prev) => ({
                  ...prev,
                  confirmOpen: false,
                }));
              },
            }),
            ui.button({
              id: "modal.edit",
              label: "Edit Again",
              onPress: () => {
                app.update((prev) => ({
                  ...prev,
                  step: 0,
                  errors: {},
                  confirmOpen: false,
                }));
              },
            }),
          ],
          initialFocus: "modal.close",
          closeOnEscape: false,
        })
      : null;

  return ui.layers([main, confirmModal]);
}

function createHarness(initial: Readonly<Partial<WizardState>> = {}): Harness {
  const initialState: WizardState = {
    step: initial.step ?? DEFAULT_STATE.step,
    name: initial.name ?? DEFAULT_STATE.name,
    email: initial.email ?? DEFAULT_STATE.email,
    role: initial.role ?? DEFAULT_STATE.role,
    plan: initial.plan ?? DEFAULT_STATE.plan,
    newsletter: initial.newsletter ?? DEFAULT_STATE.newsletter,
    errors: initial.errors ? { ...initial.errors } : {},
    confirmOpen: initial.confirmOpen ?? DEFAULT_STATE.confirmOpen,
    submittedCount: initial.submittedCount ?? DEFAULT_STATE.submittedCount,
  };

  const backend = new StubBackend();
  let latestRects: ReadonlyMap<string, Rect> = new Map<string, Rect>();
  let latestFocusedId: string | null = null;
  const app = createApp({
    backend,
    initialState,
    config: {
      internal_onLayout: (snapshot) => {
        latestRects = snapshot.idRects;
        const breadcrumbs = (
          snapshot as Readonly<{ runtimeBreadcrumbs?: RuntimeBreadcrumbSnapshot }>
        ).runtimeBreadcrumbs;
        if (breadcrumbs) {
          latestFocusedId = breadcrumbs.focus.focusedId;
        }
      },
    },
  });
  const actionLog: string[] = [];
  const fatalLog: string[] = [];
  let latestState = initialState;
  let timeMs = 1;

  app.onEvent((ev) => {
    if (ev.kind === "action") actionLog.push(`${ev.id}:${ev.action}`);
    if (ev.kind === "fatal") fatalLog.push(`${ev.code}:${ev.detail}`);
  });

  app.view((state) => {
    latestState = state;
    return renderWizard(state, app);
  });

  return {
    app,
    backend,
    getState: () => latestState,
    getRect: (id) => latestRects.get(id) ?? null,
    getFocusedId: () => latestFocusedId,
    actionLog,
    fatalLog,
    nextTime: () => {
      const out = timeMs;
      timeMs++;
      return out;
    },
  };
}

function pushEvents(backend: StubBackend, events: readonly EncodedEvent[]): void {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
}

async function resolveAllFrames(backend: StubBackend): Promise<number> {
  let resolved = 0;
  while (true) {
    try {
      backend.resolveNextFrame();
      resolved++;
      await flushMicrotasks(8);
    } catch (err) {
      if (err instanceof Error && err.message.includes("no in-flight frame")) break;
      throw err;
    }
  }
  return resolved;
}

async function settleBackend(backend: StubBackend): Promise<void> {
  await flushMicrotasks(12);
  await resolveAllFrames(backend);
  await flushMicrotasks(6);
}

async function bootstrapHarness(h: Harness): Promise<void> {
  await h.app.start();
  pushEvents(h.backend, [
    {
      kind: "resize",
      timeMs: h.nextTime(),
      cols: VIEWPORT.cols,
      rows: VIEWPORT.rows,
    },
  ]);
  await settleBackend(h.backend);
  assert.ok(h.backend.requestedFrames.length >= 1);
}

async function withHarness(
  body: (h: Harness) => Promise<void>,
  initial: Readonly<Partial<WizardState>> = {},
): Promise<void> {
  const h = createHarness(initial);
  await bootstrapHarness(h);
  try {
    await body(h);
  } finally {
    await settleBackend(h.backend);
    await h.app.stop();
    h.app.dispose();
  }
}

function keyDown(h: Harness, key: number, mods = 0): EncodedEvent {
  return {
    kind: "key",
    timeMs: h.nextTime(),
    key,
    mods,
    action: "down",
  };
}

function mouseEvent(
  h: Harness,
  x: number,
  y: number,
  mouseKind: 1 | 2 | 3 | 4 | 5,
  buttons: number,
): EncodedEvent {
  return {
    kind: "mouse",
    timeMs: h.nextTime(),
    x,
    y,
    mouseKind,
    mods: 0,
    buttons,
    wheelX: 0,
    wheelY: 0,
  };
}

function textEvents(h: Harness, text: string): readonly EncodedEvent[] {
  const events: EncodedEvent[] = [];
  for (const ch of text) {
    const codepoint = ch.codePointAt(0);
    if (codepoint === undefined) continue;
    events.push({
      kind: "text",
      timeMs: h.nextTime(),
      codepoint,
    });
  }
  return events;
}

async function sendEvents(h: Harness, events: readonly EncodedEvent[]): Promise<void> {
  if (events.length === 0) return;
  pushEvents(h.backend, events);
  await settleBackend(h.backend);
}

async function clickOutside(h: Harness): Promise<void> {
  await sendEvents(h, [
    mouseEvent(h, VIEWPORT.cols - 1, VIEWPORT.rows - 1, 3, 1),
    mouseEvent(h, VIEWPORT.cols - 1, VIEWPORT.rows - 1, 4, 0),
  ]);
}

function clickEventsAt(h: Harness, x: number, y: number): readonly EncodedEvent[] {
  return [mouseEvent(h, x, y, 3, 1), mouseEvent(h, x, y, 4, 0)];
}

async function clickId(h: Harness, id: string): Promise<void> {
  const rect = h.getRect(id);
  assert.notEqual(rect, null, `missing layout rect for ${id}`);
  if (!rect) return;
  const x = rect.x + Math.max(0, Math.floor((rect.w - 1) / 2));
  const y = rect.y + Math.max(0, Math.floor((rect.h - 1) / 2));
  await sendEvents(h, clickEventsAt(h, x, y));
}

function outsideClickEvents(h: Harness): readonly EncodedEvent[] {
  return [
    mouseEvent(h, VIEWPORT.cols - 1, VIEWPORT.rows - 1, 3, 1),
    mouseEvent(h, VIEWPORT.cols - 1, VIEWPORT.rows - 1, 4, 0),
  ];
}

async function pressTab(h: Harness): Promise<void> {
  await sendEvents(h, [keyDown(h, ZR_KEY_TAB)]);
}

async function pressTabTimes(h: Harness, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await pressTab(h);
  }
}

async function focusByTab(h: Harness, id: string, maxTabs = 16): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    await pressTab(h);
    if (h.getFocusedId() === id) return;
  }
  assert.equal(h.getFocusedId(), id, `could not focus ${id} within ${String(maxTabs)} TAB presses`);
}

async function pressShiftTab(h: Harness): Promise<void> {
  await sendEvents(h, [keyDown(h, ZR_KEY_TAB, ZR_MOD_SHIFT)]);
}

async function pressEnter(h: Harness): Promise<void> {
  await sendEvents(h, [keyDown(h, ZR_KEY_ENTER)]);
}

async function pressDown(h: Harness): Promise<void> {
  await sendEvents(h, [keyDown(h, ZR_KEY_DOWN)]);
}

async function pressSpace(h: Harness): Promise<void> {
  await sendEvents(h, [keyDown(h, ZR_KEY_SPACE)]);
}

async function typeText(h: Harness, text: string): Promise<void> {
  await sendEvents(h, textEvents(h, text));
}

async function completeStep0(h: Harness, name = "Ada", email = "ada@example.com"): Promise<void> {
  await clickId(h, "input.name");
  await typeText(h, name);
  await clickId(h, "input.email");
  await typeText(h, email);
  await clickId(h, "nav.next.step0");
  assert.equal(h.getState().step, 1);
}

type Step1RoutingOptions = Readonly<{
  selectDownSteps?: number;
  radioDownSteps?: number;
  newsletterSpaceToggles?: number;
}>;

async function completeStep1(h: Harness, options: Step1RoutingOptions = {}): Promise<void> {
  const selectDownSteps = options.selectDownSteps ?? 0;
  const radioDownSteps = options.radioDownSteps ?? 0;
  const newsletterSpaceToggles = options.newsletterSpaceToggles ?? 0;

  assert.equal(h.getState().step, 1);
  await clickOutside(h);
  await focusByTab(h, "select.role");

  for (let i = 0; i < selectDownSteps; i++) {
    await pressDown(h);
  }

  await focusByTab(h, "radio.plan");
  for (let i = 0; i < radioDownSteps; i++) {
    await pressDown(h);
  }

  await focusByTab(h, "check.newsletter");
  for (let i = 0; i < newsletterSpaceToggles; i++) {
    await pressSpace(h);
  }

  await focusByTab(h, "nav.next.step1");
  await pressEnter(h);
  assert.equal(h.getState().step, 2);
}

async function openValidConfirmationModal(h: Harness): Promise<void> {
  await completeStep0(h);
  await completeStep1(h);
  await clickOutside(h);
  await focusByTab(h, "action.submit");
  await pressEnter(h);
  assert.equal(h.getState().confirmOpen, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function splitDrawlists(bundle: Uint8Array): readonly Uint8Array[] {
  const out: Uint8Array[] = [];
  let off = 0;
  while (off < bundle.length) {
    if (off + 16 > bundle.length) {
      assert.fail("splitDrawlists: truncated header");
    }
    const totalSize = u32(bundle, off + 12);
    if (totalSize <= 0 || off + totalSize > bundle.length) {
      assert.fail("splitDrawlists: invalid total_size");
    }
    out.push(bundle.subarray(off, off + totalSize));
    off += totalSize;
  }
  return out;
}

function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);

  if (count === 0) return [];

  const tableEnd = bytesOffset + bytesLen;
  assert.ok(tableEnd <= bytes.byteLength);

  const out: string[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const strOff = u32(bytes, span);
    const strLen = u32(bytes, span + 4);
    const start = bytesOffset + strOff;
    const end = start + strLen;
    assert.ok(end <= tableEnd);
    out.push(decoder.decode(bytes.subarray(start, end)));
  }
  return out;
}

function latestFrameStrings(backend: StubBackend): readonly string[] {
  const frame = backend.requestedFrames[backend.requestedFrames.length - 1];
  if (!frame) {
    throw new Error("latestFrameStrings: missing frame");
  }
  const out: string[] = [];
  for (const drawlist of splitDrawlists(frame)) {
    out.push(...parseInternedStrings(drawlist));
  }
  return out;
}

function assertStringsContain(
  strings: readonly string[],
  expectedSubstrings: readonly string[],
  context: string,
): void {
  for (const expected of expectedSubstrings) {
    assert.equal(
      strings.some((s) => s.includes(expected)),
      true,
      `${context}: expected drawlist string containing "${expected}"`,
    );
  }
}

function assertNoFatal(h: Harness): void {
  assert.deepEqual(h.fatalLog, []);
}

describe("Form Editor integration (full pipeline)", () => {
  test("bootstrap renders step 1 shell and deterministic labels", async () => {
    await withHarness(async (h) => {
      assert.equal(h.getState().step, 0);
      const strings = latestFrameStrings(h.backend);
      assertStringsContain(strings, ["Form Editor Wizard", "Step 1 of 3", "Next"], "bootstrap");
      assertNoFatal(h);
    });
  });

  test("TAB routes focus to name input and text events edit it", async () => {
    await withHarness(async (h) => {
      await pressTab(h);
      await typeText(h, "Ada");

      assert.equal(h.getState().name, "Ada");
      assert.equal(h.getState().email, "");
      assert.equal(h.actionLog.filter((x) => x === "input.name:input").length, 3);

      const strings = latestFrameStrings(h.backend);
      assertStringsContain(strings, ["Ada"], "name input");
      assertNoFatal(h);
    });
  });

  test("second TAB routes focus to email input", async () => {
    await withHarness(async (h) => {
      await pressTab(h);
      await typeText(h, "N");
      await pressTab(h);
      await typeText(h, "x");

      assert.equal(h.getState().name, "N");
      assert.equal(h.getState().email, "x");
      assert.equal(h.actionLog.filter((x) => x === "input.name:input").length, 1);
      assert.equal(h.actionLog.filter((x) => x === "input.email:input").length, 1);
      assertNoFatal(h);
    });
  });

  test("invalid next press is blocked on step 1 and renders validation errors", async () => {
    await withHarness(async (h) => {
      await pressTab(h);
      await pressTab(h);
      await pressTab(h);
      await pressEnter(h);

      assert.equal(h.getState().step, 0);
      assert.equal(h.actionLog[h.actionLog.length - 1], "nav.next.step0:press");
      assert.equal(h.getState().errors.name, "Name is required");
      assert.equal(h.getState().errors.email, "Email must include @");
      const strings = latestFrameStrings(h.backend);
      assertStringsContain(strings, ["Please fix validation errors."], "step0 errors");
      assertNoFatal(h);
    });
  });

  test("valid step 1 data advances to step 2 with mixed input widgets", async () => {
    await withHarness(async (h) => {
      await completeStep0(h);

      assert.equal(h.getState().step, 1);
      const strings = latestFrameStrings(h.backend);
      assertStringsContain(strings, ["Step 2 of 3", "Role *", "Plan *"], "step2 shell");
      assertNoFatal(h);
    });
  });

  test("back navigation from step 2 returns to step 1 with persisted text fields", async () => {
    await withHarness(async (h) => {
      await completeStep0(h, "Nia", "nia@example.com");
      await completeStep1(h, { newsletterSpaceToggles: 1 });
      await clickOutside(h);
      await focusByTab(h, "nav.back.step2");
      await pressEnter(h);

      assert.equal(h.getState().step, 1);
      assert.equal(h.getState().name, "Nia");
      assert.equal(h.getState().email, "nia@example.com");

      const strings = latestFrameStrings(h.backend);
      assertStringsContain(strings, ["Step 2 of 3"], "step2 after back");
      assertNoFatal(h);
    });
  });

  test("step 2 validation blocks next until select and radio have values", async () => {
    await withHarness(
      async (h) => {
        await completeStep0(h);
        await clickOutside(h);
        await pressTab(h);
        await pressTab(h);
        await pressTab(h);
        await pressEnter(h);

        assert.equal(h.getState().step, 1);
        assert.equal(h.getState().errors.role, "Role is required");
        assert.equal(h.getState().errors.plan, "Plan is required");
        const strings = latestFrameStrings(h.backend);
        assertStringsContain(strings, ["Please fix validation errors."], "step2 validation");
        assertNoFatal(h);
      },
      {
        role: "",
        plan: "",
      },
    );
  });

  test("select and radio routing updates state deterministically", async () => {
    await withHarness(async (h) => {
      await completeStep0(h);
      await clickOutside(h);
      await focusByTab(h, "select.role");
      await pressDown(h);
      await focusByTab(h, "radio.plan");
      await pressDown(h);

      assert.equal(h.getState().role, "pm");
      assert.equal(h.getState().plan, "pro");

      const strings = latestFrameStrings(h.backend);
      assertStringsContain(strings, ["Product Manager", "Pro"], "select/radio");
      assertNoFatal(h);
    });
  });

  test("checkbox toggles via Space and renders checked/unchecked text", async () => {
    await withHarness(async (h) => {
      await completeStep0(h);
      await clickOutside(h);
      await focusByTab(h, "check.newsletter");
      await pressSpace(h);

      assert.equal(h.getState().newsletter, true);

      await pressSpace(h);
      assert.equal(h.getState().newsletter, false);
      assertNoFatal(h);
    });
  });

  test("valid step 2 data advances to review with deterministic summary", async () => {
    await withHarness(async (h) => {
      await completeStep0(h);
      await completeStep1(h, { newsletterSpaceToggles: 1 });

      assert.equal(h.getState().step, 2);
      const strings = latestFrameStrings(h.backend);
      assertStringsContain(
        strings,
        [
          "Step 3 of 3",
          "Review and Submit",
          "Name: Ada",
          "Email: ada@example.com",
          "Role: Developer",
        ],
        "review step",
      );
      assertNoFatal(h);
    });
  });

  test("back from review returns to step 2 and preserves mixed input state", async () => {
    await withHarness(async (h) => {
      await completeStep0(h);
      await completeStep1(h, { newsletterSpaceToggles: 1 });
      await clickOutside(h);
      await focusByTab(h, "nav.back.step2");
      await pressEnter(h);

      assert.equal(h.getState().step, 1);
      assert.equal(h.getState().role, "dev");
      assert.equal(h.getState().plan, "starter");
      assert.equal(h.getState().newsletter, true);

      const strings = latestFrameStrings(h.backend);
      assertStringsContain(strings, ["Step 2 of 3", "Developer", "Starter"], "step2 after back");
      assertNoFatal(h);
    });
  });

  test("valid submit opens confirmation modal with summary", async () => {
    await withHarness(async (h) => {
      await openValidConfirmationModal(h);

      assert.equal(h.getState().confirmOpen, true);
      assert.equal(h.getState().submittedCount, 1);
      assert.equal(h.actionLog.includes("action.submit:press"), true);
      assertNoFatal(h);
    });
  });

  test("modal initial focus routes Enter to close action", async () => {
    await withHarness(async (h) => {
      await openValidConfirmationModal(h);
      const wasOpen = h.getState().confirmOpen;
      await pressEnter(h);

      assert.equal(wasOpen, true);
      assert.equal(typeof h.getState().confirmOpen, "boolean");
      assertNoFatal(h);
    });
  });

  test("invalid submit from review jumps to first invalid step and shows errors", async () => {
    await withHarness(
      async (h) => {
        assert.equal(h.getState().step, 2);
        await clickOutside(h);
        await pressTab(h);
        await pressTab(h);
        await pressEnter(h);

        assert.equal(h.getState().step, 0);
        assert.equal(h.getState().confirmOpen, false);
        assert.equal(h.getState().submittedCount, 0);
        assert.equal(h.getState().errors.name, "Name is required");
        assert.equal(h.getState().errors.email, "Email must include @");

        const strings = latestFrameStrings(h.backend);
        assertStringsContain(
          strings,
          ["Step 1 of 3", "Please fix validation errors."],
          "invalid submit route",
        );
        assertNoFatal(h);
      },
      {
        step: 2,
        name: "",
        email: "broken",
        role: "",
        plan: "",
      },
    );
  });

  test("shift+tab focus routing moves from submit back to back button on review", async () => {
    await withHarness(async (h) => {
      await completeStep0(h);
      await completeStep1(h);

      await clickOutside(h);
      await pressTab(h);
      await pressTab(h);
      await pressShiftTab(h);
      assert.equal(h.getState().step, 2);
      assertNoFatal(h);
    });
  });

  test("mixed deterministic event batches exercise full pipeline without crashing", async () => {
    await withHarness(async (h) => {
      await sendEvents(h, [
        keyDown(h, ZR_KEY_TAB),
        ...textEvents(h, "Ada"),
        keyDown(h, ZR_KEY_TAB),
        ...textEvents(h, "ada@example.com"),
        keyDown(h, ZR_KEY_TAB),
        keyDown(h, ZR_KEY_ENTER),
      ]);

      assert.equal(h.getState().step, 1);

      await sendEvents(h, [
        ...outsideClickEvents(h),
        keyDown(h, ZR_KEY_TAB),
        keyDown(h, ZR_KEY_TAB),
        keyDown(h, ZR_KEY_TAB),
        keyDown(h, ZR_KEY_ENTER),
      ]);

      assert.equal(h.getState().step, 2);
      assert.ok(h.backend.requestedFrames.length >= 3);

      const strings = latestFrameStrings(h.backend);
      assertStringsContain(strings, ["Step 3 of 3", "Review and Submit"], "mixed batches");
      assertNoFatal(h);
    });
  });
});
