'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, FlaskConical, RefreshCw, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import StatusBadge from '@/components/shared/StatusBadge';
import { LanguageList } from '@/components/shared/LanguageBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

export default function TrialLeadsPage() {
  return (
    <RoleGuard allowedRoles={['super_admin']}>
      <TrialLeadsContent />
    </RoleGuard>
  );
}

function TrialLeadsContent() {
  const [leads, setLeads] = useState([]);
  const [groups, setGroups] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [assignmentLog, setAssignmentLog] = useState(null);

  const [form, setForm] = useState({
    language: 'tamil',
    group_id: '',
    campaign_id: '',
    auto_assign: true,
    trial_scenario: 'round_robin_demo',
  });
  const [batchForm, setBatchForm] = useState({
    count: 5,
    language: 'tamil',
    group_id: '',
    auto_assign: true,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [leadsRes, groupsRes, langRes] = await Promise.all([
        api.get('/trial-leads'),
        api.get('/groups?limit=100'),
        // /config returns a flat array of Config rows; filter by category
        api.get('/config?category=language&active=true'),
      ]);

      setLeads(unwrap(leadsRes) || []);

      // groups endpoint paginates: response.data.data = { data: [...], total, ... }
      const groupsPayload = unwrap(groupsRes);
      const groupsList = Array.isArray(groupsPayload)
        ? groupsPayload
        : groupsPayload?.data || [];
      setGroups(groupsList);

      const langRows = unwrap(langRes) || [];
      setLanguages(
        langRows.map((r) => ({ value: r.key, label: r.label || r.key }))
      );
    } catch (e) {
      toast.error('Failed to load trial leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createOne = async () => {
    try {
      await api.post('/trial-leads', form);
      toast.success('Trial lead created and assigned');
      setCreateOpen(false);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to create trial lead');
    }
  };

  const createBatch = async () => {
    try {
      const res = await api.post('/trial-leads/batch', batchForm);
      const data = unwrap(res) || {};
      // Backend returns assignment_log as ARRAY of { slot, assigned_to, language, rr_index }
      // (or { slot, error } on per-slot failure)
      setAssignmentLog(data.assignment_log || []);
      const okCount = (data.assignment_log || []).filter((e) => !e.error).length;
      toast.success(`${okCount} leads created and assigned via round robin`);
      setBatchOpen(false);
      loadData();
    } catch (e) {
      toast.error('Failed to create batch');
    }
  };

  const deleteOne = async (id) => {
    if (!confirm('Permanently delete this trial lead?')) return;
    try {
      await api.delete(`/trial-leads/${id}`);
      toast.success('Trial lead deleted');
      loadData();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const deleteAll = async () => {
    if (!confirm(`Delete ALL ${leads.length} trial leads? This cannot be undone.`)) return;
    try {
      // Backend route is DELETE /trial-leads/all
      await api.delete('/trial-leads/all');
      toast.success('All trial leads deleted');
      setAssignmentLog(null);
      loadData();
    } catch (e) {
      toast.error('Failed to delete all');
    }
  };

  // Filter groups by selected language for the batch dialog
  const batchGroups = groups.filter(
    (g) => !batchForm.language || g.language === batchForm.language
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
            <FlaskConical className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            Trial leads
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create demo leads to test the assignment system and show dashboard changes
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)}>
            <Play className="h-3.5 w-3.5 mr-1.5" /> Run batch demo
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create trial lead
          </Button>
          {leads.length > 0 && (
            <Button variant="destructive" size="sm" onClick={deleteAll}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear all ({leads.length})
            </Button>
          )}
        </div>
      </div>

      {/* How trial leads work */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <FlaskConical className="h-5 w-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium">How trial leads work</p>
              <p className="text-muted-foreground">
                Create individual or batch trial leads to demonstrate the CRM to clients. When created with
                auto-assign, they go through the real round robin system — you can watch how each lead gets
                assigned to a different teleseller in sequence. The assignment log shows exactly who got which
                lead and at what round robin position.
              </p>
              <p className="text-muted-foreground">
                Trial leads are flagged and can be permanently deleted. They show up on teleseller dashboards
                like real leads.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assignment log (after batch) */}
      {assignmentLog && assignmentLog.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-emerald-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-emerald-600 dark:text-emerald-400">
                Round robin assignment log
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {assignmentLog.map((info, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 text-center ${
                    info.error
                      ? 'bg-red-500/10 border border-red-500/20'
                      : 'bg-emerald-500/10'
                  }`}
                >
                  <p className="text-[11px] font-medium">Lead #{info.slot ?? i + 1}</p>
                  {info.error ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{info.error}</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold mt-1 truncate">{info.assigned_to}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {info.language}
                      </p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                        RR pos: {info.rr_index}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Trial leads table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground">Lead</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Scenario</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Assigned to</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Created</th>
                  <th className="p-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="p-3">
                      <p className="font-medium">
                        {lead.first_name} {lead.last_name}
                      </p>
                      <p className="text-muted-foreground font-mono mt-0.5">{lead.phone}</p>
                      {lead.trial_label && (
                        <Badge
                          variant="outline"
                          className="text-[10px] mt-1 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        >
                          {lead.trial_label}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-[10px]">
                        {(lead.trial_scenario || 'demo').replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {lead.assignedTo ? (
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">
                            {lead.assignedTo.first_name} {lead.assignedTo.last_name}
                          </p>
                          <LanguageList
                            primary={lead.assignedTo.primary_language}
                            additional={lead.assignedTo.additional_languages}
                            size="xs"
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={lead.lead_status} />
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {lead.createdAt
                        ? new Date(lead.createdAt).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteOne(lead.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!leads.length && !loading && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No trial leads yet. Create some to demo the system.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Single dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create trial lead</DialogTitle>
            <DialogDescription>
              Creates a fake lead to demo assignment and dashboard changes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select
                value={form.language}
                onValueChange={(v) => setForm({ ...form, language: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {languages.length === 0 && (
                    <SelectItem value="tamil">Tamil</SelectItem>
                  )}
                  {languages.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign to group</Label>
              <Select
                value={form.group_id}
                onValueChange={(v) => setForm({ ...form, group_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select group…" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scenario tag</Label>
              <Select
                value={form.trial_scenario}
                onValueChange={(v) => setForm({ ...form, trial_scenario: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round_robin_demo">Round robin demo</SelectItem>
                  <SelectItem value="ftd_demo">FTD demo</SelectItem>
                  <SelectItem value="cold_lead_demo">Cold lead demo</SelectItem>
                  <SelectItem value="general_demo">General demo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createOne}>Create &amp; assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch dialog */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch round robin demo</DialogTitle>
            <DialogDescription>
              Create multiple trial leads and watch the round robin assign them across your telesellers
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Number of leads (max 20)</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={batchForm.count}
                onChange={(e) =>
                  setBatchForm({ ...batchForm, count: parseInt(e.target.value, 10) || 1 })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select
                value={batchForm.language}
                onValueChange={(v) =>
                  setBatchForm({ ...batchForm, language: v, group_id: '' })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {languages.length === 0 && (
                    <SelectItem value="tamil">Tamil</SelectItem>
                  )}
                  {languages.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign to group</Label>
              <Select
                value={batchForm.group_id}
                onValueChange={(v) => setBatchForm({ ...batchForm, group_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${batchForm.language} group…`} />
                </SelectTrigger>
                <SelectContent>
                  {batchGroups.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      No groups in this language
                    </div>
                  ) : (
                    batchGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              This will create {batchForm.count} trial leads and assign them via round robin to the selected group.
              An assignment log will show you exactly which teleseller got which lead.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>Cancel</Button>
            <Button onClick={createBatch} disabled={!batchForm.group_id}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Run demo ({batchForm.count} leads)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
