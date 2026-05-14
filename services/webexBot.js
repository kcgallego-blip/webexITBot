const axios = require('axios');
const crypto = require('crypto');

class WebexBot {
  constructor(accessToken, botId) {
    this.accessToken = accessToken;
    this.botId = botId;
    this.apiBaseUrl = process.env.WEBEX_API_URL || 'https://webexapis.com/v1';
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.apiBaseUrl,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(config => {
      console.log(`[Webex API] ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        const errorMessage = error.response?.data?.message || error.message;
        console.error(`[Webex API Error] ${errorMessage}`);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initialize bot and verify connection
   */
  async initialize() {
    try {
      const response = await this.client.get('/people/me');
      this.botInfo = response.data;
      return this.botInfo;
    } catch (error) {
      throw new Error(`Failed to initialize bot: ${error.message}`);
    }
  }

  /**
   * Get bot information
   */
  async getBotInfo() {
    if (this.botInfo) return this.botInfo;
    return await this.initialize();
  }

  /**
   * Send a message to a room or person
   * @param {Object} options - Message options
   * @param {string} [options.roomId] - Room ID (required if toPersonId not set)
   * @param {string} [options.toPersonId] - Person ID (required if roomId not set)
   * @param {string} [options.text] - Plain text message
   * @param {string} [options.markdown] - Markdown formatted message
   * @param {Array} [options.files] - Array of file attachments
   */
  async sendMessage({ roomId, toPersonId, text, markdown, files = [] }) {
    if (!roomId && !toPersonId) {
      throw new Error('Either roomId or toPersonId is required');
    }

    if (!text && !markdown) {
      throw new Error('Either text or markdown content is required');
    }

    const payload = {
      ...(roomId && { roomId }),
      ...(toPersonId && { toPersonId }),
      ...(text && { text }),
      ...(markdown && { markdown }),
      ...(files.length > 0 && { files })
    };

    const response = await this.client.post('/messages', payload);
    return response.data;
  }

  /**
   * Get list of rooms the bot is a member of
   * @param {Object} options - Filter options
   * @param {number} [options.max=50] - Max number of results
   * @param {string} [options.type] - Filter by type (direct, group)
   */
  async getRooms(options = {}) {
    const { max = 50, type } = options;
    const params = { max };
    if (type) params.type = type;

    const response = await this.client.get('/rooms', { params });
    return response.data.items || [];
  }

  /**
   * Get room details
   * @param {string} roomId - Room ID
   */
  async getRoomDetails(roomId) {
    const response = await this.client.get(`/rooms/${roomId}`);
    return response.data;
  }

  /**
   * Get message details by ID
   * @param {string} messageId - Message ID
   */
  async getMessageDetails(messageId) {
    const response = await this.client.get(`/messages/${messageId}`);
    return response.data;
  }

  /**
   * Get attachment action details by ID.
   * Webex attachmentActions webhooks include the action ID; the submitted
   * Adaptive Card inputs are returned by this endpoint.
   * @param {string} actionId - Attachment action ID
   */
  async getAttachmentActionDetails(actionId) {
    const response = await this.client.get(`/attachment/actions/${actionId}`);
    return response.data;
  }

  /**
   * Search for people
   * @param {Object} options - Search criteria
   * @param {string} [options.email] - Filter by email
   * @param {string} [options.displayName] - Filter by display name
   * @param {string} [options.id] - Filter by person ID
   * @param {number} [options.max=25] - Max results
   */
  async getPeople(options = {}) {
    const { email, displayName, id, max = 25 } = options;
    const params = { max };
    
    if (email) params.email = email;
    if (displayName) params.displayName = displayName;
    if (id) params.id = id;

    const response = await this.client.get('/people', { params });
    return response.data.items || [];
  }

  /**
   * Get person by ID or email
   * @param {string} personId - Person ID or email
   */
  async getPerson(personId) {
    const response = await this.client.get(`/people/${personId}`);
    return response.data;
  }

  /**
   * Register a webhook for bot events
   * @param {Object} options - Webhook configuration
   * @param {string} options.targetUrl - URL to receive webhook events
   * @param {string} options.resource - Resource type (e.g., 'messages')
   * @param {string} options.event - Event type (e.g., 'created')
   * @param {string} [options.name] - Webhook name (default: auto-generated)
   * @param {string} [options.secret] - Secret for signature verification
   */
  async registerWebhook({ targetUrl, resource, event, name, secret }) {
    const payload = {
      name: name || `Webhook-${resource}-${event}-${Date.now()}`,
      targetUrl,
      resource,
      event,
      ...(secret && { secret })
    };

    const response = await this.client.post('/webhooks', payload);
    return response.data;
  }

  /**
   * Get all registered webhooks
   */
  async getWebhooks() {
    const response = await this.client.get('/webhooks');
    return response.data.items || [];
  }

  /**
   * Delete a webhook
   * @param {string} webhookId - Webhook ID to delete
   */
  async deleteWebhook(webhookId) {
    await this.client.delete(`/webhooks/${webhookId}`);
    return { success: true };
  }

  /**
   * Verify webhook signature (if secret is configured)
   * @param {string} secret - Webhook secret
   * @param {string} body - Raw request body
   * @param {string} signature - Signature from header
   */
  verifyWebhookSignature(secret, body, signature) {
    if (!secret || !signature) return true;

    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(body).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  /**
   * Join a room by ID
   * @param {string} roomId - Room ID to join
   */
  async joinRoom(roomId) {
    const response = await this.client.post(`/rooms/${roomId}/memberships`, {
      roomId
    });
    return response.data;
  }

  /**
   * Leave a room by ID
   * @param {string} roomId - Room ID to leave
   */
  async leaveRoom(roomId) {
    // Get bot's membership in the room
    const me = await this.getBotInfo();
    const memberships = await this.client.get(`/rooms/${roomId}/memberships`);
    const membership = memberships.data.items.find(
      m => m.personId === me.id
    );

    if (membership) {
      await this.client.delete(`/room/memberships/${membership.id}`);
    }

    return { success: true };
  }

  /**
   * Send a card (attachment) to a room
   * @param {string} roomId - Room ID
   * @param {Object} card - Card configuration { contentType, content }
   */
  async sendCard(roomId, card) {
    if (!card || !card.contentType || !card.content) {
      throw new Error('Card must have contentType and content properties');
    }
    
    const { contentType, content } = card;
    const payload = {
      roomId,
      text: ' ', // Webex requires text, file, or meetingId even when sending attachments
      attachments: [
        {
          contentType,
          content
        }
      ]
    };
    const response = await this.client.post('/messages', payload);
    return response.data;
  }

  /**
   * Update an existing message. Can be used to replace an interactive card
   * with a non-interactive summary after the user submits it.
   * @param {string} messageId - Message ID to update
   * @param {Object} options - Updated message content
   */
  async updateMessage(messageId, { roomId, text, markdown, attachments = [] }) {
    if (!messageId) {
      throw new Error('messageId is required');
    }

    const payload = {
      ...(roomId && { roomId }),
      ...(text && { text }),
      ...(markdown && { markdown }),
      ...(attachments.length > 0 && { attachments })
    };

    const response = await this.client.put(`/messages/${messageId}`, payload);
    return response.data;
  }
}

module.exports = { WebexBot };
