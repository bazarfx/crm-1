'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Trash2, AlertCircle, Undo2, Award, Phone,
  MessageCircle, Mail, Copy, MapPin, Globe, Briefcase, Wallet,
  CheckCircle2, Building2, Hash, Languages, FileText, ListTree, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api, { unwrap } from '@/lib/api';
import useStore from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import StatusBadge from '@/components/shared/StatusBadge';
import { AssigneeDropdown } from '@/components/shared/AssigneeDropdown';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';
import { cn } from '@/lib/utils';

dayjs.extend(relativeTime);

const STATUSES = [
  'new', 'contacted', 'interested', 'not_interested', 'call_back',
  'account_opened', 'ftd_done', 'cold', 'dnd',
];
const LANGUAGES = [
  'english', 'tamil', 'telugu', 'hindi', 'marathi',
  'gujarati', 'bengali', 'kannada', 'malayalam', 'punjabi',
];
const SOURCES = [
  'facebook_ads', 'instagram_ads', 'google_ads', 'organic', 'referral', 'manual',
];
const EXPERIENCE = [
  'beginner_0_6m', 'beginner_6_12m', 'intermediate', 'advanced',
];
const MARKETS = [
  'nse_options', 'nse_futures', 'bse_equity', 'commodity', 'currency', 'crypto',
];

const fmtINR = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN');
};

const initialsOf = (lead) => {
  const t = ((lead?.first_name?.[0] || '') + (lead?.last_name?.[0] || '')).toUpperCase();
  return t || (lead?.phone?.slice(-2) || '?');
};

/**
 * Stable form-field renderer — hoisted out of the page component so its
 * <input>/<Select> aren't re-mounted on every parent render (which would
 * blow away focus on each keystroke).
 */
