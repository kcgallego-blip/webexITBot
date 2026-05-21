require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');
const axios = require('axios');
const { loadConfig } = require('./config');
const { WebexBot } = require('./services/webexBot');
const { TokenManager } = require('./services/tokenManager');
const { webhookHandler, verifySignature } = require('./handlers/webhookHandler');
const { TicketService } = require('./services/ticketService');
const { cardTemplates } = require('./services/cardTemplates');

// Load and validate configuration
const config = loadConfig();

// Initialize Webex Bot instance
const webexBot = new WebexBot(
  config.webex.accessToken,
  config.webex.botId
);

// Initialize services
const ticketService = new TicketService(config.supabase);

// Initialize Token Manager (for OAuth if using Service App)
const tokenManager = new TokenManager(config);

const app = express();
const PORT = config.server.port;
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ============================================
// OAuth Endpoints (for Service App)
// ============================================

// Generate OAuth authorization URL
app.get('/oauth/authorize', (req, res) => {
  try {
    const scopes = req.query.scopes 
      ? req.query.scopes.split(' ')
      : ['spark:messages_read', 'spark:messages_write', 'spark:rooms_read', 'spark:people_read'];
    const state = req.query.state || crypto.randomBytes(16).toString('hex');
    
    const authUrl = tokenManager.buildAuthUrl(scopes, state);
    res.json({ 
      success: true, 
      authorization_url: authUrl,
      state 
    });
  } catch (error) {
    logger.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// OAuth callback endpoint
app.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    // Exchange code for tokens
    const tokens = await tokenManager.exchangeCodeForToken(code);

    // Get user info to link tokens to personId
    const userClient = axios.create({
      baseURL: 'https://webexapis.com/v1',
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const userInfo = await userClient.get('/people/me');
    const personId = userInfo.data.id;

    // Store tokens with personId
    tokenManager.setUserTokens(personId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    });

    logger.info(`OAuth successful for person: ${personId} (${userInfo.data.emails[0]})`);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: green; font-size: 24px; margin-bottom: 20px; }
          .close { margin-top: 20px; color: #666; }
        </style>
      </head>
      <body>
        <div class="success">✓ Authorization Successful!</div>
        <p>You can now close this tab and return to Webex.</p>
        <p>User: ${userInfo.data.displayName}</p>
        <p class="close">This window will close automatically in 5 seconds...</p>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).send('Authorization failed: ' + error.message);
  }
});

