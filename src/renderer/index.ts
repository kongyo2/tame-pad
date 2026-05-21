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
const convertNewlinesEl = byId<HTMLInputElement>("convertNewlines");
const toast = byId<HTMLDivElement>("toast");

type RuntimeState = {
  settings: Settings;
  expandTimer: number | undefined;
  collapseTimer: number | undefined;
  saveTimer: number | undefined;
  toastTimer: number | undefined;
  imeComposing: boolean;
};

const state: RuntimeState = {
  settings: undefined as unknown as Settings,
  expandTimer: undefined,
  collapseTimer: undefined,
  saveTimer: undefined,
  toastTimer: undefined,
  imeComposing: false,
};

function clearTimer(handle: number | undefined): undefined {
  if (handle !== undefined) window.clearTimeout(handle);
  return undefined;
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

function setExpandedNow(expanded: boolean): void {
  if (expanded) {
    app.classList.remove("collapsed");
    app.classList.add("expanded");
  } else {
    app.classList.remove("expanded");
    app.classList.add("collapsed");
  }
  void window.tamepad.setExpanded(expanded);
}

function isExpanded(): boolean {
  return app.classList.contains("expanded");
}

function isPadFocused(): boolean {
  return document.activeElement === pad;
}

function requestExpand(): void {
  state.collapseTimer = clearTimer(state.collapseTimer);
  if (isExpanded()) return;
  state.expandTimer = clearTimer(state.expandTimer);
  state.expandTimer = window.setTimeout(() => {
    setExpandedNow(true);
  }, state.settings.expandHoverDelayMs);
}

function requestCollapse(): void {
  state.expandTimer = clearTimer(state.expandTimer);
  if (isPadFocused() || state.imeComposing) return;
  state.collapseTimer = clearTimer(state.collapseTimer);
  state.collapseTimer = window.setTimeout(() => {
    if (isPadFocused() || state.imeComposing) return;
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
    state.expandTimer = clearTimer(state.expandTimer);
    state.collapseTimer = clearTimer(state.collapseTimer);
    if (expanded) {
      app.classList.remove("collapsed");
      app.classList.add("expanded");
    } else {
      app.classList.remove("expanded");
      app.classList.add("collapsed");
    }
  });
}

async function init(): Promise<void> {
  state.settings = await window.tamepad.getSettings();
  convertNewlinesEl.checked = state.settings.convertNewlines;
  pad.value = state.settings.draftText;
  applyVisualSettings();
  wireEvents();
  window.tamepad.notifyReady();
}

void init();
