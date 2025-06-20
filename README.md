# WhatsApp API

Simple WhatsApp API untuk mengirim pesan menggunakan WhatsApp Web JS dan JWT authentication.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Setup file `.env`:
```bash
cp .env.example .env
```
Edit file `.env` dan sesuaikan konfigurasi database MySQL.

3. Buat database MySQL:
```sql
CREATE DATABASE whatsapp_api;
```

1. Login ke API terlebih dahulu:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"siaokebpa@gmail.com","password":"YOUR_PASSWORD"}'
```

2. Dapatkan QR Code untuk WhatsApp (hanya diperlukan sekali):
```bash
curl -X GET http://localhost:3000/api/whatsapp/qr \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

3. Scan QR Code dengan WhatsApp di HP

4. Cek status koneksi:
```bash
curl -X GET http://localhost:3000/api/whatsapp/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Note:** Setelah scan QR pertama kali, session akan tersimpan di folder `whatsapp-session/`. Selanjutnya tidak perlu scan QR lagi kecuali logout dari WhatsApp Web.

## Reset Session WhatsApp

Jika ada masalah dengan koneksi WhatsApp:
```bash
curl -X POST http://localhost:3000/api/whatsapp/reset-session \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Setelah reset, restart server dan scan QR code lagi.

## Troubleshooting

### WhatsApp tidak connect
1. Cek status: `GET /api/whatsapp/status`
2. Jika tidak ready, cek QR: `GET /api/whatsapp/qr`
3. Jika masih bermasalah, reset session: `POST /api/whatsapp/reset-session`

### Error Puppeteer
Aplikasi sudah dikonfigurasi dengan flag yang diperlukan untuk server tanpa GUI:
- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-dev-shm-usage`

## Mengirim Pesan

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"number":"628123456789","message":"Hello from API!"}'
```

## Authentication

### Token Management
- **Access Token**: Tidak disimpan di database, short-lived (24 jam)
- **Refresh Token**: Disimpan di database, long-lived (7 hari)

### Login Flow
1. Login dengan email/password
2. Dapat access token dan refresh token
3. Gunakan access token untuk API calls
4. Jika access token expired, gunakan refresh token untuk mendapat token baru

### Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## API Endpoints

- `POST /api/auth/login` - Login
- `POST /api/auth/refresh-token` - Refresh token
- `POST /api/auth/logout` - Logout (clear refresh token)
- `GET /api/whatsapp/qr` - Get QR code
- `GET /api/whatsapp/status` - WhatsApp status  
- `POST /api/whatsapp/send-message` - Send message
- `POST /api/whatsapp/reset-session` - Reset WhatsApp session
