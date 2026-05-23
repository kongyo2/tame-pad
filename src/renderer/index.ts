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
const pad = byId<HTMLTextAreaElement>("pad");
const copyBtn = byId<HTMLButtonElement>("copy");
const clearBtn = byId<HTMLButtonElement>("clear");
const closeBtn = byId<HTMLButtonElement>("close");
const pinBtn = byId<HTMLButtonElement>("pin");
const snoozeBtn = byId<HTMLButtonElement>("snooze");
const convertNewlinesEl = byId<HTMLInputElement>("convertNewlines");
const toast = byId<HTMLDivElement>("toast");

type RuntimeState = {
  settings: Settings;
  expandTimer: number | undefined;
  collapseTimer: number | undefined;
  saveTimer: number | undefined;
  toastTimer: number | undefined;
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
}

function applyExpandedClass(expanded: boolean): void {
  if (expanded) {
    app.classList.remove("collapsed");
    app.classList.add("expanded");
  } else {
    app.classList.remove("expanded");
    app.classList.add("collapsed");
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
    applyExpandedClass(false);
  }
}

function requestExpand(): void {
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
  document.body.addEventListener("mouseleave", requestCollapse);

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
  wireEvents();
  // Register the DraftQuery responder only AFTER pad.value has been
  // populated from settings.draftText. If shutdown races with bootstrap
  // and we registered earlier, we'd reply with an empty pad.value and
  // main would overwrite the persisted draftText with "". A missing
  // responder makes main time out and keep the persisted value instead.
  window.tamepad.onDraftQuery(() => pad.value);
  window.tamepad.notifyReady();
}

void init();
