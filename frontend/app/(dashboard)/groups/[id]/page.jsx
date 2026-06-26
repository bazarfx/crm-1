'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * `/groups/[id]` is no longer a separate editor — the canonical group editor
 * is `/groups/[id]/edit` (GroupForm) and member management lives in the
 * Manage-members dialog on the Groups list. Redirect any direct hit there so
 * there's a single source of truth.
 */
export default function GroupRedirectPage() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/groups/${id}/edit`);
  }, [id, router]);

  return (
    <div className="py-24 flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
