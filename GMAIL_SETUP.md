# Gmail SMTP Setup Guide for DugsiKabe

**IMPORTANT**: The error you're seeing (`535-5.7.8 Username and Password not accepted`) means your Gmail App Password is **not correctly configured**. Follow this guide EXACTLY step-by-step!

---

## 🔑 Step-by-Step: Create a Gmail App Password (THE CRITICAL STEP!)

### 1. First, Enable 2-Step Verification (REQUIRED!)
You **cannot** create an App Password without 2-Step Verification enabled!

1. Open a web browser and go to: https://myaccount.google.com/security
2. Under the "How you sign in to Google" section, find **"2-Step Verification"**
3. Click **2-Step Verification** → Click **Get Started**
4. Follow Google's instructions to enable 2-Step Verification (you'll need to add a phone number)
5. Once you see "2-Step Verification is on", proceed to Step 2!

---

### 2. Generate Your App Password (THIS IS WHAT YOU USE IN .env!)

IMPORTANT: Use the **same browser** you used to enable 2-Step Verification!

1. Go directly to: https://myaccount.google.com/apppasswords
   - If this link says "The feature you're looking for is not available", double-check that 2-Step Verification is **definitely enabled**!
   
2. You'll see two dropdown menus:
   - **"Select app"**: Choose **Mail** (scroll down if needed)
   - **"Select device"**: Choose **Other (Custom name)** (at the bottom)
   
3. A text box will appear; type: `DugsiKabe School ERP` (or any name you want)
   
4. Click the **Generate** button (it's blue)
   
5. A pop-up window will appear with a **16-character code**! It will look like this:
   ```
   abcd efgh ijkl mnop
   ```
   ⚠️ **THIS IS THE ONLY TIME YOU'LL SEE THIS CODE! COPY IT NOW!** (you can include or exclude the spaces, either works)

---

### 3. Update Your `backend/.env` File

Open `c:\Users\hp\Desktop\schoolManagementSystem\backend\.env` and replace the email section with this (fill in your details):

```env
# Email Configuration (Gmail SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=dugsikaabe1@gmail.com  # Your Gmail address
EMAIL_PASS=abcd efgh ijkl mnop    # Paste your 16-character App Password HERE!
EMAIL_FROM="DugsiKaabe <dugsikaabe1@gmail.com>"  # Name <email> format
```

⚠️ **DO NOT USE YOUR REGULAR GMAIL PASSWORD! YOU MUST USE THE 16-CHARACTER APP PASSWORD!**

---

### 4. Restart Your Backend Server

1. In your terminal, press `Ctrl+C` to stop the server (if it's running)
2. Start it again with:
   ```bash
   cd backend
   npm run dev
   ```

---

### 5. Test It!

Once the server is running, send a `POST` request to:
`https://schoolmangementbackend-deployment.up.railway.app/api/auth/test-email`

With this JSON body (use your own email):
```json
{ "email": "your-email@gmail.com" }
```

---

## 🛠️ Troubleshooting Common Errors

### Error 1: `535-5.7.8 Username and Password not accepted`
This is the most common error! Here are all possible fixes:
1. **2-Step Verification is not enabled**: Double-check! https://myaccount.google.com/security
2. **You used your regular password**: You **must** use the 16-character App Password, NOT your Gmail login password!
3. **App Password was typed wrong**: Try generating a new App Password and copy-paste it exactly (no extra spaces)
4. **Gmail account has security issues**: Sign in to Gmail normally first; if Google asks for verification, complete that first

### Error 2: App Password page not working
- Make sure you're using the **same Google account** in your browser as your `EMAIL_USER`
- Double-check 2-Step Verification is enabled
- Try an incognito/private browser window

---

## 🚀 Alternative: Use Brevo (Free, Easier Than Gmail!)

If Gmail is giving you too much trouble, use **Brevo (formerly Sendinblue)** instead! It's free for 300 emails/day:
1. Sign up at https://www.brevo.com/
2. Go to your Brevo Dashboard → Click your name (top right) → **SMTP & API**
3. Use these values in `.env`:
   ```env
   EMAIL_HOST=smtp-relay.brevo.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=your-brevo-login-email@example.com
   EMAIL_PASS=your-brevo-smtp-key  # From Brevo's SMTP page
   EMAIL_FROM="DugsiKaabe <dugsikaabe1@gmail.com>"
   ```
