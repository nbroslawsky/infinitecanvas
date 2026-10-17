"use client";

import { useState } from "react";

export function PeopleManager({ admins, initial }: { admins: string[]; initial: string[] }) {
  const [emails, setEmails] = useState(initial);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  async function addEmail() {
    setNote("");
    const response = await fetch("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: draft }),
    });
    const body = (await response.json()) as { error?: string; email?: string };
    if (!response.ok) {
      setNote(body.error || "Could not add that email");
      return;
    }
    if (body.email && !admins.includes(body.email) && !emails.includes(body.email)) {
      setEmails((current) => [...current, body.email!].sort());
    }
    setDraft("");
    setNote("Added. Tell them to open the site and sign in with Google.");
  }

  async function remove(email: string) {
    await fetch("/api/people", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setEmails((current) => current.filter((entry) => entry !== email));
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold">People</h1>
      <p className="mb-6 text-sm text-stone-600">
        Add the Google email of someone who should have their own boards. Nothing is emailed. Admins listed in the
        server settings can always sign in.
      </p>
      <form
        className="mb-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void addEmail();
        }}
      >
        <input
          aria-label="Email"
          type="email"
          required
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-stone-300 px-3"
          placeholder="name@example.com"
          data-testid="people-email"
        />
        <button className="h-11 rounded-md bg-stone-900 px-4 text-sm text-white" type="submit">
          Add
        </button>
      </form>
      {note ? <p className="mb-4 text-sm text-stone-600">{note}</p> : null}
      <h2 className="mb-2 text-sm font-semibold text-stone-500">Admins</h2>
      <ul className="mb-6 space-y-1 text-sm">
        {admins.map((email) => (
          <li key={email}>{email}</li>
        ))}
      </ul>
      <h2 className="mb-2 text-sm font-semibold text-stone-500">Allowed</h2>
      <ul className="space-y-2">
        {emails.map((email) => (
          <li key={email} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
            <span>{email}</span>
            <button className="h-11 px-2 text-sm hover:bg-stone-100" onClick={() => void remove(email)}>
              Remove
            </button>
          </li>
        ))}
        {emails.length === 0 ? <li className="text-sm text-stone-500">No one else yet.</li> : null}
      </ul>
    </main>
  );
}
