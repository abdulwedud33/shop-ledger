# Shop Ledger: Manual QA Script for Mobile Testing

**Target Device:** Any modern Android smartphone (Chrome browser) or iPhone (Safari browser).  
**Time Required:** ~15–20 minutes.  
**Audience:** Shop owner, store manager, or non-technical tester.

---

## Instructions for the Tester
Follow each step in sequence on your mobile phone. Do not skip steps, as earlier actions (like adding items or customers) are used in subsequent tests. Tick the checkbox `[ ]` next to each test once you confirm the expected result.

---

### Step 1: Install to Home Screen (PWA Test)
- [ ] **1.1 Open Browser:** Navigate to the hosted app URL (e.g. `https://your-domain.com` or local testing server) in Chrome or Safari.
- [ ] **1.2 Add to Home Screen:** Tap the browser menu (`⋮` in Chrome or Share `⎋` in Safari) and choose **"Add to Home screen"** or **"Install App"**.
- [ ] **1.3 Open from Home Screen:** Close the browser and tap the **Shop Ledger** app icon from your home screen.
- [ ] **Expected Result:** The app opens in full-screen standalone mode without a browser URL bar. The app icon and theme header match the branding.

---

### Step 2: Language Switch on Auth & Account Sign-Up
- [ ] **2.1 Change Language:** On the welcome screen, open the Language dropdown and select **"አማርኛ" (Amharic)**. Verify all text switches to Ge'ez script immediately without page refresh.
- [ ] **2.2 Switch to Afaan Oromo:** Select **"Afaan Oromoo"** and verify headings and labels update.
- [ ] **2.3 Switch back to English:** Select **"English"**.
- [ ] **2.4 Create Account:** Tap **"New here? Create an account"**.
- [ ] **2.5 Enter Details:**
  - Name: `Almaz Retailer`
  - Email: Enter your test email (e.g. `test_owner@example.com`)
  - Password: Enter a 10+ character password (e.g. `Password12345!`)
- [ ] **2.6 Submit:** Tap **"Create account"**.
- [ ] **Expected Result:** Instant submission. You are directed to the 3-step onboarding wizard.

---

### Step 3: Fixed-Layout Onboarding (Fast Setup)
- [ ] **3.1 Step 1 (Shop Name):**
  - Enter Shop Name: `Mercato Mini Mart`
  - Currency is prefilled as ETB.
  - Notice the top progress bar shows **"Step 1 of 3"**.
  - Tap **"Next"**.
- [ ] **3.2 Step 2 (Product Presets):**
  - Verify 4 sample products are already pre-filled: *Sugar (120 ETB)*, *Cooking oil (250 ETB)*, *Soap (40 ETB)*, *Bread (10 ETB)*.
  - Tap **"Add another"** and add `Table Salt`, Price `25`.
  - Tap **"Next"**.
- [ ] **3.3 Step 3 (Starting Stock):**
  - Use the `+` steppers to set starting stock: Sugar = `20`, Oil = `10`, Soap = `15`, Bread = `30`, Salt = `50`.
  - Tap **"Record first sale"**.
- [ ] **Expected Result:** You land directly on the **Sell** screen with all products visible as large touch tiles.

---

### Step 4: Core Flow — Fast Cash Sale & Receipt
- [ ] **4.1 Tap Tiles:**
  - Tap `Sugar` twice (count badge shows `2`).
  - Tap `Cooking oil` once (count badge shows `1`).
- [ ] **4.2 Review Cart Bar:** The floating bottom bar displays: `2 items · 490.00 ETB` (2 x 120 + 250).
- [ ] **4.3 Charge:** Tap the green **"Charge 490.00 ETB"** button.
- [ ] **4.4 Payment Sheet:**
  - Verify **"Cash"** is pre-selected by default.
  - Verify the paid amount is pre-filled to the exact total: `490`.
- [ ] **4.5 Confirm:** Tap **"Confirm sale · 490.00 ETB"**.
- [ ] **4.6 Receipt Card:** A receipt card appears showing items, total, and **"Thank you"**.
- [ ] **4.7 Share Receipt:** Tap **"Share receipt"**; confirm mobile share sheet or "Copied" toast appears.
- [ ] **4.8 New Sale:** Tap **"New sale"**.
- [ ] **Expected Result:** Sale is recorded instantly (< 10 seconds). The screen clears and is ready for the next customer.

---

### Step 5: Offline Selling (Network Outage Resilience)
- [ ] **5.1 Turn On Airplane Mode:** Swipe down your phone's notification panel and turn on **Airplane Mode** (disable Wi-Fi and mobile data).
- [ ] **5.2 Check Offline Banner:** Notice the quiet header banner: *"Offline. Changes are saved on this phone."*
- [ ] **5.3 Make a Sale While Offline:**
  - Tap `Bread` 3 times (total: 30 ETB).
  - Tap **"Charge 30.00 ETB"** -> **"Confirm sale"**.
- [ ] **5.4 Verify Local Save:** The receipt displays with a subtitle indicator: *"Saved on this phone"*.
- [ ] **5.5 Reconnect Network:** Turn off **Airplane Mode** (re-enable internet).
- [ ] **5.6 Sync Verification:** Notice the sync icon in the top header transitions from syncing dot to green checkmark.
- [ ] **5.7 Check Sales History:** Go to **More -> Sales history**. Confirm the 30 ETB sale is marked completed and synced.
- [ ] **Expected Result:** Zero data loss. Offline sale is committed locally, seamlessly synchronizes to the cloud upon reconnect, and never creates duplicates.

