"use client";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanList } from "../loan-list";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  return (
    <>
      <h1>Incoming requests</h1>
      <LoanList loans={loans} as="owner" empty="No one has asked for your tools yet." />
    </>
  );
}
