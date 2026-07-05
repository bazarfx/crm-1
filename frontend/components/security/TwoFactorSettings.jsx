'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, ShieldOff, Loader2, KeyRound, Copy, Check,
  AlertCircle, Smartphone, ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  get2FAStatus, setup2FA, enable2FA, disable2FA,
} from '@/lib/twoFactor';

/** Group a secret into 4-char chunks for readable manual entry. */
function chunk(secret) {
  return (secret || '').replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') || '';
}

/* Local numeric-code input, shared by enrol + disable. */
function CodeInput({ value, onChange, autoFocus, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className="relative max-w-[220px]">
      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="123456"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-base font-mono tracking-[0.35em] placeholder:tracking-[0.35em] placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
      />
    </div>
  );
}

export default function TwoFactorSettings() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [err, setErr] = useState(null);

  // Enrollment flow: null → 'setup' (show key + code) → 'backup' (show codes)
  const [stage, setStage] = useState(null);
  const [setupData, setSetupData] = useState(null);   // { secret, otpauth_url }
  const [enrolCode, setEnrolCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [ack, setAck] = useState(false);

  // Disable flow
  const [disarming, setDisarming] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const s = await get2FAStatus();
      setEnabled(!!s.enabled);
    } catch {
      toast.error('Could not load two-factor status');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadStatus(); }, []);

  /* ── Enroll ── */
  const startSetup = async () => {
    setErr(null);
    setBusy(true);
    try {
      const data = await setup2FA();
      setSetupData(data);
      setEnrolCode('');
      setStage('setup');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not start setup. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (enrolCode.length !== 6) return;
    setErr(null);
    setBusy(true);
    try {
      const data = await enable2FA(enrolCode);
      setBackupCodes(data?.backup_codes || []);
      setAck(false);
      setStage('backup');
    } catch (e) {
      setErr(e?.response?.data?.message || 'That code is not valid. Try again.');
      setEnrolCode('');
    } finally {
      setBusy(false);
    }
  };

  const finishEnrollment = () => {
    setEnabled(true);
    setStage(null);
    setSetupData(null);
    setBackupCodes([]);
    setEnrolCode('');
    setAck(false);
    setErr(null);
    toast.success('Two-factor authentication is on');
  };

  const cancelSetup = () => {
    setStage(null);
    setSetupData(null);
    setEnrolCode('');
    setErr(null);
  };

  /* ── Disable ── */
  const confirmDisable = async () => {
    if (disableCode.length !== 6) return;
    setErr(null);
    setBusy(true);
    try {
      await disable2FA(disableCode);
      setEnabled(false);
      setDisarming(false);
      setDisableCode('');
      toast.success('Two-factor authentication disabled');
    } catch (e) {
      setErr(e?.response?.data?.message || 'That code is not valid. Try again.');
      setDisableCode('');
    } finally {
      setBusy(false);
    }
  };

  const copyBackup = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      toast.success('Backup codes copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText((setupData?.secret || '').replace(/\s+/g, ''));
      toast.success('Setup key copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  /* ──────────────── BACKUP CODES (post-enable, shown once) ──────────────── */
  if (stage === 'backup') {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-[13px] text-amber-800 dark:text-amber-200">
            <p className="font-medium">Save your backup codes now.</p>
            <p className="text-amber-700/90 dark:text-amber-300/80 mt-0.5">
              Each code works once if you lose your authenticator. They will not be shown again.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {backupCodes.map((c) => (
            <div
              key={c}
              className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm text-center tracking-wide select-all"
            >
              {c}
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={copyBackup}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy all codes'}
        </Button>

        <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <span className="text-[13px] text-foreground/90">
            I have saved my backup codes in a safe place.
          </span>
        </label>

        <div>
          <Button onClick={finishEnrollment} disabled={!ack}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  /* ──────────────── SETUP (show key + verify code) ──────────────── */
  if (stage === 'setup') {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={cancelSetup}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Cancel
        </button>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
              <Smartphone className="h-4 w-4" />
            </div>
            <div className="text-[13px] text-muted-foreground space-y-2">
              <p className="text-foreground font-medium text-sm">
                Add this account to your authenticator app
              </p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Open Google Authenticator, Authy, or 1Password.</li>
                <li>Choose <span className="text-foreground">Add account → Enter a setup key</span>.</li>
                <li>Paste the key below and save.</li>
                <li>Enter the 6-digit code it generates to finish.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Setup key */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Setup key (manual entry)
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm sm:text-base tracking-wider text-foreground break-all select-all">
              {chunk(setupData?.secret)}
            </code>
            <Button variant="ghost" size="sm" className="h-7" onClick={copyKey}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          {setupData?.otpauth_url && (
            <div className="pt-1 border-t">
              <p className="text-[11px] text-muted-foreground mb-1 mt-2">
                Or paste this otpauth URL into an app that accepts it:
              </p>
              <code className="font-mono text-[11px] text-muted-foreground break-all select-all block">
                {setupData.otpauth_url}
              </code>
            </div>
          )}
        </div>

        {/* Verify */}
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-foreground/80">
            Enter the 6-digit code from your app
          </p>
          <CodeInput
            value={enrolCode}
            onChange={(v) => { setEnrolCode(v); if (err) setErr(null); }}
            autoFocus
            disabled={busy}
          />
        </div>

        {err && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <Button onClick={confirmEnable} disabled={busy || enrolCode.length !== 6}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? 'Verifying…' : 'Verify & enable'}
        </Button>
      </div>
    );
  }

  /* ──────────────── ENABLED STATE ──────────────── */
  if (enabled) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              Two-factor authentication is on
            </p>
            <p className="text-[12px] text-emerald-700/80 dark:text-emerald-300/70">
              You will be asked for a code from your authenticator app each time you sign in.
            </p>
          </div>
        </div>

        {!disarming ? (
          <Button variant="outline" onClick={() => { setDisarming(true); setErr(null); }}>
            <ShieldOff className="h-4 w-4" /> Disable two-factor
          </Button>
        ) : (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-[13px] text-foreground">
              Enter a current 6-digit code to turn two-factor off.
            </p>
            <CodeInput
              value={disableCode}
              onChange={(v) => { setDisableCode(v); if (err) setErr(null); }}
              autoFocus
              disabled={busy}
            />
            {err && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{err}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                onClick={confirmDisable}
                disabled={busy || disableCode.length !== 6}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                {busy ? 'Disabling…' : 'Disable'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setDisarming(false); setDisableCode(''); setErr(null); }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ──────────────── DISABLED STATE (default CTA) ──────────────── */
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground flex-shrink-0">
          <ShieldOff className="h-4.5 w-4.5" />
        </div>
        <div className="text-[13px] text-muted-foreground">
          <p className="text-sm font-medium text-foreground">Two-factor authentication is off</p>
          <p className="mt-0.5">
            Add a second step at sign-in using a time-based code from an authenticator app.
          </p>
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <Button onClick={startSetup} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Enable two-factor authentication
      </Button>
    </div>
  );
}
