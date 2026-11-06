"use client";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "../../convex/_generated/api";

const links = [
  ["/tools", "All tools"],
  ["/listings", "My listings"],
  ["/requests", "My requests"],
  ["/incoming", "Incoming"],
] as const;

function Nav() {
  const path = usePathname();
  const me = useQuery(api.users.me);
  const all = me?.role === "admin" ? [...links, ["/admin", "Admin"] as const] : links;
  return (
    <nav>
      {all.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function Header() {
  return (
    <header className="top">
      <Link href="/" className="brand">LendLoop</Link>
      <Authenticated>
        <Nav />
        <UserButton />
      </Authenticated>
      <AuthLoading><span className="button primary placeholder">Sign in</span></AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal">
          <button className="primary">Sign in</button>
        </SignInButton>
      </Unauthenticated>
    </header>
  );
}
