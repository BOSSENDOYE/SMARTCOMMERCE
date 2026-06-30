<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class GoogleDriveService
{
    private array  $creds;
    private ?string $token       = null;
    private int     $tokenExpiry = 0;

    public function __construct(string $credentialsJson)
    {
        $this->creds = json_decode($credentialsJson, true);

        if (empty($this->creds['private_key']) || empty($this->creds['client_email'])) {
            throw new \InvalidArgumentException('JSON de compte de service invalide (private_key ou client_email manquant).');
        }
    }

    // ── JWT / Access Token ────────────────────────────────────────────────────

    private function b64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function getAccessToken(): string
    {
        if ($this->token && time() < $this->tokenExpiry - 30) {
            return $this->token;
        }

        $now     = time();
        $header  = $this->b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $payload = $this->b64url(json_encode([
            'iss'   => $this->creds['client_email'],
            'scope' => 'https://www.googleapis.com/auth/drive.file',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'exp'   => $now + 3600,
            'iat'   => $now,
        ]));

        $input = "$header.$payload";
        $sig   = '';
        openssl_sign($input, $sig, $this->creds['private_key'], 'sha256WithRSAEncryption');
        $jwt = "$input." . $this->b64url($sig);

        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt,
            ]),
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        ]);

        $result = curl_exec($ch);
        curl_close($ch);

        $data = json_decode($result, true);

        if (empty($data['access_token'])) {
            throw new \RuntimeException('Impossible d\'obtenir le token Google Drive : ' . ($data['error_description'] ?? $result));
        }

        $this->token       = $data['access_token'];
        $this->tokenExpiry = $now + (int) ($data['expires_in'] ?? 3600);

        return $this->token;
    }

    // ── Upload ────────────────────────────────────────────────────────────────

    public function uploadFile(string $filePath, string $folderId, string $fileName): string
    {
        $token    = $this->getAccessToken();
        $fileSize = filesize($filePath);

        // Step 1 — Initiate resumable session
        $ch = curl_init('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER         => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode([
                'name'    => $fileName,
                'parents' => [$folderId],
            ]),
            CURLOPT_HTTPHEADER => [
                "Authorization: Bearer $token",
                'Content-Type: application/json; charset=UTF-8',
                'X-Upload-Content-Type: application/gzip',
                "X-Upload-Content-Length: $fileSize",
            ],
        ]);
        $response   = curl_exec($ch);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        preg_match('/^location:\s*(.+)$/im', substr($response, 0, $headerSize), $m);
        if (empty($m[1])) {
            throw new \RuntimeException('Impossible d\'initier l\'upload Drive (pas de Location).');
        }
        $uploadUrl = trim($m[1]);

        // Step 2 — Upload file content
        $fh = fopen($filePath, 'rb');
        $ch = curl_init($uploadUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_PUT            => true,
            CURLOPT_INFILE         => $fh,
            CURLOPT_INFILESIZE     => $fileSize,
            CURLOPT_HTTPHEADER     => [
                "Authorization: Bearer $token",
                'Content-Type: application/gzip',
                "Content-Length: $fileSize",
            ],
        ]);
        $result = curl_exec($ch);
        fclose($fh);
        curl_close($ch);

        $data = json_decode($result, true);
        if (empty($data['id'])) {
            throw new \RuntimeException('Upload Drive échoué : ' . $result);
        }

        return $data['id'];
    }

    // ── Test connection ───────────────────────────────────────────────────────

    public function testConnection(string $folderId): bool
    {
        try {
            $token = $this->getAccessToken();
            $ch    = curl_init("https://www.googleapis.com/drive/v3/files/$folderId?fields=id,name");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => ["Authorization: Bearer $token"],
            ]);
            $result = curl_exec($ch);
            $code   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            return $code === 200;
        } catch (\Throwable $e) {
            Log::warning('GoogleDrive test failed: ' . $e->getMessage());
            return false;
        }
    }

    public function getServiceAccountEmail(): string
    {
        return $this->creds['client_email'] ?? '';
    }
}
