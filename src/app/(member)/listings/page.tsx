"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { ErrorText, useRun } from "../../ui";

type Fields = Pick<Doc<"tools">, "name" | "category" | "condition" | "description">;
const blank: Fields = { name: "", category: "", condition: "good", description: "" };

function ToolForm({ initial, onSave, onCancel }: {
  initial: Fields;
  onSave: (f: Fields) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const { name, category, condition, description } = initial;
  const [f, setF] = useState<Fields>({ name, category, condition, description });
  const { run, error, busy } = useRun();
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await run(() => onSave(f))) && !onCancel) setF(blank);
      }}
    >
      <label>Name <input required maxLength={80} value={f.name} onChange={set("name")} placeholder="Cordless drill" /></label>
      <label>Category <input required maxLength={40} value={f.category} onChange={set("category")} placeholder="Power tools" /></label>
      <label>Condition
        <select value={f.condition} onChange={set("condition")}>
          <option value="new">New</option><option value="good">Good</option>
          <option value="fair">Fair</option><option value="worn">Worn</option>
        </select>
      </label>
      <label>Description <textarea maxLength={1000} rows={3} value={f.description} onChange={set("description")} /></label>
      <div className="row">
        <button className="primary" disabled={busy}>{onCancel ? "Save" : "List tool"}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
      <ErrorText error={error} />
    </form>
  );
}

export default function ListingsPage() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<string | null>(null);
  const { run, error } = useRun();

  return (
    <div className="split">
      <section>
        <h1>My listings</h1>
        <ErrorText error={error} />
        {tools === undefined ? <p className="muted">Loading…</p> : tools.length === 0 ? (
          <p className="muted">You haven&apos;t listed anything yet.</p>
        ) : (
          <ul className="list">
            {tools.map((t) => (
              <li key={t._id} className="card">
                {editing === t._id ? (
                  <ToolForm
                    initial={t}
                    onCancel={() => setEditing(null)}
                    onSave={async (f) => { await update({ toolId: t._id, ...f }); setEditing(null); }}
                  />
                ) : (
                  <>
                    <div className="row">
                      <strong>{t.name}</strong><span className="chip">{t.category}</span>
                      <span className="muted">{t.condition}</span>
                    </div>
                    {t.description && <p>{t.description}</p>}
                    <div className="row">
                      <button onClick={() => setEditing(t._id)}>Edit</button>
                      <button
                        className="danger"
                        onClick={() => confirm(`Remove "${t.name}"?`) && run(() => remove({ toolId: t._id }))}
                      >Remove</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="card">
        <h2>Lend something</h2>
        <ToolForm initial={blank} onSave={(f) => create(f)} />
      </aside>
    </div>
  );
}
