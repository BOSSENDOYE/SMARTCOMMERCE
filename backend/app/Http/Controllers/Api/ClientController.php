<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(
            Client::where('store_id', $request->user()->store_id)
                ->when($request->search, fn($q) => $q->where(function ($q) use ($request) {
                    $q->where('name', 'like', "%{$request->search}%")
                      ->orWhere('phone', 'like', "%{$request->search}%");
                }))
                ->orderBy('name')
                ->paginate($request->per_page ?? 30)
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'phone' => 'nullable|string|max:30',
            'email' => 'nullable|email',
            'address' => 'nullable|string',
            'credit_limit' => 'nullable|numeric|min:0',
        ]);
        $client = Client::create(array_merge($data, ['store_id' => $request->user()->store_id]));
        return response()->json($client, 201);
    }

    public function show(Client $client) { return response()->json($client); }

    public function update(Request $request, Client $client)
    {
        $client->update($request->validate([
            'name' => 'sometimes|string',
            'phone' => 'nullable|string',
            'email' => 'nullable|email',
            'credit_limit' => 'nullable|numeric|min:0',
        ]));
        return response()->json($client);
    }

    public function destroy(Client $client) { $client->delete(); return response()->json(null, 204); }
}
