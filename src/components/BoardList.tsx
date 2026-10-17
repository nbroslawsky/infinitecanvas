"use client";

import { useState } from "react";
import { downloadBlob, exportBoardPdf, exportBoardsZip } from "@/components/canvas/export-board";
import type { BoardPayload, BoardRecord, CanvasItem } from "@/lib/types";

export function BoardList({ initial }: { initial: BoardRecord[] }) {
  const [boards, setBoards] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/boards");
    const body = (await response.json()) as { boards: BoardRecord[] };
    setBoards(body.boards);
  }

  async function createBoard() {
    const response = await fetch("/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Untitled" }),
    });
    const body = (await response.json()) as { board: BoardRecord };
    window.location.href = `/boards/${body.board.id}`;
  }

  async function rename(board: BoardRecord, name: string) {
    await fetch(`/api/boards/${board.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await refresh();
  }

  async function duplicate(id: string) {
    await fetch(`/api/boards/${id}/duplicate`, { method: "POST" });
    await refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/boards/${id}`, { method: "DELETE" });
    setPendingDelete(null);
    await refresh();
  }

  async function loadPages(ids: string[]) {
    const pages: Array<{ name: string; items: CanvasItem[] }> = [];
    for (const id of ids) {
      const response = await fetch(`/api/boards/${id}`);
      if (!response.ok) continue;
      const payload = (await response.json()) as BoardPayload;
      pages.push({ name: payload.board.name, items: payload.items });
    }
    return pages;
  }

  async function exportPdf() {
    setNote("");
    const pages = await loadPages(selected);
    const result = await exportBoardPdf(pages);
    if ("error" in result) {
      setNote(result.error);
      return;
    }
    downloadBlob(result.blob, "boards.pdf");
  }

  async function exportZip() {
    setNote("");
    const pages = await loadPages(selected);
    const result = await exportBoardsZip(pages);
    if ("error" in result) {
      setNote(result.error);
      return;
    }
    downloadBlob(result.blob, "boards.zip");
    if (result.capped) setNote(`Exported at ${result.scale.toFixed(2)}x, capped`);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Boards</h1>
        <button className="h-11 rounded-md bg-stone-900 px-4 text-sm text-white" onClick={() => void createBoard()} data-testid="new-board">
          New board
        </button>
        <button className="h-11 rounded-md px-3 text-sm hover:bg-stone-200 disabled:opacity-40" disabled={selected.length === 0} onClick={() => void exportPdf()} data-testid="export-boards-pdf">
          Export PDF
        </button>
        <button className="h-11 rounded-md px-3 text-sm hover:bg-stone-200 disabled:opacity-40" disabled={selected.length === 0} onClick={() => void exportZip()} data-testid="export-boards-zip">
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
              onBlur={(event) => void rename(board, event.target.value.trim() || "Untitled")}
            />
            <a href={`/boards/${board.id}`} className="h-11 rounded-md px-3 text-sm leading-[2.75rem] hover:bg-stone-100" data-testid={`open-${board.id}`}>
              Open
            </a>
            <button className="h-11 rounded-md px-3 text-sm hover:bg-stone-100" onClick={() => void duplicate(board.id)}>
              Duplicate
            </button>
            {pendingDelete === board.id ? (
              <button className="h-11 rounded-md bg-red-700 px-3 text-sm text-white" onClick={() => void remove(board.id)} data-testid="confirm-delete">
                Delete board
              </button>
            ) : (
              <button className="h-11 rounded-md px-3 text-sm hover:bg-stone-100" onClick={() => setPendingDelete(board.id)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
