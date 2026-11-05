"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ErrorText, useRun } from "../../ui";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function RequestForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: () => void }) {
  const request = useMutation(api.loans.request);
  const { run, error, busy } = useRun();
  const today = iso(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  return (
    <form
      className="inline"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => request({ toolId, startDate: start, endDate: end }))) onDone();
      }}
    >
      <label>From <input type="date" required min={today} value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label>To <input type="date" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      <button className="primary" disabled={busy}>Send request</button>
      <button type="button" onClick={onDone}>Cancel</button>
      <ErrorText error={error} />
    </form>
  );
}

export default function ToolsPage() {
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Id<"tools"> | null>(null);
  const categories = useQuery(api.tools.categories);
  const tools = useQuery(api.tools.list, { category: category || undefined });

  return (
    <>
      <div className="bar">
        <h1>All tools</h1>
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories?.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {tools === undefined ? (
        <p className="muted">Loading…</p>
      ) : tools.length === 0 ? (
        <p className="muted">No tools here yet.</p>
      ) : (
        <ul className="list">
          {tools.map((t) => (
            <li key={t._id} className="card">
              <div className="row">
                <strong>{t.name}</strong>
                <span className="chip">{t.category}</span>
                <span className="muted">{t.condition}</span>
                <span className={t.availableFrom ? "status declined" : "status approved"}>
                  {t.availableFrom ? `out until ${t.availableFrom}` : "available"}
                </span>
              </div>
              {t.description && <p>{t.description}</p>}
              <p className="muted">
                Lent by {t.mine ? "you" : t.ownerName}
                {t.ownerTrusted && <span className="trusted"> ✓ Trusted lender</span>}
              </p>
              {!t.mine &&
                (open === t._id ? (
                  <RequestForm toolId={t._id} onDone={() => { setOpen(null); setSent(t._id); }} />
                ) : (
                  <button onClick={() => setOpen(t._id)}>Request to borrow</button>
                ))}
              {sent === t._id && open !== t._id && <p className="ok">Request sent. Track it in My requests.</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
