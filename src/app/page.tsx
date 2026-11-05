"use client";
import { SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";

export default function Home() {
  const tools = useQuery(api.tools.publicList);
  return (
    <>
      <section className="hero">
        <h1>LendLoop</h1>
        <p className="tagline">Borrow the drill. Skip the hardware store.</p>
        <Unauthenticated>
          <SignInButton mode="modal">
            <button className="primary">Sign in to lend or borrow</button>
          </SignInButton>
        </Unauthenticated>
        <Authenticated>
          <Link className="button primary" href="/tools">Browse and borrow</Link>
        </Authenticated>
      </section>

      <h2>Available now</h2>
      {tools === undefined ? (
        <p className="muted">Loading…</p>
      ) : tools.length === 0 ? (
        <p className="muted">Nothing listed yet. Be the first to lend something.</p>
      ) : (
        <ul className="list">
          {tools.map((t) => (
            <li key={t._id} className="row">
              <strong>{t.name}</strong>
              <span className="chip">{t.category}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
