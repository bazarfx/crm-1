'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';

export default function ChangePasswordPage() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const hydrated = useStore((s) => s.hydrated);
  const updateUser = useStore((s) => s.updateUser);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    confirm: '',
  });

  // Bounce unauthenticated visitors back to login
  useEffect(() => {
    if (hydrated && !user) router.replace('/login');
  }, [hydrated, user, router]);

  const forced = !!user?.must_change_password;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (form.new_password !== form.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.new_password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const body = forced
        ? { new_password: form.new_password }
        : { current_password: form.current_password, new_password: form.new_password };
      await api.post('/auth/change-password', body);
      toast.success('Password changed. Welcome!');
      updateUser({ must_change_password: false });
      router.replace('/dashboard');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change your password
          </CardTitle>
          <CardDescription>
            {forced
              ? 'Your administrator requires you to set a new password before continuing.'
              : 'Update your account password.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!forced && (
              <div className="space-y-1.5">
                <Label htmlFor="current_password">Current password</Label>
                <Input
                  id="current_password"
                  type={show ? 'text' : 'password'}
                  value={form.current_password}
                  onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="new_password">New password</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setShow((s) => !s)}
                >
                  {show ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                  {show ? 'Hide' : 'Show'}
                </Button>
              </div>
              <Input
                id="new_password"
                type={show ? 'text' : 'password'}
                value={form.new_password}
                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                autoComplete="new-password"
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type={show ? 'text' : 'password'}
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Changing…' : (
                <>
                  Change password <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
