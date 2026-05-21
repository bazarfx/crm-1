'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, PhoneCall, Mail, MessageSquare, StickyNote, Activity, Zap,
  Calendar, BanIcon, Snowflake, UserCog, Loader2, Hash, Clock, Wallet,
  Building, MapPin, Tag, Megaphone, ChevronRight,
} from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import ActivityModal from '@/components/leads/ActivityModal';
import Modal from '@/components/shared/Modal';
import { inrFormat, statusColor } from '@/lib/charts';

dayjs.extend(relativeTime);

const STATUSES = [
  'new','contacted','interested','not_interested','call_back',
  'account_opened','ftd_done','cold','dnd','inactive','reactive',
];

const colorBg = (name) => {
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue} 70% 92%)`;
};
const colorFg = (name) => {
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue} 60% 35%)`;
};
const initials = (n) => {
  const t = (n || '').trim().split(/\s+/);
  return ((t[0]?.[0] || '?') + (t[1]?.[0] || '')).toUpperCase();
};

export default function LeadDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can('super_admin', 'admin', 'floor_manager');

  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [activityOpen, setActivityOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // { action, label }
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [leadRes, actRes] = await Promise.allSettled([
        api.get(`/leads/${id}`),
        api.get(`/leads/${id}/activities`),
      ]);
      if (leadRes.status === 'fulfilled') setLead(unwrap(leadRes.value) || null);
      if (actRes.status === 'fulfilled') setActivities(unwrap(actRes.value)?.data || unwrap(actRes.value) || []);
      if (leadRes.status === 'rejected') {
        const e = leadRes.reason;
        setErr(e?.code === 'ERR_NETWORK' ? 'Backend not reachable on :5000' : 'Could not load lead');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const patchStatus = async (next) => {
    try {
      await api.patch(`/leads/${id}/status`, { status: next });
      toast.success('Status updated');
      setStatusOpen(false);
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Update failed');
    }
  };

  const confirmAction = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === 'dnd' || confirm.action === 'cold') {
        await api.patch(`/leads/${id}/status`, { status: confirm.action });
        toast.success(`Marked ${confirm.label}`);
        fetchAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Action failed');
    } finally {
      setConfirm(null);
    }
  };

  const scheduleCallback = async () => {
    if (!scheduleAt) return;
    try {
      await api.post(`/leads/${id}/activities`, {
        type: 'call',
        outcome: 'callback',
        scheduled_at: scheduleAt,
        notes: 'Scheduled callback',
      });
      toast.success('Callback scheduled');
      setScheduleOpen(false);
      setScheduleAt('');
      fetchAll();
    } catch {
      toast.error('Could not schedule');
    }
  };

  if (loading && !lead) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-ink-muted">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.back()} className="btn-ghost text-sm">
          <ArrowLeft size={14} /> Back
        </button>
        <EmptyState
          title={err || 'Lead not found'}
          message={`Lead ${id} unavailable. The detail loads from /api/v1/leads/${id} once backend is up.`}
        />
      </div>
    );
  }

  const name = lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unnamed';
  const status = lead.status || lead.lead_status;
  const hasArk = Boolean(lead.ark_account_number || lead.ark_username);
  const hasFtd = Boolean(lead.ftd_at || lead.ftd_amount);

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft size={14} /> Back to leads
      </button>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* LEFT */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Card 1: Header */}
          <div className="card">
            <div className="flex flex-wrap items-start gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold shrink-0"
                style={{ background: colorBg(name), color: colorFg(name) }}
              >
                {initials(name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-ink-primary">{name}</h2>
                  <button
                    onClick={() => setStatusOpen(true)}
                    className="hover:scale-[1.02] transition-transform"
                    title="Change status"
                  >
                    <StatusBadge status={status} color={lead.status_color} size="md" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {lead.phone && (
                    <span className="mono text-ink-secondary inline-flex items-center gap-1.5">
                      <PhoneCall size={12} /> {lead.phone}
                    </span>
                  )}
                  {lead.email && (
                    <span className="text-ink-secondary inline-flex items-center gap-1.5">
                      <Mail size={12} /> {lead.email}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lead.whatsapp && (
                  <a
                    href={`https://wa.me/${(lead.whatsapp || '').replace(/\D/g, '')}`}
                    target="_blank" rel="noreferrer"
                    className="btn-ghost text-sm"
                    title="WhatsApp"
                  >
                    <MessageSquare size={14} />
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="btn-ghost text-sm" title="Email">
                    <Mail size={14} />
                  </a>
                )}
                {canManage && (
                  <button className="btn-ghost text-sm" onClick={() => toast('Reassign coming with users API')}>
                    <UserCog size={14} /> Reassign
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Basic Info */}
          <InfoCard title="Basic Info" icon={Tag}>
            <Grid>
              <Field label="Language"          value={lead.language} />
              <Field label="Preferred Language" value={lead.preferred_language} />
              <Field label="City"              value={lead.city} icon={MapPin} />
              <Field label="State"             value={lead.state} />
              <Field label="Contact Method"    value={lead.contact_method} />
              <Field label="Lead Source"       value={lead.source} />
              <Field label="Campaign"          value={lead.campaign_name || lead.campaign} />
              <Field label="Department"        value={lead.department} />
              <Field label="Consent Date"      value={lead.consent_date ? dayjs(lead.consent_date).format('DD MMM YYYY') : '—'} />
            </Grid>
          </InfoCard>

          {/* Card 3: Trading Profile */}
          <InfoCard title="Trading Profile" icon={Building}>
            <Grid>
              <Field label="Trading Experience" value={lead.trading_experience} />
              <Field label="Current Platform"   value={lead.current_platform} />
              <Field label="Preferred Market"   value={lead.preferred_market} />
              <Field label="Date of Birth"      value={lead.date_of_birth ? dayjs(lead.date_of_birth).format('DD MMM YYYY') : '—'} />
            </Grid>
          </InfoCard>

          {/* Card 4: ARK Terminal */}
          <div
            className={clsx(
              'card border-l-[4px]',
              hasArk ? 'border-l-amber-400' : 'border-l-slate-300'
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-2">
                <Zap size={14} className="text-amber-500" /> ARK Terminal
              </h3>
              <ArkStatusIndicator status={status} hasArk={hasArk} hasFtd={hasFtd} />
            </div>
            <Grid>
              <Field label="ARK Username"    value={lead.ark_username} mono />
              <Field label="Account Number"  value={lead.ark_account_number} mono />
              <Field label="UID"             value={lead.ark_uid} mono />
              <Field label="Account Opened"  value={lead.account_opened_at ? dayjs(lead.account_opened_at).format('DD MMM YYYY, HH:mm') : '—'} />
              <Field label="Last Activity"   value={lead.ark_last_activity_at ? dayjs(lead.ark_last_activity_at).fromNow() : '—'} />
              <Field label="FTD Date"        value={lead.ftd_at ? dayjs(lead.ftd_at).format('DD MMM YYYY') : '—'} />
              <Field
                label="FTD Amount"
                value={lead.ftd_amount ? `₹${inrFormat(lead.ftd_amount)}` : '—'}
                accent={lead.ftd_amount ? 'text-emerald-700 font-semibold' : ''}
              />
            </Grid>
          </div>

          {/* Card 5: Campaign Info */}
          <InfoCard title="Campaign Info" icon={Megaphone}>
            <Grid>
              <Field label="Campaign Name" value={lead.campaign_name || lead.campaign} />
              <Field label="Ad Set"        value={lead.ad_set_name} />
              <Field label="Ad Name"       value={lead.ad_name} />
              <Field label="Platform"      value={lead.platform} pill />
              <Field label="Facebook Lead ID" value={lead.facebook_lead_id} mono />
            </Grid>
          </InfoCard>

          {/* Card 6: Interaction Stats */}
          <div className="card">
            <h3 className="text-sm font-semibold text-ink-primary mb-3">Interaction Stats</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <MiniStat icon="📞" label="Total Calls" value={lead.total_calls ?? 0} />
              <MiniStat icon="⏱" label="Duration" value={formatDuration(lead.total_call_seconds || 0)} />
              <MiniStat icon="💬" label="Sent" value={lead.messages_sent ?? 0} />
              <MiniStat icon="📥" label="Received" value={lead.messages_received ?? 0} />
              <MiniStat icon="🔁" label="Follow-ups" value={lead.followups ?? 0} />
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:w-80 lg:shrink-0 space-y-3">
          <div className="lg:sticky lg:top-[72px] space-y-3">
            <button
              onClick={() => setActivityOpen(true)}
              className="btn-primary w-full text-sm"
            >
              <Activity size={14} /> Log Activity
            </button>

            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-ink-primary">Activity Feed</h3>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {activities.length === 0 ? (
                  <div className="p-6 text-center text-sm text-ink-muted">No activity yet</div>
                ) : (
                  <ul>
                    {activities.map((a) => <ActivityItem key={a.id} item={a} />)}
                  </ul>
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-ink-primary mb-3">Quick Actions</h3>
              <div className="space-y-1.5">
                <QuickAction icon={Calendar} label="Schedule Callback" onClick={() => setScheduleOpen(true)} />
                <QuickAction icon={BanIcon}  label="Mark DND"  tone="danger" onClick={() => setConfirm({ action: 'dnd', label: 'DND' })} />
                <QuickAction icon={Snowflake} label="Mark Cold" tone="muted" onClick={() => setConfirm({ action: 'cold', label: 'Cold' })} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ActivityModal
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        leadId={id}
        onSaved={fetchAll}
      />

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Change Status"
        description="Pick the new lead status."
      >
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => patchStatus(s)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-150',
                s === status
                  ? 'border-accent bg-accent/5 text-ink-primary'
                  : 'border-slate-200 hover:border-slate-300 text-ink-secondary'
              )}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: statusColor(s) }} />
              <span className="capitalize">{s.replaceAll('_', ' ')}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={`Mark as ${confirm?.label}?`}
        description="This will change the lead status."
        footer={
          <>
            <button className="btn-ghost text-sm" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn-danger text-sm" onClick={confirmAction}>Confirm</button>
          </>
        }
      >
        <p className="text-sm text-ink-secondary">
          You can revert this later from the status dropdown.
        </p>
      </Modal>

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule Callback"
        description="Pick a date and time."
        footer={
          <>
            <button className="btn-ghost text-sm" onClick={() => setScheduleOpen(false)}>Cancel</button>
            <button className="btn-primary text-sm" onClick={scheduleCallback} disabled={!scheduleAt}>Schedule</button>
          </>
        }
      >
        <input
          type="datetime-local"
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          className="input"
        />
      </Modal>
    </div>
  );
}

