const axios = require('axios');

/**
 * TicketService - Manages ticket submission state and Supabase persistence
 */
class TicketService {
  constructor(supabaseConfig) {
    this.conversations = new Map();
    this.supabaseUrl = String(supabaseConfig?.url || '').replace(/\/+$/, '');
    this.serviceRoleKey = supabaseConfig?.serviceRoleKey;
    this.ticketsTable = supabaseConfig?.ticketsTable || 'tickets';
    this.agentsTable = supabaseConfig?.agentsTable || 'agents';
    this.five9Table = supabaseConfig?.five9Table || 'five9';

    this.client = axios.create({
      baseURL: `${this.supabaseUrl}/rest/v1`,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  startConversation(personId, personEmail, roomId, personName = '') {
    this.conversations.set(personId, {
      step: 'category',
      data: {
        personId,
        personEmail,
        personName,
        roomId,
        teamLeader: '',
        agentSearch: '',
        agentName: '',
        category: '',
        subcategory: '',
        workLocation: '',
        description: ''
      }
    });
  }

  getConversation(personId) {
    return this.conversations.get(personId);
  }

  updateConversation(personId, updates) {
    const convo = this.conversations.get(personId);
    if (convo) {
      Object.assign(convo.data, updates);
    }
  }

  advanceStep(personId, nextStep) {
    const convo = this.conversations.get(personId);
    if (convo) {
      convo.step = nextStep;
    }
  }

  async submitTicket(personId) {
    const convo = this.conversations.get(personId);
    if (!convo) return null;

    const ticket = convo.data;
    const submittedAt = new Date();
    const ticketId = await this.getNextTicketId();
    const concern = this.buildConcern(ticket.subcategory, ticket.description);
    const date = this.formatDate(submittedAt);
    const startTime = this.formatTime(submittedAt);

    await this.insertTicket({
      ticketid: ticketId,
      email: ticket.personEmail || ticket.personName || ticket.personId,
      category: this.toTitleCase(ticket.category),
      concern,
      date,
      start_time: startTime,
      status: 'Open'
    });

    this.conversations.delete(personId);

    return {
      ...ticket,
      ticketId,
      concern,
      date,
      startTime,
      status: 'Open'
    };
  }

  async getNextTicketId() {
    try {
      const response = await this.client.get(`/${this.ticketsTable}`, {
        params: {
          select: 'ticketid',
          order: 'ticketid.desc',
          limit: 1
        }
      });

      const currentMax = Array.isArray(response.data) && response.data.length > 0
        ? Number(response.data[0].ticketid)
        : 0;

      return Number.isFinite(currentMax) ? currentMax + 1 : 1;
    } catch (error) {
      const details = error.response?.data?.message || error.message;
      throw new Error(`Failed to determine next ticket ID from Supabase: ${details}`);
    }
  }

  async insertTicket(record) {
    try {
      await this.client.post(`/${this.ticketsTable}`, record, {
        headers: {
          Prefer: 'return=minimal'
        }
      });
    } catch (error) {
      const details = error.response?.data?.message || error.response?.data?.hint || error.message;
      throw new Error(`Failed to save ticket to Supabase: ${details}`);
    }
  }

  async createDirectRequestTicket(ticket) {
    const submittedAt = new Date();
    const record = {
      category: ticket.category || null,
      concern: ticket.concern || null,
      date: this.formatDate(submittedAt),
      start_time: this.formatTime(submittedAt),
      name: ticket.name || null,
      end_time: null,
      troubleshooting: null,
      assisted_by: null,
      status: 'Open',
      affected_five9: Boolean(ticket.affectedFive9),
      onsite: ticket.onsite !== false,
      webex_message_id: null,
      team_leader: ticket.teamLeader || null
    };

    try {
      const response = await this.client.post(`/${this.ticketsTable}`, record, {
        headers: {
          Prefer: 'return=representation'
        }
      });

      const saved = Array.isArray(response.data) ? response.data[0] : response.data;
      if (!saved?.ticketid) {
        throw new Error('Supabase did not return the new ticket ID');
      }

      return saved;
    } catch (error) {
      const details = error.response?.data?.message || error.response?.data?.hint || error.message;
      throw new Error(`Failed to save ticket to Supabase: ${details}`);
    }
  }

  async updateTicketWebexMessageId(ticketId, webexMessageId) {
    if (!ticketId || !webexMessageId) return false;

    try {
      await this.client.patch(
        `/${this.ticketsTable}`,
        { webex_message_id: webexMessageId },
        {
          params: {
            ticketid: `eq.${ticketId}`
          }
        }
      );
      return true;
    } catch (error) {
      const details = error.response?.data?.message || error.message;
      throw new Error(`Failed to update ticket Webex message ID in Supabase: ${details}`);
    }
  }

  async getUniqueTeamLeaders() {
    try {
      const response = await this.client.get(`/${this.agentsTable}`, {
        params: {
          select: 'team_leader',
          order: 'team_leader.asc'
        }
      });

      return [...new Set(
        (Array.isArray(response.data) ? response.data : [])
          .map(row => String(row.team_leader || '').trim())
          .filter(Boolean)
      )];
    } catch (error) {
      const details = error.response?.data?.message || error.message;
      throw new Error(`Failed to load team leaders from Supabase: ${details}`);
    }
  }

  async searchAgentsByTeamLeader(teamLeader, searchTerm) {
    try {
      const response = await this.client.get(`/${this.agentsTable}`, {
        params: {
          select: 'name',
          team_leader: `eq.${teamLeader}`,
          name: `ilike.*${searchTerm}*`,
          order: 'name.asc',
          limit: 25
        }
      });

      return [...new Set(
        (Array.isArray(response.data) ? response.data : [])
          .map(row => String(row.name || '').trim())
          .filter(Boolean)
      )];
    } catch (error) {
      const details = error.response?.data?.message || error.message;
      throw new Error(`Failed to load agents from Supabase: ${details}`);
    }
  }

  async searchAgentsByName(searchTerm) {
    try {
      const searchPattern = `%${searchTerm}%`;
      const response = await this.client.get(`/${this.agentsTable}`, {
        params: {
          select: 'name,team_leader',
          or: `(name.ilike.${searchPattern})`,
          order: 'name.asc',
          limit: 25
        }
      });

      return (Array.isArray(response.data) ? response.data : [])
        .map(row => ({
          name: String(row.name || '').trim(),
          teamLeader: String(row.team_leader || '').trim()
        }))
        .filter(agent => agent.name);
    } catch (error) {
      const details = error.response?.data?.message || error.message;
      throw new Error(`Failed to search agents from Supabase: ${details}`);
    }
  }

  async insertFive9Record(agentName, startTime, webexMessageId = null, webexSenderId = null) {
    try {
      const response = await this.client.post(`/${this.five9Table}`, {
        name: agentName,
        start_time: startTime,
        end_time: null,
        webex_message_id: webexMessageId,
        webex_sender_id: webexSenderId
      }, {
        headers: {
          Prefer: 'return=representation'
        }
      });

      return response.data && response.data[0];
    } catch (error) {
      const details = error.response?.data?.message || error.message;
      throw new Error(`Failed to save Five9 record to Supabase: ${details}`);
    }
  }

  async updateFive9EndTime(recordId, endTime) {
    try {
      await this.client.patch(`/${this.five9Table}`, {
        end_time: endTime
      }, {
        params: {
          id: `eq.${recordId}`
        }
      });
      return true;
    } catch (error) {
      const details = error.response?.data?.message || error.message;
      throw new Error(`Failed to update Five9 end time in Supabase: ${details}`);
    }
  }

  buildConcern(subcategory, description) {
    const subcategoryLabel = this.toTitleCase(subcategory);
    const trimmedDescription = String(description || '').trim();

    if (!trimmedDescription) {
      return subcategoryLabel;
    }

    return `${subcategoryLabel} - ${trimmedDescription}`;
  }

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  toTitleCase(value = '') {
    return String(value)
      .replace(/_/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  cancelConversation(personId) {
    this.conversations.delete(personId);
  }
}

module.exports = { TicketService };
