<?php

namespace App\Services;

use Illuminate\Support\Facades\Mail;

class MailService
{
    public function isConfigured(): bool
    {
        $mailer = config('mail.default');

        if (in_array($mailer, ['log', 'array', 'null', 'failover'])) {
            return false;
        }

        $from = config('mail.from.address');
        if (empty($from) || $from === 'hello@example.com') {
            return false;
        }

        if ($mailer === 'smtp') {
            return !empty(config('mail.mailers.smtp.host'));
        }

        return true;
    }

    public function getStatus(): array
    {
        return [
            'configured' => $this->isConfigured(),
            'mailer'     => config('mail.default'),
            'host'       => config('mail.mailers.smtp.host'),
            'port'       => config('mail.mailers.smtp.port'),
            'from'       => config('mail.from.address'),
            'from_name'  => config('mail.from.name'),
        ];
    }

    public function testConnection(): array
    {
        if (!$this->isConfigured()) {
            return [
                'success' => false,
                'error'   => 'Configuration email incomplète. Vérifiez MAIL_MAILER, MAIL_HOST et MAIL_FROM_ADDRESS dans votre .env',
            ];
        }

        try {
            Mail::raw(
                "Test de connexion email depuis SMARTCOMMERCE.\n\nSi vous recevez ce message, la configuration SMTP fonctionne correctement.",
                function ($message) {
                    $message->to(config('mail.from.address'))
                        ->subject('[SMARTCOMMERCE] Test de connexion');
                }
            );

            return [
                'success'   => true,
                'mailer'    => config('mail.default'),
                'from'      => config('mail.from.address'),
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function sendTest(string $to): array
    {
        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'Email non configuré'];
        }

        try {
            Mail::raw(
                "Bonjour,\n\nCeci est un message de test depuis SMARTCOMMERCE.\n\nSi vous recevez ce message, la configuration email fonctionne correctement.\n\n— SMARTCOMMERCE",
                function ($message) use ($to) {
                    $message->to($to)
                        ->subject('[SMARTCOMMERCE] Message de test');
                }
            );

            return ['success' => true];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function sendReminder(string $to, string $subject, string $message): array
    {
        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'Email non configuré'];
        }

        try {
            Mail::raw($message, function ($msg) use ($to, $subject) {
                $msg->to($to)->subject($subject);
            });

            return ['success' => true];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
