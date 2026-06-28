'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Undo2, Check, X, Clock, ExternalLink, ShieldCheck, ShieldOff, CircleDot,
} from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import FilterRail from '@/components/shared/FilterRail';

const STATUS_META = {
  pending:   { label: 'Pending',   color: 'amber',   icon: Clock },
  approved:  { label: 'Approved',  color: 'emerald', icon: ShieldCheck },
  rejected:  { label: 'Rejected',  color: 'red',     icon: ShieldOff },
  cancelled: { label: 'Withdrawn', color: 'slate',   icon: X },
};

const STATUS_BADGE = {
  amber:   'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10',
  emerald: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  red:     'text-red-600 dark:text-red-400 border-red-500/40 bg-red-500/10',
  slate:   'text-slate-600 dark:text-slate-400 border-slate-500/40 bg-slate-500/10',
};

const fmtMoney = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function DealRequestsPage() {
  const { role, user } = useAuth();
  const isApprover = ['super_admin', 'admin'].includes(role);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  // Single consolidated filter-state object (mirrors leads/page.jsx). `status`
  // is the one backend query-param this page sends; '' (or 'all') means no filter.
  const [filters, setFilters] = useState({ status: 'pending' });
  const [activeReview, setActiveReview] = useState(null); // request currently being reviewed
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(null); // 'approve' | 'reject' | 'cancel'

  const statusFilter = filters.status || 'all';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/deals/undo-requests', { params });
      setRequests(unwrap(res)?.items || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load undo requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Live-apply: replace filter state on every rail change. No pagination here
  // (single fixed page of 100), but resetting the list keeps parity with leads.
  const applyFilters = useCallback((next) => {
    setFilters(next);
  }, []);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const r of requests) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [requests]);

  // Status chip spec — single-select, surfaces live counts as a label suffix
  // when a number is meaningful (mirrors the count tiles).
  const filterSpec = useMemo(() => {
    const withCount = (key, label) => {
      const n = counts[key] || 0;
      return n > 0 ? `${label} (${n})` : label;
    };
    return [
      {
        key: 'status',
        label: 'Status',
        kind: 'single',
        glyph: CircleDot,
        tint: 'bg-amber-500/40',
        width: 'w-[220px]',
        allLabel: 'All statuses',
        capitalize: false,
        options: [
          { value: 'pending', label: withCount('pending', 'Pending') },
          { value: 'approved', label: withCount('approved', 'Approved') },
          { value: 'rejected', label: withCount('rejected', 'Rejected') },
          { value: 'cancelled', label: withCount('cancelled', 'Withdrawn') },
        ],
      },
    ];
  }, [counts]);

  const openReview = (req) => {
    setActiveReview(req);
    setReviewNotes('');
  };

  const closeReview = () => {
    if (submittingAction) return;
    setActiveReview(null);
    setReviewNotes('');
  };

  const act = async (action) => {
    if (!activeReview) return;
    setSubmittingAction(action);
    try {
      await api.post(`/deals/undo-requests/${activeReview.id}/${action}`, {
        notes: reviewNotes.trim() || undefined,
      });
      toast.success(
        action === 'approve' ? 'Deal reverted'
          : action === 'reject' ? 'Request rejected'
          : 'Request withdrawn'
      );
      closeReview();
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || `Failed to ${action}`);
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-amber-500" />
            Deal undo requests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isApprover
              ? 'Review requests from telesellers to reverse a closed deal.'
              : 'Your submitted requests to undo a closed deal.'}
          </p>
        </div>

        <FilterRail spec={filterSpec} filters={filters} onChange={applyFilters} />
      </div>

      {/* Status mini-tiles — only meaningful when viewing 'all'. */}
      {statusFilter === 'all' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(STATUS_META).map(([k, meta]) => (
            <Card key={k} className={`border-l-4 ${STATUS_BADGE[meta.color]} bg-card`}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </p>
                  <p className="text-xl font-bold tabular-nums mt-1">{counts[k] || 0}</p>
                </div>
                <meta.icon className="h-5 w-5 opacity-50" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Deal</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Requested by</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Reason</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Submitted</th>
                <th className="p-3 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    No requests {statusFilter === 'all' ? 'yet' : `in "${statusFilter}"`}.
                  </td>
                </tr>
              )}
              {!loading && requests.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.pending;
                const StatusIcon = meta.icon;
                const lead = r.lead || {};
                const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—';
                const requester = r.requestedBy
                  ? `${r.requestedBy.first_name || ''} ${r.requestedBy.last_name || ''}`.trim()
                  : '—';
                const isMine = String(r.requested_by_user_id) === String(user?.id);
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Link
                        href={`/leads/${r.lead_id}`}
                        className="font-medium hover:text-blue-500 dark:hover:text-blue-400 flex items-center gap-1"
                      >
                        {name}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </Link>
                      {lead.phone && (
                        <p className="text-muted-foreground font-mono text-[11px] mt-0.5">
                          {lead.phone}
                        </p>
                      )}
                      {(r.snapshot?.deposited_amount ?? lead.deposited_amount) && (
                        <p className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums text-xs mt-0.5">
                          {fmtMoney(r.snapshot?.deposited_amount ?? lead.deposited_amount)}
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      <p className="text-xs">{requester}</p>
                      {r.requestedBy?.role && (
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {r.requestedBy.role.replace(/_/g, ' ')}
                        </p>
                      )}
                    </td>
                    <td className="p-3 max-w-xs">
                      <p className="text-xs text-foreground/90 line-clamp-3">
                        {r.reason}
                      </p>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${STATUS_BADGE[meta.color]}`}
                      >
                        <StatusIcon className="h-2.5 w-2.5 mr-1" />
                        {meta.label}
                      </Badge>
                      {r.reviewedBy && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          by {r.reviewedBy.first_name} {r.reviewedBy.last_name}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {r.created_at ? dayjs(r.created_at).format('DD MMM, HH:mm') : '—'}
                    </td>
                    <td className="p-3 text-right">
                      {r.status === 'pending' && isApprover ? (
                        <Button size="sm" variant="outline" onClick={() => openReview(r)}>
                          Review
                        </Button>
                      ) : r.status === 'pending' && isMine ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openReview(r)}
                          className="text-amber-700 dark:text-amber-400"
                        >
                          Withdraw
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Review modal */}
      {activeReview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={closeReview}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Undo2 className="h-4 w-4 text-amber-500" />
                  {isApprover
                    ? 'Review undo request'
                    : 'Withdraw your undo request'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1 text-xs">
                  <p>
                    <span className="text-muted-foreground">Lead: </span>
                    <Link
                      href={`/leads/${activeReview.lead_id}`}
                      className="font-medium hover:underline"
                    >
                      {`${activeReview.lead?.first_name || ''} ${activeReview.lead?.last_name || ''}`.trim() || activeReview.lead_id}
                    </Link>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Requested by: </span>
                    {`${activeReview.requestedBy?.first_name || ''} ${activeReview.requestedBy?.last_name || ''}`.trim() || '—'}
                  </p>
                  {(activeReview.snapshot?.deposited_amount) && (
                    <p>
                      <span className="text-muted-foreground">Deposit at request time: </span>
                      <span className="font-mono">
                        {fmtMoney(activeReview.snapshot.deposited_amount)}
                      </span>
                    </p>
                  )}
                </div>

                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Reason given
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{activeReview.reason}</p>
                </div>

                {isApprover && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      <strong>Approving</strong> will clear ftd_at, deposit amount, and
                      closer credit on this lead, and revert its status to{' '}
                      {activeReview.snapshot?.account_opened_at ? '"account_opened"' : '"contacted"'}.
                      The lead&apos;s current assignment stays as-is.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {isApprover ? 'Review notes (optional)' : 'Notes (optional)'}
                  </Label>
                  <Textarea
                    rows={3}
                    placeholder={
                      isApprover
                        ? 'Why approve / reject? Visible to the requester.'
                        : 'Why are you withdrawing this?'
                    }
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeReview}
                    disabled={!!submittingAction}
                  >
                    Cancel
                  </Button>
                  {isApprover ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => act('reject')}
                        disabled={!!submittingAction}
                        className="border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        {submittingAction === 'reject' ? 'Rejecting…' : 'Reject'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => act('approve')}
                        disabled={!!submittingAction}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        {submittingAction === 'approve' ? 'Approving…' : 'Approve & revert'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act('cancel')}
                      disabled={!!submittingAction}
                      className="border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                    >
                      {submittingAction === 'cancel' ? 'Withdrawing…' : 'Withdraw request'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
}
