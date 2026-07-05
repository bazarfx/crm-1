'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Workflow, Save, Loader2, ListFilter, UserCog, Users, Plus, X,
  CircleUser, Repeat, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AssigneeDropdown } from '@/components/shared/AssigneeDropdown';
import {
  FormPageHeader, FormPageBody, FormSection, Field,
} from '@/components/shared/FormShell';
import CriteriaEditor from '@/components/assignment/CriteriaEditor';
import {
  getRule, createRule, updateRule, previewRule,
} from '@/lib/assignmentRules';
import { cn } from '@/lib/utils';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

// A radio-card option shared by both the "apply to" and "assign to" pickers.
function RadioCard({ active, onClick, icon: Icon, title, description }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 text-left rounded-lg border p-3 transition-colors', RING,
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'border-border hover:bg-muted/40',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">{description}</p>
    </button>
  );
}

let rowSeq = 0;
const newRowKey = () => `rr${++rowSeq}`;

/** ruleId = null → create. Otherwise load + edit that rule. */
export default function AssignmentRuleForm({ ruleId = null }) {
  const router = useRouter();
  const isEdit = !!ruleId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState([]);

  const [form, setForm] = useState({
    name: '',
    description: '',
    match_type: 'all',            // 'all' | 'criteria'
    criteria: null,
    assign_strategy: 'user',      // 'user' | 'round_robin'
    is_active: true,
  });

  // 'user' strategy → a single selected user id.
  const [singleUser, setSingleUser] = useState('');
  // 'round_robin' strategy → an ordered list of { key, id } rows (user ids).
  const [rrRows, setRrRows] = useState([{ key: newRowKey(), id: '' }]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // ── Campaigns for the criteria editor's Campaign field options ────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/campaigns', { params: { limit: 100 } });
        setCampaigns(unwrap(res)?.data || unwrap(res) || []);
      } catch { /* criteria editor still works without campaign labels */ }
    })();
  }, []);

  // ── Load rule on edit ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    (async () => {
      try {
        const rule = await getRule(ruleId);
        if (!alive || !rule) return;
        setForm({
          name: rule.name || '',
          description: rule.description || '',
          match_type: rule.match_type === 'criteria' ? 'criteria' : 'all',
          criteria: rule.criteria || null,
          assign_strategy: rule.assign_strategy === 'round_robin' ? 'round_robin' : 'user',
          is_active: rule.is_active !== false,
        });
        const targets = Array.isArray(rule.targets) ? rule.targets : [];
        const userTargets = targets.filter((t) => t.type === 'user');
        if (rule.assign_strategy === 'round_robin') {
          setRrRows(userTargets.length
            ? userTargets.map((t) => ({ key: newRowKey(), id: t.id }))
            : [{ key: newRowKey(), id: '' }]);
        } else {
          setSingleUser(userTargets[0]?.id || '');
        }
      } catch (e) {
        toast.error(e?.response?.data?.message || 'Failed to load assignment rule');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ruleId, isEdit]);

  // ── Live preview: "N of M records match" ──────────────────────────────────
  const [preview, setPreview] = useState(null); // { matched, sampled } | null
  const [previewing, setPreviewing] = useState(false);
  const previewSeq = useRef(0);

  const runPreview = useCallback(async (matchType, criteria) => {
    // Only meaningful for criteria rules with at least one rule.
    if (matchType !== 'criteria' || !criteria || !Array.isArray(criteria.rules) || criteria.rules.length === 0) {
      setPreview(null);
      setPreviewing(false);
      return;
    }
    const seq = ++previewSeq.current;
    setPreviewing(true);
    try {
      const res = await previewRule({ criteria, match_type: 'criteria' });
      if (seq === previewSeq.current) setPreview(res);
    } catch {
      if (seq === previewSeq.current) setPreview(null);
    } finally {
      if (seq === previewSeq.current) setPreviewing(false);
    }
  }, []);

  // Debounce the preview call as criteria change.
  useEffect(() => {
    const t = setTimeout(() => runPreview(form.match_type, form.criteria), 450);
    return () => clearTimeout(t);
  }, [form.match_type, form.criteria, runPreview]);

  // ── Round-robin row management ────────────────────────────────────────────
  const addRrRow = () => setRrRows((prev) => [...prev, { key: newRowKey(), id: '' }]);
  const removeRrRow = (key) => setRrRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  const setRrRow = (key, id) => setRrRows((prev) => prev.map((r) => (r.key === key ? { ...r, id } : r)));

  // ── Build targets from the active strategy ────────────────────────────────
  const buildTargets = () => {
    if (form.assign_strategy === 'user') {
      return singleUser ? [{ type: 'user', id: singleUser }] : [];
    }
    // round_robin — dedupe + drop empties, preserve order.
    const seen = new Set();
    const out = [];
    for (const row of rrRows) {
      if (row.id && !seen.has(row.id)) { seen.add(row.id); out.push({ type: 'user', id: row.id }); }
    }
    return out;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.name.trim()) { toast.error('Rule name is required'); return; }

    if (form.match_type === 'criteria') {
      if (!form.criteria || !Array.isArray(form.criteria.rules) || form.criteria.rules.length === 0) {
        toast.error('Add at least one condition, or switch to "All records"');
        return;
      }
    }

    const targets = buildTargets();
    if (targets.length === 0) {
      toast.error(form.assign_strategy === 'user' ? 'Choose a user to assign to' : 'Add at least one user to the round robin');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      module: 'lead',
      match_type: form.match_type,
      criteria: form.match_type === 'criteria' ? form.criteria : null,
      assign_strategy: form.assign_strategy,
      targets,
      is_active: form.is_active,
    };

    setSaving(true);
    try {
      if (isEdit) await updateRule(ruleId, payload);
      else await createRule(payload);
      toast.success(isEdit ? 'Assignment rule updated' : 'Assignment rule created');
      router.push('/settings/assignment-rules');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const previewLabel = previewing
    ? 'Checking recent leads…'
    : preview
      ? `${preview.matched} of ${preview.sampled} recent lead${preview.sampled === 1 ? '' : 's'} match`
      : null;

  return (
    <div className="-mt-4 lg:-mt-6">
      <FormPageHeader
        icon={Workflow}
        title={isEdit ? (form.name || 'Edit assignment rule') : 'New assignment rule'}
        parent="Assignment rules"
        parentHref="/settings/assignment-rules"
        backHref="/settings/assignment-rules"
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => router.push('/settings/assignment-rules')} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
            </Button>
          </>
        )}
      />

      {loading ? (
        <div className="py-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <FormPageBody width="max-w-3xl">
          {/* Identity */}
          <FormSection icon={Workflow} title="Rule details" description="Name this rule so admins can recognise it in the ordered list.">
            <div className="space-y-4">
              <Field label="Rule name" required>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. High-value Hindi leads → Senior desk" />
              </Field>
              <Field label="Description" hint="Optional">
                <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this rule is for" />
              </Field>
            </div>
          </FormSection>

          {/* Apply to */}
          <FormSection icon={ListFilter} title="Apply this rule to" description="Choose which incoming leads this rule should act on.">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <RadioCard
                active={form.match_type === 'all'}
                onClick={() => set('match_type', 'all')}
                icon={Users}
                title="All records"
                description="Every lead that reaches this rule matches."
              />
              <RadioCard
                active={form.match_type === 'criteria'}
                onClick={() => set('match_type', 'criteria')}
                icon={ListFilter}
                title="Records matching certain conditions"
                description="Only leads that satisfy the conditions below."
              />
            </div>

            {form.match_type === 'criteria' && (
              <div className="mt-4 space-y-2">
                <CriteriaEditor
                  value={form.criteria}
                  onChange={(next) => set('criteria', next)}
                  campaigns={campaigns}
                />
                {previewLabel && (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-1">
                    <Sparkles className={cn('h-3 w-3', previewing ? 'animate-pulse' : 'text-primary')} />
                    {previewLabel}
                  </p>
                )}
              </div>
            )}
          </FormSection>

          {/* Assign to */}
          <FormSection icon={UserCog} title="Assign to" description="Where matching leads should be routed.">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <RadioCard
                active={form.assign_strategy === 'user'}
                onClick={() => set('assign_strategy', 'user')}
                icon={CircleUser}
                title="Specific user"
                description="All matching leads go to one teleseller or senior."
              />
              <RadioCard
                active={form.assign_strategy === 'round_robin'}
                onClick={() => set('assign_strategy', 'round_robin')}
                icon={Repeat}
                title="Round robin"
                description="Distribute matching leads evenly across a set of users."
              />
            </div>

            {form.assign_strategy === 'user' ? (
              <div className="mt-4">
                <Field label="User">
                  <AssigneeDropdown
                    value={singleUser}
                    onChange={setSingleUser}
                    role="tele_sales,senior"
                    placeholder="Choose a user"
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                <p className="text-[11px] text-muted-foreground">
                  Leads rotate through these users in order. Add every user that should receive a share.
                </p>
                <div className="space-y-2">
                  {rrRows.map((row, idx) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-[11px] text-muted-foreground tabular-nums text-right">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <AssigneeDropdown
                          value={row.id}
                          onChange={(id) => setRrRow(row.key, id)}
                          role="tele_sales,senior"
                          placeholder="Choose a user"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRrRow(row.key)}
                        disabled={rrRows.length === 1}
                        aria-label="Remove user"
                        className={cn(
                          'shrink-0 h-9 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground transition-colors',
                          'hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:pointer-events-none',
                          RING,
                        )}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addRrRow}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add user
                </Button>
              </div>
            )}
          </FormSection>

          {/* Active */}
          <FormSection icon={Sparkles} title="Status" description="Inactive rules are skipped when leads are routed.">
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Active</p>
                <p className="text-[11px] text-muted-foreground">
                  When on, this rule participates in lead assignment in its list order.
                </p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
            </div>
          </FormSection>
        </FormPageBody>
      )}
    </div>
  );
}
