<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CrmLead;
use App\Models\CrmActivity;
use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class CrmController extends Controller
{
    // ═══════════════════════════════════════════════════════════════════════════
    // STATISTIQUES
    // ═══════════════════════════════════════════════════════════════════════════

    public function stats(Request $request)
    {
        $storeId = $request->query('store_id', Auth::user()->store_id);

        $base = CrmLead::where('store_id', $storeId)->whereNotIn('stage', ['lost']);

        return response()->json([
            'total'          => CrmLead::where('store_id', $storeId)->count(),
            'by_stage'       => CrmLead::where('store_id', $storeId)
                ->selectRaw('stage, COUNT(*) as count, COALESCE(SUM(expected_amount), 0) as value')
                ->groupBy('stage')
                ->get()
                ->keyBy('stage'),
            'pipeline_value' => $base->sum('expected_amount'),
            'won_count'      => CrmLead::where('store_id', $storeId)->where('stage', 'won')->count(),
            'won_value'      => CrmLead::where('store_id', $storeId)->where('stage', 'won')->sum('expected_amount'),
            'overdue_tasks'  => CrmActivity::whereHas('lead', fn($q) => $q->where('store_id', $storeId))
                ->whereNull('completed_at')
                ->where('scheduled_at', '<', now())
                ->count(),
            'activities_today' => CrmActivity::whereHas('lead', fn($q) => $q->where('store_id', $storeId))
                ->whereDate('scheduled_at', today())
                ->count(),
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LEADS — CRUD
    // ═══════════════════════════════════════════════════════════════════════════

    public function index(Request $request)
    {
        $storeId = $request->query('store_id', Auth::user()->store_id);

        $q = CrmLead::with(['client:id,name,phone', 'assignedTo:id,name'])
            ->where('store_id', $storeId)
            ->orderByDesc('updated_at');

        if ($request->filled('stage')) {
            $q->where('stage', $request->stage);
        }
        if ($request->filled('assigned_to')) {
            $q->where('assigned_to', $request->assigned_to);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $q->where(function ($qq) use ($s) {
                $qq->where('title', 'like', "%{$s}%")
                   ->orWhere('contact_name', 'like', "%{$s}%")
                   ->orWhere('contact_phone', 'like', "%{$s}%")
                   ->orWhere('company_name', 'like', "%{$s}%")
                   ->orWhereHas('client', fn($c) => $c->where('name', 'like', "%{$s}%"));
            });
        }
        if ($request->boolean('overdue')) {
            $q->where('expected_close_date', '<', now())
              ->whereNotIn('stage', ['won', 'lost']);
        }
        if ($request->filled('pipeline_id')) {
            $q->where('pipeline_id', $request->pipeline_id);
        }

        // Vue Kanban : retourner groupé par stage
        if ($request->boolean('kanban')) {
            $leads = $q->get()->append(['display_name', 'display_phone']);
            return response()->json($leads->groupBy('stage'));
        }

        return response()->json($q->paginate($request->integer('per_page', 30)));
    }

    public function store(Request $request)
    {
        if (!$request->filled('store_id') && Auth::user()?->store_id) {
            $request->merge(['store_id' => Auth::user()->store_id]);
        }

        $data = $request->validate([
            'store_id'            => 'required|exists:stores,id',
            'pipeline_id'         => 'nullable|exists:crm_pipelines,id',
            'title'               => 'required|string|max:255',
            'client_id'           => 'nullable|exists:clients,id',
            'contact_name'        => 'nullable|string|max:150',
            'contact_phone'       => 'nullable|string|max:30',
            'contact_email'       => 'nullable|email|max:150',
            'company_name'        => 'nullable|string|max:150',
            'stage'               => 'nullable|in:new,qualified,proposal,negotiation,won,lost',
            'source'              => 'nullable|in:walk_in,referral,phone,whatsapp,social,website,email,other',
            'probability'         => 'nullable|integer|min:0|max:100',
            'expected_amount'     => 'nullable|numeric|min:0',
            'expected_close_date' => 'nullable|date',
            'assigned_to'         => 'nullable|exists:users,id',
            'notes'               => 'nullable|string',
        ]);

        $stage = $data['stage'] ?? 'new';
        $lead  = CrmLead::create([
            ...$data,
            'stage'       => $stage,
            'probability' => $data['probability'] ?? CrmLead::defaultProbability($stage),
            'assigned_to' => $data['assigned_to'] ?? Auth::id(),
        ]);

        return response()->json($lead->load(['client', 'assignedTo']), 201);
    }

    public function show(CrmLead $crmLead)
    {
        $crmLead->load([
            'client',
            'assignedTo:id,name',
            'activities.user:id,name',
        ]);
        $crmLead->append(['display_name', 'display_phone']);

        // Historique des ventes si lié à un client
        if ($crmLead->client_id) {
            $crmLead->client_sales = \App\Models\Sale::where('client_id', $crmLead->client_id)
                ->where('status', 'completed')
                ->select('id', 'reference', 'total_ttc', 'created_at')
                ->orderByDesc('created_at')
                ->limit(5)
                ->get();
        }

        return response()->json($crmLead);
    }

    public function update(Request $request, CrmLead $crmLead)
    {
        $data = $request->validate([
            'title'               => 'sometimes|string|max:255',
            'client_id'           => 'nullable|exists:clients,id',
            'contact_name'        => 'nullable|string|max:150',
            'contact_phone'       => 'nullable|string|max:30',
            'contact_email'       => 'nullable|email|max:150',
            'company_name'        => 'nullable|string|max:150',
            'stage'               => 'sometimes|in:new,qualified,proposal,negotiation,won,lost',
            'source'              => 'nullable|in:walk_in,referral,phone,whatsapp,social,website,email,other',
            'probability'         => 'nullable|integer|min:0|max:100',
            'expected_amount'     => 'nullable|numeric|min:0',
            'expected_close_date' => 'nullable|date',
            'assigned_to'         => 'nullable|exists:users,id',
            'notes'               => 'nullable|string',
            'lost_reason'         => 'nullable|string',
        ]);

        // Transitions de stage
        if (isset($data['stage'])) {
            if ($data['stage'] === 'won'  && $crmLead->stage !== 'won') {
                $data['won_at'] = now();
                $data['lost_at'] = null;
                $data['probability'] = 100;
            }
            if ($data['stage'] === 'lost' && $crmLead->stage !== 'lost') {
                $data['lost_at'] = now();
                $data['won_at'] = null;
                $data['probability'] = 0;
            }
        }

        $crmLead->update($data);
        return response()->json($crmLead->fresh()->load(['client', 'assignedTo'])->append(['display_name', 'display_phone']));
    }

    /** Changer uniquement le stage (drag & drop Kanban) */
    public function moveStage(Request $request, CrmLead $crmLead)
    {
        $data = $request->validate([
            'stage' => 'required|in:new,qualified,proposal,negotiation,won,lost',
        ]);

        $patch = ['stage' => $data['stage']];

        if ($data['stage'] === 'won') {
            $patch['won_at']      = now();
            $patch['lost_at']     = null;
            $patch['probability'] = 100;
        } elseif ($data['stage'] === 'lost') {
            $patch['lost_at']     = now();
            $patch['won_at']      = null;
            $patch['probability'] = 0;
        } else {
            $patch['probability'] = CrmLead::defaultProbability($data['stage']);
        }

        $crmLead->update($patch);
        return response()->json($crmLead->fresh()->append(['display_name', 'display_phone']));
    }

    public function destroy(CrmLead $crmLead)
    {
        $crmLead->delete();
        return response()->json(['message' => 'Lead supprimé.']);
    }

    /** Convertir un lead en client */
    public function convertToClient(CrmLead $crmLead)
    {
        if ($crmLead->client_id) {
            return response()->json(['message' => 'Déjà lié à un client.', 'client_id' => $crmLead->client_id]);
        }

        return DB::transaction(function () use ($crmLead) {
            $client = Client::create([
                'store_id' => $crmLead->store_id,
                'name'     => $crmLead->contact_name ?? $crmLead->company_name ?? $crmLead->title,
                'phone'    => $crmLead->contact_phone,
                'email'    => $crmLead->contact_email,
                'type'     => $crmLead->company_name ? 'company' : 'individual',
                'is_active'=> true,
            ]);

            $crmLead->update([
                'client_id' => $client->id,
                'stage'     => 'won',
                'won_at'    => now(),
                'probability' => 100,
            ]);

            return response()->json([
                'client' => $client,
                'lead'   => $crmLead->fresh()->load('client'),
            ], 201);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTIVITÉS
    // ═══════════════════════════════════════════════════════════════════════════

    public function storeActivity(Request $request, CrmLead $crmLead)
    {
        $data = $request->validate([
            'type'         => 'required|in:call,email,meeting,visit,whatsapp,sms,note,task',
            'title'        => 'required|string|max:255',
            'description'  => 'nullable|string',
            'scheduled_at' => 'nullable|date',
            'completed_at' => 'nullable|date',
        ]);

        $activity = CrmActivity::create([
            ...$data,
            'lead_id'     => $crmLead->id,
            'user_id'     => Auth::id(),
            // Si pas de date planifiée et pas de tâche → marquer comme fait maintenant
            'completed_at' => $data['completed_at'] ?? (
                !isset($data['scheduled_at']) && $data['type'] !== 'task' ? now() : null
            ),
        ]);

        return response()->json($activity->load('user:id,name'), 201);
    }

    public function completeActivity(CrmActivity $crmActivity)
    {
        $crmActivity->update(['completed_at' => now()]);
        return response()->json($crmActivity->fresh());
    }

    public function destroyActivity(CrmActivity $crmActivity)
    {
        $crmActivity->delete();
        return response()->json(['message' => 'Activité supprimée.']);
    }

    /** Toutes les tâches à faire pour le magasin */
    public function tasks(Request $request)
    {
        $storeId = $request->query('store_id', Auth::user()->store_id);

        $tasks = CrmActivity::with(['lead:id,title,contact_name,company_name', 'user:id,name'])
            ->whereHas('lead', fn($q) => $q->where('store_id', $storeId))
            ->whereNull('completed_at')
            ->when($request->filled('assigned_to'), fn($q) => $q->where('user_id', $request->assigned_to))
            ->orderBy('scheduled_at')
            ->limit(50)
            ->get();

        return response()->json($tasks);
    }
}
