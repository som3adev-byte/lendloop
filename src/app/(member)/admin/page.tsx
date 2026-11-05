"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { ErrorText, useRun } from "../../ui";
import { LoanList } from "../loan-list";

export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <p className="muted">Loading…</p>;
  if (me?.role !== "admin") return <p className="error">Admins only.</p>;
  return <Admin />;
}

function Admin() {
  const users = useQuery(api.users.list);
  const tools = useQuery(api.tools.list, {});
  const loans = useQuery(api.loans.all);
  const setTrusted = useMutation(api.users.setTrusted);
  const removeTool = useMutation(api.tools.adminRemove);
  const { run, error } = useRun();

  return (
    <>
      <h1>Admin</h1>
      <ErrorText error={error} />
      <h2>Members</h2>
      <ul className="list">
        {users?.map((u) => (
          <li key={u._id} className="row">
            <strong>{u.name}</strong>
            <span className="chip">{u.role}</span>
            <label className="row">
              <input type="checkbox" checked={u.trusted}
                onChange={(e) => run(() => setTrusted({ userId: u._id, trusted: e.target.checked }))} />
              Trusted lender
            </label>
          </li>
        ))}
      </ul>
      <h2>All listings</h2>
      <ul className="list">
        {tools?.map((t) => (
          <li key={t._id} className="row">
            <strong>{t.name}</strong><span className="muted">by {t.ownerName}</span>
            <button className="danger"
              onClick={() => confirm(`Remove "${t.name}" for everyone?`) && run(() => removeTool({ toolId: t._id }))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <h2>All loans</h2>
      <LoanList loans={loans} as="admin" empty="No loans yet." />
    </>
  );
}
