<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InvoiceReminderQueue;
use App\Models\InvoiceReminderRule;
use App\Models\Store;
use App\Services\MailService;
use App\Services\TwilioService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class InvoiceReminderController extends Controller
{
    public function __construct(
        private TwilioService $twilio,
        private MailService   $mail,
    ) {}

    private function getStoreId(Request $request): int
    {
        return $request->header('X-Store-Id')
            ? (int) $request->header('X-Store-Id')
            : (int) $request->user()->store_id;
    }

    // ── Twilio ─────────────────────────────────────────────────────────────────

    public function twilioStatus()
    {
        return response()->json([
            'configured'    => $this->twilio->isConfigured(),
            'has_sms'       => $this->twilio->hasSms(),
            'has_whatsapp'  => $this->twilio->hasWhatsApp(),
            'from_sms'      => $this->twilio->hasSms()      ? config('twilio.from_sms')      : null,
            'from_whatsapp' => $this->twilio->hasWhatsApp() ? config('twilio.from_whatsapp') : null,
        ]);
    }

    public function twilioTest(Request $request)
    {
        $result = $this->twilio->testConnection();
        return response()->json($result, $result['success'] ? 200 : 422);
    }

    public function twilioSendTest(Request $request)
    {
        $data = $request->validate([
            'to'      => 'required|string|max:30',
            'channel' => 'required|in:sms,whatsapp',
        ]);

        $result = $this->twilio->sendTest($data['to'], $data['channel']);
        return response()->json($result, $result['success'] ? 200 : 422);
    }

    // ── Mail ──────────────────────────────────────────────────────────────────

    public function mailStatus()
    {
        return response()->json($this->mail->getStatus());
    }

    public function mailTest(Request $request)
    {
        $result = $this->mail->testConnection();
        return response()->json($result, $result['success'] ? 200 : 422);
    }

    public function mailSendTest(Request $request)
    {
        $data = $request->validate([
            'to' => 'required|email|max:150',
        ]);

        $result = $this->mail->sendTest($data['to']);
        return response()->json($result, $result['success'] ? 200 : 422);
    }

    // ── Rules ─────────────────────────────────────────────────────────────────

    public function indexRules(Request $request)
    {
        $storeId = $this->getStoreId($request);

        return response()->json(
            InvoiceReminderRule::where('store_id', $storeId)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get()
        );
    }

    public function getDefaultTemplate()
    {
        return response()->json(['template' => InvoiceReminderRule::getDefaultTemplate()]);
    }

    public function storeRule(Request $request)
    {
        $storeId = $this->getStoreId($request);

        $data = $request->validate([
            'type'             => 'required|in:before_due,on_due,after_due,fixed_monthly',
            'offset_days'      => 'nullable|integer|min:0|max:365',
            'day_of_month'     => 'nullable|integer|min:-28|max:28|not_in:0',
            'send_whatsapp'    => 'boolean',
            'send_sms'         => 'boolean',
            'send_email'       => 'boolean',
            'message_template' => 'nullable|string|max:2000',
            'is_active'        => 'boolean',
            'sort_order'       => 'integer|min:0',
        ]);

        $rule = InvoiceReminderRule::create(array_merge($data, ['store_id' => $storeId]));

        return response()->json($rule, 201);
    }

    public function updateRule(Request $request, InvoiceReminderRule $invoiceReminderRule)
    {
        $storeId = $this->getStoreId($request);
        if ($invoiceReminderRule->store_id !== $storeId) abort(403);

        $data = $request->validate([
            'type'             => 'sometimes|in:before_due,on_due,after_due,fixed_monthly',
            'offset_days'      => 'nullable|integer|min:0|max:365',
            'day_of_month'     => 'nullable|integer|min:-28|max:28|not_in:0',
            'send_whatsapp'    => 'boolean',
            'send_sms'         => 'boolean',
            'send_email'       => 'boolean',
            'message_template' => 'nullable|string|max:2000',
            'is_active'        => 'boolean',
            'sort_order'       => 'integer|min:0',
        ]);

        $invoiceReminderRule->update($data);

        return response()->json($invoiceReminderRule->fresh());
    }

    public function destroyRule(Request $request, InvoiceReminderRule $invoiceReminderRule)
    {
        $storeId = $this->getStoreId($request);
        if ($invoiceReminderRule->store_id !== $storeId) abort(403);

        $invoiceReminderRule->delete();

        return response()->json(null, 204);
    }

    // ── Queue ─────────────────────────────────────────────────────────────────

    public function indexQueue(Request $request)
    {
        $storeId = $this->getStoreId($request);
        $status  = $request->input('status', 'pending');

        $items = InvoiceReminderQueue::with([
            'invoice:id,reference,total_ttc,paid_amount,due_date,client_id',
            'invoice.client:id,name,phone,email',
            'rule:id,type,offset_days,day_of_month',
        ])
            ->where('store_id', $storeId)
            ->when($status !== 'all', fn($q) => $q->where('status', $status))
            ->orderBy('scheduled_date')
            ->orderBy('id')
            ->paginate(30);

        return response()->json($items);
    }

    /**
     * Send a reminder (via Twilio or email) and mark queue item as sent.
     */
    public function markSent(Request $request, InvoiceReminderQueue $invoiceReminderQueue)
    {
        $storeId = $this->getStoreId($request);
        if ($invoiceReminderQueue->store_id !== $storeId) abort(403);

        $channel = $invoiceReminderQueue->channel;
        $message = $invoiceReminderQueue->message;
        $sendResult = null;
        $sendNote   = 'Relance marquée manuellement';

        // --- WhatsApp / SMS via Twilio ---
        if (in_array($channel, ['whatsapp', 'sms']) && $this->twilio->isConfigured()) {
            $phone = $invoiceReminderQueue->phone;

            if ($channel === 'whatsapp' && $this->twilio->hasWhatsApp()) {
                $sendResult = $this->twilio->sendWhatsApp($phone, $message);
            } elseif ($channel === 'sms' && $this->twilio->hasSms()) {
                $sendResult = $this->twilio->sendSms($phone, $message);
            }

            if ($sendResult && !$sendResult['success']) {
                Log::warning('Twilio send failed', [
                    'queue_id' => $invoiceReminderQueue->id,
                    'error'    => $sendResult['error'],
                ]);
                return response()->json([
                    'error'  => 'Échec d\'envoi Twilio : ' . $sendResult['error'],
                    'detail' => $sendResult,
                ], 422);
            }

            if ($sendResult) {
                $sendNote = 'Envoyé via Twilio (SID : ' . ($sendResult['sid'] ?? '?') . ')';
            }
        }

        // --- Email ---
        if ($channel === 'email') {
            // Resolve recipient email
            $emailTo = $invoiceReminderQueue->email;
            if (!$emailTo) {
                $invoiceReminderQueue->loadMissing('invoice.client');
                $emailTo = $invoiceReminderQueue->invoice?->client?->email;
            }

            if (!$emailTo) {
                return response()->json([
                    'error' => 'Aucune adresse email disponible pour ce client',
                ], 422);
            }

            if ($this->mail->isConfigured()) {
                $invoiceReminderQueue->loadMissing('invoice');
                $reference = $invoiceReminderQueue->invoice?->reference ?? 'Facture';
                $subject   = 'Rappel de facture - ' . $reference;

                $sendResult = $this->mail->sendReminder($emailTo, $subject, $message);

                if (!$sendResult['success']) {
                    Log::warning('Mail send failed', [
                        'queue_id' => $invoiceReminderQueue->id,
                        'error'    => $sendResult['error'],
                    ]);
                    return response()->json([
                        'error'  => 'Échec d\'envoi email : ' . $sendResult['error'],
                        'detail' => $sendResult,
                    ], 422);
                }

                $sendNote = 'Email envoyé à ' . $emailTo;
            }
        }

        $invoiceReminderQueue->update([
            'status'  => 'sent',
            'sent_at' => now(),
            'sent_by' => $request->user()->id,
        ]);

        $invoiceReminderQueue->invoice->reminders()->create([
            'type'    => 'first',
            'method'  => $channel,
            'sent_at' => now(),
            'sent_by' => $request->user()->id,
            'notes'   => $sendNote,
        ]);

        return response()->json([
            'item'   => $invoiceReminderQueue->fresh(),
            'result' => $sendResult,
        ]);
    }

    public function markSkipped(Request $request, InvoiceReminderQueue $invoiceReminderQueue)
    {
        $storeId = $this->getStoreId($request);
        if ($invoiceReminderQueue->store_id !== $storeId) abort(403);

        $invoiceReminderQueue->update(['status' => 'skipped']);

        return response()->json($invoiceReminderQueue->fresh());
    }

    public function processQueue(Request $request)
    {
        $exitCode = \Artisan::call('invoices:queue-reminders');
        $output   = trim(\Artisan::output());

        return response()->json([
            'success' => $exitCode === 0,
            'message' => $output,
        ]);
    }
}
