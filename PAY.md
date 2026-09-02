Because you are operating from Bangladesh, **you do not need to generate live keys yourself or provide US SSN/EIN verification**.
In the **Bring Your Own Keys (BYOK)** model, your app only requests keys from your users (clients). Since your clients reside in supported regions (US, UK, EU), **they** generate these keys from their own accounts and paste them into your app dashboard.
Below is the exact integration guide to provide to your clients, along with instructions for obtaining **free test keys** for development from Bangladesh without local restriction blockades.
**Client Onboarding Instructions (Copy/Paste into Your SaaS Documentation)**
Provide these step-by-step instructions inside your app settings page where clients enter their payment credentials:
### 1. Stripe Setup (Restricted API Keys)
*Instruct your clients to use Restricted Keys instead of standard secret keys for security.*
 * **Step 1:** Log into the Stripe Dashboard.
 * **Step 2:** Click **Developers** in the top right menu, then select **API Keys**.
 * **Step 3:** Under the **Restricted keys** section, click **Create restricted key**.
 * **Step 4:** Name the key (e.g., Invoice Recovery App Integration).
 * **Step 5:** Set the following explicit permissions:
   * PaymentIntents: **Write**
   * Customers: **Write**
   * Charges: **Read**
 * **Step 6:** Click **Create key**, copy the key (starts with rk_live_), and paste it into your app dashboard.
### 2. PayPal Setup (REST API Credentials)
*Instruct your clients to generate standard merchant app keys.*
 * **Step 1:** Log into the PayPal Developer Dashboard using a PayPal Business account.
 * **Step 2:** Toggle the switch to **Live** mode at the top of the dashboard.
 * **Step 3:** Under **Apps & Credentials**, click **Create App**.
 * **Step 4:** Enter an App Name (e.g., Debt Recovery Payment Gateway) and set App Type to **Merchant**.
 * **Step 5:** Copy the **Client ID** and click **Show** to copy the **Client Secret**, then paste both values into your app dashboard.
**How to Test & Build This System from Bangladesh (No Verification Needed)**
You can build and test this entire dynamic multi-tenant setup locally in Bangladesh without needing a US bank account or tax ID:
 * **For Stripe Sandbox Testing:**
   * Go to Stripe Dashboard and register a standard developer account.
   * Skip identity verification setup and toggle on **Test Mode** (located in the top right/left corner).
   * Grab your sandbox keys (pk_test_ and rk_test_) to build your dynamic Node.js billing logic.
 * **For PayPal Sandbox Testing:**
   * Log into the PayPal Developer Sandbox Dashboard.
   * Under **Apps & Credentials**, click **Sandbox**.
   * Copy the automatically generated **Default Application** Client ID and Client Secret to test buyer/seller transaction flows locally.