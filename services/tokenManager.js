const axios = require('axios');
const fs = require('fs');
const path = require('path');

class TokenManager {
  constructor(config) {
    this.config = config;
    this.tokensFile = path.join(__dirname, '../data/tokens.json');
    this.ensureDataDir();
    this.tokens = this.loadTokens();
  }

  ensureDataDir() {
    const dataDir = path.dirname(this.tokensFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  loadTokens() {
    try {
      if (fs.existsSync(this.tokensFile)) {
        const data = fs.readFileSync(this.tokensFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Error loading tokens:', err.message);
    }
    return {};
  }

  saveTokens() {
    try {
      fs.writeFileSync(this.tokensFile, JSON.stringify(this.tokens, null, 2));
    } catch (err) {
      console.error('Error saving tokens:', err.message);
    }
  }

  /**
   * Store tokens for a user
   * @param {string} personId - Webex person ID
   * @param {Object} tokens - { access_token, refresh_token, expires_at }
   */
  setUserTokens(personId, tokens) {
    this.tokens[personId] = {
      ...tokens,
      updated_at: new Date().toISOString()
    };
    this.saveTokens();
  }

  /**
   * Get stored tokens for a user
   * @param {string} personId - Webex person ID
   */
  getUserTokens(personId) {
    return this.tokens[personId] || null;
  }

  /**
   * Remove user tokens
   * @param {string} personId - Webex person ID
   */
  removeUserTokens(personId) {
    delete this.tokens[personId];
    this.saveTokens();
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    const response = await axios.post('https://webexapis.com/v1/access_token', {
      grant_type: 'authorization_code',
      code,
      client_id: this.config.webex.clientId,
      client_secret: this.config.webex.clientSecret,
      redirect_uri: this.config.webex.redirectUri
    });

    return response.data;
  }

  /**
   * Refresh an access token
   */
  async refreshToken(refreshToken) {
    const response = await axios.post('https://webexapis.com/v1/access_token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.webex.clientId,
      client_secret: this.config.webex.clientSecret
    });

    return response.data;
  }

  /**
   * Get a valid access token for a user (refreshes if expired)
   */
  async getValidAccessToken(personId) {
    const stored = this.getUserTokens(personId);
    if (!stored) {
      throw new Error(`No tokens found for person ${personId}`);
    }

    // Check if token expires in next 5 minutes
    const expiresAt = new Date(stored.expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) {
      // Refresh token
      try {
        const refreshed = await this.refreshToken(stored.refresh_token);
        this.setUserTokens(personId, {
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        });
        return refreshed.access_token;
      } catch (error) {
        console.error('Token refresh failed:', error.message);
        throw new Error('Failed to refresh token');
      }
    }

    return stored.access_token;
  }

  /**
   * Build OAuth authorization URL
   */
  buildAuthUrl(scopes = ['spark:messages_read', 'spark:messages_write', 'spark:rooms_read', 'spark:people_read'], state = null) {
    const scopeParam = encodeURIComponent(scopes.join(' '));
    const redirectUri = encodeURIComponent(this.config.webex.redirectUri);
    const baseUrl = 'https://webexapis.com/v1/authorize';
    
    let url = `${baseUrl}?client_id=${this.config.webex.clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scopeParam}`;
    
    if (state) {
      url += `&state=${encodeURIComponent(state)}`;
    }

    return url;
  }
}

module.exports = { TokenManager };