"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { downloadBlob, exportBoardPdf, exportBoardsZip } from "@/components/canvas/export-board";
import { BusyOverlay, ConfirmDialog, useBusyJob } from "@/components/BusyOverlay";
import type { BoardPayload, BoardRecord, CanvasItem } from "@/lib/types";

export function BoardList({ initial }: { initial: BoardRecord[] }) {
  const router = useRouter();
  const job = useBusyJob();
  const [boards, setBoards] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<BoardRecord | null>(null);
  const figInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = figInput.current;
    const file = input?.files?.[0];
    if (!input || !file) return;
    // A file can be chosen before hydration attaches onChange. Wait one tick so
    // Strict Mode's setup/cleanup does not start the import twice.
    const timer = window.setTimeout(() => {
      input.value = "";
      void importFig(file);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function refresh() {
    const response = await fetch("/api/boards");
    if (!response.ok) throw new Error("Could not refresh boards");
    const body = (await response.json()) as { boards: BoardRecord[] };
    setBoards(body.boards);
  }

  async function importFig(file: File) {
    if (!job.begin({ title: "Importing Figma file", detail: `Reading ${file.name}. Stay here until the boards are ready.` })) return;
    setNote("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/boards/import-fig", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; boards?: Array<{ id: string }> };
      if (!response.ok) {
        setNote(payload.error || "Could not import that Figma file");
        job.end();
        return;
      }
      const imported = payload.boards ?? [];
      if (imported.length === 1 && imported[0]) {
        router.push(`/boards/${imported[0].id}`);
        return;
      }
      setNote(imported.length > 0 ? `Imported ${imported.length} boards` : "That Figma file has no pages to import");
      await refresh();
      job.end();
    } catch {
      setNote("Could not import that Figma file");
      job.end();
    }
  }

  async function createBoard() {
    if (!job.begin({ title: "Creating board", detail: "Saving the board, then opening it." })) return;
    setNote("");
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Untitled" }),
      });
      const body = (await response.json().catch(() => null)) as { board?: BoardRecord } | null;
      if (!response.ok || !body?.board?.id) {
        setNote("Could not create a board");
        job.end();
        return;
      }
      router.push(`/boards/${body.board.id}`);
    } catch {
      setNote("Could not create a board");
      job.end();
    }
  }

  async function rename(board: BoardRecord, name: string) {
    const next = name.trim() || "Untitled";
    if (next === board.name) return;
    setBoards((current) => current.map((entry) => (entry.id === board.id ? { ...entry, name: next } : entry)));
    try {
      const response = await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
        keepalive: true,
      });
      if (!response.ok) setNote("Could not rename that board");
    } catch {
      setNote("Could not rename that board");
    }
  }

  async function duplicate(board: BoardRecord) {
    if (!job.begin({ title: "Duplicating board", detail: `Making a copy of ${board.name}. Stay here until it appears.` })) return;
    setNote("");
    try {
      const response = await fetch(`/api/boards/${board.id}/duplicate`, { method: "POST" });
      if (!response.ok) {
        setNote("Could not duplicate that board");
        return;
      }
      await refresh();
    } catch {
      setNote("Could not duplicate that board");
    } finally {
      job.end();
    }
  }

  async function remove(board: BoardRecord) {
    setConfirmDelete(null);
    if (!job.begin({ title: "Deleting board", detail: `Removing ${board.name}.` })) return;
    setNote("");
    try {
      const response = await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
      if (!response.ok) {
        setNote("Could not delete that board");
        return;
      }
      setSelected((current) => current.filter((id) => id !== board.id));
      await refresh();
    } catch {
      setNote("Could not delete that board");
    } finally {
      job.end();
    }
  }

  async function loadPages(ids: string[]) {
    const payloads = await Promise.all(
      ids.map(async (id) => {
        const response = await fetch(`/api/boards/${id}`);
        if (!response.ok) return null;
        return (await response.json()) as BoardPayload;
      }),
    );
    const pages: Array<{ name: string; items: CanvasItem[] }> = [];
    for (const payload of payloads) {
      if (!payload) continue;
      pages.push({ name: payload.board.name, items: payload.items });
    }
    return pages;
  }

  async function exportPdf() {
    if (selected.length === 0) return;
    if (
      !job.begin({
        title: "Exporting PDF",
        detail: exportDetail(selected.length, "PDF"),
      })
    ) {
      return;
    }
    setNote("");
    try {
      const pages = await loadPages(selected);
      const result = await exportBoardPdf(pages);
      if ("error" in result) {
        setNote(result.error);
        return;
      }
      downloadBlob(result.blob, "boards.pdf");
    } catch {
      setNote("Could not export that PDF");
    } finally {
      job.end();
    }
  }

  async function exportZip() {
    if (selected.length === 0) return;
    if (
      !job.begin({
        title: "Exporting images",
        detail: exportDetail(selected.length, "images"),
      })
    ) {
      return;
    }
    setNote("");
    try {
      const pages = await loadPages(selected);
      const result = await exportBoardsZip(pages);
      if ("error" in result) {
        setNote(result.error);
        return;
      }
      downloadBlob(result.blob, "boards.zip");
      if (result.capped) setNote(`Exported at ${result.scale.toFixed(2)}x, capped`);
    } catch {
      setNote("Could not export those images");
    } finally {
      job.end();
    }
  }

  const held = Boolean(job.busy || confirmDelete);

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8" inert={held ? true : undefined} aria-busy={held}>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-2xl font-semibold">Boards</h1>
          <button className="h-11 rounded-md bg-stone-900 px-4 text-sm text-white disabled:opacity-40" onClick={() => void createBoard()} disabled={held} data-testid="new-board">
            New board
          </button>
          <label className={`h-11 rounded-md px-3 text-sm leading-[2.75rem] hover:bg-stone-200 ${held ? "pointer-events-none opacity-40" : "cursor-pointer"}`}>
            Import Figma
            <input
              ref={figInput}
              data-testid="fig-input"
              className="sr-only"
              type="file"
              accept=".fig,.deck,.jam"
              disabled={held}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importFig(file);
              }}
            />
          </label>
          <button className="h-11 rounded-md px-3 text-sm hover:bg-stone-200 disabled:opacity-40" disabled={selected.length === 0 || held} onClick={() => void exportPdf()} data-testid="export-boards-pdf">
            Export PDF
          </button>
          <button className="h-11 rounded-md px-3 text-sm hover:bg-stone-200 disabled:opacity-40" disabled={selected.length === 0 || held} onClick={() => void exportZip()} data-testid="export-boards-zip">
            Export images
          </button>
        </div>
        {note ? <p className="mb-4 text-sm text-stone-600">{note}</p> : null}
        {boards.length === 0 ? <p className="text-stone-600">No boards yet. Create one and drop images on it.</p> : null}
        <ul className="space-y-2">
          {boards.map((board) => (
            <li key={board.id} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
              <input
                aria-label={`Select ${board.name}`}
                type="checkbox"
                className="h-5 w-5"
                checked={selected.includes(board.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked ? [...current, board.id] : current.filter((id) => id !== board.id),
                  )
                }
              />
              <input
                aria-label="Board name"
                className="h-11 min-w-0 flex-1 rounded-md border border-transparent px-2 outline-none hover:border-stone-200 focus:border-stone-400"
                defaultValue={board.name}
                onBlur={(event) => void rename(board, event.target.value)}
              />
              <Link href={`/boards/${board.id}`} className="h-11 rounded-md px-3 text-sm leading-[2.75rem] hover:bg-stone-100" data-testid={`open-${board.id}`}>
                Open
              </Link>
              <button className="h-11 rounded-md px-3 text-sm hover:bg-stone-100" onClick={() => void duplicate(board)}>
                Duplicate
              </button>
              <button className="h-11 rounded-md px-3 text-sm hover:bg-stone-100" onClick={() => setConfirmDelete(board)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </main>
      {job.busy ? <BusyOverlay title={job.busy.title} detail={job.busy.detail} /> : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${confirmDelete.name}”?`}
          detail="The board and everything on it will be removed."
          confirmLabel="Delete board"
          confirmTestId="confirm-delete"
          onConfirm={() => void remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}
    </>
  );
}

function exportDetail(count: number, kind: "PDF" | "images") {
  const boards = count === 1 ? "the board" : `${count} boards`;
  return `Loading ${boards} and drawing the ${kind}. Stay here until the file downloads.`;
}
