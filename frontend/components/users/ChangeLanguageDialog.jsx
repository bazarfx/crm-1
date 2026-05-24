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
  const [primary, setPrimary] = useState('');
  const [additional, setAdditional] = useState([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-sync the form whenever the dialog is opened on a (possibly different)
  // user — without this, switching the "Change language" menu from one row
  // to another keeps the previous row's pre-selected state.
  useEffect(() => {
    if (!open) return;
    setPrimary(user?.primary_language || '');
    setAdditional(user?.additional_languages || []);
    setReason('');
  }, [open, user?.id, user?.primary_language, user?.additional_languages]);

  if (!user) return null;

  const isChange = primary !== (user.primary_language || '');

  const togglePrimary = (lang) => {
    setPrimary(lang);
    setAdditional((a) => a.filter((x) => x !== lang));
  };

  const toggleAdditional = (lang) => {
    if (lang === primary) return;
    setAdditional((a) => (a.includes(lang) ? a.filter((x) => x !== lang) : [...a, lang]));
  };

  const handleSave = async () => {
    if (!primary) {
      toast.error('Primary language is required');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/language`, {
        primary_language: primary,
        additional_languages: additional,
        reason: reason.trim() || undefined,
      });
      toast.success(`${user.first_name}'s language updated. New leads will route based on this.`);
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update language');
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
            Affects future round-robin assignments. Currently assigned leads stay with them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Primary language</Label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => {
                const active = primary === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => togglePrimary(l.value)}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md border transition-colors',
                      active
                        ? 'bg-purple-500/15 border-purple-500/50 text-purple-700 dark:text-purple-300 font-medium'
                        : 'bg-transparent border-border hover:bg-muted text-muted-foreground'
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Also speaks (overflow)</Label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.filter((l) => l.value !== primary).map((l) => {
                const sel = additional.includes(l.value);
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => toggleAdditional(l.value)}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md border transition-colors',
                      sel
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                        : 'bg-transparent border-border hover:bg-muted text-muted-foreground'
                    )}
                  >
                    {sel && <Check className="h-3 w-3" />}
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isChange && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                Changing primary language from{' '}
                <strong>{labelFor(user.primary_language) || '—'}</strong> to{' '}
                <strong>{labelFor(primary)}</strong>. {user.first_name} will start
                receiving {labelFor(primary)} leads in the round robin. Currently
                assigned leads stay.
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
              placeholder="e.g. transferred to English team to cover staffing gap"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !primary}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
