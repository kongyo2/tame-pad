import type { Settings } from "../shared/settings";
import type { TamepadApi } from "../shared/api";

declare global {
  interface Window {
    readonly tamepad: TamepadApi;
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Element #${id} not found`);
  return el as T;
}

const app = byId<HTMLDivElement>("app");
const strip = byId<HTMLDivElement>("strip");
const pad = byId<HTMLTextAreaElement>("pad");
const copyBtn = byId<HTMLButtonElement>("copy");
const clearBtn = byId<HTMLButtonElement>("clear");
const closeBtn = byId<HTMLButtonElement>("close");
const pinBtn = byId<HTMLButtonElement>("pin");
const snoozeBtn = byId<HTMLButtonElement>("snooze");
const convertNewlinesEl = byId<HTMLInputElement>("convertNewlines");
const toast = byId<HTMLDivElement>("toast");

// One idle-pulse burst is PULSE_COUNT breaths of var(--idle-pulse-period).
// Kept in sync with styles.css (.strip.pulsing animation) so the JS timer
// that ends the burst matches the CSS animation length. The +120ms guard
// makes the timer outlast the animation so the strip settles back to its
// resting opacity before we re-arm.
const PULSE_PERIOD_MS = 2400;
const PULSE_COUNT = 3;
const PULSE_BURST_MS = PULSE_PERIOD_MS * PULSE_COUNT + 120;

type RuntimeState = {
  settings: Settings;
  expandTimer: number | undefined;
  collapseTimer: number | undefined;
  saveTimer: number | undefined;
  toastTimer: number | undefined;
  idleTimer: number | undefined;
  pulseEndTimer: number | undefined;
  imeComposing: boolean;
  pinned: boolean;
  snoozed: boolean;
};

const state: RuntimeState = {
  settings: undefined as unknown as Settings,
  expandTimer: undefined,
  collapseTimer: undefined,
  saveTimer: undefined,
  toastTimer: undefined,
  idleTimer: undefined,
  pulseEndTimer: undefined,
  imeComposing: false,
  pinned: false,
  snoozed: false,
};

function clearTimer(handle: number | undefined): undefined {
  if (handle !== undefined) window.clearTimeout(handle);
  return undefined;
}

function clearExpansionTimers(): void {
  state.expandTimer = clearTimer(state.expandTimer);
  state.collapseTimer = clearTimer(state.collapseTimer);
}

function applyVisualSettings(): void {
  const root = document.documentElement;
  root.style.setProperty("--font-size-px", `${state.settings.fontSizePx}px`);
  root.style.setProperty(
    "--opacity-collapsed",
    String(state.settings.opacityCollapsed),
  );
  root.style.setProperty(
    "--opacity-expanded",
    String(state.settings.opacityExpanded),
  );
  root.style.setProperty("--transition-ms", `${state.settings.transitionMs}ms`);
  root.style.setProperty(
    "--idle-pulse-peak",
    String(state.settings.idlePulsePeakOpacity),
  );
}

function applyExpandedClass(expanded: boolean): void {
  if (expanded) {
    app.classList.remove("collapsed");
    app.classList.add("expanded");
    // Expanded = the user can already see the pad; the idle reminder has
    // nothing to remind about. Stop any pulse and pause the countdown.
    cancelIdle();
  } else {
    app.classList.remove("expanded");
    app.classList.add("collapsed");
    // Back to a thin strip: start counting toward the next idle pulse.
    armIdle();
  }
}

function setExpandedNow(expanded: boolean): void {
  applyExpandedClass(expanded);
  void window.tamepad.setExpanded(expanded);
}

function isExpanded(): boolean {
  return app.classList.contains("expanded");
}

function isPadFocused(): boolean {
  return document.activeElement === pad;
}

// Collapse must be suppressed while the textarea is focused, an IME
// composition is mid-flight, or the user has pinned the panel open.
function shouldHoldOpen(): boolean {
  return state.pinned || isPadFocused() || state.imeComposing;
}

function applyPinnedUi(pinned: boolean): void {
  pinBtn.classList.toggle("pinned", pinned);
  pinBtn.setAttribute("aria-pressed", pinned ? "true" : "false");
  pinBtn.title = pinned ? "ピン留め解除" : "ピン留め (展開を固定)";
}

function setPinned(pinned: boolean): void {
  if (state.pinned === pinned) return;
  state.pinned = pinned;
  applyPinnedUi(pinned);
  void window.tamepad.setPinned(pinned);
  if (!pinned && !document.body.matches(":hover") && !isPadFocused()) {
    requestCollapse();
  }
}

function applySnoozedUi(snoozed: boolean): void {
  app.classList.toggle("snoozed", snoozed);
  snoozeBtn.classList.toggle("snoozed", snoozed);
  snoozeBtn.setAttribute("aria-pressed", snoozed ? "true" : "false");
  snoozeBtn.title = snoozed
    ? "スヌーズ中 (解除はトレイから)"
    : "スヌーズ (クリックスルー / 解除はトレイから)";
}

// Mirror snooze state without invoking the IPC again. Used both for
// renderer-initiated toggles and for main-initiated broadcasts (tray menu).
function applySnoozedState(snoozed: boolean): void {
  state.snoozed = snoozed;
  applySnoozedUi(snoozed);
  if (snoozed) {
    // Snooze and pin are opposites; main has already cleared its pin
    // state. Mirror that in the renderer so the UI stays consistent.
    if (state.pinned) {
      state.pinned = false;
      applyPinnedUi(false);
    }
    clearExpansionTimers();
    // Stop the pulse before applyExpandedClass(false): a click-through,
    // "leave me alone" strip should never blink, and armIdle would no-op
    // anyway while snoozed.
    cancelIdle();
    applyExpandedClass(false);
  } else {
    // Un-snoozed and (always, here) collapsed: resume counting toward the
    // next reminder. applyExpandedClass isn't called on this branch, so arm
    // explicitly.
    armIdle();
  }
}

function requestExpand(): void {
  // Any hover is an interaction: kill an in-flight pulse immediately and
  // reset the idle countdown, even if we don't end up expanding (snoozed,
  // or already expanded) below.
  cancelIdle();
  state.collapseTimer = clearTimer(state.collapseTimer);
  // Snooze means "stay collapsed and ignore mouse"; the window is
  // already click-through, but a queued mouseenter (from before the
  // ignore took effect) can still land here. Short-circuit so the
  // panel doesn't briefly pop open.
  if (state.snoozed) return;
  if (isExpanded()) return;
  state.expandTimer = clearTimer(state.expandTimer);
  state.expandTimer = window.setTimeout(() => {
    setExpandedNow(true);
  }, state.settings.expandHoverDelayMs);
}

function requestCollapse(): void {
  state.expandTimer = clearTimer(state.expandTimer);
  if (shouldHoldOpen()) return;
  state.collapseTimer = clearTimer(state.collapseTimer);
  state.collapseTimer = window.setTimeout(() => {
    if (shouldHoldOpen()) return;
    setExpandedNow(false);
  }, state.settings.collapseDelayMs);
}

// --- Idle attention pulse ---------------------------------------------------
// When the collapsed strip sits untouched for a while it's easy to forget the
// pad is even running. After settings.idlePulseDelayMs of no interaction we
// run a short, gentle breathing burst on the strip to draw the eye, then go
// quiet and re-arm. Any interaction (hover/focus/expand) or snooze cancels it.

function stopPulse(): void {
  state.pulseEndTimer = clearTimer(state.pulseEndTimer);
  strip.classList.remove("pulsing");
}

// Cancel both the scheduled countdown and any in-flight pulse. Used whenever
// the strip stops being a quiet, collapsed reminder target.
function cancelIdle(): void {
  state.idleTimer = clearTimer(state.idleTimer);
  stopPulse();
}

// (Re)start the idle countdown. Safe to call from any transition: onIdle
// re-checks conditions when it fires and reschedules itself if the moment
// isn't right, so callers don't have to reason about current state.
function armIdle(): void {
  state.idleTimer = clearTimer(state.idleTimer);
  if (!state.settings.idlePulse || state.snoozed) return;
  state.idleTimer = window.setTimeout(onIdle, state.settings.idlePulseDelayMs);
}

function onIdle(): void {
  state.idleTimer = undefined;
  if (!state.settings.idlePulse || state.snoozed) return;
  // Pulsing an open/pinned/focused pad is pointless — it's already visible.
  // Wait out another interval instead of nagging.
  if (isExpanded() || state.pinned || isPadFocused()) {
    armIdle();
    return;
  }
  startPulse();
}

function startPulse(): void {
  stopPulse();
  // Force a reflow so re-adding the class restarts the CSS animation from 0%
  // even if a previous burst just ended on the same frame.
  void strip.offsetWidth;
  strip.classList.add("pulsing");
  // End the burst on a timer rather than the animationend event: under
  // prefers-reduced-motion the animation is disabled (no animationend), but
  // the strip is still held at peak opacity for this window and must be
  // released and re-armed the same way.
  state.pulseEndTimer = window.setTimeout(() => {
    state.pulseEndTimer = undefined;
    strip.classList.remove("pulsing");
    armIdle();
  }, PULSE_BURST_MS);
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("show");
  state.toastTimer = clearTimer(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 900);
}

function transformForCopy(raw: string): string {
  if (!convertNewlinesEl.checked) return raw;
  return raw.replace(/\r?\n/g, " ").replace(/ {2,}/g, " ");
}

function scheduleAutosave(): void {
  state.saveTimer = clearTimer(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    void window.tamepad.saveDraft(pad.value);
  }, state.settings.autosaveDebounceMs);
}

