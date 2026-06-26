'use client';

import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  MoreHorizontal, Pencil, UserPlus, Settings2, Crown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

dayjs.extend(relativeTime);

const TYPE_LABEL = { telesales: 'Telesales', senior: 'Senior', other: 'Other' };

export default function GroupsTable({ groups, onAddMember, onManage }) {
  const router = useRouter();

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b">
            {['Group', 'Members', 'Language', 'Type', 'Created by', 'Updated', ''].map((h, i) => (
              <th key={i} className="text-left px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const members = g.members || [];
            const shown = members.slice(0, 3);
            const overflow = members.length - shown.length;
            const creator = g.creator
              ? `${g.creator.first_name || ''} ${g.creator.last_name || ''}`.trim()
              : null;
            return (
              <tr
                key={g.id}
                className="border-b last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => router.push(`/groups/${g.id}/edit`)}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.name}</span>
                    {g.is_active === false && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center -space-x-2">
                      {shown.map((m) => (
                        <span key={m.id} className="relative h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-medium ring-2 ring-card">
                          {m.first_name?.[0]}{m.last_name?.[0]}
                          {m.role === 'senior' && <Crown className="absolute -top-1 -right-1 h-2.5 w-2.5 text-amber-500" />}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-medium ring-2 ring-card">
                          +{overflow}
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground tabular-nums">{members.length}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {g.language ? <LanguageBadge language={g.language} size="xs" /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{TYPE_LABEL[g.type] || g.type}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{creator || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {g.updated_at || g.updatedAt ? dayjs(g.updated_at || g.updatedAt).fromNow() : '—'}
                </td>
                <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${g.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => router.push(`/groups/${g.id}/edit`)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit group
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onAddMember(g)}>
                        <UserPlus className="h-3.5 w-3.5 mr-2" /> Add member
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onManage(g)}>
                        <Settings2 className="h-3.5 w-3.5 mr-2" /> Manage members
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
