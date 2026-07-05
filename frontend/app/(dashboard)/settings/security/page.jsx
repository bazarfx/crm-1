'use client';

import { ShieldCheck } from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import TwoFactorSettings from '@/components/security/TwoFactorSettings';

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          Security
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage sign-in protection for your account
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            Require a time-based one-time code from an authenticator app in
            addition to your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <TwoFactorSettings />
        </CardContent>
      </Card>
    </div>
  );
}
