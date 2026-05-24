'use client';

import { useEffect, useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { LANGUAGES, labelFor } from '@/lib/languages';
import api from '@/lib/api';

export default function ChangeLanguageDialog({ open, onOpenChange, user, onChanged }) {
  const [languages, setLanguages] = useState([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-sync whenever the dialog opens on a (possibly different) user — without
  // this, switching the "Change language" menu from one row to another keeps
  // the previous row's pre-selected state.
  useEffect(() => {
    if (!open) return;
    setLanguages(Array.isArray(user?.languages) ? [...user.languages] : []);
    setReason('');
  }, [open, user?.id, user?.languages]);

  if (!user) return null;

  const toggle = (lang) => {
    setLanguages((prev) => (prev.includes(lang)
      ? prev.filter((l) => l !== lang)
      : [...prev, lang]));
  };

  const originalSet = new Set(user.languages || []);
  const newSet = new Set(languages);
  const added = languages.filter((l) => !originalSet.has(l));
  const removed = (user.languages || []).filter((l) => !newSet.has(l));
  const hasChanges = added.length > 0 || removed.length > 0;

  const handleSave = async () => {
    if (languages.length === 0) {
      toast.error('Select at least one language');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/language`, {
        languages,
        reason: reason.trim() || undefined,
      });
      toast.success(
        `${user.first_name}'s languages updated. Existing leads stay assigned; future round-robin uses the new list.`,
      );
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update languages');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Change languages for {user.first_name} {user.last_name}
          </DialogTitle>
          <DialogDescription>
            Affects future round-robin assignments. Existing assigned leads stay where they are.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Languages spoken</Label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => {
                const sel = languages.includes(l.value);
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => toggle(l.value)}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md border transition-colors',
                      sel
                        ? 'bg-purple-500/15 border-purple-500/50 text-purple-700 dark:text-purple-300 font-medium'
                        : 'bg-transparent border-border hover:bg-muted text-muted-foreground',
                    )}
                  >
                    {sel && <Check className="h-3 w-3" />}
                    {l.label}
                  </button>
                );
              })}
            </div>
            {languages.length === 0 && (
              <p className="text-[10px] text-red-500 dark:text-red-400">
                Select at least one language.
              </p>
            )}
          </div>

          {hasChanges && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                {added.length > 0 && (
                  <div>+ Adding: {added.map(labelFor).join(', ')}</div>
                )}
                {removed.length > 0 && (
                  <div>− Removing: {removed.map(labelFor).join(', ')}</div>
                )}
                <div className="text-muted-foreground mt-1">
                  Existing leads stay with {user.first_name}.{' '}
                  {languages.length > 0 && (
                    <>
                      New leads in {languages.map(labelFor).join('/')} will route via round robin.
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="text-sm"
              placeholder="e.g. moved from Tamil team to English team"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || languages.length === 0 || !hasChanges}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
