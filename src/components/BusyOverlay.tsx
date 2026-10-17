"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type WaitCopy = { title: string; detail: string };

export function routeWaitCopy(pathname: string): WaitCopy {
  if (pathname.startsWith("/boards/")) {
    return { title: "Opening board", detail: "Fetching the canvas." };
  }
  if (pathname === "/people") {
    return { title: "Loading people", detail: "Fetching who can sign in." };
  }
  return { title: "Loading boards", detail: "Fetching your boards." };
}

export function useHoldPage(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}

export function useBusyJob() {
  const [busy, setBusy] = useState<WaitCopy | null>(null);
  const activeRef = useRef(false);
  useHoldPage(busy !== null);

  const begin = useCallback((next: WaitCopy) => {
    if (activeRef.current) return false;
    activeRef.current = true;
    setBusy(next);
    return true;
  }, []);

  const update = useCallback((next: WaitCopy) => {
    activeRef.current = true;
    setBusy(next);
  }, []);

  const end = useCallback(() => {
    activeRef.current = false;
    setBusy(null);
  }, []);

  return { busy, begin, update, end, activeRef };
}

export function BusyOverlay({ title, detail, delay = false }: WaitCopy & { delay?: boolean }) {
  const [shown, setShown] = useState(!delay);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const detailId = useId();

  useEffect(() => {
    if (!delay) return;
    const timer = window.setTimeout(() => setShown(true), 200);
    return () => window.clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!shown) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        panel.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [shown]);

  return (
    <div className="fixed inset-0 z-[5000] grid place-items-center px-4" data-testid={shown ? "busy-overlay" : "busy-hold"}>
      <div className={`absolute inset-0 ${shown ? "bg-zinc-950/30" : ""}`} />
      {shown ? (
        <div
          ref={panelRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={detailId}
          aria-busy="true"
          tabIndex={-1}
          className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white px-6 py-6 shadow-2xl outline-none"
        >
          <Spinner />
          <h2 id={titleId} className="mt-4 text-lg font-semibold tracking-tight text-zinc-950">
            {title}
          </h2>
          <p id={detailId} className="mt-1.5 text-sm leading-relaxed text-zinc-600" aria-live="polite">
            {detail}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ConfirmDialog({
  title,
  detail,
  confirmLabel,
  confirmTestId,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail: string;
  confirmLabel: string;
  confirmTestId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  const detailId = useId();
  onCancelRef.current = onCancel;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      [...panel.querySelectorAll<HTMLElement>("button")].filter((button) => !button.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[5000] grid place-items-center px-4">
      <div className="absolute inset-0 bg-zinc-950/30" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={detailId}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white px-6 py-6 shadow-2xl outline-none"
      >
        <h2 id={titleId} className="text-lg font-semibold tracking-tight text-zinc-950">
          {title}
        </h2>
        <p id={detailId} className="mt-1.5 text-sm leading-relaxed text-zinc-600">
          {detail}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="h-11 rounded-md px-3 text-sm text-zinc-700 hover:bg-zinc-100" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="h-11 rounded-md bg-red-700 px-3 text-sm text-white hover:bg-red-800"
            data-testid={confirmTestId}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="grid h-10 w-10 place-items-center" aria-hidden="true">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-950" />
    </span>
  );
}
