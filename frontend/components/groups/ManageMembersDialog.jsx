'use client';

import { useEffect, useState } from 'react';
import { Plus, X, Crown, Loader2, UserMinus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import api from '@/lib/api';
import AddMemberDialog from './AddMemberDialog';

/** Manage a group's members — list, remove, and jump to Add. */
export default function ManageMembersDialog({ group, allGroups = [], onClose, onChanged }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    if (!group) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/groups/${group.id}/members`);
      setMembers(data.data || []);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (group) load(); /* eslint-disable-next-line */ }, [group?.id]);

  const remove = async (m) => {
    const name = `${m.user?.first_name || ''} ${m.user?.last_name || ''}`.trim();
    if (!confirm(`Remove ${name} from ${group.name}?`)) return;
    try {
      await api.delete(`/groups/${group.id}/members/${m.user.id}`);
      toast.success('Removed');
      load();
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  if (!group) return null;

  return (
    <>
      <Dialog open={!!group && !addOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>Members of {group.name}</DialogTitle>
                <DialogDescription className="text-xs">
                  {loading ? 'Loading…' : `${members.length} member${members.length === 1 ? '' : 's'} in the round-robin rotation.`}
                </DialogDescription>
              </div>
              <Button size="sm" className="h-8" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add member
              </Button>
            </div>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {loading ? (
              <div className="py-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <div className="py-10 text-center">
                <UserMinus className="h-6 w-6 mx-auto text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground mt-2">No members yet.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add the first member
                </Button>
              </div>
            ) : (
              <div className="divide-y border rounded-md">
                {members.map((m) => (
                  <div key={m.membership_id || m.user?.id} className="flex items-center justify-between gap-2 p-2.5 hover:bg-muted/30">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-medium flex-shrink-0">
                        {m.user?.first_name?.[0]}{m.user?.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          {m.user?.first_name} {m.user?.last_name}
                          {m.is_senior && <Crown className="h-3 w-3 text-amber-500" aria-label="Senior" />}
                          <span className="text-[11px] text-muted-foreground capitalize font-normal">
                            · {m.user?.role?.replace(/_/g, ' ')}
                          </span>
                        </p>
                        <div className="flex gap-1 mt-0.5">
                          {(m.user?.languages || []).slice(0, 4).map((l) => (
                            <LanguageBadge key={l} language={l} size="xs" />
                          ))}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                      onClick={() => remove(m)}
                      title="Remove from group"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {addOpen && (
        <AddMemberDialog
          group={group}
          allGroups={allGroups}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); load(); onChanged?.(); }}
        />
      )}
    </>
  );
}
