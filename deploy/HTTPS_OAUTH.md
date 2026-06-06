# เปิดใช้ HTTPS + Google Login

คู่มือนี้พา deploy ที่รันด้วย `init.sh` (nip.io / HTTP) ให้ขึ้น **โดเมนจริง + HTTPS**
และเปิด **เข้าสู่ระบบด้วย Google** (ผ่าน Supabase Auth บนคลาวด์)

ทุกอย่างเป็น **opt-in** — ถ้ายังไม่ทำตามนี้ stack เดิม (nip.io + โหมดเดโม ไม่ต้องล็อกอิน) ยังทำงานปกติ

---

## สิ่งที่ต้องเตรียมจาก user (กรอกตอนทำจริง)

| ต้องการ | ใช้ที่ไหน |
|---|---|
| **โดเมนจริง** เช่น `example.com` | ทำ DNS + ออกใบรับรอง TLS |
| **อีเมล** สำหรับ Let's Encrypt | รับแจ้งเตือนใบรับรองใกล้หมดอายุ |
| **Google OAuth Client ID + Client Secret** | ใส่ใน Supabase Dashboard |
| **Supabase Cloud project** (URL + anon key) | ให้ web ต่อ Auth บนคลาวด์ |

> หมายเหตุ: stack แบบ self-host (`init.sh`) ใช้ PostgREST ล้วน ๆ **ไม่มี Auth service**
> ดังนั้น Google login เป็นฟีเจอร์ของ **Supabase Cloud** เท่านั้น — เมื่อเปิดใช้ต้องชี้
> `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` ไปที่โปรเจกต์คลาวด์

---

## ส่วนที่ 1 — HTTPS (โดเมนจริง + ใบรับรอง)

### ขั้นที่ 1: ชี้ DNS A record → IP เซิร์ฟเวอร์

สร้าง A record ทั้ง 4 รายการชี้ไปที่ public IP ของเครื่องนี้ (ดูจาก `cat deploy/.env | grep HOST_IP`):

```
example.com           A   <SERVER_IP>
api.example.com       A   <SERVER_IP>
console.example.com   A   <SERVER_IP>
status.example.com    A   <SERVER_IP>
```

ตรวจว่ากระจายแล้ว: `dig +short console.example.com` ต้องคืน IP ของเซิร์ฟเวอร์
และพอร์ต **80 / 443** ต้องเปิดให้อินเทอร์เน็ตเข้าถึง (firewall / security group)

### ขั้นที่ 2: เปิด mount + พอร์ต 443 ใน compose

ใน `deploy/docker-compose.yml` ที่ service `nginx` ให้ **uncomment**:

- `- "443:443"` (ใต้ `ports:`)
- `- ${DATA_DIR}/letsencrypt:/etc/letsencrypt:ro`
- `- ${DATA_DIR}/certbot:/var/www/certbot:ro`

แล้วสร้าง nginx ใหม่ให้รับ mount:

```bash
docker compose -f deploy/docker-compose.yml up -d nginx
```

### ขั้นที่ 3: รันสคริปต์ออกใบรับรอง

```bash
cd deploy
./scripts/enable-https.sh --domain example.com --email you@example.com
```

สคริปต์จะ:
1. ใส่ location `/.well-known/acme-challenge/` ลงใน config HTTP ปัจจุบัน (สำหรับ certbot)
2. รัน certbot (`--webroot`) ออกใบรับรองให้ `example.com` + `api.` `console.` `status.`
3. เรนเดอร์ config TLS (`nginx/default-tls.conf.template`) แล้ว reload nginx
4. พิมพ์บรรทัด cron สำหรับ **auto-renew** — ก็อปไปใส่ `crontab -e`