/* ---------- helpers ---------- */
function ArkStatusIndicator({ status, hasArk, hasFtd }) {
  if (hasFtd || status === 'ftd_done') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Wallet size={12} /> FTD Done
      </span>
    );
  }
  if (hasArk || status === 'account_opened') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
        ✓ Account Opened
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
      No Account
    </span>
  );
}

function InfoCard({ title, icon: Icon, children }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-ink-primary mb-3 inline-flex items-center gap-2">
        {Icon && <Icon size={14} className="text-ink-muted" />} {title}
      </h3>
      {children}
    </div>
  );
}

function Grid({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function Field({ label, value, mono, icon: Icon, accent, pill }) {
  const shown = value === 0 || value ? value : '—';
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted mb-0.5 inline-flex items-center gap-1">
        {Icon && <Icon size={10} />} {label}
      </p>
      {pill && shown !== '—' ? (
        <span className="badge bg-slate-100 text-ink-primary text-xs">{shown}</span>
      ) : (
        <p className={clsx('text-sm text-ink-primary truncate', mono && 'mono text-xs', accent)}>
          {shown}
        </p>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value }) {
  return (
    <div className="rounded-lg bg-surface-alt px-3 py-2.5 text-center">
      <div className="text-base mb-0.5">{icon}</div>
      <p className="mono text-sm font-semibold text-ink-primary tabular-nums leading-none">{value}</p>
      <p className="text-[10px] text-ink-muted mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function formatDuration(sec) {
  const m = Math.floor((sec || 0) / 60);
  const s = (sec || 0) % 60;
  return `${m}m ${s}s`;
}

function ActivityItem({ item }) {
  const ICONS = { call: PhoneCall, note: StickyNote, whatsapp: MessageSquare, email: Mail, status_change: ChevronRight, ark: Zap };
  const Icon = ICONS[item.type] || Activity;
  const isArk = item.type === 'ark';
  const isStatusChange = item.type === 'status_change';

  return (
    <li className={clsx('px-4 py-3 border-b border-slate-50 hover:bg-surface-alt transition-colors', isArk && 'border-l-2 border-l-amber-400')}>
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 mt-0.5">
          <Icon size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-primary truncate">
              {item.actor_name || item.user?.name || 'System'}
            </p>
            <span className="mono text-[10px] text-ink-muted whitespace-nowrap">
              {item.created_at ? dayjs(item.created_at).fromNow() : ''}
            </span>
          </div>

          {isStatusChange ? (
            <p className="text-xs text-ink-secondary mt-0.5">
              <span className="text-ink-primary">{item.from_status}</span>
              <span className="text-accent mx-1">→</span>
              <span className="text-ink-primary">{item.to_status}</span>
            </p>
          ) : item.type === 'call' ? (
            <div className="mt-1 space-y-1">
              <div className="flex flex-wrap gap-1.5">
                {item.duration_seconds !== undefined && (
                  <span className="badge bg-slate-100 text-slate-700 text-[10px]">
                    <Clock size={9} className="mr-1" />
                    {formatDuration(item.duration_seconds)}
                  </span>
                )}
                {item.outcome && (
                  <span className="badge bg-blue-50 text-blue-700 text-[10px]">{item.outcome.replaceAll('_', ' ')}</span>
                )}
              </div>
              {item.notes && <p className="text-xs text-ink-secondary">{item.notes}</p>}
            </div>
          ) : (
            <p className="text-xs text-ink-secondary mt-0.5 whitespace-pre-line">{item.content || item.notes || '—'}</p>
          )}
        </div>
      </div>
    </li>
  );
}

function QuickAction({ icon: Icon, label, onClick, tone = 'default' }) {
  const toneClass = {
    default: 'text-ink-secondary hover:text-ink-primary hover:bg-surface-alt',
    danger:  'text-red-600 hover:bg-red-50',
    muted:   'text-slate-500 hover:text-ink-primary hover:bg-surface-alt',
  }[tone];
  return (
    <button
      onClick={onClick}
      className={clsx('w-full text-left text-sm flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors duration-150', toneClass)}
    >
      <Icon size={14} /> {label}
    </button>
  );
}
