<?php

namespace App\Mail;

use App\Models\OnboardingRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class NewOnboardingRequestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public OnboardingRequest $req) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '🔔 Nouvelle demande — ' . $this->req->company_name,
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.onboarding.new-request');
    }
}
