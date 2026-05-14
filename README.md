# Webex Bot Backend

Node.js backend for controlling a Webex bot via webhooks. Built with Express.js and includes comprehensive Webex API integration.

## Features

- Webhook event handling (messages, memberships, rooms)
- Send messages to rooms or users
- Bot management (info, rooms, people lookup)
- Webhook registration and management
- Signature verification for secure webhooks
- Built-in command processing (help, ping, status, etc.)
- Health check endpoint
- Comprehensive error handling and logging

## Prerequisites

- Node.js 14.x or higher
- A Webex bot account (create one at [developer.webex.com](https://developer.webex.com))
- Webex Access Token with bot scope
- Public HTTPS URL for webhooks (use ngrok for development)

## Installation

1. Clone or copy the project files

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your Webex credentials:

   **For simple bot (no OAuth):**
   ```env
   WEBEX_BOT_ID=your_bot_id_here
   WEBEX_ACCESS_TOKEN=your_access_token_here
   ```

   **For OAuth Service App (user-level access):**
   ```env
   WEBEX_CLIENT_ID=your_client_id
   WEBEX_CLIENT_SECRET=your_client_secret
   WEBEX_REDIRECT_URI=http://localhost:3000/oauth/callback
   ```

4. **Set Redirect URI in Webex Developer Portal:**
   - Go to [developer.webex.com](https://developer.webex.com) → My Apps
   - Select your Service App
   - Under "OAuth & Authentication" → "Redirect URLs"
   - Add: `http://localhost:3000/oauth/callback`
   - Save

5. Start the server:
   ```bash
   npm start
   ```
   or for development with auto-reload:
   ```bash
   npm run dev
   ```

The server will start on port 3000 (or `PORT` from .env).

## Development with Ngrok

For local development, use ngrok to expose your local server:

1. Start ngrok:
   ```bash
   ngrok http 3000
   ```

2. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

3. Update `.env`:
   ```
   WEBHOOK_URL=https://abc123.ngrok.io/webhook
   ```

4. Access your bot API at `http://localhost:3000`

## Webex Bot Setup

### Option A: Simple Bot Token (Quick Start)

1. Go to [Webex Developer Portal](https://developer.webex.com)
2. Create a new **Bot** (not Service App)
3. Copy the Bot ID and Access Token
4. Add to `.env`:
   ```env
   WEBEX_BOT_ID=YOUR_BOT_ID
   WEBEX_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
   ```
5. Restart server

**Use this if:** You just need a bot that responds in rooms where it's added.

---

### Option B: OAuth Service App (Advanced)

If you need user-level permissions (read user's messages, act on their behalf):

#### 1. Create Service App

1. Go to [Webex Developer Portal](https://developer.webex.com) → My Apps
2. Click **"Create New App"** → **"Service App"**
3. Fill in:
   - App Name: `IT Support Bot`
   - OAuth Redirect URL: `http://localhost:3000/oauth/callback`
4. Under **OAuth Scopes**, select:
   - `spark:messages_read`
   - `spark:messages_write`
   - `spark:rooms_read`
   - `spark:people_read`
5. Click **Create App**
6. Copy **Client ID** and **Client Secret** to `.env`:
   ```env
   WEBEX_CLIENT_ID=your_client_id
   WEBEX_CLIENT_SECRET=your_client_secret
   WEBEX_REDIRECT_URI=http://localhost:3000/oauth/callback
   ```

#### 2. Get Authorization URL

Visit in browser:
```
http://localhost:3000/oauth/authorize
```
or programmatically:
```bash
curl http://localhost:3000/oauth/authorize?scopes=spark%3Amessages_read%20spark%3Amessages_write
```

#### 3. Authorize

The URL will redirect you to Webex consent screen. After approving, you'll be redirected back to `http://localhost:3000/oauth/callback` and tokens will be stored automatically.

#### 4. Use User Tokens

Now you can make API calls on behalf of the authorized user:
```bash
# List rooms the user is in
curl http://localhost:3000/api/people/me/rooms \
  -H "Authorization: Bearer <user_access_token>"
```

Or use the `/api/user/message` endpoint to send messages as the user.

## API Endpoints

### Bot Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/bot` | Get bot information |
| `GET` | `/api/rooms` | List rooms bot is in |
| `GET` | `/api/rooms/:roomId` | Get room details |
| `GET` | `/api/people` | Search people (query: email, displayName, id) |
| `POST` | `/api/message` | Send message |
| `GET` | `/api/ticket/message` | Send ticket card to room by ticket ID |

### Send Ticket Card

Fetch a ticket from Supabase by ID and send an Adaptive Card to the designated Webex room:

```bash
curl "http://localhost:3000/api/ticket/message?id=1"
```

The card displays:
- Date & Time (from ticket `date` and `start_time` fields)
- Category
- Concern
- Agent name
- Dropdown to assign to IT staff
- "Assist Agent" submit button

**Query Parameters:**
- `id` (required): Ticket ID (`ticketid` from Supabase `tickets` table)

**Target Room:**  
Y2lzY29zcGFyazovL3VybjpURUFNOnVzLXdlc3QtMl9yL1JPT00vZmM4NmViYTAtNGE2Yy0xMWYxLWE5ZjQtMTcwODQ2ODI2MGZj

### Send Message

```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "YOUR_ROOM_ID",
    "text": "Hello from the bot!"
  }'
```

or send to a person:
```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "toPersonId": "PERSON_ID",
    "markdown": "**Bold message** to a user"
  }'
```

### OAuth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/oauth/authorize?scopes=...` | Get OAuth authorization URL |
| `GET` | `/oauth/callback?code=...` | OAuth callback (handled automatically) |
| `POST` | `/api/user/message` | Send message as authenticated user |
| `GET` | `/api/tokens` | List authorized users (debug) |

### Webhook Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/webhooks` | List all webhooks |
| `POST` | `/api/webhook/register` | Register new webhook |
| `DELETE` | `/api/webhooks/:id` | Delete webhook |

## Bot Commands

Once the bot is added to a room, it responds to these commands:

- `help` - Show available commands
- `ping` - Check bot responsiveness
- `status` - Bot status and uptime
- `rooms` - List rooms the bot is in
- `info` - Bot information
- `echo <text>` - Echo back text

Customize commands in `handlers/webhookHandler.js` → `processMessage()` function.

## Project Structure

```
project/
├── index.js              # Main Express server
├── config/
│   └── index.js          # Configuration loader
├── services/
│   └── webexBot.js       # Webex API service
├── handlers/
│   └── webhookHandler.js # Webhook event processor
├── .env                  # Environment variables (not in git)
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
├── package.json          # Dependencies
└── README.md            # This file
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WEBEX_BOT_ID` | Yes | Webex bot ID |
| `WEBEX_ACCESS_TOKEN` | Yes | Bot access token |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (default: development) |
| `WEBHOOK_URL` | No | Public webhook URL |
| `WEBHOOK_SECRET` | No | Secret for webhook verification |
| `WEBEX_API_URL` | No | API base URL (default: https://webexapis.com/v1) |

## Security

- Webhook signature verification is enabled when `WEBHOOK_SECRET` is set
- `.env` file is excluded from git via `.gitignore`
- Helmet.js adds security headers
- CORS configured for all origins (restrict in production)

## Error Handling

All errors are logged to console with structured messages. API responses include:
- `4xx` for client errors
- `5xx` for server errors
- Error details in response body (sanitized for production)

## Deployment

1. Set environment variables on your hosting platform
2. Ensure HTTPS is enabled (required for webhooks)
3. Set `NODE_ENV=production`
4. Deploy with your preferred method (VM, container, serverless)

### Heroku / Railway / Render

Configure the buildpack to use Node.js and set environment variables in dashboard.

### Docker

Example Dockerfile:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

## Troubleshooting

**Bot not receiving messages:**
- Verify webhook URL is publicly accessible
- Check webhook registration: `GET /api/webhooks`
- Ensure bot is added to the room
- Validate access token has correct scopes

**"Failed to initialize bot" error:**
- Check `WEBEX_ACCESS_TOKEN` and `WEBEX_BOT_ID` are correct
- Token may have expired; regenerate from Webex portal

**Signature verification fails:**
- Ensure `WEBHOOK_SECRET` matches on both server and webhook registration
- Secret must be the same when registering the webhook

## License

MIT