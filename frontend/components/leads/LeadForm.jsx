'use client';

import { forwardRef, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import clsx from 'clsx';
import { Loader2, User, Tag, Briefcase, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/shared/Modal';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';

const SECTIONS = [
  { key: 'basic',     label: 'Basic',          icon: User },
  { key: 'classify',  label: 'Classification', icon: Tag },
  { key: 'trading',   label: 'Trading',        icon: Briefcase },
  { key: 'custom',    label: 'Custom fields',  icon: Settings2 },
];

const Input = forwardRef(function Input(
  { label, error, mono, type = 'text', className, ...rest },
  ref
) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-secondary mb-1.5">{label}</label>
      <input
        ref={ref}
        type={type}
        className={clsx('input', mono && 'mono text-xs', className)}
        {...rest}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
});

const Select = forwardRef(function Select(
  { label, options = [], error, className, children, ...rest },
  ref
) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-secondary mb-1.5">{label}</label>
      <select ref={ref} className={clsx('input', className)} {...rest}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        {children}
      </select>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
});

export default function LeadForm({ open, onClose, onSaved, initial }) {
  const config = useStore((s) => s.config);
  const [section, setSection] = useState('basic');
  const [submitting, setSubmitting] = useState(false);
  // Custom-fields state lives outside react-hook-form because DynamicFields
  // is a controlled, schema-driven component — RHF doesn't help it.
  const [customFields, setCustomFields] = useState(initial?.custom_fields || {});

  useEffect(() => {
    if (open) setCustomFields(initial?.custom_fields || {});
  }, [open, initial]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: initial || {
      first_name: '', last_name: '', phone: '', email: '', whatsapp: '',
      language: '', source: '', department: '', contact_method: '',
      trading_experience: '', preferred_market: '', current_platform: '',
    },
  });

  useEffect(() => {
    if (open) {
      setSection('basic');
      reset(initial || {});
    }
  }, [open, initial, reset]);

  const languages = config?.languages || [
    { value: 'english', label: 'English' }, { value: 'hindi', label: 'Hindi' },
    { value: 'tamil', label: 'Tamil' },     { value: 'telugu', label: 'Telugu' },
    { value: 'kannada', label: 'Kannada' }, { value: 'marathi', label: 'Marathi' },
    { value: 'gujarati', label: 'Gujarati' },
  ];
  const sources = config?.sources || [
    { value: 'meta', label: 'Meta Ads' }, { value: 'organic', label: 'Organic' },
    { value: 'referral', label: 'Referral' }, { value: 'manual', label: 'Manual' },
  ];
  const departments = config?.departments || [
    { value: 'sales', label: 'Sales' }, { value: 'support', label: 'Support' },
  ];
  const contactMethods = config?.contact_methods || [
    { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'email', label: 'Email' },
  ];
  const tradingExp = config?.trading_experience || [
    { value: 'none', label: 'None' }, { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' }, { value: 'expert', label: 'Expert' },
  ];
  const markets = config?.markets || [
    { value: 'equity', label: 'Equity' }, { value: 'commodity', label: 'Commodity' },
    { value: 'forex', label: 'Forex' }, { value: 'derivatives', label: 'Derivatives' },
  ];

  const submit = async (data) => {
    setSubmitting(true);
    try {
      // Merge cf alongside native fields. Backend's leadController.create
      // runs the cf blob through processIncomingCustomFields automatically.
      await api.post('/leads', { ...data, custom_fields: customFields });
      toast.success('Lead created');
      reset();
      setCustomFields({});
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not create lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Lead"
      description="Three short sections — only Basic fields are required."
      size="lg"
      footer={
        <>
          <ManageFieldsButton entityType="lead" label="Manage fields" size="sm" />
          <button className="btn-ghost text-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary text-sm"
            onClick={handleSubmit(submit)}
            disabled={submitting}
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'Saving…' : 'Save Lead'}
          </button>
        </>
      }
    >
      <div className="flex gap-1 mb-5 border-b border-slate-100">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors duration-150 relative',
                active ? 'text-ink-primary font-medium' : 'text-ink-secondary hover:text-ink-primary'
              )}
            >
              <Icon size={14} /> {s.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-accent rounded-full" />}
            </button>
          );
        })}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        {section === 'basic' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="First Name *" error={errors.first_name?.message}
              {...register('first_name', { required: 'Required' })} />
            <Input label="Last Name *" error={errors.last_name?.message}
              {...register('last_name', { required: 'Required' })} />
            <Input label="Phone *" type="tel" mono error={errors.phone?.message}
              {...register('phone', {
                required: 'Required',
                pattern: { value: /^[+\d][\d\s-]{6,}$/, message: 'Invalid phone' },
              })} />
            <Input label="Email" type="email" error={errors.email?.message}
              {...register('email', {
                pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Invalid email' },
              })} />
            <Input label="WhatsApp" mono {...register('whatsapp')} />
          </div>
        )}

        {section === 'classify' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Language" options={languages} {...register('language')} />
            <Select label="Lead Source" options={sources} {...register('source')} />
            <Select label="Department" options={departments} {...register('department')} />
            <Select label="Contact Method" options={contactMethods} {...register('contact_method')} />
          </div>
        )}

        {section === 'trading' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Trading Experience" options={tradingExp} {...register('trading_experience')} />
            <Select label="Preferred Market" options={markets} {...register('preferred_market')} />
            <Input label="Current Platform" {...register('current_platform')} />
          </div>
        )}

        {section === 'custom' && (
          <DynamicFields
            entityType="lead"
            values={customFields}
            onChange={setCustomFields}
          />
        )}
      </form>
    </Modal>
  );
}
