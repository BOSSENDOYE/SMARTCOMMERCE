<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    // GET /superadmin/analytics
    public function index(): \Illuminate\Http\JsonResponse
    {
        $now = now();

        // ── Connectés maintenant (token utilisé dans les 30 dernières minutes) ──
        $activeNow = DB::table('personal_access_tokens as t')
            ->join('users as u', fn($j) => $j->on('u.id', '=', DB::raw('t.tokenable_id::bigint'))
                ->where('t.tokenable_type', 'App\\Models\\User'))
            ->where('t.last_used_at', '>=', $now->copy()->subMinutes(30))
            ->whereNull('u.deleted_at')
            ->select('u.id', 'u.name', 'u.store_id', 't.last_used_at')
            ->orderByDesc('t.last_used_at')
            ->get();

        // ── Connexions aujourd'hui (sessions créées aujourd'hui) ─────────────────
        $todaySessions = DB::table('personal_access_tokens')
            ->where('tokenable_type', 'App\\Models\\User')
            ->whereDate('created_at', $now->toDateString())
            ->count();

        $todayUniqueUsers = DB::table('personal_access_tokens')
            ->where('tokenable_type', 'App\\Models\\User')
            ->whereDate('created_at', $now->toDateString())
            ->distinct('tokenable_id')
            ->count('tokenable_id');

        // ── Connexions par jour — 30 derniers jours ───────────────────────────────
        $sessionsByDay = DB::table('personal_access_tokens')
            ->where('tokenable_type', 'App\\Models\\User')
            ->where('created_at', '>=', $now->copy()->subDays(29)->startOfDay())
            ->selectRaw("DATE(created_at) as day, COUNT(*) as sessions, COUNT(DISTINCT tokenable_id) as unique_users")
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        // ── Remplir les jours sans données avec 0 ────────────────────────────────
        $sessionsByDayMap = $sessionsByDay->keyBy('day');
        $filledDays = collect();
        for ($i = 29; $i >= 0; $i--) {
            $day = $now->copy()->subDays($i)->toDateString();
            $filledDays->push([
                'day'          => $day,
                'sessions'     => (int) ($sessionsByDayMap[$day]->sessions     ?? 0),
                'unique_users' => (int) ($sessionsByDayMap[$day]->unique_users ?? 0),
            ]);
        }

        // ── Top organisations actives (7 derniers jours) ─────────────────────────
        $topOrgs = DB::table('personal_access_tokens as t')
            ->join('users as u', DB::raw('u.id::text'), '=', DB::raw('t.tokenable_id::text'))
            ->join('stores as s', 's.id', '=', 'u.store_id')
            ->leftJoin('organizations as o', 'o.id', '=', 's.organization_id')
            ->where('t.tokenable_type', 'App\\Models\\User')
            ->where('t.created_at', '>=', $now->copy()->subDays(7))
            ->whereNull('u.deleted_at')
            ->selectRaw("COALESCE(o.name, s.name) as org_name, COUNT(*) as sessions, COUNT(DISTINCT u.id) as users")
            ->groupBy('org_name')
            ->orderByDesc('sessions')
            ->limit(10)
            ->get();

        // ── Totaux généraux ───────────────────────────────────────────────────────
        $totalUsers = DB::table('users')->whereNull('deleted_at')->where('is_active', true)->count();
        $totalSessions30d = DB::table('personal_access_tokens')
            ->where('tokenable_type', 'App\\Models\\User')
            ->where('created_at', '>=', $now->copy()->subDays(30))
            ->count();

        return response()->json([
            'active_now'          => $activeNow,
            'active_now_count'    => $activeNow->count(),
            'today_sessions'      => $todaySessions,
            'today_unique_users'  => $todayUniqueUsers,
            'sessions_by_day'     => $filledDays,
            'top_orgs'            => $topOrgs,
            'total_users'         => $totalUsers,
            'total_sessions_30d'  => $totalSessions30d,
        ]);
    }
}