> รันซ้ำได้ปลอดภัย (idempotent): ใบรับรองที่ยังไม่หมดอายุจะถูกใช้ซ้ำ
> ทดสอบก่อนของจริงด้วย `--staging` (เลี่ยง rate limit ของ Let's Encrypt) แล้วค่อยรันจริง

หลังเสร็จ: `https://console.example.com`, `https://api.example.com`, `https://status.example.com`
ส่วน `http://` และ nip.io เดิมจะ redirect ไป https ให้อัตโนมัติ

### auto-renew

สคริปต์พิมพ์บรรทัดนี้ออกมา (ปรับ path/โดเมนตาม output จริง) — ใส่ใน `crontab -e`:

```cron
0 3,15 * * *  docker run --rm -v /data/reforge/letsencrypt:/etc/letsencrypt -v /data/reforge/certbot:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot --quiet && docker compose -f /path/to/deploy/docker-compose.yml exec -T nginx nginx -s reload
```

---

## ส่วนที่ 2 — Google Login (Supabase Auth)

### ขั้นที่ 4: ตั้ง Google OAuth ใน Google Cloud Console

1. ไปที่ <https://console.cloud.google.com> → **APIs & Services → Credentials**
2. **Create Credentials → OAuth client ID** → ประเภท **Web application**
3. ใน **Authorized redirect URIs** ใส่ callback ของ Supabase (ไม่ใช่โดเมนเรา):

   ```
   https://<supabase-project-ref>.supabase.co/auth/v1/callback
   ```

4. กด Create → ก็อป **Client ID** กับ **Client Secret**

### ขั้นที่ 5: ใส่ค่าใน Supabase Dashboard

1. เปิดโปรเจกต์ Supabase Cloud → **Authentication → Providers → Google**
2. เปิด (Enable) แล้ววาง **Client ID** + **Client Secret** → Save
3. ไป **Authentication → URL Configuration**:
   - **Site URL**: `https://console.example.com`
   - **Redirect URLs** (เพิ่ม): `https://console.example.com/auth/callback`

   > path callback ของแอปเราคือ `/auth/callback` (หน้า client ที่ทำ PKCE exchange)

### ขั้นที่ 6: เปิด flag + ชี้ web ไป Supabase Cloud + redeploy

แก้ `deploy/.env`:

```dotenv
NEXT_PUBLIC_AUTH_ENABLED=1
```

และต้องให้ web ต่อ **Supabase Cloud** (ไม่ใช่ PostgREST ภายใน) — ปรับ build args ของ
service `web` ใน `docker-compose.yml` ให้เป็น URL/anon key ของคลาวด์:

```yaml
    build:
      args:
        NEXT_PUBLIC_SUPABASE_URL: https://<supabase-project-ref>.supabase.co
        NEXT_PUBLIC_SUPABASE_ANON_KEY: <supabase-anon-key>
        NEXT_PUBLIC_AUTH_ENABLED: "1"
```

> `NEXT_PUBLIC_*` ถูก inline ตอน **build** ของ Next.js → ต้อง **rebuild** เสมอ

rebuild + redeploy:

```bash
docker compose -f deploy/docker-compose.yml up -d --build web
```

เสร็จแล้ว: ที่ navbar จะมีลิงก์ **"เข้าสู่ระบบ"** → หน้า `/login` → ปุ่ม
**"เข้าสู่ระบบด้วย Google"**

---

## มันต่อกันยังไง (สถาปัตยกรรม)

- **Login** (`/login`, client) → `supabase.auth.signInWithOAuth({provider:'google'})`
  → เด้งไป Google → กลับมาที่ `/auth/callback`
- **Callback** (`/auth/callback`, client) → `exchangeCodeForSession()` (PKCE verifier
  อยู่ใน browser storage จึงต้องทำฝั่ง client — เราไม่ใช้ `@supabase/ssr`)
  → เขียน access token ลง cookie `reforge-access-token` → ไป `/dashboard`
- **Server seam** (`lib/current-user.ts`) → อ่าน token จาก cookie แล้ว verify ด้วย
  `supabase.auth.getUser(token)` คืน user id จริง; ถ้าไม่มี/flag ปิด → fallback เป็น
  `DEMO_USER_ID` (โหมดเดโมเดิม ใช้ได้โดยไม่ต้องล็อกอิน)
- ตอนนี้ wire ไว้เป็นตัวอย่างที่ `app/api/projects/route.ts` (GET/POST) เท่านั้น
  route อื่นยังใช้ `DEMO_USER_ID` — ค่อย ๆ migrate ทีละ route มาใช้ `getCurrentUserId()`

---

## checklist

- [ ] DNS A records (4 ตัว) → IP เซิร์ฟเวอร์ กระจายแล้ว, พอร์ต 80/443 เปิด
- [ ] uncomment 443 + letsencrypt/certbot mounts ใน compose, `up -d nginx`
- [ ] `./scripts/enable-https.sh --domain ... --email ...` ผ่าน
- [ ] ใส่บรรทัด cron auto-renew ใน `crontab -e`
- [ ] Google OAuth client (redirect URI = Supabase callback) → ได้ id/secret
- [ ] ใส่ id/secret + เปิด Google provider ใน Supabase Dashboard
- [ ] ตั้ง Site URL + Redirect URLs (`/auth/callback`) ใน Supabase
- [ ] `NEXT_PUBLIC_AUTH_ENABLED=1` + ชี้ web ไป Supabase Cloud + `up -d --build web`
