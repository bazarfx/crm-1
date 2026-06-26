'use client';

import { useRouter } from 'next/navigation';
import {
  MoreHorizontal, Pencil, UserPlus, Users, Crown, RotateCw, Settings2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const TYPE_LABEL = { telesales: 'Telesales', senior: 'Senior', other: 'Other' };

export default function GroupCard({ group, onAddMember, onManage }) {
  const router = useRouter();
  const members = group.members || [];
  const seniorCount = members.filter((m) => m.role === 'senior').length;
  const teleCount = members.filter((m) => m.role === 'tele_sales').length;
  const shown = members.slice(0, 6);
  const overflow = members.length - shown.length;

  const split = [];
  if (teleCount) split.push(`${teleCount} teleseller${teleCount === 1 ? '' : 's'}`);
  if (seniorCount) split.push(`${seniorCount} senior${seniorCount === 1 ? '' : 's'}`);

  return (
    <div className={cn(
      'rounded-xl border bg-card shadow-sm transition-all hover:shadow-md hover:border-foreground/20',
      group.is_active === false && 'opacity-75',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{group.name}</p>
            {group.language && <LanguageBadge language={group.language} size="xs" />}
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">
              {TYPE_LABEL[group.type] || group.type}
            </Badge>
            {group.is_active === false && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30">
                Inactive
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {members.length} member{members.length === 1 ? '' : 's'}
            {split.length > 0 && <span className="opacity-70"> · {split.join(' · ')}</span>}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" aria-label={`Actions for ${group.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => router.push(`/groups/${group.id}/edit`)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit group
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddMember(group)}>
              <UserPlus className="h-3.5 w-3.5 mr-2" /> Add member
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onManage(group)}>
              <Settings2 className="h-3.5 w-3.5 mr-2" /> Manage members
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {members.length === 0 ? (
          <button
            type="button"
            onClick={() => onAddMember(group)}
            className="w-full rounded-lg border border-dashed py-4 flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Users className="h-4 w-4" />
            <span className="text-xs">No members yet — add one</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onManage(group)}
            className="flex items-center -space-x-2 group/avatars"
            title="Manage members"
          >
            {shown.map((m) => (
              <span
                key={m.id}
                className="relative h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium ring-2 ring-card"
              >
                {m.first_name?.[0]}{m.last_name?.[0]}
                {m.role === 'senior' && (
                  <Crown className="absolute -top-1 -right-1 h-3 w-3 text-amber-500" />
                )}
              </span>
            ))}
            {overflow > 0 && (
              <span className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-medium ring-2 ring-card">
                +{overflow}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Round-robin footer */}
      <div className="px-4 py-2 border-t flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <RotateCw className="h-3 w-3" />
        Round-robin · {members.length} in rotation
      </div>
    </div>
  );
}