---

### Step 6: Credit Sale & Customer Debt Repayment
- [ ] **6.1 Add Sale on Credit:**
  - From **Sell**, tap `Cooking oil` twice (total: 500 ETB).
  - Tap **"Charge 500.00 ETB"**.
  - In the payment sheet, tap **"On credit"**.
- [ ] **6.2 Choose Customer:**
  - Tap **"New customer"** inline.
  - Name: `Dawit Yonas`, Phone: `0911234567`. Tap **"Save"**.
  - Tap **"Confirm sale · 500.00 ETB"**.
- [ ] **6.3 Check Debt on Home Dashboard:**
  - Tap the **Home** tab in the bottom bar.
  - Under **"Who owes you"**, verify `Dawit Yonas` is listed owing `Br 500`.
- [ ] **6.4 Record Repayment in Two Taps:**
  - Tap `Dawit Yonas` to open his customer ledger.
  - Tap **"Record payment"**.
  - Notice the smart shortcut buttons: tap **"Half"** (automatically fills `250`).
  - Tap **"Save"**.
- [ ] **6.5 Goal-Gradient Progress Bar:**
  - Look at Dawit's balance card: balance is now `250.00 ETB`.
  - A green progress bar shows **"50% paid back"**.
- [ ] **Expected Result:** Credit sale accurately creates debt ledger entries; two-tap repayment updates balance immediately.

---

### Step 7: Inventory Restock & Correct Stock
- [ ] **7.1 Open Products:** Tap **Products** in the bottom navigation.
- [ ] **7.2 Low Stock Alert:** Notice any product below reorder level displays a yellow or red **"Low"** or **"Out"** chip.
- [ ] **7.3 Restock Item:**
  - Tap `Table Salt`.
  - In the sheet, tap **"Restock"**.
  - Quantity: `20`. Cost per unit defaults to your previous cost.
  - Tap **"Save"**.
- [ ] **7.4 Correct Stock (Adjust):**
  - Tap `Table Salt` -> **"Correct stock"**.
  - Enter `-2` (damaged goods). Reason: `Damaged packaging`.
  - Tap **"Save"**.
- [ ] **Expected Result:** Stock quantity updates instantly on screen and reflects movement history in database ledgers.

---

### Step 8: Cashier Invite & Privilege Isolation
- [ ] **8.1 Generate Invite:**
  - Go to **More -> Team**.
  - Tap **"Invite a cashier"**.
  - An 8-character single-use code is displayed (e.g. `ABC123XY`). Tap **"Copy"**.
- [ ] **8.2 Open Incognito / Second Device:** Open an incognito tab or a second phone.
- [ ] **8.3 Sign Up as Cashier:** Sign up with email `cashier@example.com`.
- [ ] **8.4 Join Shop:** On the onboarding screen, tap **"Join a shop"**, paste the invite code, and tap **"Join"**.
- [ ] **8.5 Verify Cashier Isolation:**
  - Go to **More**: Confirm **Team**, **Settings**, and **Assistant memory** are completely hidden.
  - Go to **Reports**: Confirm **Profit** card is hidden (cashier only sees Sales count and Cash collected).
  - Go to **Products**: Edit any product; confirm **Cost price** is completely hidden.
  - Go to **Sales history**: Confirm **Void sale** button does not exist.
- [ ] **Expected Result:** Cashier can perform sales and accept customer payments, but has zero access to profit margins, wholesale costs, team management, or voiding transactions.

---

### Step 9: Reports & Formula-Safe CSV Export
- [ ] **9.1 Switch Periods:** On **More -> Reports**, tap **"Today"**, **"This week"**, and **"This month"**.
- [ ] **9.2 Verify Best Sellers:** Top products are ranked by revenue and quantity.
- [ ] **9.3 Export CSV:**
  - Tap **"Export sales (CSV)"**.
  - Open the downloaded CSV file in Microsoft Excel or Google Sheets.
  - Verify column headers: `date`, `total`, `paid`, `method`, `status`.
  - Verify cells with special characters (like `=`) are quoted to prevent spreadsheet formula injection.
- [ ] **Expected Result:** Summary figures match transaction ledger sums exactly; CSV is clean and secure.

---

### Step 10: Shop Deletion & Device Data Wipe
- [ ] **10.1 Go to Settings:** Log back in as the Owner. Navigate to **More -> Settings**.
- [ ] **10.2 Delete Shop:** Tap the red **"Delete shop and all data"** button.
- [ ] **10.3 Confirmation:** Type the exact shop name `Mercato Mini Mart` and tap **"Delete shop and all data"**.
- [ ] **10.4 Verify Data Wipe:**
  - You are redirected to the `/auth/` welcome screen.
  - Inspect browser storage: all cached products, sales, customers, and active sessions are wiped clean.
- [ ] **Expected Result:** Entire shop database and local IndexedDB cache are wiped without leftover artifacts.

---

### Tester Sign-Off
- **Tester Name:** ___________________________
- **Date Tested:** ___________________________
- **Overall Result:** [ ] PASS  /  [ ] FAIL
- **Notes / Observations:** __________________________________________________
