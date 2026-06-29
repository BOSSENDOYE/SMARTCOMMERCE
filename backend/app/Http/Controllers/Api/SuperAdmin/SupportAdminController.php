<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;
use Illuminate\Http\Request;

class SupportAdminController extends Controller
{
    // ── Stats dashboard ───────────────────────────────────────────────────────

    public function stats()
    {
        $base = SupportTicket::query();

        return response()->json([
            'total'         => (clone $base)->count(),
            'open'          => (clone $base)->where('status', 'open')->count(),
            'in_progress'   => (clone $base)->where('status', 'in_progress')->count(),
            'waiting_reply' => (clone $base)->where('status', 'waiting_reply')->count(),
            'resolved'      => (clone $base)->whereIn('status', ['resolved', 'closed'])->count(),
            'urgent'        => (clone $base)->where('priority', 'urgent')->whereNotIn('status', ['resolved', 'closed'])->count(),
        ]);
    }

    // ── List all tickets ──────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $query = SupportTicket::with([
                'creator:id,name',
                'organization:id,name',
                'store:id,name',
            ])
            ->withCount('messages')
            ->when($request->status,   fn($q) => $q->where('status', $request->status))
            ->when($request->priority, fn($q) => $q->where('priority', $request->priority))
            ->when($request->category, fn($q) => $q->where('category', $request->category))
            ->when($request->organization_id, fn($q) => $q->where('organization_id', $request->organization_id))
            ->when($request->search, fn($q) => $q->where(fn($q2) => $q2
                ->where('subject', 'ilike', "%{$request->search}%")
                ->orWhere('ticket_number', 'ilike', "%{$request->search}%")
            ))
            ->orderByRaw("CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting_reply' THEN 2 ELSE 3 END")
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at');

        return response()->json($query->paginate($request->per_page ?? 30));
    }

    // ── Show ticket + thread ──────────────────────────────────────────────────

    public function show(SupportTicket $supportTicket)
    {
        return response()->json(
            $supportTicket->load([
                'creator:id,name',
                'organization:id,name',
                'store:id,name',
                'messages',
                'messages.user:id,name',
                'messages.superAdmin:id,name',
            ])
        );
    }

    // ── Reply as support agent ────────────────────────────────────────────────

    public function reply(Request $request, SupportTicket $supportTicket)
    {
        $data  = $request->validate(['body' => 'required|string', 'is_internal' => 'boolean']);
        $admin = $request->user(); // SuperAdmin model

        $message = SupportTicketMessage::create([
            'ticket_id'       => $supportTicket->id,
            'user_id'         => null,
            'super_admin_id'  => $admin->id,
            'author_name'     => $admin->name,
            'body'            => $data['body'],
            'is_internal'     => $data['is_internal'] ?? false,
        ]);

        // Track first response time
        if (!($data['is_internal'] ?? false) && !$supportTicket->first_response_at) {
            $supportTicket->update(['first_response_at' => now()]);
        }

        // Auto-transition status: open → in_progress after first agent reply
        if (!($data['is_internal'] ?? false) && $supportTicket->status === 'open') {
            $supportTicket->update(['status' => 'in_progress']);
        }

        return response()->json(array_merge($message->toArray(), [
            'author_name' => $admin->name,
            'is_admin'    => true,
        ]), 201);
    }

    // ── Update status ─────────────────────────────────────────────────────────

    public function updateStatus(Request $request, SupportTicket $supportTicket)
    {
        $data = $request->validate([
            'status' => 'required|in:open,in_progress,waiting_reply,resolved,closed',
        ]);

        $updates = ['status' => $data['status']];

        if (in_array($data['status'], ['resolved', 'closed']) && !$supportTicket->resolved_at) {
            $updates['resolved_at'] = now();
        }
        if ($data['status'] === 'closed' && !$supportTicket->closed_at) {
            $updates['closed_at'] = now();
        }

        $supportTicket->update($updates);

        return response()->json($supportTicket->fresh(['creator:id,name', 'organization:id,name']));
    }
}
