# Eron — Automated Payment Recovery & Invoice Reminders SaaS

Eron is a professional, production-ready Automated Payment Recovery & Invoice Reminders SaaS designed for B2B digital agencies. It streamlines debt collection by syncing open invoices from QuickBooks and Xero, executing multi-step escalation sequences via Email (Resend), WhatsApp (Whapi.cloud), and SMS (Vonage).

Every transaction, reminder, and account flow is handled through real-world providers and a persistent PostgreSQL database.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18+)
- **Supabase Account** (PostgreSQL)
- **Provider API Keys** (See Environment Variables)

### 2. Database Setup
The application uses a self-migrating architecture. To initialize your database:
1.  Navigate to your Supabase **SQL Editor**.
2.  Paste and run the contents of `src/data/supabaseSchema.sql`.
3.  Restart the server; `/api/health` will confirm `dbReady: true`.

### 3. Installation
```bash
npm install
cp .env.example .env # Fill in your real API keys
npm run dev          # Starts Express + Vite on http://localhost:3000
```

---

## ⚙️ Third-Party Integration Setup

### QuickBooks Online
1.  Go to the [Intuit Developer Portal](https://developer.intuit.com/).
2.  Create an app and obtain your `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET`.
3.  **Redirect URI:** `https://your-domain.com/api/oauth/callback`
4.  **Webhooks:** Set the endpoint to `https://your-domain.com/api/webhooks/quickbooks`.

### Xero
1.  Go to the [Xero Developer Portal](https://developer.xero.com/).
2.  Create an app and obtain your `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`.
3.  **Redirect URI:** `https://your-domain.com/api/oauth/callback`
4.  **Webhooks:** Set the endpoint to `https://your-domain.com/api/webhooks/xero`.

### Google OAuth (Sign-In)
1.  Configure a project in the [Google Cloud Console](https://console.cloud.google.com/).
2.  **Redirect URI:** `https://your-domain.com/api/auth/google/callback`

---

## 🛠 Architecture & Tech Stack

- **Frontend:** React 19, Tailwind CSS v4, Vite 6, Lucide Icons.
- **Backend:** Node.js (Express 4), TypeScript.
- **Database:** Supabase (PostgreSQL).
- **Messaging:** 
    - **Email:** Resend
    - **WhatsApp:** Whapi.cloud
    - **SMS:** Vonage (Nexmo)
- **AI Engine:** Google Gemini (Multi-model fallback).
- **Payments:** Payoneer (Direct card and bank transfers).
- **Cron/Automation:** Upstash QStash.

---

## 📈 Feature Highlights

### 1. Unified Automation
- Consolidated automation management (Reminders & Recovery).
- Granular control: Schedule automations per invoice or globally.
- Escalating tones: Polite reminders shifting to urgent recovery based on due dates.

### 2. Accounting Sync
- Real-time sync via Webhooks (no polling).
- Batch processing for high-volume invoice management.
- Native OAuth 2.0 flows for QuickBooks and Xero.

### 3. Secure Payments
- Branded Public Payment Portal.
- Live Payoneer payment links embedded in all messaging channels.
- Support for Card, Bank Transfer, PayPal, Apple Pay, and Google Pay.

---

## 👥 Development Team
Developed and maintained by the **Eron Engineering Team**.

## 📄 License
Commercial - All Rights Reserved.