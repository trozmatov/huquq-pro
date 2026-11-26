# HuquqPro (Oson Huquq) — Huquqshunoslik bo'yicha Mustaqil LMS + AI Huquqshunos Ustoz

O'zbekiston ta'lim tizimi (8–11-sinf maktab/litsey o'quvchilari, TDYU/OTM abituriyentlari, Milliy sertifikat topshiruvchilar va huquq fani o'qituvchilari) uchun yaratilgan to'liq mustaqil veb-platforma.

> **Arxitektura tamoyili:** Bu Telegram bot yoki Telegram Mini App **EMAS** — oddiy mobil va desktop brauzerlarda mustaqil domenda ishlovchi to'liq veb-sayt. Foydalanuvchilar esa parol eslab qolmasdan rasmiy **Telegram Login Widget** orqali xavfsiz tizimga kiradi.

---

## Asosiy imkoniyatlar

- **Standalone Web + Telegram Login Widget**:
  - Rasmiy `telegram-widget.js` orqali kirish, backendda `SHA256(TELEGRAM_BOT_TOKEN)` va `HMAC-SHA256` timing-safe imzo tekshiruvi + 24 soatlik `auth_date` nazorati.
  - Imzolangan `HttpOnly; SameSite=Lax; Secure (prod)` sessiya cookie, WebSocket (Gemini Live) autentifikatsiyasi ham shu sessiya orqali himoyalangan.
  - 3 ta rol (`student`, `teacher`, `admin`) — faqat serverda (`ADMIN_TELEGRAM_IDS`, `TEACHER_TELEGRAM_IDS` va allowlist) aniqlanadi.
- **O'quvchi oqimi**:
  - Foydalanish roziligi (Consent) → 4 bosqichli kirish so'rovnomasi → Jonli Countdown va 4 bosqichli shaxsiy Roadmap.
  - 4 tabli navigatsiya (mobilda fiksirlangan Bottom Tab Bar, desktopda yuqori menyu): **Darslar**, **Takrorlash (Leitner 1-3-7-14-30 + Xatolar banki)**, **Imtihon (20–30 savollik simulyator + Oraliq imtihonlar)**, **Profil**.
- **Har bir mavzuda 5 bosqichli erkin sikl**:
  1. **Konspekt** — tuzilgan mazmun, qonun moddalari/muddatlar jadvali, atamalar lug'ati va nusxalanadigan Bilim paketi.
  2. **Kartalar** — 3D Leitner flashcardlar (4 yuridik toifa: `articles`, `terms`, `organs`, `subjects`) va «Juftini top» o'yini.
  3. **Testlar** — Tezkor Mashq (MCQ + Cloze), Protsessual Tartib + Sabab-oqibat kazusi, BMBA Imtihon Testi.
  4. **Yozma va Kazuslar** — vertikal ro'yxat, lokal tezkor + parallel Gemini AI semantik baholash (sinonimlar va Lotin/Kirill qo'llab-quvvatlovi).
  5. **AI Huquqshunos Ustoz** — real vaqtdagi ovozli (Gemini Live API backend WebSocket proxy orqali) va matnli og'zaki imtihon, kunlik kvota, `AudioVisualizer` va yakuniy AI hisobot (`pending_evaluation` qayta tekshirish bilan).
- **Ustoz va Admin boshqaruv paneli**:
  - 4 ta tab: **Guruhlar (8 xonali kod + Imtihon sanalari CRUD + Admin ustoz ruxsatnomasi)**, **Darsliklar va Mavzular (6 tabli muharrir + PDF/DOC/DOCX/TXT dan 2 bosqichli AI generatsiya + Oraliq Imtihon)**, **Natijalar (5 bosqichli analitika)** va **Suhbat loglari**.

---

## O'rnatish va ishga tushirish

```bash
npm install
cp .env.example .env
```

Lokal ishlab chiqish rejimida (API `127.0.0.1:3001` + Vite `localhost:5173`):

```bash
npm run dev
```

Tekshirish, testlar va production build:

```bash
npm run lint
npm test
npm run build
npm start
```

---

## Muhit o'zgaruvchilari (`.env`)

| O'zgaruvchi | Tavsif |
|---|---|
| `PORT` | Backend server porti (standart `3001`) |
| `NODE_ENV` | `development` yoki `production` |
| `STORE` | `memory` (lokal/test, boshlang'ich huquq darsliklari bilan) yoki `firestore` (Firebase Firestore) |
| `TELEGRAM_BOT_TOKEN` | `@BotFather` dan olingan bot tokeni (Telegram Login Widget imzosini tekshirish uchun) |
| `TELEGRAM_BOT_USERNAME` | Bot username (`@` belgisiz, masalan `huquqpro_bot`) |
| `SESSION_SECRET` | Sessiya cookie imzolash uchun kamida 32 belgilik maxfiy kalit |
| `ADMIN_TELEGRAM_IDS` | Administrator Telegram user ID'lari (vergul bilan ajratilgan) |
| `TEACHER_TELEGRAM_IDS` | Ustoz Telegram user ID'lari (vergul bilan ajratilgan) |
| `GEMINI_API_KEY` | Google Gemini API kaliti (faqat backendda ishlatiladi, hech qachon frontendga chiqmaydi) |
| `GEMINI_TEXT_MODEL` | Matn/baholash/generatsiya modeli (standart `gemini-4-hydrogen`) |
| `GEMINI_LIVE_MODEL` | Real vaqtdagi ovozli suhbat modeli (standart `gemini-3.8-live`) |
| `AI_TUTOR_MAX_SESSIONS_PER_DAY` | O'quvchi uchun kunlik AI Ustoz sessiya kvotasi (standart `5`) |
| `AI_TUTOR_MAX_DURATION_SEC` | Bitta ovozli sessiya maksimal davomiyligi, soniyada (standart `600`) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Faqat `STORE=firestore` bo'lganda talab qilinadi |
| `DEV_AUTH_USER_ID` | Lokal ishlab chiqish/testlar uchun ixtiyoriy bypass (faqat `NODE_ENV !== 'production'` va `127.0.0.1` da ishlaydi) |

---

## BotFather orqali Telegram Login Widget domenini ulash (`/setdomain`)

Saytni production domenda (masalan, `https://huquqpro.uz`) ishga tushirgach, Telegram Login Widget ishlashi uchun quyidagi qadamlarni bajaring:

1. Telegram'da rasmiy **[@BotFather](https://t.me/BotFather)** botini oching.
2. Yangi bot yarating (`/newbot`) yoki mavjud botingizni tanlang.
3. Olingan tokenni `.env` faylidagi `TELEGRAM_BOT_TOKEN` ga, bot nomini (`@` siz) `TELEGRAM_BOT_USERNAME` ga yozing.
4. `@BotFather` ga `/setdomain` buyrug'ini yuboring.
5. Botingizni tanlang va saytingiz domenini kiriting (masalan: `huquqpro.uz` — HTTPS bo'lishi shart).
6. Endi foydalanuvchilar sayt bosh sahifasidagi **«Log in with Telegram»** tugmasi orqali mustaqil brauzerda tizimga kira oladilar.
