<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class MailSettingController extends Controller
{
    /** GET /mail-settings — retourne la config mail de l'organisation courante */
    public function show(Request $request)
    {
        $user = $request->user();
        $org  = $user->store?->organization ?? $user->organization;

        if (!$org) {
            return response()->json(['message' => 'Organisation introuvable.'], 404);
        }

        return response()->json([
            'mail_host'         => $org->mail_host,
            'mail_port'         => $org->mail_port,
            'mail_username'     => $org->mail_username,
            'mail_password'     => $org->mail_password ? '••••••••' : null,
            'mail_encryption'   => $org->mail_encryption ?? 'tls',
            'mail_from_address' => $org->mail_from_address,
            'mail_from_name'    => $org->mail_from_name,
            'is_configured'     => !empty($org->mail_host),
        ]);
    }

    /** PUT /mail-settings — met à jour la config mail */
    public function update(Request $request)
    {
        $user = $request->user();
        $org  = $user->store?->organization ?? $user->organization;

        if (!$org) {
            return response()->json(['message' => 'Organisation introuvable.'], 404);
        }

        $data = $request->validate([
            'mail_host'         => 'nullable|string|max:255',
            'mail_port'         => 'nullable|integer|min:1|max:65535',
            'mail_username'     => 'nullable|string|max:255',
            'mail_password'     => 'nullable|string|max:500',
            'mail_encryption'   => 'nullable|in:tls,ssl,starttls',
            'mail_from_address' => 'nullable|email|max:255',
            'mail_from_name'    => 'nullable|string|max:255',
        ]);

        // Ne pas écraser le mot de passe si l'utilisateur envoie '••••••••'
        if (isset($data['mail_password']) && str_contains($data['mail_password'], '•')) {
            unset($data['mail_password']);
        }

        // Si les champs sont vides → supprimer la config
        if (empty($data['mail_host'])) {
            $org->update([
                'mail_host' => null, 'mail_port' => null, 'mail_username' => null,
                'mail_password' => null, 'mail_encryption' => null,
                'mail_from_address' => null, 'mail_from_name' => null,
            ]);
            return response()->json(['message' => 'Configuration email supprimée.']);
        }

        $org->update($data);

        return response()->json(['message' => 'Configuration email mise à jour.']);
    }

    /** POST /mail-settings/test — envoie un email de test */
    public function test(Request $request)
    {
        $user = $request->user();
        $org  = $user->store?->organization ?? $user->organization;

        $request->validate([
            'to' => 'required|email',
        ]);

        try {
            if ($org?->mail_host && $org->mail_username) {
                config([
                    'mail.mailers.smtp.host'       => $org->mail_host,
                    'mail.mailers.smtp.port'       => $org->mail_port ?? 587,
                    'mail.mailers.smtp.username'   => $org->mail_username,
                    'mail.mailers.smtp.password'   => $org->mail_password,
                    'mail.mailers.smtp.encryption' => $org->mail_encryption ?? 'tls',
                    'mail.from.address'            => $org->mail_from_address ?? $org->email,
                    'mail.from.name'               => $org->mail_from_name ?? $org->name,
                ]);
            }

            Mail::raw(
                "Ceci est un email de test SmartCommerce — {$org?->name}.\n\nSi vous recevez ce message, votre configuration SMTP fonctionne correctement.",
                fn($m) => $m->to($request->to)->subject('✅ Test SMTP — SmartCommerce')
            );

            return response()->json(['message' => 'Email de test envoyé avec succès.']);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Erreur SMTP : ' . $e->getMessage()], 422);
        }
    }
}
