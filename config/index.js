/**
 * Configuration loader with validation
 */

const requiredEnvVars = [
  'WEBEX_ACCESS_TOKEN',
  'WEBEX_BOT_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

function validateConfig() {
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please copy .env.example to .env and fill in the values.`
    );
  }
}

function loadConfig() {
  validateConfig();

  return {
    webex: {
      accessToken: process.env.WEBEX_ACCESS_TOKEN,
      botId: process.env.WEBEX_BOT_ID,
      clientId: process.env.WEBEX_CLIENT_ID,
      clientSecret: process.env.WEBEX_CLIENT_SECRET,
      redirectUri: process.env.WEBEX_REDIRECT_URI,
      apiUrl: process.env.WEBEX_API_URL || 'https://webexapis.com/v1'
    },
    server: {
      port: parseInt(process.env.PORT, 10) || 3000,
      env: process.env.NODE_ENV || 'development'
    },
    webhook: {
      url: process.env.WEBHOOK_URL || 'http://localhost:3000/webhook',
      secret: process.env.WEBHOOK_SECRET || null
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      ticketsTable: process.env.SUPABASE_TICKETS_TABLE || 'tickets',
      agentsTable: process.env.SUPABASE_AGENTS_TABLE || 'agents'
    }
  };
}

module.exports = { loadConfig };
