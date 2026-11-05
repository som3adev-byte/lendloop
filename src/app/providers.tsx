"use client";
import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

/** Renders children once the signed-in user has a row in Convex. */
export function MemberGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    store()
      .then(() => setReady(true))
      .catch((e: Error) => setError(e.message));
  }, [isAuthenticated, store]);

  if (error) return <p className="error">Couldn&apos;t load your account: {error}</p>;
  if (isLoading || (isAuthenticated && !ready)) return <p className="muted">Loading…</p>;
  if (!isAuthenticated) return <p className="muted">Please sign in.</p>;
  return <>{children}</>;
}
