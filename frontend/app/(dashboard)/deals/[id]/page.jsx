import { redirect } from 'next/navigation';

// Deals are leads viewed through the FTD lens — there is no separate deals
// table. The lead detail page already covers every column an admin needs,
// including the closer attribution snapshot, ARK metadata, and the deal-
// specific actions in /deals (undo close, etc.). Redirect rather than
// duplicating that page.
export default function DealDetail({ params }) {
  redirect(`/leads/${params.id}`);
}
