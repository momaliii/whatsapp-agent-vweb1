## WhatsApp AI Agent

This is a minimal WhatsApp AI agent using the WhatsApp Cloud API and OpenAI.

### Prerequisites

- Node.js 18+
- Meta Developer account with the WhatsApp product enabled
- A phone number in your WhatsApp Business Account (a test number works)
- OpenAI API key (or adjust code to use a different LLM provider)

### Setup

1. Copy env template and fill values:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Run locally:

```bash
npm run dev
```

### WhatsApp Cloud API configuration

1. In Meta Developers, create an app and add the WhatsApp product.
2. Obtain:
   - Phone Number ID (`META_PHONE_NUMBER_ID`)
   - Permanent Access Token (`META_WHATSAPP_TOKEN`)
3. Expose your local server and set your webhook:
   - Start a tunnel (e.g., `ngrok http 3000`)
   - Set the webhook URL to `https://<your-tunnel-domain>/webhook`
   - Use your `META_VERIFY_TOKEN` for verification
   - Subscribe to `messages` and `message_status` events
4. Send a WhatsApp message from your device to your business/test number to trigger the webhook.

### Notes

- The server handles the webhook verification (`GET /webhook`) and incoming messages (`POST /webhook`).
- Replies are generated using OpenAI and sent back via the Graph API.

## WhatsApp Web (no tokens)

If you cannot get a WhatsApp API or Twilio token, you can run a local client using `whatsapp-web.js`.

### Run locally

```bash
npm run start:web
```

1. A QR code will appear in the terminal. On your phone: WhatsApp → Settings → Linked devices → Link a device → scan the QR.
2. After linking, send a message to your WhatsApp number from another phone/account. The bot will auto-reply using OpenAI if `OPENAI_API_KEY` is set, otherwise a default message.

Notes:
- This logs in as your personal WhatsApp account via a browser session. Use responsibly and at your own risk.
- Session files are stored locally (`LocalAuth`); they are ignored by git.
- To clear the session, delete `WWebJS-*`/`session-*` files and re-run to re-scan the QR.

### Custom system prompt

Set a global persona/instructions for the bot using `SYSTEM_PROMPT` in `.env`:

```env
SYSTEM_PROMPT=You are Cookie, a cheerful assistant for Homemade Cookies. Answer concisely.
```

Works for both the Cloud API server and the WhatsApp Web client. Restart the process after changing the prompt.

### Dashboard

- A simple dashboard is available at `http://localhost:4000` (set `DASHBOARD_PORT` to change).
- It lets you edit:
  - System Prompt
  - Model
  - Temperature
  - Max Tokens
- Changes are saved to `config/config.json` and applied immediately for new messages.
- Knowledge Base: upload `.pdf` or `.txt` files; they are chunked, embedded, and used for RAG answers.


