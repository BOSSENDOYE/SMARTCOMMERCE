<?php

namespace App\Services;

use App\Models\Organization;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Mail;

class OrgMailer
{
    /**
     * Envoie un email via le SMTP de l'organisation si configuré,
     * sinon utilise le SMTP système (env MAIL_*).
     */
    public static function send(Organization $org, string $to, Mailable $mail): void
    {
        if ($org->mail_host && $org->mail_username) {
            $mailer = Mail::mailer('smtp');

            config([
                'mail.mailers.smtp.host'       => $org->mail_host,
                'mail.mailers.smtp.port'       => $org->mail_port ?? 587,
                'mail.mailers.smtp.username'   => $org->mail_username,
                'mail.mailers.smtp.password'   => $org->mail_password,
                'mail.mailers.smtp.encryption' => $org->mail_encryption ?? 'tls',
                'mail.from.address'            => $org->mail_from_address ?? $org->email,
                'mail.from.name'               => $org->mail_from_name ?? $org->name,
            ]);

            $mailer->to($to)->send($mail);

            // Restaurer la config par défaut
            config([
                'mail.mailers.smtp.host'       => env('MAIL_HOST'),
                'mail.mailers.smtp.port'       => env('MAIL_PORT'),
                'mail.mailers.smtp.username'   => env('MAIL_USERNAME'),
                'mail.mailers.smtp.password'   => env('MAIL_PASSWORD'),
                'mail.mailers.smtp.encryption' => env('MAIL_ENCRYPTION', 'tls'),
                'mail.from.address'            => env('MAIL_FROM_ADDRESS'),
                'mail.from.name'               => env('MAIL_FROM_NAME'),
            ]);
        } else {
            Mail::to($to)->send($mail);
        }
    }
}
