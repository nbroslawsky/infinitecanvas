"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InfiniteViewer from "react-infinite-viewer";
import Moveable from "react-moveable";
import Selecto from "react-selecto";
import { alignItems, contentBounds, distributeItems, reparent, type AlignKind } from "@/lib/layout";
import { FONT_SIZES, TEXT_COLORS, type BoardPayload, type CanvasItem } from "@/lib/types";
import { downloadBlob, exportBoardPdf, exportBoardPng } from "@/components/canvas/export-board";
import { prepareImage, type PreparedImage } from "@/components/canvas/prepare-image";

type ViewerHandle = {
  setZoom: (zoom: number) => void;
  getZoom: () => number;
  scrollTo: (x: number, y: number) => void;
  getScrollLeft: () => number;
  getScrollTop: () => number;
};

type Tool = "select" | "frame";

const WORLD_OFFSET = 10000;
const WORLD_SIZE = 20000;

export function InfiniteCanvas({
  initial,
  uploadMode,
}: {
  initial: BoardPayload;
  uploadMode: "server" | "direct";
}) {
  const [boardName, setBoardName] = useState(initial.board.name);
  const [items, setItems] = useState<CanvasItem[]>(initial.items);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [status, setStatus] = useState("Saved");
  const [note, setNote] = useState("");
  const [zoomLabel, setZoomLabel] = useState(Math.round(initial.board.zoom * 100));
  const [view, setView] = useState({ scrollLeft: 0, scrollTop: 0, zoom: initial.board.zoom || 1 });
  const [coarse, setCoarse] = useState(false);
  const [panTool, setPanTool] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const [draft, setDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerHandle>(null);
  const itemsRef = useRef(items);
  const lastSaved = useRef(items);
  const undoStack = useRef<CanvasItem[][]>([]);
  const redoStack = useRef<CanvasItem[][]>([]);
  const moveableRef = useRef<Moveable>(null);
  const saveTimer = useRef<number | null>(null);
  const running = useRef(false);
  const queued = useRef(false);
  const cameraTimer = useRef<number | null>(null);
  const draftStart = useRef<{ x: number; y: number } | null>(null);
  const pan = coarse ? panTool || spaceDown : spaceDown;
  itemsRef.current = items;

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.setZoom(initial.board.zoom || 1);
    const shell = shellRef.current?.getBoundingClientRect();
    if (initial.board.cameraX === 0 && initial.board.cameraY === 0 && shell) {
      viewer.scrollTo(WORLD_OFFSET - shell.width / 2, WORLD_OFFSET - shell.height / 2);
    } else {
      viewer.scrollTo(initial.board.cameraX, initial.board.cameraY);
    }
  }, [initial.board.cameraX, initial.board.cameraY, initial.board.zoom]);

  const refreshTargets = useCallback((ids: string[]) => {
    const next = ids
      .map((id) => document.querySelector<HTMLElement>(`[data-item-id="${id}"]`))
      .filter((element): element is HTMLElement => Boolean(element));
    setTargets(next);
  }, []);

  useEffect(() => {
    refreshTargets(editingTextId || editingNameId ? [] : selectedIds);
  }, [selectedIds, items, editingTextId, editingNameId, refreshTargets]);

  const worldPoint = useCallback((clientX: number, clientY: number) => {
    const rect = shellRef.current?.getBoundingClientRect();
    const viewer = viewerRef.current;
    const zoom = viewer?.getZoom() || 1;
    return {
      x: (clientX - (rect?.left ?? 0)) / zoom + (viewer?.getScrollLeft() || 0) - WORLD_OFFSET,
      y: (clientY - (rect?.top ?? 0)) / zoom + (viewer?.getScrollTop() || 0) - WORLD_OFFSET,
    };
  }, []);

  const persist = useCallback(async (prev: CanvasItem[], next: CanvasItem[]) => {
    const prevIds = new Set(prev.map((item) => item.id));
    const nextIds = new Set(next.map((item) => item.id));
    const created = next.filter((item) => !prevIds.has(item.id));
    const removed = [...prevIds].filter((id) => !nextIds.has(id));
    const updated = next.filter((item) => prevIds.has(item.id));
    for (const item of created) {
      const response = await fetch(`/api/boards/${initial.board.id}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item }),
      });
      if (response.status === 401) throw new Error("Sign in again to keep saving");
      if (!response.ok) throw new Error("Could not save");
    }
    if (updated.length > 0) {
      const response = await fetch(`/api/boards/${initial.board.id}/items`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: updated }),
      });
      if (response.status === 401) throw new Error("Sign in again to keep saving");
      if (!response.ok) throw new Error("Could not save");
    }
    if (removed.length > 0) {
      const response = await fetch(`/api/boards/${initial.board.id}/items`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: removed }),
      });
      if (response.status === 401) throw new Error("Sign in again to keep saving");
      if (!response.ok) throw new Error("Could not save");
    }
  }, [initial.board.id]);

  const flush = useCallback(async () => {
    if (running.current) {
      queued.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        queued.current = false;
        const next = itemsRef.current;
        const prev = lastSaved.current;
        if (JSON.stringify(prev) === JSON.stringify(next)) {
          setStatus("Saved");
          continue;
        }
        setStatus("Saving");
        await persist(prev, next);
        lastSaved.current = next;
        setStatus("Saved");
      } while (queued.current || JSON.stringify(lastSaved.current) !== JSON.stringify(itemsRef.current));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Couldn't save. Retrying…");
      window.setTimeout(() => void flush(), 1500);
    } finally {
      running.current = false;
    }
  }, [persist]);

  const commit = useCallback((next: CanvasItem[], immediate = false) => {
    undoStack.current.push(itemsRef.current);
    if (undoStack.current.length > 40) undoStack.current.shift();
    redoStack.current = [];
    itemsRef.current = next;
    setItems(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (immediate) {
      void flush();
    } else {
      setStatus("Saving");
      saveTimer.current = window.setTimeout(() => void flush(), 400);
    }
  }, [flush]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (status.startsWith("Saving") || status.startsWith("Couldn't") || status.startsWith("Sign in")) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      if (status.startsWith("Saving") || JSON.stringify(lastSaved.current) !== JSON.stringify(itemsRef.current)) return;
      const response = await fetch(`/api/boards/${initial.board.id}`);
      if (!response.ok) return;
      const payload = (await response.json()) as BoardPayload;
      lastSaved.current = payload.items;
      itemsRef.current = payload.items;
      setItems(payload.items);
      setBoardName(payload.board.name);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [initial.board.id, status]);

  const saveCamera = useCallback((x: number, y: number, zoom: number) => {
    setView({ scrollLeft: x, scrollTop: y, zoom });
    setZoomLabel(Math.round(zoom * 100));
    if (cameraTimer.current) window.clearTimeout(cameraTimer.current);
    cameraTimer.current = window.setTimeout(() => {
      void fetch(`/api/boards/${initial.board.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cameraX: x, cameraY: y, zoom }),
      });
    }, 500);
  }, [initial.board.id]);

  function withIds(ids: string[], recipe: (current: CanvasItem[]) => CanvasItem[]) {
    commit(recipe(itemsRef.current));
    setSelectedIds(ids);
  }

  function updateSelected(recipe: (item: CanvasItem) => CanvasItem) {
    const ids = new Set(selectedIds);
    commit(itemsRef.current.map((item) => (ids.has(item.id) ? recipe(item) : item)));
  }

  function applyReparent(next: CanvasItem[], ids: string[]) {
    let current = next;
    for (const id of ids) {
      const change = reparent(current, id);
      if (change) current = current.map((item) => (item.id === id ? { ...item, ...change } : item));
    }
    return current;
  }

  function readElements(elements: HTMLElement[]) {
    const byElement = new Map(elements.map((element) => [element.dataset.itemId, element]));
    let next = itemsRef.current.map((item) => {
      const element = byElement.get(item.id);
      if (!element) return item;
      const rotation = /rotate\(([-\d.]+)deg\)/.exec(element.style.transform)?.[1];
      return {
        ...item,
        x: (Number.parseFloat(element.style.left) || 0) - (element.dataset.parent ? 0 : WORLD_OFFSET),
        y: (Number.parseFloat(element.style.top) || 0) - (element.dataset.parent ? 0 : WORLD_OFFSET),
        width: Math.max(8, Number.parseFloat(element.style.width) || item.width),
        height: Math.max(8, Number.parseFloat(element.style.height) || item.height),
        rotation: item.type === "frame" ? 0 : rotation ? Number(rotation) : item.rotation,
      };
    });
    next = applyReparent(next, elements.map((element) => element.dataset.itemId || "").filter(Boolean));
    commit(next);
  }

  async function uploadFiles(files: File[], point?: { x: number; y: number }) {
    const origin = point ?? viewCenter();
    let offset = 0;
    const added: string[] = [];
    for (const file of files) {
      const prepared = await prepareImage(file);
      if ("error" in prepared) {
        setNote(prepared.error);
        continue;
      }
      const asset = await sendAsset(prepared);
      if (!asset) continue;
      const size = fitted(prepared.width, prepared.height);
      const item: CanvasItem = {
        id: crypto.randomUUID(),
        type: "image",
        assetId: asset.id,
        parentId: null,
        x: origin.x + offset,
        y: origin.y,
        width: size.width,
        height: size.height,
        rotation: 0,
        zIndex: maxZ(itemsRef.current) + 1,
        text: "",
        fontSize: 24,
        color: "#1c1917",
        name: "",
      };
      const next = applyReparent([...itemsRef.current, item], [item.id]);
      commit(next, true);
      added.push(item.id);
      offset += size.width + 24;
    }
    if (added.length > 0) setSelectedIds(added);
  }

  async function sendAsset(prepared: PreparedImage) {
    if (uploadMode === "direct") {
      const { upload } = await import("@vercel/blob/client");
      const originalBlob = await upload(prepared.name, prepared.original, {
        access: "public",
        handleUploadUrl: "/api/blob",
      });
      const previewBlob = await upload(`preview-${prepared.name}`, prepared.preview, {
        access: "public",
        handleUploadUrl: "/api/blob",
      });
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalUrl: originalBlob.url,
          previewUrl: previewBlob.url,
          width: prepared.width,
          height: prepared.height,
        }),
      });
      if (!response.ok) {
        setNote("Could not save that image");
        return null;
      }
      return (await response.json()).asset as { id: string };
    }
    const form = new FormData();
    form.set("original", prepared.original, prepared.name);
    form.set("preview", prepared.preview, "preview.jpg");
    form.set("width", String(prepared.width));
    form.set("height", String(prepared.height));
    const response = await fetch("/api/upload", { method: "POST", body: form });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setNote(body?.error || "Could not save that image");
      return null;
    }
    return (await response.json()).asset as { id: string };
  }

  function viewCenter() {
    const rect = shellRef.current?.getBoundingClientRect();
    const viewer = viewerRef.current;
    const zoom = viewer?.getZoom() || 1;
    return {
      x: (viewer?.getScrollLeft() || 0) - WORLD_OFFSET + (rect?.width ?? 800) / (2 * zoom),
      y: (viewer?.getScrollTop() || 0) - WORLD_OFFSET + (rect?.height ?? 600) / (2 * zoom),
    };
  }

  function addFrame(rect: { x: number; y: number; width: number; height: number }) {
    const count = itemsRef.current.filter((item) => item.type === "frame").length + 1;
    const item: CanvasItem = {
      id: crypto.randomUUID(),
      type: "frame",
      assetId: null,
      parentId: null,
      x: rect.x,
      y: rect.y,
      width: Math.max(40, rect.width),
      height: Math.max(40, rect.height),
      rotation: 0,
      zIndex: maxZ(itemsRef.current) + 1,
      text: "",
      fontSize: 24,
      color: "#1c1917",
      name: `Frame ${count}`,
    };
    const next = applyReparent([...itemsRef.current, item], [item.id]);
    commit(next, true);
    setSelectedIds([item.id]);
  }

  function deleteSelected() {
    const ids = collectIds(itemsRef.current, selectedIds);
    if (ids.length === 0) return;
    commit(itemsRef.current.filter((item) => !ids.includes(item.id)), true);
    setSelectedIds([]);
  }

  function duplicateSelected() {
    const copies = cloneItems(itemsRef.current, selectedIds, 24);
    if (copies.length === 0) return;
    commit([...itemsRef.current, ...copies], true);
    setSelectedIds(copies.map((item) => item.id));
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(itemsRef.current);
    itemsRef.current = previous;
    setItems(previous);
    void flush();
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    void flush();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (event.code === "Space" && !typing) {
        event.preventDefault();
        setSpaceDown(true);
      }
      if (typing) return;
      const meta = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") {
        setSelectedIds([]);
        setEditingTextId(null);
        setEditingNameId(null);
        setTool("select");
        draftStart.current = null;
        setDraft(null);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      }
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (meta && event.key === "0") {
        event.preventDefault();
        fit();
      }
      if (meta && event.key === "1") {
        event.preventDefault();
        viewerRef.current?.setZoom(1);
      }
      const nudge = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") nudgeBy(-nudge, 0);
      if (event.key === "ArrowRight") nudgeBy(nudge, 0);
      if (event.key === "ArrowUp") nudgeBy(0, -nudge);
      if (event.key === "ArrowDown") nudgeBy(0, nudge);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceDown(false);
    };
    const onCopy = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target) || selectedIds.length === 0 || !event.clipboardData) return;
      event.preventDefault();
      const payload = JSON.stringify(selectedIds);
      event.clipboardData.setData(CANVAS_CLIPBOARD, payload);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target) || !event.clipboardData) return;
      const ids = canvasIdsFromClipboard(event.clipboardData);
      if (ids) {
        event.preventDefault();
        const copies = cloneItems(itemsRef.current, ids, 24);
        if (copies.length === 0) return;
        commit([...itemsRef.current, ...copies], true);
        setSelectedIds(copies.map((item) => item.id));
        return;
      }
      const files = imageFilesFromClipboard(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      void uploadFiles(files);
    };
    const allowFileDrop = (event: DragEvent) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes("Files") || !pointInShell(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      if (!pointInShell(event.clientX, event.clientY)) return;
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      void uploadFiles(files, worldPoint(event.clientX, event.clientY));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("copy", onCopy);
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", allowFileDrop, true);
    window.addEventListener("dragover", allowFileDrop, true);
    window.addEventListener("drop", onDrop, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", allowFileDrop, true);
      window.removeEventListener("dragover", allowFileDrop, true);
      window.removeEventListener("drop", onDrop, true);
    };
  });

  function pointInShell(clientX: number, clientY: number) {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function nudgeBy(dx: number, dy: number) {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    let next = itemsRef.current.map((item) => (ids.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item));
    next = applyReparent(next, selectedIds);
    commit(next);
  }

  function fit() {
    const viewer = viewerRef.current;
    const rect = shellRef.current?.getBoundingClientRect();
    if (!viewer || !rect) return;
    const bounds = contentBounds(itemsRef.current);
    if (!bounds) {
      viewer.setZoom(1);
      viewer.scrollTo(WORLD_OFFSET - rect.width / 2, WORLD_OFFSET - rect.height / 2);
      return;
    }
    const zoom = Math.min(8, Math.max(0.05, Math.min((rect.width - 80) / bounds.width, (rect.height - 80) / bounds.height)));
    viewer.setZoom(zoom);
    viewer.scrollTo(
      bounds.x + WORLD_OFFSET + bounds.width / 2 - rect.width / (2 * zoom),
      bounds.y + WORLD_OFFSET + bounds.height / 2 - rect.height / (2 * zoom),
    );
  }

  async function renameBoard(name: string) {
    setBoardName(name);
    await fetch(`/api/boards/${initial.board.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async function runExport(kind: "png" | "pdf" | "selection") {
    setNote("");
    const chosen = kind === "selection" ? items.filter((item) => selectedIds.includes(item.id)) : items;
    if (kind === "pdf") {
      const result = await exportBoardPdf([{ name: boardName, items: chosen }]);
      if ("error" in result) {
        setNote(result.error);
        return;
      }
      downloadBlob(result.blob, `${safeName(boardName)}.pdf`);
      return;
    }
    const result = await exportBoardPng(chosen);
    if ("error" in result) {
      setNote(result.error);
      return;
    }
    downloadBlob(result.blob, `${safeName(boardName)}.png`);
    if (result.capped) setNote(`Exported at ${result.scale.toFixed(2)}x, capped`);
  }

  function onItemPointerDown(event: React.PointerEvent<HTMLElement>, item: CanvasItem) {
    if (pan || tool === "frame") return;
    event.stopPropagation();
    if (event.shiftKey) {
      setSelectedIds((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]));
      return;
    }
    const element = event.currentTarget;
    const moveable = moveableRef.current;
    if (selectedIds.includes(item.id) || !moveable) return;
    setSelectedIds([item.id]);
    let holding = true;
    const release = () => {
      holding = false;
    };
    window.addEventListener("pointerup", release, { once: true });
    window.addEventListener("pointercancel", release, { once: true });
    void moveable.waitToChangeTarget().then(() => {
      if (!holding) return;
      moveable.dragStart(event.nativeEvent, element);
    });
  }

  const selected = items.filter((item) => selectedIds.includes(item.id));
  const single = selected.length === 1 ? selected[0] : null;
  const guidelines = useMemo(() => {
    if (typeof document === "undefined") return [];
    return items
      .filter((item) => !selectedIds.includes(item.id))
      .map((item) => document.querySelector(`[data-item-id="${item.id}"]`))
      .filter((element): element is Element => Boolean(element));
  }, [items, selectedIds, targets]);

  const roots = items.filter((item) => !item.parentId).sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-[#f7f6f3] text-stone-900">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-3">
        <a href="/" className="grid h-11 min-w-11 place-items-center rounded-md px-2 text-sm hover:bg-stone-100" title="Boards">
          Boards
        </a>
        <input
          aria-label="Board name"
          className="h-11 min-w-0 flex-1 rounded-md border border-transparent px-2 text-base font-medium outline-none hover:border-stone-200 focus:border-stone-400"
          value={boardName}
          onChange={(event) => setBoardName(event.target.value)}
          onBlur={(event) => void renameBoard(event.target.value.trim() || "Untitled")}
        />
        <span className="text-sm text-stone-500" data-testid="zoom-label">{zoomLabel}%</span>
        <button className={iconButton} title="Zoom out" onClick={() => viewerRef.current?.setZoom(Math.max(0.05, (viewerRef.current?.getZoom() || 1) / 1.2))}>−</button>
        <button className={iconButton} title="Zoom in" onClick={() => viewerRef.current?.setZoom(Math.min(8, (viewerRef.current?.getZoom() || 1) * 1.2))}>+</button>
        <button className={iconButton} title="Fit (⌘0)" onClick={fit}>Fit</button>
        <button className={iconButton} title="100% (⌘1)" onClick={() => viewerRef.current?.setZoom(1)}>100%</button>
        <button className={iconButton} title="Export PNG" data-testid="export-png" onClick={() => void runExport("png")}>PNG</button>
        <button className={iconButton} title="Export PDF" data-testid="export-pdf" onClick={() => void runExport("pdf")}>PDF</button>
        <button className={iconButton} title="Export selection" onClick={() => void runExport("selection")}>Selection</button>
        <span className="min-w-16 text-right text-xs text-stone-500" data-testid="save-status">{status}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-16 shrink-0 flex-col gap-1 border-r border-stone-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button className={tool === "select" ? toolOn : iconButton} title="Select" onClick={() => setTool("select")}>Move</button>
          <button className={tool === "frame" ? toolOn : iconButton} title="Draw a frame" data-testid="frame-tool" onClick={() => setTool("frame")}>Frame</button>
          <label className={`${iconButton} cursor-pointer`} title="Add image">
            Image
            <input
              data-testid="file-input"
              className="sr-only"
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                void uploadFiles(files);
              }}
            />
          </label>
          {coarse ? (
            <button className={panTool ? toolOn : iconButton} title="Pan with one finger" onClick={() => setPanTool((value) => !value)}>
              Pan
            </button>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={shellRef}
            data-testid="viewport"
            className="canvas-shell relative min-h-0 flex-1 touch-none overflow-hidden"
            style={{
              backgroundColor: "#f4f1ea",
              backgroundImage: "radial-gradient(circle, #bdb7ad 1.2px, transparent 1.2px)",
              backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
              backgroundPosition: `${(WORLD_OFFSET - view.scrollLeft) * view.zoom}px ${(WORLD_OFFSET - view.scrollTop) * view.zoom}px`,
            }}
            onPointerDown={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("[data-item-id]") || target.closest(".moveable-control-box")) return;
              if (tool !== "frame") {
                setSelectedIds([]);
                return;
              }
              const start = worldPoint(event.clientX, event.clientY);
              draftStart.current = start;
              setDraft({ ...start, width: 0, height: 0 });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!draftStart.current) return;
              const point = worldPoint(event.clientX, event.clientY);
              const x = Math.min(draftStart.current.x, point.x);
              const y = Math.min(draftStart.current.y, point.y);
              setDraft({ x, y, width: Math.abs(point.x - draftStart.current.x), height: Math.abs(point.y - draftStart.current.y) });
            }}
            onPointerUp={() => {
              if (draft && draft.width > 8 && draft.height > 8) addFrame(draft);
              draftStart.current = null;
              setDraft(null);
            }}
          >
            <InfiniteViewer
              ref={viewerRef as never}
              className="h-full w-full"
              usePinch
              useAutoZoom
              useWheelPinch
              useMouseDrag={pan}
              zoomRange={[0.05, 8]}
              displayHorizontalScroll={false}
              displayVerticalScroll={false}
              onScroll={(event) => saveCamera(event.scrollLeft, event.scrollTop, event.zoomX)}
            >
              <div className="relative" data-testid="canvas" style={{ width: WORLD_SIZE, height: WORLD_SIZE }}>
                {roots.map((item) => (
                  <ItemNode
                    key={item.id}
                    offset={WORLD_OFFSET}
                    item={item}
                    items={items}
                    selectedIds={selectedIds}
                    editingTextId={editingTextId}
                    editingNameId={editingNameId}
                    onPointerDown={onItemPointerDown}
                    onEditText={setEditingTextId}
                    onEditName={setEditingNameId}
                    onText={updateText}
                    onName={updateName}
                  />
                ))}
                {draft ? (
                  <div
                    className="absolute border border-dashed border-stone-500 bg-white/40"
                    style={{ left: draft.x + WORLD_OFFSET, top: draft.y + WORLD_OFFSET, width: draft.width, height: draft.height }}
                  />
                ) : null}
              </div>
            </InfiniteViewer>
            <Moveable
              ref={moveableRef}
              target={targets}
              draggable={!pan && tool === "select"}
              resizable={!pan && tool === "select"}
              rotatable={!pan && tool === "select" && selected.every((item) => item.type !== "frame")}
              snappable
              keepRatio={selected.length === 1 && selected[0]?.type === "image"}
              snapThreshold={5}
              snapRotationThreshold={5}
              snapRotationDegrees={[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]}
              elementGuidelines={guidelines}
              origin={false}
              renderDirections={single?.type === "image" ? ["nw", "ne", "sw", "se"] : ["n", "s", "e", "w", "nw", "ne", "sw", "se"]}
              onDrag={({ target, left, top }) => {
                target.style.left = `${left}px`;
                target.style.top = `${top}px`;
              }}
              onDragEnd={({ target }) => readElements([target as HTMLElement])}
              onDragGroup={({ events }) => {
                for (const event of events) {
                  event.target.style.left = `${event.left}px`;
                  event.target.style.top = `${event.top}px`;
                }
              }}
              onDragGroupEnd={({ targets: group }) => readElements(group as HTMLElement[])}
              onResize={({ target, width, height, drag }) => {
                target.style.width = `${width}px`;
                target.style.height = `${height}px`;
                target.style.left = `${drag.left}px`;
                target.style.top = `${drag.top}px`;
              }}
              onResizeEnd={({ target }) => readElements([target as HTMLElement])}
              onResizeGroup={({ events }) => {
                for (const event of events) {
                  event.target.style.width = `${event.width}px`;
                  event.target.style.height = `${event.height}px`;
                  event.target.style.left = `${event.drag.left}px`;
                  event.target.style.top = `${event.drag.top}px`;
                }
              }}
              onResizeGroupEnd={({ targets: group }) => readElements(group as HTMLElement[])}
              onRotate={({ target, rotation }) => {
                target.style.transform = `rotate(${rotation}deg)`;
              }}
              onRotateEnd={({ target }) => readElements([target as HTMLElement])}
              onRotateGroup={({ events }) => {
                for (const event of events) event.target.style.transform = `rotate(${event.rotation}deg)`;
              }}
              onRotateGroupEnd={({ targets: group }) => readElements(group as HTMLElement[])}
            />
            <Selecto
              container={shellRef.current}
              dragContainer={shellRef.current}
              selectableTargets={["[data-selectable='true']"]}
              selectByClick
              selectFromInside={false}
              toggleContinueSelect={["shift"]}
              hitRate={0}
              onDragStart={(event) => {
                const target = event.inputEvent.target as HTMLElement;
                if (pan || tool !== "select" || target.closest("[data-item-id]") || target.closest(".moveable-control-box")) {
                  event.stop();
                }
              }}
              onSelect={(event) => {
                const ids = event.selected
                  .map((element) => (element as HTMLElement).dataset.itemId)
                  .filter((id): id is string => Boolean(id));
                setSelectedIds(ids);
              }}
            />
          </div>
          {selected.length >= 2 ? (
            <div className="flex flex-wrap gap-1 border-t border-stone-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {(["left", "center", "right", "top", "middle", "bottom"] as AlignKind[]).map((kind) => (
                <button key={kind} className={iconButton} title={`Align ${kind}`} onClick={() => commit(alignItems(itemsRef.current, selectedIds, kind))}>
                  {kind}
                </button>
              ))}
              <button className={iconButton} title="Distribute horizontally" onClick={() => commit(distributeItems(itemsRef.current, selectedIds, "x"))}>
                Distribute H
              </button>
              <button className={iconButton} title="Distribute vertically" onClick={() => commit(distributeItems(itemsRef.current, selectedIds, "y"))}>
                Distribute V
              </button>
            </div>
          ) : null}
          {single ? (
            <div className="flex flex-wrap items-center gap-1 border-t border-stone-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button className={iconButton} title="Bring forward" onClick={() => updateSelected((item) => ({ ...item, zIndex: maxZ(itemsRef.current.filter((entry) => entry.parentId === item.parentId)) + 1 }))}>Front</button>
              <button className={iconButton} title="Send backward" onClick={() => updateSelected((item) => ({ ...item, zIndex: minZ(itemsRef.current.filter((entry) => entry.parentId === item.parentId)) - 1 }))}>Back</button>
              <button className={iconButton} title="Duplicate (⌘D)" onClick={duplicateSelected}>Duplicate</button>
              <button className={iconButton} title="Delete" onClick={deleteSelected}>Delete</button>
              {single.type === "image" && single.assetId ? (
                <a className={iconButton} title="Download original" href={`/api/assets/${single.assetId}?variant=original`} download>Original</a>
              ) : null}
              {single.type === "text" ? (
                <>
                  {FONT_SIZES.map((size) => (
                    <button key={size} className={single.fontSize === size ? toolOn : iconButton} onClick={() => updateSelected((item) => ({ ...item, fontSize: size }))}>
                      {size}
                    </button>
                  ))}
                  {TEXT_COLORS.map((color) => (
                    <button key={color} title={color} className="h-11 w-11 rounded-md border border-stone-200" style={{ background: color }} onClick={() => updateSelected((item) => ({ ...item, color }))} />
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {note ? <p className="border-t border-stone-200 bg-white px-3 py-2 text-sm text-stone-600" data-testid="export-note">{note}</p> : null}
        </div>
      </div>
    </div>
  );

  function updateText(id: string, text: string, height: number) {
    commit(itemsRef.current.map((item) => (item.id === id ? { ...item, text, height: Math.max(item.height, height) } : item)), true);
  }

  function updateName(id: string, name: string) {
    commit(itemsRef.current.map((item) => (item.id === id ? { ...item, name } : item)), true);
  }
}

function ItemNode({
  item,
  items,
  offset = 0,
  selectedIds,
  editingTextId,
  editingNameId,
  onPointerDown,
  onEditText,
  onEditName,
  onText,
  onName,
}: {
  item: CanvasItem;
  items: CanvasItem[];
  offset?: number;
  selectedIds: string[];
  editingTextId: string | null;
  editingNameId: string | null;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, item: CanvasItem) => void;
  onEditText: (id: string | null) => void;
  onEditName: (id: string | null) => void;
  onText: (id: string, text: string, height: number) => void;
  onName: (id: string, name: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const selected = selectedIds.includes(item.id);
  const children = items.filter((child) => child.parentId === item.id).sort((a, b) => a.zIndex - b.zIndex);
  return (
    <div
      data-item-id={item.id}
      data-type={item.type}
      data-parent={item.parentId ?? ""}
      data-x={item.x}
      data-y={item.y}
      data-rotation={item.rotation}
      data-selectable={item.parentId ? "false" : "true"}
      data-selected={selected ? "true" : "false"}
      data-testid={`item-${item.id}`}
      className="absolute"
      style={{
        left: item.x + offset,
        top: item.y + offset,
        width: item.width,
        height: item.height,
        transform: item.type === "frame" ? undefined : `rotate(${item.rotation}deg)`,
        transformOrigin: "center center",
        zIndex: item.zIndex,
        outline: selected && item.type !== "frame" ? "2px solid #2563eb" : undefined,
      }}
      onPointerDown={(event) => onPointerDown(event, item)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (item.type === "text") onEditText(item.id);
        if (item.type === "frame") onEditName(item.id);
      }}
    >
      {item.type === "frame" ? (
        <>
          {editingNameId === item.id ? (
            <input
              autoFocus
              className="absolute -top-7 left-0 h-6 w-full bg-transparent text-sm font-semibold text-stone-600 outline-none"
              defaultValue={item.name}
              onPointerDown={(event) => event.stopPropagation()}
              onBlur={(event) => {
                onName(item.id, event.target.value.trim() || item.name);
                onEditName(null);
              }}
            />
          ) : (
            <div className="absolute -top-6 left-0 truncate text-sm font-semibold text-stone-600">{item.name || "Frame"}</div>
          )}
          <div className={`h-full w-full overflow-hidden bg-white/70 ${selected ? "border-2 border-blue-600" : "border border-stone-300"}`}>
            {children.map((child) => (
              <ItemNode
                key={child.id}
                item={child}
                items={items}
                selectedIds={selectedIds}
                editingTextId={editingTextId}
                editingNameId={editingNameId}
                onPointerDown={onPointerDown}
                onEditText={onEditText}
                onEditName={onEditName}
                onText={onText}
                onName={onName}
              />
            ))}
          </div>
        </>
      ) : null}
      {item.type === "text" ? (
        editingTextId === item.id ? (
          <textarea
            autoFocus
            className="h-full w-full resize-none bg-transparent outline-none"
            style={{ fontSize: item.fontSize, color: item.color, fontFamily: "Inter, sans-serif", lineHeight: 1.3 }}
            defaultValue={item.text}
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={(event) => {
              onText(item.id, event.target.value, event.target.scrollHeight);
              onEditText(null);
            }}
          />
        ) : (
          <div className="h-full w-full whitespace-pre-wrap break-words" style={{ fontSize: item.fontSize, color: item.color, lineHeight: 1.3 }}>
            {item.text || "Text"}
          </div>
        )
      ) : null}
      {item.type === "image" && item.assetId ? (
        broken ? (
          <div className="grid h-full w-full place-items-center bg-stone-200 text-xs text-stone-600">Image unavailable</div>
        ) : (
          <img
            alt=""
            draggable={false}
            crossOrigin="anonymous"
            className="h-full w-full object-fill"
            src={`/api/assets/${item.assetId}?variant=preview`}
            onError={() => setBroken(true)}
          />
        )
      ) : null}
    </div>
  );
}

function fitted(width: number, height: number) {
  const long = Math.max(width, height, 1);
  const scale = Math.min(1, 480 / long);
  return { width: Math.max(32, Math.round(width * scale)), height: Math.max(32, Math.round(height * scale)) };
}

function maxZ(items: CanvasItem[]) {
  return items.reduce((max, item) => Math.max(max, item.zIndex), 0);
}

function minZ(items: CanvasItem[]) {
  return items.reduce((min, item) => Math.min(min, item.zIndex), 0);
}

function collectIds(items: CanvasItem[], ids: string[]) {
  const all = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (item.parentId && all.has(item.parentId) && !all.has(item.id)) {
        all.add(item.id);
        grew = true;
      }
    }
  }
  return [...all];
}

function cloneItems(items: CanvasItem[], ids: string[], offset: number) {
  const chosen = items.filter((item) => ids.includes(item.id));
  const idMap = new Map(chosen.map((item) => [item.id, crypto.randomUUID()]));
  return chosen.map((item) => ({
    ...item,
    id: idMap.get(item.id)!,
    parentId: item.parentId && idMap.has(item.parentId) ? idMap.get(item.parentId)! : item.parentId,
    x: item.x + offset,
    y: item.y + offset,
    zIndex: item.zIndex + 1,
  }));
}

const CANVAS_CLIPBOARD = "application/x-infinitecanvas";

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || element.tagName === "INPUT" || element.tagName === "TEXTAREA";
}

function canvasIdsFromClipboard(data: DataTransfer) {
  let raw = "";
  try {
    raw = data.getData(CANVAS_CLIPBOARD);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const ids = JSON.parse(raw) as unknown;
    if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) return ids;
  } catch {
    return null;
  }
  return null;
}

function imageFilesFromClipboard(data: DataTransfer) {
  const listed = [...data.files];
  if (listed.length > 0) return listed.filter(isImageFile);
  const files: File[] = [];
  for (const item of data.items) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|heic|heif)$/i.test(file.name);
}

function safeName(name: string) {
  return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "board";
}

const iconButton = "grid h-11 min-w-11 place-items-center rounded-md px-2 text-sm hover:bg-stone-100";
const toolOn = "grid h-11 min-w-11 place-items-center rounded-md bg-stone-900 px-2 text-sm text-white";
