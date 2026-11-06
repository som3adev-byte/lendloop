"use client";
import { SignInButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";

const steps = [
  ["List", "Add the tools sitting in your garage."],
  ["Request", "Pick dates. The owner approves or declines."],
  ["Return", "Hand it back. Late? You get a friendly reminder."],
] as const;

export default function Home() {
  const tools = useQuery(api.tools.publicList);
  return (
    <>
      <section className="hero">
        <h1>Borrow the drill.<br />Skip the hardware store.</h1>
        <p className="tagline">Lend and borrow tools with your neighbours, with dates, approvals and reminders handled for you.</p>
        <AuthLoading><span className="button primary placeholder">Sign in to lend or borrow</span></AuthLoading>
        <Unauthenticated>
          <SignInButton mode="modal">
            <button className="primary">Sign in to lend or borrow</button>
          </SignInButton>
        </Unauthenticated>
        <Authenticated>
          <Link className="button primary" href="/tools">Browse and borrow</Link>
        </Authenticated>
      </section>

      <ol className="steps">
        {steps.map(([title, text], i) => (
          <li key={title}>
            <span className="step-n">{i + 1}</span>
            <strong>{title}</strong>
            <p className="muted">{text}</p>
          </li>
        ))}
      </ol>

      <h2>
        Available now{tools && tools.length > 0 && <span className="muted"> · {tools.length}</span>}
      </h2>
      {tools === undefined ? (
        <ul className="grid" aria-busy="true">
          {[0, 1, 2].map((i) => <li key={i} className="tool skeleton" />)}
        </ul>
      ) : tools.length === 0 ? (
        <p className="muted">Nothing listed yet. Be the first to lend something.</p>
      ) : (
        <ul className="grid">
          {tools.map((t) => (
            <li key={t._id} className="tool">
              <span className="tool-mark" aria-hidden>{t.name.charAt(0)}</span>
              <strong>{t.name}</strong>
              <span className="chip">{t.category}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
