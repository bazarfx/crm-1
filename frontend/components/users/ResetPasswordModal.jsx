'use client';

import { useState } from 'react';
import { Copy, Check, KeyRound, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import api, { unwrap } from '@/lib/api';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz!@#$';
  let p = '';
  for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

export default function ResetPasswordModal({ open, onOpenChange, user }) {
  const [newPassword, setNewPassword] = useState('');
  const [forceChange, setForceChange] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setNewPassword('');
    setForceChange(true);
    setShowPassword(false);
    setResult(null);
    setCopied(false);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleReset = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await api.patch(`/users/${user.id}/reset-password`, {
        new_password: newPassword,
        force_change_on_next_login: forceChange,
      });
      setResult(unwrap(res));
      toast.success('Password reset');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.new_password);
      setCopied(true);
      toast.success('Password copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  // ── Success view ────────────────────────────────────────────────
  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Check className="h-5 w-5" /> Password reset successful
            </DialogTitle>
            <DialogDescription>
              Share this password with {result.name} securely. This is the only time it
              will be shown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <span className="text-amber-700 dark:text-amber-200">
                For security, this password will NOT be shown again. Copy it now.
              </span>
            </div>

            <div className="space-y-1.5">
              <Label>User</Label>
              <div className="text-sm">
                {result.name}{' '}
                <span className="text-muted-foreground">({result.email})</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>New password</Label>
              <div className="flex gap-2">
                <Input value={result.new_password} readOnly className="font-mono" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {result.force_change && (
              <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <Check className="h-3 w-3" />
                User will be prompted to change this on next login
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>I&rsquo;ve saved it — close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Form view ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Reset password
          </DialogTitle>
          <DialogDescription>
            Set a new password for {user?.first_name} {user?.last_name}. They&rsquo;ll be
            logged out immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>New password</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setNewPassword(generatePassword())}
              >
                Generate strong
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Force change on next login</Label>
              <p className="text-[11px] text-muted-foreground">
                User must set their own password before continuing
              </p>
            </div>
            <Switch checked={forceChange} onCheckedChange={setForceChange} />
          </div>

          <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-2">
            <strong>Note:</strong> For security, we cannot retrieve the user&rsquo;s
            current password (it&rsquo;s encrypted). We can only set a new one.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleReset} disabled={loading || newPassword.length < 6}>
            {loading ? 'Resetting…' : 'Reset password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
