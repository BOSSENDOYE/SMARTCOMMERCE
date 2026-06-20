<?php

namespace App\Services;

use Twilio\Rest\Client;
use Twilio\Exceptions\TwilioException;

class TwilioService
{
    private ?Client $client = null;

    public function isConfigured(): bool
    {
        return !empty(config('twilio.sid')) && !empty(config('twilio.token'));
    }

    public function hasSms(): bool
    {
        return $this->isConfigured() && !empty(config('twilio.from_sms'));
    }

    public function hasWhatsApp(): bool
    {
        return $this->isConfigured() && !empty(config('twilio.from_whatsapp'));
    }

    private function client(): Client
    {
        if (!$this->client) {
            $this->client = new Client(config('twilio.sid'), config('twilio.token'));
        }
        return $this->client;
    }

    /**
     * Send a plain SMS via Twilio.
     */
    public function sendSms(string $to, string $message): array
    {
        if (!$this->hasSms()) {
            return ['success' => false, 'error' => 'TWILIO_FROM_SMS non configuré'];
        }

        $to = $this->normalizePhone($to);

        try {
            $msg = $this->client()->messages->create($to, [
                'from' => config('twilio.from_sms'),
                'body' => $message,
            ]);
            return ['success' => true, 'sid' => $msg->sid];
        } catch (TwilioException $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Send a WhatsApp message via Twilio.
     */
    public function sendWhatsApp(string $to, string $message): array
    {
        if (!$this->hasWhatsApp()) {
            return ['success' => false, 'error' => 'TWILIO_FROM_WHATSAPP non configuré'];
        }

        $to   = $this->normalizePhone($to);
        $from = config('twilio.from_whatsapp');

        // Ensure whatsapp: prefix
        if (!str_starts_with($from, 'whatsapp:')) {
            $from = 'whatsapp:' . $from;
        }
        if (!str_starts_with($to, 'whatsapp:')) {
            $to = 'whatsapp:' . $to;
        }

        try {
            $msg = $this->client()->messages->create($to, [
                'from' => $from,
                'body' => $message,
            ]);
            return ['success' => true, 'sid' => $msg->sid];
        } catch (TwilioException $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Send a test message to verify credentials + channel.
     */
    public function sendTest(string $to, string $channel = 'sms'): array
    {
        $msg = 'Ceci est un message de test SmartCommerce via Twilio.';

        return $channel === 'whatsapp'
            ? $this->sendWhatsApp($to, $msg)
            : $this->sendSms($to, $msg);
    }

    /**
     * Verify Twilio credentials by fetching account info.
     */
    public function testConnection(): array
    {
        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'Identifiants Twilio non configurés (TWILIO_SID / TWILIO_AUTH_TOKEN)'];
        }

        try {
            $account = $this->client()->api->v2010->accounts(config('twilio.sid'))->fetch();
            return [
                'success'      => true,
                'account_name' => $account->friendlyName,
                'status'       => $account->status,
            ];
        } catch (TwilioException $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Normalize phone number: strip spaces/dashes, ensure + prefix.
     */
    private function normalizePhone(string $phone): string
    {
        $cleaned = preg_replace('/[^\d+]/', '', $phone);
        if (!empty($cleaned) && !str_starts_with($cleaned, '+')) {
            $cleaned = '+' . $cleaned;
        }
        return $cleaned;
    }
}
