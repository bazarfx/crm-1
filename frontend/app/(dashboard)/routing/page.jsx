'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Route, Plus, ArrowUp, ArrowDown, Trash2, UserCircle2, Building2,
  AlertCircle, RefreshCw, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const SOURCE_LABEL = {
  facebook_ads:  'Facebook Ads',
  instagram_ads: 'Instagram Ads',
  google_ads:    'Google Ads',
  direct_ark:    'Direct ARK',
  manual:        'Manual',
  referral:      'Referral',
};

const ANY_LANG = '__any__';

export default function RoutingPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      <RoutingContent />
    </RoleGuard>
  );
}

function RoutingContent() {
  const config = useStore((s) => s.config);

  // Build source + language pickers from Config when available; fall back to
  // the static maps so the page works on a fresh install.
  const sources = useMemo(() => {
    const fromCfg = Array.isArray(config?.lead_source)
      ? config.lead_source.map((r) => ({ value: r.key, label: r.label || r.key }))
      : null;
    return fromCfg?.length ? fromCfg : Object.keys(SOURCE_LABEL).map((k) => ({ value: k, label: SOURCE_LABEL[k] }));
  }, [config]);

  const languages = useMemo(() => {
    const fromCfg = Array.isArray(config?.language)
      ? config.language.map((r) => ({ value: r.key, label: r.label || r.key }))
      : null;
    if (fromCfg?.length) return fromCfg;
    return [
      'english', 'tamil', 'telugu', 'hindi', 'marathi', 'gujarati',
      'bengali', 'kannada', 'malayalam', 'punjabi',
    ].map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }));
  }, [config]);

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState({ groups: [], users: [] });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    lead_source: '',
    language: ANY_LANG,
    target_type: 'group',
    target_id: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, tRes] = await Promise.all([
        api.get('/routing-rules'),
        api.get('/routing-rules/target-options'),
      ]);
      setRules(unwrap(rRes)?.items || []);
      setTargets(unwrap(tRes) || { groups: [], users: [] });
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load routing rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Group rules by (lead_source, language) for the bucketed display.
  const buckets = useMemo(() => {
    const map = new Map();
    for (const r of rules) {
      const key = `${r.lead_source}::${r.language || ANY_LANG}`;
      if (!map.has(key)) {
        map.set(key, {
          lead_source: r.lead_source,
          language: r.language,
          rules: [],
        });
      }
      map.get(key).rules.push(r);
    }
    // Sort rules inside each bucket by position
    for (const b of map.values()) b.rules.sort((a, b2) => (a.position || 0) - (b2.position || 0));
    // Buckets sorted source ascending then language (null first)
    return Array.from(map.values()).sort((a, b) => {
      if (a.lead_source !== b.lead_source) return a.lead_source.localeCompare(b.lead_source);
      return (a.language || '').localeCompare(b.language || '');
    });
  }, [rules]);

  const openAdd = (preset = {}) => {
    setAddForm({
      lead_source: preset.lead_source || sources[0]?.value || '',
      language: preset.language || ANY_LANG,
      target_type: 'group',
      target_id: '',
      notes: '',
    });
    setShowAdd(true);
  };

  const submitAdd = async () => {
    if (!addForm.lead_source) return toast.error('Pick a lead source');
    if (!addForm.target_id) return toast.error('Pick a group or user');
    setSubmitting(true);
    try {
      await api.post('/routing-rules', {
        lead_source: addForm.lead_source,
        language: addForm.language === ANY_LANG ? null : addForm.language,
        target_type: addForm.target_type,
        target_id: addForm.target_id,
        notes: addForm.notes || undefined,
      });
      toast.success('Routing rule added');
      setShowAdd(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add rule');
    } finally {
      setSubmitting(false);
    }
  };

  const move = async (ruleId, direction) => {
    try {
      await api.post(`/routing-rules/${ruleId}/move`, { direction });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to reorder');
    }
  };

  const remove = async (ruleId) => {
    if (!confirm('Remove this routing target from the rotation?')) return;
    try {
      await api.delete(`/routing-rules/${ruleId}`);
      toast.success('Routing rule removed');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete');
    }
  };

  const toggleActive = async (rule) => {
    try {
      await api.patch(`/routing-rules/${rule.id}`, { is_active: !rule.is_active });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Route className="h-5 w-5 text-blue-500" />
            Lead Routing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Decide who receives leads from each source &amp; language. Round-robin runs
            across every active target in the list, then within each group.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => openAdd()}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add rule
          </Button>
        </div>
      </div>

      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-3 flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">How the cascade works</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-700/90 dark:text-blue-300/90">
              <li>Admin rules for exact (source, language) — round-robin across this list.</li>
              <li>Admin rules for (source, any language) — round-robin across this list.</li>
              <li>Active telesales groups whose language matches — RR across groups, then within.</li>
              <li>Telesellers whose <span className="font-mono">primary_language</span> matches — RR direct.</li>
              <li>Telesellers with the language in <span className="font-mono">additional_languages</span> — overflow RR.</li>
              <li>Final fallback — round-robin across every active teleseller.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : buckets.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground space-y-3">
            <p>No routing rules yet. Leads fall through to the language-based cascade.</p>
            <Button size="sm" onClick={() => openAdd()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add your first rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {buckets.map((bucket) => (
            <Card key={`${bucket.lead_source}::${bucket.language || ANY_LANG}`}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-500/40">
                      {SOURCE_LABEL[bucket.lead_source] || bucket.lead_source}
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="outline" className={bucket.language ? '' : 'text-muted-foreground'}>
                      {bucket.language ? bucket.language : 'Any language'}
                    </Badge>
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {bucket.rules.length} target{bucket.rules.length === 1 ? '' : 's'} in rotation
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAdd({ lead_source: bucket.lead_source, language: bucket.language || ANY_LANG })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add target
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      <th className="text-left p-2.5 w-12 font-medium text-muted-foreground text-xs">#</th>
                      <th className="text-left p-2.5 font-medium text-muted-foreground text-xs">Target</th>
                      <th className="text-left p-2.5 font-medium text-muted-foreground text-xs">Notes</th>
                      <th className="text-left p-2.5 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="p-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.rules.map((r, i) => {
                      const isGroup = r.target_type === 'group';
                      const targetName = isGroup
                        ? r.target?.name
                        : `${r.target?.first_name || ''} ${r.target?.last_name || ''}`.trim();
                      const Icon = isGroup ? Building2 : UserCircle2;
                      const inactive = r.target && !r.target.is_active;
                      return (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2.5 font-mono text-xs text-muted-foreground tabular-nums">
                            {i + 1}
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 flex-shrink-0 ${isGroup ? 'text-violet-500' : 'text-emerald-500'}`} />
                              <div>
                                <p className="font-medium text-sm">{targetName || <span className="text-muted-foreground italic">missing</span>}</p>
                                <p className="text-[10px] text-muted-foreground capitalize">
                                  {r.target_type}
                                  {isGroup && r.target?.language && ` · ${r.target.language}`}
                                  {!isGroup && r.target?.role && ` · ${r.target.role.replace(/_/g, ' ')}`}
                                  {!isGroup && r.target?.primary_language && ` · ${r.target.primary_language}`}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5 text-xs text-muted-foreground max-w-xs">
                            <p className="line-clamp-2">{r.notes || '—'}</p>
                          </td>
                          <td className="p-2.5">
                            <button
                              type="button"
                              onClick={() => toggleActive(r)}
                              className="text-left"
                            >
                              <Badge
                                variant="outline"
                                className={
                                  r.is_active
                                    ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10 text-[10px]'
                                    : 'text-muted-foreground border-muted text-[10px]'
                                }
                              >
                                {r.is_active ? 'Active' : 'Disabled'}
                              </Badge>
                            </button>
                            {inactive && (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                                <AlertCircle className="h-2.5 w-2.5" />
                                Target inactive
                              </p>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex justify-end gap-0.5">
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7"
                                disabled={i === 0}
                                onClick={() => move(r.id, 'up')}
                                aria-label="Move up"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7"
                                disabled={i === bucket.rules.length - 1}
                                onClick={() => move(r.id, 'down')}
                                aria-label="Move down"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => remove(r.id)}
                                aria-label="Remove"
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add-rule modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !submitting && setShowAdd(false)}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">Add routing target</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Lead source</Label>
                  <Select
                    value={addForm.lead_source}
                    onValueChange={(v) => setAddForm((f) => ({ ...f, lead_source: v }))}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {sources.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Language</Label>
                  <Select
                    value={addForm.language}
                    onValueChange={(v) => setAddForm((f) => ({ ...f, language: v }))}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_LANG}>Any language</SelectItem>
                      {languages.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Target type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['group', 'user'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAddForm((f) => ({ ...f, target_type: t, target_id: '' }))}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        addForm.target_type === t
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {t === 'group'
                          ? <Building2 className="h-4 w-4 text-violet-500" />
                          : <UserCircle2 className="h-4 w-4 text-emerald-500" />}
                        <span className="font-medium text-sm capitalize">{t}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t === 'group'
                          ? 'Lead enters group RR — picks next teleseller'
                          : 'Lead goes directly to this user'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  {addForm.target_type === 'group' ? 'Group' : 'User'}
                </Label>
                <Select
                  value={addForm.target_id}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, target_id: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={`Select a ${addForm.target_type}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {addForm.target_type === 'group'
                      ? targets.groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name} {g.language && <span className="text-muted-foreground">· {g.language}</span>}
                          </SelectItem>
                        ))
                      : targets.users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.first_name} {u.last_name}
                            {u.primary_language && <span className="text-muted-foreground"> · {u.primary_language}</span>}
                            {u.role && <span className="text-muted-foreground"> · {u.role.replace(/_/g, ' ')}</span>}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Hindi speakers for premium FB campaign"
                  className="h-9 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submitAdd} disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add target'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  );
}
