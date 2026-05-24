'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Users2, Crown, AlertCircle, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import { LANGUAGES } from '@/lib/languages';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';

export default function GroupDetailPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin', 'floor_manager']}>
      <GroupDetailContent />
    </RoleGuard>
  );
}

function GroupDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get(`/groups/${id}/with-fields`).then((r) => unwrap(r)),
      api.get(`/groups/${id}/members`).then((r) => unwrap(r) || []).catch(() => []),
    ])
      .then(([g, m]) => {
        setGroup(g);
        setMembers(m);
        setForm({
          name: g.name || '',
          type: g.type || 'telesales',
          language: g.language || '',
          description: g.description || '',
          is_active: g.is_active !== false,
          custom_fields: g.custom_fields || {},
        });
      })
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load group'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (id) load(); /* eslint-disable-next-line */ }, [id]);

  const updateField = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/groups/${id}`, form);
      const updated = unwrap(res);
      setGroup(updated);
      setForm({
        name: updated.name || '',
        type: updated.type || 'telesales',
        language: updated.language || '',
        description: updated.description || '',
        is_active: updated.is_active !== false,
        custom_fields: updated.custom_fields || {},
      });
      setHasChanges(false);
      toast.success('Group updated');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from this group?`)) return;
    try {
      await api.delete(`/groups/${id}/members/${userId}`);
      toast.success('Removed');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    }
  };

  if (loading) return <p className="text-xs text-muted-foreground p-6">Loading…</p>;
  if (!group) return <p className="text-sm text-muted-foreground p-6">Group not found.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/groups')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Users2 className="h-4 w-4 text-muted-foreground" /> {group.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              {group.language && <LanguageBadge language={group.language} size="xs" />}
              <span className="capitalize">{group.type || '—'}</span>
              <Badge
                variant="outline"
                className={group.is_active
                  ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]'
                  : 'text-muted-foreground text-[10px]'}
              >
                {group.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <span className="text-muted-foreground">· {members.length} member{members.length === 1 ? '' : 's'}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ManageFieldsButton entityType="group" size="sm" />
          {hasChanges && (
            <Button onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle>Settings</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={form.name || ''} onChange={(e) => updateField('name', e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select value={form.type} onValueChange={(v) => updateField('type', v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="telesales">Telesales</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Language</Label>
                  <Select value={form.language || ''} onValueChange={(v) => updateField('language', v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea value={form.description || ''} onChange={(e) => updateField('description', e.target.value)} rows={2} className="text-sm" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <Label className="text-xs">Active</Label>
                <Switch checked={!!form.is_active} onCheckedChange={(v) => updateField('is_active', v)} />
              </div>
              {/* Custom fields */}
              <DynamicFields
                entityType="group"
                values={form.custom_fields || {}}
                onChange={(cf) => updateField('custom_fields', cf)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Members ({members.length})</CardTitle></CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No members yet. Add via the Groups page.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {members.map((m) => (
                    <div key={m.membership_id} className="flex items-center justify-between gap-2 group">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                          {m.user?.first_name?.[0]}{m.user?.last_name?.[0]}
                        </div>
                        <span className="text-xs truncate">
                          {m.user?.first_name} {m.user?.last_name}
                        </span>
                        {m.is_senior && (
                          <Crown className="h-2.5 w-2.5 text-amber-400 flex-shrink-0" aria-label="Senior" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMember(m.user?.id, m.user?.first_name)}
                        className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-3 text-xs text-blue-700 dark:text-blue-300 flex gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              Round-robin assigns matching-language leads to active members of this group.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
