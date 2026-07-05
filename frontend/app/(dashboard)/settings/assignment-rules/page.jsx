'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Workflow, Plus, ArrowUp, ArrowDown, Pencil, Trash2, Loader2,
  Users, ListFilter, CircleUser, Repeat,
} from 'lucide-react';
import toast from 'react-hot-toast';
import RoleGuard from '@/components/layout/RoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  listRules, updateRule, deleteRule, reorderRules,
} from '@/lib/assignmentRules';
import { operatorsFor } from '@/lib/filterOperators';
import { cn } from '@/lib/utils';

export default function AssignmentRulesPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager']}>
      <AssignmentRulesContent />
    </RoleGuard>
  );
}

// ── Human-readable one-line summary of a rule's criteria ─────────────────────
function operatorLabel(type, op) {
  return operatorsFor(type).find((o) => o.value === op)?.label || op;
}

function criteriaSummary(rule) {
  if (rule.match_type === 'all') return { text: 'All records', all: true };
  const rules = rule.criteria?.rules;
  if (!Array.isArray(rules) || rules.length === 0) return { text: 'No conditions', all: false };
  const join = (rule.criteria?.match || 'and').toUpperCase();
  const first = rules[0];
  const firstText = `${first.field} ${operatorLabel(first.type, first.operator)}`.trim();
  if (rules.length === 1) return { text: firstText, all: false };
  return { text: `${firstText} +${rules.length - 1} more (${join})`, all: false };
}

function AssignmentRulesContent() {
  const router = useRouter();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listRules();
      setRules(items);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load assignment rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ordered = useMemo(
    () => [...rules].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [rules],
  );

  // Swap two adjacent rows, then persist the new positions.
  const move = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    // Re-number positions from 0 so the backend stores a clean sequence.
    const renumbered = next.map((r, i) => ({ ...r, position: i }));
    setRules(renumbered); // optimistic
    try {
      const fresh = await reorderRules(renumbered.map((r) => ({ id: r.id, position: r.position })));
      if (Array.isArray(fresh) && fresh.length) setRules(fresh);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Reorder failed');
      load();
    }
  };

  const toggleActive = async (rule) => {
    setBusyId(rule.id);
    // optimistic
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)));
    try {
      await updateRule(rule.id, { is_active: !rule.is_active });
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update');
      load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (rule) => {
    if (!confirm(`Delete assignment rule “${rule.name}”?`)) return;
    setBusyId(rule.id);
    try {
      await deleteRule(rule.id);
      toast.success('Assignment rule deleted');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            Assignment rules
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Rules run top to bottom — the first one that matches an incoming lead wins.
            Use the arrows to change priority, and criteria to target specific leads.
          </p>
        </div>
        <Button size="sm" onClick={() => router.push('/settings/assignment-rules/new')}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Create assignment rule
        </Button>
      </div>

      <div className="rounded-xl border bg-card shadow-card overflow-hidden">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : ordered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="mx-auto h-11 w-11 rounded-xl bg-muted flex items-center justify-center">
              <Workflow className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No assignment rules yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create your first rule to route leads to specific users or a round robin.
              </p>
            </div>
            <Button size="sm" onClick={() => router.push('/settings/assignment-rules/new')}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Create assignment rule
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th className="p-3 w-16 font-medium text-muted-foreground text-xs">Order</th>
                <th className="p-3 font-medium text-muted-foreground text-xs">Rule name</th>
                <th className="p-3 font-medium text-muted-foreground text-xs">Criteria</th>
                <th className="p-3 font-medium text-muted-foreground text-xs">Assign to</th>
                <th className="p-3 w-24 font-medium text-muted-foreground text-xs">Active</th>
                <th className="p-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {ordered.map((rule, i) => {
                const summary = criteriaSummary(rule);
                const isRR = rule.assign_strategy === 'round_robin';
                const targets = Array.isArray(rule.targets) ? rule.targets : [];
                return (
                  <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    {/* Order + reorder controls */}
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs text-muted-foreground tabular-nums w-4">{i + 1}</span>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => move(i, -1)}
                            disabled={i === 0}
                            aria-label="Move up"
                            className="h-4 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(i, 1)}
                            disabled={i === ordered.length - 1}
                            aria-label="Move down"
                            className="h-4 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Name + description */}
                    <td className="p-3 align-top">
                      <button
                        type="button"
                        onClick={() => router.push(`/settings/assignment-rules/${rule.id}`)}
                        className="text-left"
                      >
                        <p className="font-medium text-sm hover:text-primary transition-colors">{rule.name}</p>
                        {rule.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 max-w-xs">{rule.description}</p>
                        )}
                      </button>
                    </td>

                    {/* Criteria summary */}
                    <td className="p-3 align-top max-w-[220px]">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 text-xs',
                        summary.all ? 'text-muted-foreground' : 'text-foreground',
                      )}>
                        {summary.all
                          ? <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          : <ListFilter className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                        <span className="truncate font-mono text-[11px]">{summary.text}</span>
                      </span>
                    </td>

                    {/* Assign-to summary */}
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-1.5">
                        {isRR
                          ? <Repeat className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                          : <CircleUser className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-xs font-medium capitalize">
                            {isRR ? 'Round robin' : 'Specific user'}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            {isRR
                              ? `${targets.length} user${targets.length === 1 ? '' : 's'}`
                              : (targets[0]?.label || <span className="italic">unassigned</span>)}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Active toggle */}
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!rule.is_active}
                          onCheckedChange={() => toggleActive(rule)}
                          disabled={busyId === rule.id}
                          aria-label="Toggle active"
                        />
                        {busyId === rule.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>
                    </td>

                    {/* Row actions */}
                    <td className="p-3 align-top text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => router.push(`/settings/assignment-rules/${rule.id}`)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => remove(rule)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