function Field({ label, name, value, onChange, type = 'text', options, disabled, hint, icon: Icon }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon size={11} />} {label}
      </Label>
      {options ? (
        <Select value={value || ''} onValueChange={(v) => onChange(name, v)} disabled={disabled}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map((o) => {
              const optValue = typeof o === 'string' ? o : o.value;
              const optLabel = typeof o === 'string' ? o.replace(/_/g, ' ') : o.label;
              return <SelectItem key={optValue} value={optValue}>{optLabel}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(name, e.target.value)}
          disabled={disabled}
          className="h-9 text-sm"
        />
      )}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const user = useStore((s) => s.user);
  const isAdmin = useStore((s) => s.isAdmin);
  const isSuperAdmin = useStore((s) => s.isSuperAdmin);

  const [lead, setLead] = useState(null);
  const [form, setForm] = useState({});
  const [telesellers, setTelesellers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Undo-request modal state. We render the modal locally instead of using a
  // global confirm because the reason text needs a textarea, not a yes/no.
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoReason, setUndoReason] = useState('');
  const [submittingUndo, setSubmittingUndo] = useState(false);
  const [pendingUndo, setPendingUndo] = useState(null);

  // BRUTE-FORCE OVERRIDE: trust user.role directly so editing is never gated
  // by an async-loaded flag. On a hard reload, the Zustand persist layer only
  // restores `user` — `isAdmin` / `isSuperAdmin` default to false until
  // fetchPermissions resolves, which was leaving every field disabled.
  const isAdminRole = user?.role === 'admin' || user?.role === 'super_admin';
  const canEditAll = isAdmin || isSuperAdmin || isAdminRole;
  const isAssignedToMe = Boolean(
    lead?.assigned_to_id && user?.id && String(lead.assigned_to_id) === String(user.id)
  );
  const isClosedByMe = Boolean(
    lead?.closed_by_user_id && user?.id && String(lead.closed_by_user_id) === String(user.id)
  );
  const canEditAssigned = isAssignedToMe && (user?.role === 'tele_sales' || user?.role === 'senior');
  const canEdit = canEditAll || canEditAssigned;
  const canDelete = canEditAll;

  const isDeal = Boolean(lead?.ftd_at);
  const canRequestUndo = isDeal && (isClosedByMe || isAssignedToMe || canEditAll);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [leadRes, actRes] = await Promise.all([
        api.get(`/leads/${id}`),
        api.get(`/leads/${id}/activities`),
      ]);
      const leadData = unwrap(leadRes);
      setLead(leadData);
      setForm(leadData || {});
      setHasChanges(false);
      setActivities(unwrap(actRes) || []);

      if (leadData?.ftd_at) {
        try {
          const undoRes = await api.get('/deals/undo-requests', {
            params: { status: 'pending', limit: 50 },
          });
          const all = unwrap(undoRes)?.items || [];
          setPendingUndo(all.find((r) => r.lead_id === leadData.id) || null);
        } catch { /* non-fatal */ }
      } else {
        setPendingUndo(null);
      }

      if (canEditAll) {
        try {
          const telesRes = await api.get('/users', { params: { role: 'tele_sales', limit: 200 } });
          const telesPayload = unwrap(telesRes);
          const telesList = Array.isArray(telesPayload) ? telesPayload : telesPayload?.data || [];
          setTelesellers(telesList);
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load lead');
    } finally {
      setLoading(false);
    }
  }, [id, canEditAll]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const updateField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const {
        id: _i, createdAt: _c, updatedAt: _u, assignedTo: _at, group: _g,
        activities: _a, campaign: _cp, ...updates
      } = form;
      const res = await api.patch(`/leads/${id}`, updates);
      const updated = unwrap(res);
      setLead(updated);
      setForm(updated || form);
      setHasChanges(false);
      toast.success('Lead updated');
      try {
        const actRes = await api.get(`/leads/${id}/activities`);
        setActivities(unwrap(actRes) || []);
      } catch { /* silent */ }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const submitUndoRequest = async () => {
    if (!undoReason.trim()) {
      toast.error('Please describe why this deal should be undone');
      return;
    }
    setSubmittingUndo(true);
    try {
      const res = await api.post(`/deals/${id}/undo-request`, { reason: undoReason.trim() });
      const created = unwrap(res);
      setPendingUndo(created);
      setShowUndoModal(false);
      setUndoReason('');
      toast.success('Undo request submitted — admin will review');
      try {
        const actRes = await api.get(`/leads/${id}/activities`);
        setActivities(unwrap(actRes) || []);
      } catch { /* silent */ }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to submit undo request');
    } finally {
      setSubmittingUndo(false);
    }
  };

  const cancelUndoRequest = async () => {
    if (!pendingUndo) return;
    if (!confirm('Withdraw this undo request?')) return;
    try {
      await api.post(`/deals/undo-requests/${pendingUndo.id}/cancel`, {});
      setPendingUndo(null);
      toast.success('Undo request withdrawn');
      try {
        const actRes = await api.get(`/leads/${id}/activities`);
        setActivities(unwrap(actRes) || []);
      } catch { /* silent */ }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to cancel');
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    if (!confirm(`Delete ${lead.first_name} ${lead.last_name}? Will move to recycle bin.`)) return;
    try {
      await api.delete(`/leads/${id}`);
      toast.success('Lead moved to recycle bin');
      router.push('/leads');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete');
    }
  };

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    toast.success(`Copied ${label || text}`);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 rounded-xl bg-muted/50" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="h-9 w-64 rounded-md bg-muted/50" />
            <div className="h-96 rounded-xl bg-muted/50" />
          </div>
          <div className="space-y-3">
            <div className="h-56 rounded-xl bg-muted/50" />
            <div className="h-40 rounded-xl bg-muted/50" />
          </div>
        </div>
      </div>
    );
  }
  if (!lead) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Lead not found</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/leads')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to leads
        </Button>
      </div>
    );
  }

  const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—';
  const status = lead.lead_status || lead.status;
  const phoneDigits = (lead.phone || '').replace(/[^\d+]/g, '');
  const waNumber = (lead.whatsapp_number || lead.phone || '').replace(/\D/g, '');

  return (
    <div className="space-y-5">
      {/* ────────── IDENTITY HEADER ────────── */}
      <Card className="overflow-hidden">
        {/* Accent strip — colour pulled from the status palette so the header
            "matches" the badge below. Subtle: 4px tall on the top edge. */}
        <div
          className="h-1 w-full"
          style={{ background: STATUS_HEX[status] || 'hsl(var(--border))' }}
          aria-hidden
        />
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Left: back, avatar, name, status, meta */}
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -ml-1 shrink-0"
                onClick={() => router.push('/leads')}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div
                className="flex h-14 w-14 items-center justify-center rounded-xl text-base font-semibold tracking-tight border shrink-0"
                style={{
                  background: `${STATUS_HEX[status] || '#94A3B8'}1A`,
                  color: STATUS_HEX[status] || '#94A3B8',
                  borderColor: `${STATUS_HEX[status] || '#94A3B8'}40`,
                }}
              >
                {initialsOf(lead)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold tracking-tight truncate">{fullName}</h1>
                  <StatusBadge status={status} size="lg" />
                  {isDeal && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      <Award size={10} /> Deal
                    </span>
                  )}
                  {lead.ark_account_number && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400">
                      <CheckCircle2 size={10} /> ARK
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {lead.phone && (
                    <button
                      onClick={() => copyToClipboard(lead.phone, lead.phone)}
                      className="mono inline-flex items-center gap-1.5 hover:text-foreground transition-colors group"
                    >
                      <Phone size={11} />
                      {lead.phone}
                      <Copy size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                    </button>
                  )}
                  {lead.email && (
                    <button
                      onClick={() => copyToClipboard(lead.email, 'email')}
                      className="mono inline-flex items-center gap-1.5 hover:text-foreground transition-colors group"
                    >
                      <Mail size={11} />
                      <span className="truncate max-w-[220px]">{lead.email}</span>
                      <Copy size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                    </button>
                  )}
                  {(lead.city || lead.state) && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={11} />
                      {[lead.city, lead.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {lead.language && (
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <Languages size={11} />
                      {lead.language}
                    </span>
                  )}
                  {lead.campaign_name && (
                    <span className="inline-flex items-center gap-1.5 truncate max-w-[200px]">
                      <Briefcase size={11} /> {lead.campaign_name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: primary actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <ManageFieldsButton entityType="lead" label="Manage fields" size="sm" />
              {hasChanges && (
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Saving…' : 'Save changes'}
                </Button>
              )}
              {canRequestUndo && !pendingUndo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUndoModal(true)}
                  className="border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Request undo
                </Button>
              )}
              {canDelete && (
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                </Button>
              )}
            </div>
          </div>

          {/* Contact quick-actions — telesellers spend their day here, so the
              dial / WhatsApp / Email shortcuts go right under the identity. */}
          {(phoneDigits || lead.email) && (
            <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2">
              {phoneDigits && (
                <a
                  href={`tel:${phoneDigits}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Phone size={12} /> Call
                </a>
              )}
              {waNumber && (
                <a
                  href={`https://wa.me/${waNumber.startsWith('91') ? waNumber : `91${waNumber}`}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border bg-card text-foreground hover:bg-muted transition-colors"
                >
                  <MessageCircle size={12} /> WhatsApp
                </a>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border bg-card text-foreground hover:bg-muted transition-colors"
                >
                  <Mail size={12} /> Email
                </a>
              )}
              <div className="ml-auto inline-flex items-center gap-3 text-[11px] text-muted-foreground">
                {lead.last_contact_at && (
                  <span className="inline-flex items-center gap-1">
                    Last contact <span className="mono">{dayjs(lead.last_contact_at).fromNow()}</span>
                  </span>
                )}
                {lead.created_at && (
                  <span className="inline-flex items-center gap-1">
                    Created <span className="mono">{dayjs(lead.created_at).format('DD MMM YYYY')}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ────────── BANNERS ────────── */}
      {isDeal && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <Award className="h-4 w-4" />
            <span>
              This lead is a closed deal
              {lead.closed_by_name && (
                <> — credited to <span className="font-medium">{lead.closed_by_name}</span></>
              )}
              {lead.deposited_amount && (
                <> · deposit <span className="mono font-medium">₹{fmtINR(lead.deposited_amount)}</span></>
              )}
              .
            </span>
          </CardContent>
        </Card>
      )}

      {pendingUndo && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
            <Undo2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Undo request pending admin review</p>
              <p className="mt-1 text-amber-700/80 dark:text-amber-300/80">
                Reason: {pendingUndo.reason}
              </p>
              {String(pendingUndo.requested_by_user_id) === String(user?.id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/15"
                  onClick={cancelUndoRequest}
                >
                  Withdraw request
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!canEdit && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" />
            You don&rsquo;t have permission to edit this lead. View only.
          </CardContent>
        </Card>
      )}

      {/* ────────── UNDO MODAL ────────── */}
      {showUndoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !submittingUndo && setShowUndoModal(false)}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Undo2 className="h-4 w-4 text-amber-500" /> Request to undo this deal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                An admin or super admin will review your request. If approved, the FTD
                marker, deposit amount and closer credit will be cleared and the lead
                will revert to its prior status.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason</Label>
                <Textarea
                  rows={4}
                  placeholder="Why should this deal be undone?"
                  value={undoReason}
                  onChange={(e) => setUndoReason(e.target.value)}
                  className="text-sm"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowUndoModal(false)} disabled={submittingUndo}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submitUndoRequest} disabled={submittingUndo || !undoReason.trim()}>
                  {submittingUndo ? 'Submitting…' : 'Submit request'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────── MAIN GRID: TABS + STICKY RAIL ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">
                <FileText size={11} className="mr-1.5" /> Details
              </TabsTrigger>
              <TabsTrigger value="notes">
                <ListTree size={11} className="mr-1.5" /> Notes
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Activity size={11} className="mr-1.5" /> Activity ({activities.length})
              </TabsTrigger>
            </TabsList>

            {/* ─── DETAILS ─── */}
            <TabsContent value="details" className="space-y-4 mt-4">
              {/* Personal */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 size={13} className="text-muted-foreground" /> Personal
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="First name"      name="first_name"      value={form.first_name}      onChange={updateField} disabled={!canEdit} />
                  <Field label="Last name"       name="last_name"       value={form.last_name}       onChange={updateField} disabled={!canEdit} />
                  <Field label="Phone"           name="phone"           value={form.phone}           onChange={updateField} disabled={!canEdit} />
                  <Field label="WhatsApp"        name="whatsapp_number" value={form.whatsapp_number} onChange={updateField} disabled={!canEdit} />
                  <Field label="Email"           name="email"           value={form.email}           onChange={updateField} disabled={!canEdit} type="email" />
                </CardContent>
              </Card>

              {/* Address */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin size={13} className="text-muted-foreground" /> Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="City"     name="city"     value={form.city}     onChange={updateField} disabled={!canEdit} />
                  <Field label="State"    name="state"    value={form.state}    onChange={updateField} disabled={!canEdit} />
                  <Field label="Pincode"  name="pincode"  value={form.pincode}  onChange={updateField} disabled={!canEdit} />
                </CardContent>
              </Card>

              {/* Trading profile */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase size={13} className="text-muted-foreground" /> Trading profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="Language" name="language" value={form.language}
                    onChange={updateField}
                    disabled
                    hint="Locked — set from the campaign at ingest"
                    options={LANGUAGES}
                  />
                  <Field label="Preferred language" name="preferred_language" value={form.preferred_language} onChange={updateField} disabled={!canEdit} options={LANGUAGES} />
                  <Field label="Lead source"        name="lead_source"        value={form.lead_source}        onChange={updateField} disabled={!canEdit} options={SOURCES} />
                  <Field label="Trading experience" name="trading_experience" value={form.trading_experience} onChange={updateField} disabled={!canEdit} options={EXPERIENCE} />
                  <Field label="Preferred market"   name="preferred_market"   value={form.preferred_market}   onChange={updateField} disabled={!canEdit} options={MARKETS} />
                  <Field label="Investment budget"  name="investment_budget"  value={form.investment_budget}  onChange={updateField} disabled={!canEdit} type="number" />
                  {/* Custom fields live next to the native ones — no
                      separate ghetto card. Admins add/edit the schema via
                      the "Manage fields" button in the page header. */}
                  <DynamicFields
                    entityType="lead"
                    values={form.custom_fields || {}}
                    onChange={(cf) => updateField('custom_fields', cf)}
                    disabled={!canEdit}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── NOTES ─── */}
            <TabsContent value="notes" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Internal notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={form.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    disabled={!canEdit}
                    rows={10}
                    className="text-sm"
                    placeholder="Add internal notes about this lead — call summary, objections, next steps…"
                  />
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Notes are visible to everyone who can see this lead. Use the activity log for time-stamped events.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── ACTIVITY ─── */}
            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Activity history</CardTitle>
                </CardHeader>
                <CardContent>
                  {activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      No activity logged yet.
                    </p>
                  ) : (
                    <ol className="relative space-y-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                      {activities.map((a) => (
                        <li key={a.id} className="relative pl-6">
                          <span
                            className="absolute left-0 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background bg-primary"
                            aria-hidden
                          />
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-medium leading-tight">{a.title}</p>
                            <span className="text-[10px] mono text-muted-foreground whitespace-nowrap">
                              {a.createdAt
                                ? dayjs(a.createdAt).format('DD MMM · HH:mm')
                                : ''}
                            </span>
                          </div>
                          {a.description && (
                            <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            by {a.user ? `${a.user.first_name} ${a.user.last_name}` : 'System'}
                            {a.user?.role && ` (${a.user.role.replace(/_/g, ' ')})`}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ────────── STICKY RIGHT RAIL ────────── */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-20 space-y-4">
            {/* Status & sub-status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Hash size={13} className="text-muted-foreground" /> Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Lead status" name="lead_status" value={form.lead_status} onChange={updateField} disabled={!canEdit} options={STATUSES} />
                <Field label="Sub status"  name="sub_status"  value={form.sub_status}  onChange={updateField} disabled={!canEdit} />
              </CardContent>
            </Card>

            {/* Assignment */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Globe size={13} className="text-muted-foreground" /> Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Assigned to
                </Label>
                <AssigneeDropdown
                  value={form.assigned_to_id || ''}
                  onChange={(v) => updateField('assigned_to_id', v)}
                  leadLanguage={lead?.language}
                  role={lead?.lead_source === 'direct_ark' ? 'senior' : 'tele_sales'}
                  disabled={!canEditAll}
                  placeholder="Unassigned"
                />
                {!canEditAll && lead?.assignedTo && (
                  <p className="text-[10px] text-muted-foreground">
                    Currently {lead.assignedTo.first_name} {lead.assignedTo.last_name}. Reassignment requires floor manager or admin.
                  </p>
                )}
                {!canEditAll && !lead?.assignedTo && (
                  <p className="text-[10px] text-muted-foreground">
                    Reassignment requires floor manager or admin.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ARK details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Wallet size={13} className="text-muted-foreground" /> ARK terminal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="ARK account number" name="ark_account_number" value={form.ark_account_number} onChange={updateField} disabled={!canEdit} />
                <Field label="Deposited amount"   name="deposited_amount"   value={form.deposited_amount}   onChange={updateField} disabled={!canEdit} type="number" />
                {lead.ftd_at && (
                  <div className="text-[11px] text-muted-foreground border-t pt-2">
                    FTD recorded <span className="mono text-foreground">{dayjs(lead.ftd_at).format('DD MMM YYYY')}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity preview */}
            {activities.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Activity size={13} className="text-muted-foreground" /> Recent activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {activities.slice(0, 3).map((a) => (
                    <div key={a.id} className="text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium truncate">{a.title}</span>
                        <span className="text-[10px] mono text-muted-foreground whitespace-nowrap">
                          {a.createdAt ? dayjs(a.createdAt).fromNow() : ''}
                        </span>
                      </div>
                      {a.description && (
                        <p className="text-muted-foreground truncate mt-0.5">{a.description}</p>
                      )}
                    </div>
                  ))}
                  {activities.length > 3 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1 border-t">
                      +{activities.length - 3} more in Activity tab
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// Status hex map — sourced from CLAUDE.md, used for the identity header accent
// strip and the avatar tint so the visual identity of the lead reflects its
// current status at a glance.
const STATUS_HEX = {
  new: '#6366F1',
  contacted: '#3B82F6',
  interested: '#8B5CF6',
  not_interested: '#EF4444',
  call_back: '#F59E0B',
  account_opened: '#14B8A6',
  ftd_done: '#10B981',
  cold: '#6B7280',
  dnd: '#DC2626',
  inactive: '#9CA3AF',
  reactive: '#F97316',
};
