<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PrintTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PrintTemplateController extends Controller
{
    /** GET /print-templates */
    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        $templates = PrintTemplate::where('store_id', $storeId)
            ->when($request->document_type, fn($q) => $q->where('document_type', $request->document_type))
            ->orderBy('document_type')
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json($templates);
    }

    /** GET /print-templates/{template} */
    public function show(Request $request, PrintTemplate $printTemplate)
    {
        $this->authorizeStore($request, $printTemplate);

        // Merge stored config with defaults so the frontend always gets all keys
        $printTemplate->config = array_replace_recursive(
            PrintTemplate::defaultConfig(),
            $printTemplate->config ?? []
        );

        return response()->json($printTemplate);
    }

    /** GET /print-templates/default/{type} — used by renderers */
    public function defaultForType(Request $request, string $type)
    {
        $storeId = $request->user()->store_id;

        $tpl = PrintTemplate::where('store_id', $storeId)
            ->where('document_type', $type)
            ->where('is_default', true)
            ->where('is_active', true)
            ->first();

        $config = array_replace_recursive(
            PrintTemplate::defaultConfig(),
            $tpl?->config ?? []
        );

        return response()->json([
            'id'            => $tpl?->id,
            'document_type' => $type,
            'name'          => $tpl?->name ?? 'Défaut système',
            'config'        => $config,
        ]);
    }

    /** POST /print-templates */
    public function store(Request $request)
    {
        $data = $request->validate([
            'document_type' => 'required|in:receipt,sale_receipt,invoice,delivery_note,purchase_order,label',
            'name'          => 'required|string|max:100',
            'config'        => 'required|array',
            'is_default'    => 'boolean',
        ]);

        $storeId = $request->user()->store_id;

        return DB::transaction(function () use ($data, $storeId) {
            if ($data['is_default'] ?? false) {
                PrintTemplate::where('store_id', $storeId)
                    ->where('document_type', $data['document_type'])
                    ->update(['is_default' => false]);
            }

            $tpl = PrintTemplate::create(array_merge($data, ['store_id' => $storeId]));

            return response()->json($tpl, 201);
        });
    }

    /** PUT /print-templates/{template} */
    public function update(Request $request, PrintTemplate $printTemplate)
    {
        $this->authorizeStore($request, $printTemplate);

        $data = $request->validate([
            'name'       => 'sometimes|string|max:100',
            'config'     => 'sometimes|array',
            'is_default' => 'sometimes|boolean',
            'is_active'  => 'sometimes|boolean',
        ]);

        return DB::transaction(function () use ($data, $printTemplate, $request) {
            if ($data['is_default'] ?? false) {
                PrintTemplate::where('store_id', $request->user()->store_id)
                    ->where('document_type', $printTemplate->document_type)
                    ->where('id', '!=', $printTemplate->id)
                    ->update(['is_default' => false]);
            }

            $printTemplate->update($data);

            return response()->json($printTemplate->fresh());
        });
    }

    /** DELETE /print-templates/{template} */
    public function destroy(Request $request, PrintTemplate $printTemplate)
    {
        $this->authorizeStore($request, $printTemplate);

        if ($printTemplate->is_default) {
            return response()->json(['message' => 'Impossible de supprimer le modèle par défaut.'], 422);
        }

        $printTemplate->delete();

        return response()->json(null, 204);
    }

    private function authorizeStore(Request $request, PrintTemplate $tpl): void
    {
        if ($tpl->store_id !== $request->user()->store_id) {
            abort(403);
        }
    }
}
