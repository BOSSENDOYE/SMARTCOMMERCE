<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CrmPipeline;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CrmPipelineController extends Controller
{
    /** GET /crm/pipelines?store_id= */
    public function index(Request $request)
    {
        $storeId = $request->query('store_id', $request->user()->store_id);

        $pipelines = CrmPipeline::where('store_id', $storeId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->withCount('leads')
            ->get();

        return response()->json($pipelines);
    }

    /** POST /crm/pipelines */
    public function store(Request $request)
    {
        $request->validate([
            'name'        => 'required|string|max:100',
            'description' => 'nullable|string|max:500',
            'is_default'  => 'boolean',
        ]);

        $storeId = $request->user()->store_id;

        return DB::transaction(function () use ($request, $storeId) {
            // If new pipeline is set as default, unset others
            if ($request->boolean('is_default')) {
                CrmPipeline::where('store_id', $storeId)->update(['is_default' => false]);
            }

            $count = CrmPipeline::where('store_id', $storeId)->count();

            $pipeline = CrmPipeline::create([
                'store_id'    => $storeId,
                'name'        => $request->name,
                'description' => $request->description ?? null,
                'is_default'  => $request->boolean('is_default', $count === 0), // first one = default
                'sort_order'  => $count,
            ]);

            return response()->json($pipeline->loadCount('leads'), 201);
        });
    }

    /** PUT /crm/pipelines/{pipeline} */
    public function update(Request $request, CrmPipeline $pipeline)
    {
        $this->authorizeStore($request, $pipeline);

        $request->validate([
            'name'        => 'required|string|max:100',
            'description' => 'nullable|string|max:500',
            'is_default'  => 'boolean',
        ]);

        return DB::transaction(function () use ($request, $pipeline) {
            if ($request->boolean('is_default')) {
                CrmPipeline::where('store_id', $pipeline->store_id)
                    ->where('id', '!=', $pipeline->id)
                    ->update(['is_default' => false]);
            }

            $pipeline->update([
                'name'        => $request->name,
                'description' => $request->description ?? null,
                'is_default'  => $request->boolean('is_default', $pipeline->is_default),
            ]);

            return response()->json($pipeline->loadCount('leads'));
        });
    }

    /** DELETE /crm/pipelines/{pipeline} */
    public function destroy(Request $request, CrmPipeline $pipeline)
    {
        $this->authorizeStore($request, $pipeline);

        if ($pipeline->leads()->count() > 0) {
            return response()->json([
                'message' => 'Ce pipeline contient des leads. Déplacez-les avant de le supprimer.',
            ], 422);
        }

        $pipeline->delete();

        // If it was default, set the first remaining one as default
        if ($pipeline->is_default) {
            CrmPipeline::where('store_id', $pipeline->store_id)
                ->orderBy('sort_order')->first()?->update(['is_default' => true]);
        }

        return response()->json(null, 204);
    }

    /** POST /crm/pipelines/reorder — update sort_order */
    public function reorder(Request $request)
    {
        $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'integer',
        ]);

        $storeId = $request->user()->store_id;

        foreach ($request->ids as $order => $id) {
            CrmPipeline::where('id', $id)->where('store_id', $storeId)
                ->update(['sort_order' => $order]);
        }

        return response()->json(['ok' => true]);
    }

    private function authorizeStore(Request $request, CrmPipeline $pipeline): void
    {
        if ($pipeline->store_id !== $request->user()->store_id) {
            abort(403);
        }
    }
}
