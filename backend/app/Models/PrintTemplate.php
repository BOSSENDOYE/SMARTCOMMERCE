<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrintTemplate extends Model
{
    protected $fillable = [
        'store_id', 'document_type', 'name', 'config', 'is_default', 'is_active',
    ];

    protected $casts = [
        'config'     => 'array',
        'is_default' => 'boolean',
        'is_active'  => 'boolean',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    /**
     * Default config values — merged with stored config so missing keys always have a value.
     */
    public static function defaultConfig(): array
    {
        return [
            'header' => [
                'show_logo'           => true,
                'show_store_name'     => true,
                'store_name_override' => '',
                'show_address'        => true,
                'show_phone'          => true,
                'show_email'          => false,
                'show_ninea'          => true,
                'show_rc'             => false,
                'slogan'              => '',
            ],
            'body' => [
                'columns' => [
                    'ref'         => false,
                    'name'        => true,
                    'qty'         => true,
                    'unit_price'  => true,
                    'discount'    => true,
                    'total'       => true,
                ],
                'show_vat_detail'    => true,
                'show_lot'           => false,
                'show_cashier'       => true,
                'show_client'        => true,
                'show_payment_method'=> true,
            ],
            'footer' => [
                'message'           => 'Merci pour votre achat !',
                'show_qr'           => false,
                'qr_content'        => '',
                'show_return_policy'=> false,
                'return_policy'     => 'Échange dans les 7 jours sur présentation du ticket.',
            ],
            'typography' => [
                'font'       => 'courier',   // courier | arial | helvetica | times
                'base_size'  => 11,
                'title_size' => 14,
            ],
            'layout' => [
                'paper_format'   => '80mm',  // 58mm | 80mm | a5 | a4
                'copies'         => 1,
                'show_separator' => true,
            ],
        ];
    }
}
