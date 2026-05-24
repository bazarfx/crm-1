'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api, { unwrap } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

dayjs.extend(relativeTime);

const COLLAPSED_LIMIT = 3;

export default function ReassignedAwayBanner() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/leads/reassignments/from-me', { params: { limit: 20 } });
        const list = unwrap(res) || [];
        if (alive) setItems(Array.isArray(list) ? list : []);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, COLLAPSED_LIMIT);
  const hidden = items.length - visible.length;

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.04]">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Leads reassigned away from you</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {items.length} lead{items.length === 1 ? '' : 's'} you were working on{' '}
                {items.length === 1 ? 'is' : 'are'} now with someone else.
              </p>
            </div>
          </div>
        </div>

        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {visible.map((ev) => {
              const lead = ev.lead || {};
              const newAssignee = lead.assignedTo;
              const actor = ev.user;
              const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.phone || 'Lead';
              const newName = newAssignee
                ? `${newAssignee.first_name || ''} ${newAssignee.last_name || ''}`.trim()
                : null;
              const actorName = actor
                ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim()
                : null;
              return (
                <motion.li
                  key={ev.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <button
                    type="button"
                    onClick={() => lead.id && router.push(`/leads/${lead.id}`)}
                    className="w-full text-left px-3 py-2 rounded-md bg-background/60 hover:bg-background border border-transparent hover:border-border transition-colors group"
                    disabled={!lead.id}
                  >
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-medium text-foreground">{leadName}</span>
                      {lead.phone && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {lead.phone}
                        </span>
                      )}
                      <span className="text-muted-foreground">→</span>
                      <span className="text-foreground">
                        {newName || <span className="italic text-muted-foreground">unassigned</span>}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {dayjs(ev.created_at).fromNow()}
                      </span>
                    </div>
                    {actorName && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Moved by {actorName}
                        {ev.description ? ` · ${ev.description}` : ''}
                      </p>
                    )}
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        {items.length > COLLAPSED_LIMIT && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>Show less <ChevronUp className="h-3 w-3 ml-1" /></>
            ) : (
              <>Show {hidden} more <ChevronDown className="h-3 w-3 ml-1" /></>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
