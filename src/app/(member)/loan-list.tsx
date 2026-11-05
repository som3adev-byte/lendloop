"use client";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { Activity, ErrorText, Status, useRun } from "../ui";

type Loan = FunctionReturnType<typeof api.loans.mine>[number];

/** One list for borrower, owner and admin views; `as` decides which buttons appear. */
export function LoanList({ loans, as, empty }: {
  loans: Loan[] | undefined;
  as: "borrower" | "owner" | "admin";
  empty: string;
}) {
  const setStatus = useMutation(api.loans.setStatus);
  const { run, error, busy } = useRun();
  if (loans === undefined) return <p className="muted">Loading…</p>;
  if (loans.length === 0) return <p className="muted">{empty}</p>;
  const act = (loanId: Loan["_id"], to: "approved" | "declined" | "returned" | "cancelled") =>
    run(() => setStatus({ loanId, to }));

  return (
    <>
      <ErrorText error={error} />
      <ul className="list">
        {loans.map((l) => (
          <li key={l._id} className="card">
            <div className="row">
              <strong>{l.toolName}</strong>
              <Status status={l.status} overdue={l.overdue} />
              <span className="muted">{l.startDate} → {l.endDate}</span>
            </div>
            <p className="muted">
              {as !== "owner" && <>From {l.ownerName}. </>}
              {as !== "borrower" && <>Borrower: {l.borrowerName}.</>}
            </p>
            <div className="row">
              {as === "owner" && l.status === "pending" && (
                <>
                  <button className="primary" disabled={busy} onClick={() => act(l._id, "approved")}>Approve</button>
                  <button disabled={busy} onClick={() => act(l._id, "declined")}>Decline</button>
                </>
              )}
              {as === "owner" && l.status === "approved" && (
                <button disabled={busy} onClick={() => act(l._id, "returned")}>Mark returned</button>
              )}
              {as === "borrower" && l.status === "pending" && (
                <button disabled={busy} onClick={() => act(l._id, "cancelled")}>Cancel request</button>
              )}
            </div>
            <Activity items={l.activity} />
          </li>
        ))}
      </ul>
    </>
  );
}
