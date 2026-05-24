'use client';

import { useState, useEffect } from 'react';
import { PhoneCall, StickyNote, MessageSquare, Mail, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import Modal from '@/components/shared/Modal';
import api from '@/lib/api';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';

const TABS = [
  { key: 'call',     label: 'Call',     icon: PhoneCall },
  { key: 'note',     label: 'Note',     icon: StickyNote },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { key: 'email',    label: 'Email',    icon: Mail },
];

const OUTCOMES = [
  { value: 'connected', label: 'Connected' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'callback', label: 'Callback Requested' },
];

export default function ActivityModal({ open, onClose, leadId, onSaved }) {
  const [tab, setTab] = useState('call');
  const [submitting, setSubmitting] = useState(false);

  const [callMin, setCallMin] = useState('');
  const [callSec, setCallSec] = useState('');
  const [outcome, setOutcome] = useState('connected');
  const [notes, setNotes] = useState('');
  const [body, setBody] = useState('');
  // Custom fields on the activity itself (e.g. "Outcome category" dropdown
  // defined on lead_activity entity_type). Sent through alongside the
  // native payload; backend's addActivity validates via Terminal BB wiring.
  const [customFields, setCustomFields] = useState({});

  useEffect(() => { if (open) setCustomFields({}); }, [open]);

  const reset = () => {
    setCallMin(''); setCallSec(''); setOutcome('connected'); setNotes(''); setBody('');
    setCustomFields({});
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const nativePayload = tab === 'call'
        ? {
            type: 'call',
            duration_seconds: (Number(callMin || 0) * 60) + Number(callSec || 0),
            outcome,
            notes,
          }
        : { type: tab, content: body };
      const payload = { ...nativePayload, custom_fields: customFields };

      await api.post(`/leads/${leadId}/activities`, payload);
      toast.success('Activity logged');
      reset();
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log Activity"
      description="Record a call, note, WhatsApp, or email."
      size="md"
      footer={
        <>
          <ManageFieldsButton entityType="lead_activity" label="Manage fields" size="sm" />
          <button className="btn-ghost text-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary text-sm" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex gap-1 mb-5 border-b border-slate-100">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors duration-150 relative',
                active ? 'text-ink-primary font-medium' : 'text-ink-secondary hover:text-ink-primary'
              )}
            >
              <Icon size={14} />
              {t.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-accent rounded-full" />}
            </button>
          );
        })}
      </div>

      {tab === 'call' ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">Duration</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} value={callMin} onChange={(e) => setCallMin(e.target.value)} placeholder="0" className="input w-20" />
              <span className="text-sm text-ink-muted">min</span>
              <input type="number" min={0} max={59} value={callSec} onChange={(e) => setCallSec(e.target.value)} placeholder="0" className="input w-20" />
              <span className="text-sm text-ink-muted">sec</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">Outcome</label>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="input">
              {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">Notes</label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
              placeholder="What happened on the call?"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            {tab === 'note' ? 'Note' : tab === 'whatsapp' ? 'Message' : 'Email body'}
          </label>
          <textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input"
            placeholder="Type here…"
          />
        </div>
      )}

      {/* Custom activity fields (lead_activity entity_type). Renders only
          when an admin has defined fields for activities; otherwise the
          DynamicFields component returns null. */}
      <div className="mt-4 pt-4 border-t">
        <DynamicFields
          entityType="lead_activity"
          values={customFields}
          onChange={setCustomFields}
        />
      </div>
    </Modal>
  );
}
