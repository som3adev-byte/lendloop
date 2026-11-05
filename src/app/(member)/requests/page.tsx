"use client";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanList } from "../loan-list";

export default function RequestsPage() {
  const loans = useQuery(api.loans.mine);
  return (
    <>
      <h1>My requests</h1>
      <LoanList loans={loans} as="borrower" empty="You haven't asked to borrow anything yet." />
    </>
  );
}
