'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import RoleGuard from '@/components/layout/RoleGuard';
import { useModules, iconForModule } from '@/lib/modules';
import LayoutEditor from '@/components/fields/LayoutEditor';

export default function FieldLayoutPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin', 'schema_editor']}>
      <Suspense fallback={(
        <div className="py-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}>
        <LayoutPageContent />
      </Suspense>
    </RoleGuard>
  );
}

function LayoutPageContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { modules } = useModules();

  // Every module (built-in + custom) is arrangeable. Sort by the registry's
  // display_order so the picker order matches the rest of settings.
  const entities = useMemo(
    () => (modules || [])
      .slice()
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map((m) => ({ key: m.key, label: m.label_plural, mod: m })),
    [modules],
  );

  const [entity, setEntity] = useState(() => sp.get('entity') || 'lead');

  // Keep the selection valid as the registry resolves.
  useEffect(() => {
    if (entities.length && !entities.some((e) => e.key === entity)) {
      setEntity(entities[0].key);
    }
  }, [entities, entity]);

  const current = entities.find((e) => e.key === entity);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/settings/fields?entity=${entity}`)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Fields
            </button>
          </div>
          <h1 className="text-xl font-semibold tracking-tight mt-1">Field layout</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Arrange fields into sections and reorder them with drag &amp; drop. Changes
            take effect across forms and detail pages the moment you save.
          </p>
        </div>

        <div className="min-w-[220px]">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Module</label>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="h-9 text-sm mt-1">
              <SelectValue placeholder="Pick a module…" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => {
                const Icon = iconForModule(e.mod);
                return (
                  <SelectItem key={e.key} value={e.key}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {e.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Remount the editor when the entity changes so its internal state
          (sections, dirty baseline) resets cleanly per module. */}
      <LayoutEditor key={entity} entityType={entity} entityLabel={current?.label} />
    </div>
  );
}