// Get stored user tokens (admin only - for debugging)
app.get('/api/tokens', async (req, res) => {
  try {
    // In production, protect this endpoint!
    const tokens = tokenManager.tokens;
    const sanitized = Object.keys(tokens).reduce((acc, personId) => {
      acc[personId] = {
        email: tokens[personId].email || 'unknown',
        expires_at: tokens[personId].expires_at,
        updated_at: tokens[personId].updated_at
      };
      return acc;
    }, {});

    res.json({ success: true, users: sanitized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Use user token to send message (demonstrates user-level API calls)
app.post('/api/user/message', async (req, res) => {
  try {
    const { personId, roomId, text, markdown } = req.body;
    
    if (!personId) {
      return res.status(400).json({ error: 'personId is required' });
    }

    // Get valid access token for user
    const accessToken = await tokenManager.getValidAccessToken(personId);

    // Create user-specific client
    const userClient = axios.create({
      baseURL: 'https://webexapis.com/v1',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // Send message as user
    const payload = {};
    if (roomId) payload.roomId = roomId;
    if (text) payload.text = text;
    if (markdown) payload.markdown = markdown;

    const response = await userClient.post('/messages', payload);
    res.json({ success: true, message: response.data });
  } catch (error) {
    logger.error('Error sending message as user:', error);
    res.status(500).json({ 
      error: 'Failed to send message', 
      details: error.message 
    });
  }
});

// Send ticket card to room by ticket ID
app.get('/api/ticket/message', async (req, res) => {
  try {
    const { id: ticketId } = req.query;

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID query parameter "id" is required' });
    }

    // Fetch ticket from Supabase
    const response = await ticketService.client.get(`/${ticketService.ticketsTable}`, {
      params: {
        select: '*',
        ticketid: `eq.${ticketId}`
      }
    });

    const tickets = Array.isArray(response.data) ? response.data : [];

    if (tickets.length === 0) {
      return res.status(404).json({ error: `Ticket with ID ${ticketId} not found` });
    }

    const ticket = tickets[0];

    // Build card content using cardTemplates
    const card = cardTemplates.ticketDetailsCard(ticket);

    // Target room ID (hardcoded as specified)
    const roomId = 'Y2lzY29zcGFyazovL3VybjpURUFNOnVzLXdlc3QtMl9yL1JPT00vZmM4NmViYTAtNGE2Yy0xMWYxLWE5ZjQtMTcwODQ2ODI2MGZj';

    // Send card to room using bot credentials
    const result = await webexBot.sendCard(roomId, card);

    // Log the full message response (includes message ID) to terminal
    logger.info(`✅ Ticket card sent to room ${roomId} for ticket ID ${ticketId}`);
    logger.debug(`Webex message response: ${JSON.stringify(result, null, 2)}`);

    // Store the Webex message ID in the ticket for later reference
    try {
      await ticketService.client.patch(
        `/${ticketService.ticketsTable}`,
        { webex_message_id: result.id },
        {
          params: {
            ticketid: `eq.${ticketId}`
          }
        }
      );
      logger.info(`✅ Stored webex_message_id ${result.id} for ticket ${ticketId}`);
    } catch (patchError) {
      logger.error(`Failed to store webex_message_id: ${patchError.message}`);
    }

    // Trigger external webhook to another system
    const externalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (externalAppUrl) {
      try {
        const webexMessageId = result.id || result.messageId;
        if (webexMessageId) {
          const externalPayload = {
            webex_message_id: webexMessageId
          };
          const externalResponse = await axios.post(`${externalAppUrl}/api/tickets/${ticketId}`, externalPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          logger.info(`✅ External API notified: /api/tickets/${ticketId}`);
          logger.debug(`External response: ${JSON.stringify(externalResponse.data)}`);
        } else {
          logger.warn('Webex message ID not found in response, skipping external webhook');
        }
      } catch (externalError) {
        logger.error(`Failed to notify external system: ${externalError.message}`);
        // Continue - don't fail the request if external call fails
      }
    } else {
      logger.debug('NEXT_PUBLIC_APP_URL not set, skipping external webhook');
    }

    res.json({ success: true, message: result });
  } catch (error) {
    logger.error('Error sending ticket message:', error);
    res.status(500).json({
      error: 'Failed to send ticket message',
      details: error.message
    });
  }
});

// Update ticket status to Pending and refresh the Webex card
app.post('/api/ticket/status', async (req, res) => {
  try {
    const webex_message_id = req.query.webex_message_id || req.body?.webex_message_id;
    if (!webex_message_id) {
      return res.status(400).json({
        error: 'webex_message_id is required (query param or request body)'
      });
    }

    // Find the ticket by webex_message_id
    const { data: tickets, error: fetchError } = await ticketService.client.get(
      `/${ticketService.ticketsTable}`,
      {
        params: {
          webex_message_id: `eq.${webex_message_id}`,
          select: '*'
        }
      }
    );

    if (fetchError) {
      throw fetchError;
    }

    const ticketsArray = Array.isArray(tickets) ? tickets : [];
    if (ticketsArray.length === 0) {
      return res.status(404).json({ error: 'Ticket not found for this message ID' });
    }

    const ticket = ticketsArray[0];

    // Update status to Pending
    await ticketService.client.patch(
      `/${ticketService.ticketsTable}`,
      { status: 'Pending' },
      {
        params: {
          ticketid: `eq.${ticket.ticketid}`
        }
      }
    );

    // Update local ticket object
    ticket.status = 'Pending';

    // Build updated card with blue status
    const card = cardTemplates.ticketDetailsCard(ticket);

    // Get roomId from Webex message details
    let roomId;
    try {
      const messageDetails = await webexBot.getMessageDetails(webex_message_id);
      roomId = messageDetails.roomId;
    } catch (msgError) {
      logger.warn(`Could not fetch message details: ${msgError.message}. Using fallback roomId.`);
      roomId = 'Y2lzY29zcGFyazovL3VybjpURUFNOnVzLXdlc3QtMl9yL1JPT00vZmM4NmViYTAtNGE2Yy0xMWYxLWE5ZjQtMTcwODQ2ODI2MGZj';
    }

    // Update the message in Webex
    await webexBot.updateMessage(webex_message_id, {
      roomId,
      text: ' ',
      attachments: [{ contentType: card.contentType, content: card.content }]
    });

    logger.info(`✅ Ticket status updated to Pending for message ${webex_message_id}`);

    res.json({
      success: true,
      message: 'Ticket status updated to Pending',
      ticket
    });
  } catch (error) {
    logger.error('Error updating ticket status:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update ticket status to Resolved and refresh the Webex card
app.post('/api/ticket/resolve', async (req, res) => {
  try {
    const webex_message_id = req.query.webex_message_id || req.body?.webex_message_id;
    if (!webex_message_id) {
      return res.status(400).json({
        error: 'webex_message_id is required (query param or request body)'
      });
    }

    // Find the ticket by webex_message_id
    const { data: tickets, error: fetchError } = await ticketService.client.get(
      `/${ticketService.ticketsTable}`,
      {
        params: {
          webex_message_id: `eq.${webex_message_id}`,
          select: '*'
        }
      }
    );

    if (fetchError) {
      throw fetchError;
    }

    const ticketsArray = Array.isArray(tickets) ? tickets : [];
    if (ticketsArray.length === 0) {
      return res.status(404).json({ error: 'Ticket not found for this message ID' });
    }

    const ticket = ticketsArray[0];

    // Update status to Resolved
    await ticketService.client.patch(
      `/${ticketService.ticketsTable}`,
      { status: 'Resolved' },
      {
        params: {
          ticketid: `eq.${ticket.ticketid}`
        }
      }
    );

    // Update local ticket object
    ticket.status = 'Resolved';

    // Build updated card with gray status
    const card = cardTemplates.ticketDetailsCard(ticket);

    // Get roomId from Webex message details
    let roomId;
    try {
      const messageDetails = await webexBot.getMessageDetails(webex_message_id);
      roomId = messageDetails.roomId;
    } catch (msgError) {
      logger.warn(`Could not fetch message details: ${msgError.message}. Using fallback roomId.`);
      roomId = 'Y2lzY29zcGFyazovL3VybjpURUFNOnVzLXdlc3QtMl9yL1JPT00vZmM4NmViYTAtNGE2Yy0xMWYxLWE5ZjQtMTcwODQ2ODI2MGZj';
    }

    // Update the message in Webex
    await webexBot.updateMessage(webex_message_id, {
      roomId,
      text: ' ',
      attachments: [{ contentType: card.contentType, content: card.content }]
    });

    logger.info(`✅ Ticket status updated to Resolved for message ${webex_message_id}`);

    res.json({
      success: true,
      message: 'Ticket status updated to Resolved',
      ticket
    });
  } catch (error) {
    logger.error('Error updating ticket status to Resolved:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API endpoint for Zendesk ticket helper - save ticket status to tph table
app.post('/api/get-ticket', async (req, res) => {
  try {
    const { ticket_num, agent, status } = req.body;

    if (!ticket_num || !agent || !status) {
      return res.status(400).json({
        success: false,
        error: 'ticket_num, agent, and status are required'
      });
    }

    const validStatuses = ['Open', 'Pending', 'Solved', 'On-Hold'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const record = {
      ticket_num: Number(ticket_num),
      agent,
      status
    };

    // Try to insert first, if conflict (ticket exists), update instead
    try {
      await ticketService.client.post(`/${ticketService.tphTable}`, record, {
        headers: {
          Prefer: 'return=minimal'
        }
      });
      logger.info(`Ticket ${ticket_num} created in tph table with status: ${status}`);
    } catch (insertError) {
      // Check if it's a conflict error (ticket already exists) - Supabase returns 400/500 with constraint message
      const errMsg = (insertError.response?.data?.error || insertError.response?.data?.message || insertError.message || '').toLowerCase();
      const isDuplicateError = errMsg.includes('duplicate key') || errMsg.includes('conflict') || insertError.response?.status === 409;
      
      if (isDuplicateError) {
        // Update existing record
        await ticketService.client.patch(`/${ticketService.tphTable}`, { status, agent }, {
          params: {
            ticket_num: `eq.${ticket_num}`
          }
        });
        logger.info(`Ticket ${ticket_num} updated in tph table with status: ${status}`);
      } else {
        throw insertError;
      }
    }

    res.json({
      success: true,
      message: 'Ticket saved successfully',
      data: record
    });
  } catch (error) {
    logger.error('Error saving ticket to tph:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to save ticket'
    });
  }
});

// Webhook signature verification middleware
const verifyWebhookSignature = (req, res, next) => {
  const secret = process.env.WEBHOOK_SECRET;
  
  // Skip signature verification if no secret is configured
  if (!secret) {
    logger.debug('Webhook secret not configured, skipping signature verification');
    return next();
  }

  const signature = req.headers['x-webex-signature'];
  if (!signature) {
    logger.warn('Webhook request missing signature header');
    return res.status(401).json({ error: 'Missing signature' });
  }

  try {
    const isValid = verifySignature(secret, req.rawBody, signature);
    if (!isValid) {
      logger.warn('Invalid webhook signature - request rejected');
      logger.debug(`Expected signature format, got: ${signature.substring(0, 20)}...`);
      return res.status(401).json({ error: 'Invalid signature' });
    }
    logger.debug('Webhook signature verified');
  } catch (error) {
    logger.error('Signature verification error:', error.message);
    // In case of verification error, reject the webhook for security
    return res.status(401).json({ error: 'Signature verification failed' });
  }
  
  next();
};

// Webhook endpoint for Webex events
app.post('/webhook', verifyWebhookSignature, webhookHandler(webexBot, logger, ticketService, cardTemplates));

// Bot API endpoints

// Send a message to a room or user
app.post('/api/message', async (req, res) => {
  try {
    const { roomId, toPersonId, text, markdown } = req.body;
    
    if (!text && !markdown) {
      return res.status(400).json({ error: 'Text or markdown content is required' });
    }
    
    if (!roomId && !toPersonId) {
      return res.status(400).json({ error: 'Either roomId or toPersonId is required' });
    }

    const result = await webexBot.sendMessage({
      roomId,
      toPersonId,
      text,
      markdown
    });

    res.json({ success: true, message: result });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ 
      error: 'Failed to send message', 
      details: error.message 
    });
  }
});

// Get bot information
app.get('/api/bot', async (req, res) => {
  try {
    const botInfo = await webexBot.getBotInfo();
    res.json({ success: true, bot: botInfo });
  } catch (error) {
    logger.error('Error fetching bot info:', error);
    res.status(500).json({ 
      error: 'Failed to fetch bot info', 
      details: error.message 
    });
  }
});

// Get list of rooms the bot is a member of
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await webexBot.getRooms();
    res.json({ success: true, rooms });
  } catch (error) {
    logger.error('Error fetching rooms:', error);
    res.status(500).json({ 
      error: 'Failed to fetch rooms', 
      details: error.message 
    });
  }
});

// Get list of people
app.get('/api/people', async (req, res) => {
  try {
    const { email, displayName, id } = req.query;
    const people = await webexBot.getPeople({ email, displayName, id });
    res.json({ success: true, people });
  } catch (error) {
    logger.error('Error fetching people:', error);
    res.status(500).json({ 
      error: 'Failed to fetch people', 
      details: error.message 
    });
  }
});

// Get room details
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const room = await webexBot.getRoomDetails(req.params.roomId);
    res.json({ success: true, room });
  } catch (error) {
    logger.error('Error fetching room details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch room details', 
      details: error.message 
    });
  }
});

// Create a webhook registration (for initial setup)
app.post('/api/webhook/register', async (req, res) => {
  try {
    const { targetUrl, resource, event, secret } = req.body;
    
    if (!targetUrl || !resource || !event) {
      return res.status(400).json({ 
        error: 'targetUrl, resource, and event are required' 
      });
    }

    const webhook = await webexBot.registerWebhook({
      targetUrl,
      resource,
      event,
      secret: secret || crypto.randomBytes(32).toString('hex')
    });

    res.json({ success: true, webhook });
  } catch (error) {
    logger.error('Error registering webhook:', error);
    res.status(500).json({ 
      error: 'Failed to register webhook', 
      details: error.message 
    });
  }
});

// List all webhooks
app.get('/api/webhooks', async (req, res) => {
  try {
    const webhooks = await webexBot.getWebhooks();
    res.json({ success: true, webhooks });
  } catch (error) {
    logger.error('Error fetching webhooks:', error);
    res.status(500).json({ 
      error: 'Failed to fetch webhooks', 
      details: error.message 
    });
  }
});

// Delete a webhook
app.delete('/api/webhooks/:webhookId', async (req, res) => {
  try {
    await webexBot.deleteWebhook(req.params.webhookId);
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    logger.error('Error deleting webhook:', error);
    res.status(500).json({ 
      error: 'Failed to delete webhook', 
      details: error.message 
    });
  }
});

// Initialize bot on startup
async function initializeBot() {
  try {
    logger.info('Initializing Webex bot...');
    await webexBot.initialize();
    logger.info('Webex bot initialized successfully');

    // Register bot details
    const botInfo = await webexBot.getBotInfo();
    logger.info(`Bot connected as: ${botInfo.displayName} (${botInfo.emails[0]})`);

    // Check webhook URL configuration
    if (config.webhook.url.includes('localhost') || config.webhook.url.includes('127.0.0.1')) {
      logger.warn('WEBHOOK_URL is set to a local address. Webex cannot reach it.');
      logger.warn('For local development, use ngrok:');
      logger.warn('  1. Download ngrok from https://ngrok.com');
      logger.warn('  2. Run: ngrok http 3000');
      logger.warn('  3. Set WEBHOOK_URL=https://<your-ngrok-id>.ngrok.io/webhook in .env');
    }

    // Ensure webhook is registered for message events
    await registerWebhookIfNeeded();

  } catch (error) {
    logger.error('Failed to initialize bot:', error.message);
    if (process.env.NODE_ENV !== 'development') {
      process.exit(1);
    }
  }
}

/**
 * Register webhook for message events if not already present
 */
async function registerWebhookIfNeeded() {
  try {
    const existingWebhooks = await webexBot.getWebhooks();
    const targetUrl = config.webhook.url;
    
    // Check if webhooks already exist at this URL
    const hasMessagesWebhook = existingWebhooks.find(w => 
      w.targetUrl === targetUrl && 
      w.resource === 'messages' && 
      w.event === 'created'
    );

    const hasAttachmentWebhook = existingWebhooks.find(w => 
      w.targetUrl === targetUrl && 
      w.resource === 'attachmentActions' && 
      w.event === 'created'
    );

    // Register messages webhook if needed
    if (hasMessagesWebhook) {
      logger.info(`Messages webhook already registered (${hasMessagesWebhook.id})`);
    } else {
      logger.info(`Registering messages webhook for ${targetUrl}...`);
      const webhook = await webexBot.registerWebhook({
        name: 'IT Support Bot - Messages',
        targetUrl,
        resource: 'messages',
        event: 'created',
        secret: config.webhook.secret || crypto.randomBytes(32).toString('hex')
      });
      logger.info(`Messages webhook registered: ${webhook.id}`);
    }

    // Register attachmentActions webhook for card submissions
    if (hasAttachmentWebhook) {
      logger.info(`Attachment webhook already registered (${hasAttachmentWebhook.id})`);
    } else {
      logger.info(`Registering attachmentActions webhook for ${targetUrl}...`);
      const webhook = await webexBot.registerWebhook({
        name: 'IT Support Bot - Card Submissions',
        targetUrl,
        resource: 'attachmentActions',
        event: 'created',
        secret: config.webhook.secret || crypto.randomBytes(32).toString('hex')
      });
      logger.info(`Attachment webhook registered: ${webhook.id}`);
    }
  } catch (error) {
    logger.error('Failed to register webhook:', error.message);
    logger.warn('Bot will not receive events without a registered webhook.');
    logger.warn('If running locally, expose your server with ngrok and set WEBHOOK_URL.');
  }
}

// Check and update webhook URL
app.get('/api/webhooks/check', async (req, res) => {
  try {
    const webhooks = await webexBot.getWebhooks();
    const currentUrl = config.webhook.url;
    
    const matchingWebhook = webhooks.find(w => 
      w.resource === 'messages' && 
      w.event === 'created'
    );

    const urlsMatch = matchingWebhook?.targetUrl === currentUrl;

    res.json({
      success: true,
      configuredUrl: currentUrl,
      webhookUrl: matchingWebhook?.targetUrl || 'No webhook found',
      urlsMatch,
      webhook: matchingWebhook || null,
      note: !urlsMatch ? 'WEBHOOK URL MISMATCH - Webhook is pointing to an old ngrok URL. Update WEBHOOK_URL in .env or re-register the webhook.' : 'Webhook URL is correct'
    });
  } catch (error) {
    logger.error('Error checking webhook:', error);
    res.status(500).json({ 
      error: 'Failed to check webhook', 
      details: error.message 
    });
  }
});

// Webhook management endpoints
app.get('/api/webhooks', async (req, res) => {
  try {
    const webhooks = await webexBot.getWebhooks();
    res.json({ success: true, webhooks });
  } catch (error) {
    logger.error('Error fetching webhooks:', error);
    res.status(500).json({ 
      error: 'Failed to fetch webhooks', 
      details: error.message 
    });
  }
});

// Delete a webhook by ID
app.delete('/api/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await webexBot.deleteWebhook(id);
    res.json({ success: true, message: `Webhook ${id} deleted` });
  } catch (error) {
    logger.error('Error deleting webhook:', error);
    res.status(500).json({ 
      error: 'Failed to delete webhook', 
      details: error.message 
    });
  }
});

// Re-register all webhooks (delete old ones and create new ones)
app.post('/api/webhooks/reregister', async (req, res) => {
  try {
    const existingWebhooks = await webexBot.getWebhooks();
    const targetUrl = config.webhook.url;

    logger.info('Re-registering webhooks...');

    // Delete all existing webhooks at this target URL
    for (const webhook of existingWebhooks) {
      if (webhook.targetUrl === targetUrl) {
        logger.info(`Deleting webhook: ${webhook.id}`);
        await webexBot.deleteWebhook(webhook.id);
      }
    }

    // Register messages webhook
    const messagesWebhook = await webexBot.registerWebhook({
      name: 'IT Support Bot - Messages',
      targetUrl,
      resource: 'messages',
      event: 'created',
      secret: config.webhook.secret || crypto.randomBytes(32).toString('hex')
    });
    logger.info(`Messages webhook registered: ${messagesWebhook.id}`);

    // Register attachmentActions webhook for card submissions
    const attachmentWebhook = await webexBot.registerWebhook({
      name: 'IT Support Bot - Card Submissions',
      targetUrl,
      resource: 'attachmentActions',
      event: 'created',
      secret: config.webhook.secret || crypto.randomBytes(32).toString('hex')
    });
    logger.info(`Attachment webhook registered: ${attachmentWebhook.id}`);

    res.json({ 
      success: true, 
      message: 'Webhooks re-registered successfully',
      webhooks: [messagesWebhook, attachmentWebhook]
    });
  } catch (error) {
    logger.error('Error re-registering webhooks:', error);
    res.status(500).json({ 
      error: 'Failed to re-register webhooks', 
      details: error.message 
    });
  }
});

// Start server
app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  await initializeBot();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