function flushAutosave(): void {
  state.saveTimer = clearTimer(state.saveTimer);
  void window.tamepad.saveDraft(pad.value);
}

function wireEvents(): void {
  document.body.addEventListener("mouseenter", requestExpand);
  document.body.addEventListener("mouseleave", () => {
    requestCollapse();
    // A hover that never triggered expansion produces no collapse event, so
    // re-arm here too; armIdle is a no-op-safe reset in every other case.
    armIdle();
  });

  pad.addEventListener("focus", () => {
    state.collapseTimer = clearTimer(state.collapseTimer);
    if (!isExpanded()) setExpandedNow(true);
  });

  pad.addEventListener("blur", () => {
    flushAutosave();
    if (!document.body.matches(":hover")) requestCollapse();
  });

  pad.addEventListener("input", scheduleAutosave);

  pad.addEventListener("compositionstart", () => {
    state.imeComposing = true;
  });
  pad.addEventListener("compositionend", () => {
    state.imeComposing = false;
  });

  copyBtn.addEventListener("click", async () => {
    flushAutosave();
    const text = transformForCopy(pad.value);
    await window.tamepad.writeClipboard(text);
    showToast("コピーしました");
    pad.focus();
  });

  clearBtn.addEventListener("click", () => {
    pad.focus();
    if (pad.value.length === 0) return;
    // setRangeText pushes onto the textarea's undo stack so Ctrl+Z restores.
    pad.setSelectionRange(0, pad.value.length);
    pad.setRangeText("", 0, pad.value.length, "end");
  });

  closeBtn.addEventListener("click", () => {
    // Manual override: collapse regardless of focus/IME/pin guards that
    // would otherwise block requestCollapse and strand the panel open.
    if (state.pinned) setPinned(false);
    if (isPadFocused()) pad.blur();
    clearExpansionTimers();
    flushAutosave();
    setExpandedNow(false);
  });

  pinBtn.addEventListener("click", () => {
    setPinned(!state.pinned);
  });

  snoozeBtn.addEventListener("click", () => {
    // Blur first: leaving focus on the (now invisible) pad would route
    // subsequent keystrokes into a textarea the user can't see, mirroring
    // the close-button rationale.
    if (isPadFocused()) pad.blur();
    // Sequence matters: collapse + clear-pin (via applySnoozedState) must
    // happen before the IPC so the window is in a known state when main
    // calls setIgnoreMouseEvents(true).
    applySnoozedState(true);
    flushAutosave();
    void window.tamepad.setSnoozed(true);
  });

  convertNewlinesEl.addEventListener("change", () => {
    const next = convertNewlinesEl.checked;
    state.settings = { ...state.settings, convertNewlines: next };
    void window.tamepad.updateSettings({ convertNewlines: next });
  });

  window.addEventListener("beforeunload", flushAutosave);

  // Main process broadcasts when it initiates an expansion change
  // (window blur, second-instance). Sync classList without calling back,
  // otherwise hover mouseenter early-returns on isExpanded() === true.
  window.tamepad.onExpansionChanged((expanded) => {
    clearExpansionTimers();
    applyExpandedClass(expanded);
  });

  // Main broadcasts on tray toggle (the only place snooze can be turned
  // off, since the click-through window can't receive the title-bar
  // button click). Mirror state without calling back to avoid an IPC loop.
  window.tamepad.onSnoozeChanged((snoozed) => {
    applySnoozedState(snoozed);
  });
}

async function init(): Promise<void> {
  state.settings = await window.tamepad.getSettings();
  convertNewlinesEl.checked = state.settings.convertNewlines;
  pad.value = state.settings.draftText;
  applyVisualSettings();
  app.classList.toggle("no-grip", !state.settings.edgeGrip);
  wireEvents();
  // Start counting toward the first idle pulse from launch (the app boots
  // collapsed), so a freshly started pad that's left untouched still reminds
  // the user it's there.
  armIdle();
  // Register the DraftQuery responder only AFTER pad.value has been
  // populated from settings.draftText. If shutdown races with bootstrap
  // and we registered earlier, we'd reply with an empty pad.value and
  // main would overwrite the persisted draftText with "". A missing
  // responder makes main time out and keep the persisted value instead.
  window.tamepad.onDraftQuery(() => pad.value);
  window.tamepad.notifyReady();
}

void init();
