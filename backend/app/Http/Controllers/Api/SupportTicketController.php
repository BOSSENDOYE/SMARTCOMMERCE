<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;
use Illuminate\Http\Request;

class SupportTicketController extends Controller
{
    /** Resolve org ID for the current user (same pattern as categories) */
    private function resolveOrgId(Request $request): ?int
    {
        $user = $request->user();
        if ($user->organization_id) return (int) $user->organization_id;
        if ($user->store_id) {
            return (int) Store::where('id', $user->store_id)->value('organization_id');
        }
        return null; // platform super_admin → sees all
    }

    private function isPlatformAdmin(Request $request): bool
    {
        return $request->user()->organization_id === null
            && $request->user()->hasRole('super_admin');
    }

    // ── List tickets ──────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $orgId = $this->resolveOrgId($request);

        $query = SupportTicket::with(['creator:id,name', 'agent:id,name', 'organization:id,name'])
            ->withCount('messages')
            ->forOrganization($orgId);

        // Tenant: see only own tickets unless super_admin
        if ($orgId && !$request->user()->hasRole('super_admin')) {
            $query->where('created_by', $request->user()->id);
        }

        $query
            ->when($request->status,   fn($q) => $q->where('status', $request->status))
            ->when($request->priority, fn($q) => $q->where('priority', $request->priority))
            ->when($request->category, fn($q) => $q->where('category', $request->category))
            ->when($request->search,   fn($q) => $q->where(fn($q2) => $q2
                ->where('subject', 'ilike', "%{$request->search}%")
                ->orWhere('ticket_number', 'ilike', "%{$request->search}%")
            ))
            ->orderByRaw("CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting_reply' THEN 2 ELSE 3 END")
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END")
            ->orderByDesc('created_at');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    // ── Stats (platform admin dashboard) ─────────────────────────────────────

    public function stats(Request $request)
    {
        $orgId = $this->resolveOrgId($request);
        $base  = SupportTicket::forOrganization($orgId);

        return response()->json([
            'total'          => (clone $base)->count(),
            'open'           => (clone $base)->where('status', 'open')->count(),
            'in_progress'    => (clone $base)->where('status', 'in_progress')->count(),
            'waiting_reply'  => (clone $base)->where('status', 'waiting_reply')->count(),
            'resolved'       => (clone $base)->whereIn('status', ['resolved', 'closed'])->count(),
            'urgent'         => (clone $base)->where('priority', 'urgent')->whereNotIn('status', ['resolved', 'closed'])->count(),
        ]);
    }

    // ── Create ticket ─────────────────────────────────────────────────────────

    public function store(Request $request)
    {
        $data = $request->validate([
            'subject'  => 'required|string|max:200',
            'body'     => 'required|string',
            'category' => 'required|in:bug,question,billing,feature,other',
            'priority' => 'nullable|in:low,normal,high,urgent',
            'store_id' => 'nullable|exists:stores,id',
        ]);

        $user  = $request->user();
        $orgId = $this->resolveOrgId($request);

        $ticket = SupportTicket::create([
            'ticket_number'   => SupportTicket::nextNumber(),
            'organization_id' => $orgId,
            'store_id'        => $data['store_id'] ?? $user->store_id,
            'created_by'      => $user->id,
            'subject'         => $data['subject'],
            'category'        => $data['category'],
            'priority'        => $data['priority'] ?? 'normal',
            'status'          => 'open',
        ]);

        // First message = description du ticket
        SupportTicketMessage::create([
            'ticket_id'   => $ticket->id,
            'user_id'     => $user->id,
            'body'        => $data['body'],
            'is_internal' => false,
        ]);

        return response()->json($ticket->load(['creator:id,name', 'messages.user:id,name']), 201);
    }

    // ── Show ticket + messages ────────────────────────────────────────────────

    public function show(Request $request, SupportTicket $supportTicket)
    {
        $this->authorizeAccess($request, $supportTicket);

        $isAgent = $this->isPlatformAdmin($request) || $request->user()->hasRole('super_admin');

        $ticket = $supportTicket->load([
            'creator:id,name',
            'agent:id,name',
            'organization:id,name',
            'store:id,name',
            'messages' => fn($q) => $isAgent ? $q : $q->where('is_internal', false),
            'messages.user:id,name',
        ]);

        return response()->json($ticket);
    }

    // ── Reply to ticket ───────────────────────────────────────────────────────

    public function reply(Request $request, SupportTicket $supportTicket)
    {
        $this->authorizeAccess($request, $supportTicket);

        $data = $request->validate([
            'body'        => 'required|string',
            'is_internal' => 'boolean',
        ]);

        $user    = $request->user();
        $isAgent = $this->isPlatformAdmin($request) || $user->hasRole('super_admin');

        // Only agents can post internal notes
        $isInternal = $isAgent && ($data['is_internal'] ?? false);

        $message = SupportTicketMessage::create([
            'ticket_id'   => $supportTicket->id,
            'user_id'     => $user->id,
            'body'        => $data['body'],
            'is_internal' => $isInternal,
        ]);

        // Track first response time (agent replying for the first time)
        if ($isAgent && !$isInternal && !$supportTicket->first_response_at) {
            $supportTicket->update(['first_response_at' => now()]);
        }

        // Auto-status transitions
        if (!$isInternal) {
            if ($isAgent && $supportTicket->status === 'open') {
                $supportTicket->update(['status' => 'in_progress']);
            } elseif (!$isAgent && $supportTicket->status === 'waiting_reply') {
                $supportTicket->update(['status' => 'in_progress']);
            }
        }

        return response()->json($message->load('user:id,name'), 201);
    }

    // ── Update status / assign ────────────────────────────────────────────────

    public function updateStatus(Request $request, SupportTicket $supportTicket)
    {
        abort_unless($request->user()->hasRole('super_admin'), 403);

        $data = $request->validate([
            'status'      => 'required|in:open,in_progress,waiting_reply,resolved,closed',
            'assigned_to' => 'nullable|exists:users,id',
        ]);

        $updates = ['status' => $data['status']];

        if (isset($data['assigned_to'])) {
            $updates['assigned_to'] = $data['assigned_to'];
        }

        if (in_array($data['status'], ['resolved', 'closed']) && !$supportTicket->resolved_at) {
            $updates['resolved_at'] = now();
        }

        if ($data['status'] === 'closed' && !$supportTicket->closed_at) {
            $updates['closed_at'] = now();
        }

        $supportTicket->update($updates);

        return response()->json($supportTicket->fresh(['creator:id,name', 'agent:id,name']));
    }

    // ── Close own ticket (tenant) ─────────────────────────────────────────────

    public function close(Request $request, SupportTicket $supportTicket)
    {
        $this->authorizeAccess($request, $supportTicket);

        $supportTicket->update([
            'status'      => 'closed',
            'closed_at'   => now(),
            'resolved_at' => $supportTicket->resolved_at ?? now(),
        ]);

        return response()->json(['ok' => true]);
    }

    // ── Authorization helper ──────────────────────────────────────────────────

    private function authorizeAccess(Request $request, SupportTicket $ticket): void
    {
        $user  = $request->user();
        $orgId = $this->resolveOrgId($request);

        // Platform admin: sees all
        if ($this->isPlatformAdmin($request)) return;

        // Org super_admin: sees all tickets of their org
        if ($user->hasRole('super_admin') && $orgId === (int) $ticket->organization_id) return;

        // Regular user: only own tickets
        if ((int) $ticket->created_by === $user->id) return;

        abort(403, "Accès refusé.");
    }
}
