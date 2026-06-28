<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OnboardingApprovedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $contactName,
        public string $companyName,
        public string $email,
        public string $password,
        public string $appUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '✅ Votre compte SmartCommerce est prêt — ' . $this->companyName,
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.onboarding.approved');
    }
}
