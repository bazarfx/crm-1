'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Tag, Briefcase, Settings2, Loader2, Save, Phone, Mail, MessageCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';
import {
  FormPageHeader, FormPageBody, FormSection, Field,
} from '@/components/shared/FormShell';

const EMPTY = {
  first_name: '', last_name: '', phone: '', email: '', whatsapp: '',
  language: '', source: '', department: '', contact_method: '',
  trading_experience: '', preferred_market: '', current_platform: '',
};

export default function NewLeadPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager']}>
      <NewLeadContent />
    </RoleGuard>
  );
}

function NewLeadContent() {
  const router = useRouter();
  const config = useStore((s) => s.config);

  const [form, setForm] = useState(EMPTY);
  const [customFields, setCustomFields] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const opts = useMemo(() => ({
    languages: config?.languages || [
      { value: 'english', label: 'English' }, { value: 'hindi', label: 'Hindi' },
      { value: 'tamil', label: 'Tamil' }, { value: 'telugu', label: 'Telugu' },
      { value: 'kannada', label: 'Kannada' }, { value: 'marathi', label: 'Marathi' },
      { value: 'gujarati', label: 'Gujarati' },
    ],
    sources: config?.sources || [
      { value: 'meta', label: 'Meta Ads' }, { value: 'organic', label: 'Organic' },
      { value: 'referral', label: 'Referral' }, { value: 'manual', label: 'Manual' },
    ],
    departments: config?.departments || [
      { value: 'sales', label: 'Sales' }, { value: 'support', label: 'Support' },
    ],
    contactMethods: config?.contact_methods || [
      { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'email', label: 'Email' },
    ],
    tradingExp: config?.trading_experience || [
      { value: 'none', label: 'None' }, { value: 'beginner', label: 'Beginner' },
      { value: 'intermediate', label: 'Intermediate' }, { value: 'expert', label: 'Expert' },
    ],
    markets: config?.markets || [
      { value: 'equity', label: 'Equity' }, { value: 'commodity', label: 'Commodity' },
      { value: 'forex', label: 'Forex' }, { value: 'derivatives', label: 'Derivatives' },
    ],
  }), [config]);

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.last_name.trim()) e.last_name = 'Required';
    if (!form.phone.trim()) e.phone = 'Required';
    else if (!/^[+\d][\d\s-]{6,}$/.test(form.phone)) e.phone = 'Invalid phone number';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = 'Invalid email';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) {
      toast.error('Check the highlighted fields');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/leads', { ...form, custom_fields: customFields });
      toast.success('Lead created');
      router.push('/leads');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not create lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="-mt-4 lg:-mt-6">
      <FormPageHeader
        icon={User}
        title="Add new lead"
        parent="Leads"
        parentHref="/leads"
        backHref="/leads"
        actions={(
          <>
            <ManageFieldsButton entityType="lead" label="Manage fields" size="sm" />
            <Button variant="outline" size="sm" onClick={() => router.push('/leads')} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {submitting ? 'Saving…' : 'Save lead'}
            </Button>
          </>
        )}
      />

      <FormPageBody>
        <FormSection icon={User} title="Basic" description="Who is this lead and how do you reach them.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            <Field label="First name" required htmlFor="first_name">
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                aria-invalid={!!errors.first_name}
                className={errors.first_name ? 'border-red-500/60 focus-visible:ring-red-500/30' : ''}
              />
              {errors.first_name && <p className="text-[11px] text-red-500 mt-1">{errors.first_name}</p>}
            </Field>
            <Field label="Last name" required htmlFor="last_name">
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                aria-invalid={!!errors.last_name}
                className={errors.last_name ? 'border-red-500/60 focus-visible:ring-red-500/30' : ''}
              />
              {errors.last_name && <p className="text-[11px] text-red-500 mt-1">{errors.last_name}</p>}
            </Field>
            <Field label="Phone" required htmlFor="phone">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  className={`pl-9 font-mono text-xs ${errors.phone ? 'border-red-500/60 focus-visible:ring-red-500/30' : ''}`}
                  placeholder="+91 98765 43210"
                  aria-invalid={!!errors.phone}
                />
              </div>
              {errors.phone && <p className="text-[11px] text-red-500 mt-1">{errors.phone}</p>}
            </Field>
            <Field label="Email" htmlFor="email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value.toLowerCase())}
                  className={`pl-9 ${errors.email ? 'border-red-500/60 focus-visible:ring-red-500/30' : ''}`}
                  placeholder="lead@example.com"
                  aria-invalid={!!errors.email}
                />
              </div>
              {errors.email && <p className="text-[11px] text-red-500 mt-1">{errors.email}</p>}
            </Field>
            <Field label="WhatsApp" htmlFor="whatsapp">
              <div className="relative">
                <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="whatsapp"
                  value={form.whatsapp}
                  onChange={(e) => set('whatsapp', e.target.value)}
                  className="pl-9 font-mono text-xs"
                  placeholder="Same as phone if blank"
                />
              </div>
            </Field>
          </div>
        </FormSection>

        <FormSection icon={Tag} title="Classification" description="How this lead is categorised and routed.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Language">
              <PickList value={form.language} onChange={(v) => set('language', v)} options={opts.languages} placeholder="Select language" />
            </Field>
            <Field label="Lead source">
              <PickList value={form.source} onChange={(v) => set('source', v)} options={opts.sources} placeholder="Select source" />
            </Field>
            <Field label="Department">
              <PickList value={form.department} onChange={(v) => set('department', v)} options={opts.departments} placeholder="Select department" />
            </Field>
            <Field label="Contact method">
              <PickList value={form.contact_method} onChange={(v) => set('contact_method', v)} options={opts.contactMethods} placeholder="Select method" />
            </Field>
          </div>
        </FormSection>

        <FormSection icon={Briefcase} title="Trading profile" description="Optional context that helps the teleseller pitch.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Trading experience">
              <PickList value={form.trading_experience} onChange={(v) => set('trading_experience', v)} options={opts.tradingExp} placeholder="Select experience" />
            </Field>
            <Field label="Preferred market">
              <PickList value={form.preferred_market} onChange={(v) => set('preferred_market', v)} options={opts.markets} placeholder="Select market" />
            </Field>
            <Field label="Current platform" className="sm:col-span-2">
              <Input
                value={form.current_platform}
                onChange={(e) => set('current_platform', e.target.value)}
                placeholder="e.g. Zerodha, Upstox, none"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection icon={Settings2} title="Custom fields" description="Organisation-specific fields defined by your admins.">
          <DynamicFields
            entityType="lead"
            values={customFields}
            onChange={setCustomFields}
            hideEmptySections
          />
        </FormSection>
      </FormPageBody>
    </div>
  );
}

/** Thin wrapper so an unset value renders the placeholder cleanly. */
function PickList({ value, onChange, options, placeholder }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-10">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
