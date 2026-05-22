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
    this.usersTable = supabaseConfig?.usersTable || 'users';
    this.tphTable = supabaseConfig?.tphTable || 'tph';

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
    let startTimeValue;
    if (ticket.startTime) {
      const timeMatch = String(ticket.startTime).match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        startTimeValue = `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}:00`;
      }
    }

    const record = {
      category: ticket.category || null,
      concern: ticket.concern || null,
      date: this.formatDate(submittedAt),
      start_time: startTimeValue || this.formatTime(submittedAt),
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

  async insertFive9Record(agentName, startTime, webexMessageId = null, webexSenderId = null, notes = null) {
    try {
      const today = this.getTodayDateString();
      const start_time = `${today} ${startTime}:00`;

      const response = await this.client.post(`/${this.five9Table}`, {
        name: agentName,
        start_time,
        end_time: null,
        webex_message_id: webexMessageId,
        webex_sender_id: webexSenderId,
        notes: notes || null
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
      const today = this.getTodayDateString();
      const end_time = `${today} ${endTime}:00`;

      await this.client.patch(`/${this.five9Table}`, {
        end_time
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

  async getFive9BacklogBySender(webexSenderId) {
    try {
      const response = await this.client.get(`/${this.five9Table}`, {
        params: {
          select: 'id,name,start_time,end_time,webex_sender_id,notes',
          webex_sender_id: `eq.${webexSenderId}`,
          end_time: 'is.null',
          order: 'start_time.asc'
        }
      });

      const rows = Array.isArray(response.data) ? response.data : [];
      const teamLeaderByName = new Map();

      for (const row of rows) {
        const name = String(row.name || '').trim();
        if (!name || teamLeaderByName.has(name)) continue;
        teamLeaderByName.set(name, await this.getUserTeamLeader(name));
      }

      return rows.map(row => ({
        id: row.id,
        name: String(row.name || '').trim(),
        startTime: String(row.start_time || '').trim(),
        notes: String(row.notes || '').trim(),
        teamLeader: teamLeaderByName.get(String(row.name || '').trim()) || ''
      }));
    } catch (error) {
      const details = error.response?.data?.message || error.message;
      throw new Error(`Failed to load Five9 backlog from Supabase: ${details}`);
    }
  }

  async getUserTeamLeader(name) {
    try {
      const response = await this.client.get(`/${this.usersTable}`, {
        params: {
          select: 'team_leader',
          name: `eq.${name}`,
          limit: 1
        }
      });

      const row = Array.isArray(response.data) ? response.data[0] : null;
      return String(row?.team_leader || '').trim();
    } catch (error) {
      return '';
    }
  }

  async updateFive9EndTimeForSender(recordId, webexSenderId, endTime) {
    try {
      const today = this.getTodayDateString();
      const end_time = `${today} ${endTime}:00`;

      await this.client.patch(`/${this.five9Table}`, {
        end_time
      }, {
        params: {
          id: `eq.${recordId}`,
          webex_sender_id: `eq.${webexSenderId}`,
          end_time: 'is.null'
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
    const tzOffsetMs = 8 * 60 * 60 * 1000;
    const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
    const tzTime = new Date(utcTime + tzOffsetMs);
    const hours = String(tzTime.getHours()).padStart(2, '0');
    const minutes = String(tzTime.getMinutes()).padStart(2, '0');
    const seconds = String(tzTime.getSeconds()).padStart(2, '0');
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

  getTodayDateString() {
    const now = new Date();
    const tzOffsetMs = 8 * 60 * 60 * 1000;
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const tzTime = new Date(utcTime + tzOffsetMs);
    const year = tzTime.getFullYear();
    const month = String(tzTime.getMonth() + 1).padStart(2, '0');
    const day = String(tzTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  cancelConversation(personId) {
    this.conversations.delete(personId);
  }
}

module.exports = { TicketService };
