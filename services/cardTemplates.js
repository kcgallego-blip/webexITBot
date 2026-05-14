/**
 * Adaptive Card templates for IT Support ticket submission
 * Uses Adaptive Cards schema 1.3 for Webex
 */

function toTitleCase(value = '') {
  return String(value)
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const cardTemplates = {
  teamLeaderCard(teamLeaders = []) {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "Create Request",
            "size": "medium",
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": "Select Team Leader",
            "wrap": true
          },
          {
            "type": "Input.ChoiceSet",
            "id": "teamLeader",
            "style": "compact",
            "choices": teamLeaders.map(teamLeader => ({
              title: teamLeader,
              value: teamLeader
            })),
            "isRequired": true,
            "errorMessage": "Please select a team leader"
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Next",
            "data": { "action": "selectTeamLeader" }
          }
        ]
      }
    };
  },

  agentSearchCard(teamLeader, searchTerm = '', note = '') {
    const body = [
      {
        "type": "TextBlock",
        "text": "Create Request",
        "size": "medium",
        "weight": "Bolder"
      },
      {
        "type": "TextBlock",
        "text": `**Team Leader:** ${teamLeader}`,
        "wrap": true
      },
      {
        "type": "TextBlock",
        "text": "Search agent name",
        "wrap": true
      },
      {
        "type": "Input.Text",
        "id": "agentSearch",
        "placeholder": "Type agent name",
        "value": searchTerm
      }
    ];

    if (note) {
      body.push({
        "type": "TextBlock",
        "text": note,
        "wrap": true,
        "isSubtle": true
      });
    }

    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": body,
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Next",
            "data": { "action": "searchAgentName" }
          }
        ]
      }
    };
  },

  agentResultsCard(teamLeader, searchTerm, agentNames = []) {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "Create Request",
            "size": "medium",
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": `**Team Leader:** ${teamLeader}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": `**Search:** ${searchTerm}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "Select Agent",
            "wrap": true
          },
          {
            "type": "Input.ChoiceSet",
            "id": "agentName",
            "style": "compact",
            "choices": agentNames.map(agentName => ({
              title: agentName,
              value: agentName
            })),
            "isRequired": true,
            "errorMessage": "Please select an agent"
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Next",
            "data": { "action": "selectAgentResult" }
          }
        ]
      }
    };
  },

  /**
   * Card 1: Category selection dropdown
   */
  categoryCard() {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "📋 Create Support Ticket",
            "size": "medium",
            "weight": "Bolder",
            "isSubtle": false
          },
          {
            "type": "TextBlock",
            "text": "What type of issue are you experiencing?",
            "wrap": true
          },
          {
            "type": "Input.ChoiceSet",
            "id": "category",
            "style": "compact",
            "choices": [
              { "title": "Hardware", "value": "hardware" },
              { "title": "Software", "value": "software" },
              { "title": "Network", "value": "network" },
              { "title": "Access", "value": "access" }
            ],
            "isRequired": true,
            "errorMessage": "Please select a category"
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Next →",
            "data": { "action": "selectCategory" }
          }
        ]
      }
    };
  },

  /**
   * Card 2: Sub-category selection based on category
   * @param {string} selectedCategory - The category chosen in step 1
   */
  subcategoryCard(selectedCategory) {
    const subcategories = {
      hardware: [
        { title: "Laptop", value: "laptop" },
        { title: "Monitor", value: "monitor" },
        { title: "Printer", value: "printer" },
        { title: "Peripherals", value: "peripherals" }
      ],
      software: [
        { title: "OS", value: "os" },
        { title: "Application", value: "application" },
        { title: "License", value: "license" }
      ],
      network: [
        { title: "No internet", value: "no_internet" },
        { title: "VPN", value: "vpn" },
        { title: "Slow connection", value: "slow_connection" }
      ],
      access: [
        { title: "Password reset", value: "password_reset" },
        { title: "Account locked", value: "account_locked" },
        { title: "Permissions", value: "permissions" }
      ]
    };

    const choices = subcategories[selectedCategory] || [];

    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "📋 Create Support Ticket",
            "size": "medium",
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": `You selected: **${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}**`,
            "wrap": true,
            "isSubtle": true
          },
          {
            "type": "TextBlock",
            "text": "Please choose a sub-category:",
            "wrap": true
          },
          {
            "type": "Input.ChoiceSet",
            "id": "subcategory",
            "style": "compact",
            "choices": choices,
            "isRequired": true,
            "errorMessage": "Please select a sub-category"
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "← Back",
            "data": { "action": "backToCategory" }
          },
          {
            "type": "Action.Submit",
            "title": "Next →",
            "data": { "action": "selectSubcategory" }
          }
        ]
      }
    };
  },

  /**
   * Card 3: Description text input + Submit
   * @param {string} category - Selected category
   * @param {string} subcategory - Selected sub-category
   */
  descriptionCard(category, subcategory) {
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    const subcategoryLabel = subcategory.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "📋 Create Support Ticket",
            "size": "medium",
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": `**Category:** ${categoryLabel}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": `**Sub-category:** ${subcategoryLabel}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "Select work setup and add details if needed:",
            "wrap": true
          },
          {
            "type": "Input.ChoiceSet",
            "id": "workLocation",
            "style": "compact",
            "choices": [
              { "title": "Onsite", "value": "onsite" },
              { "title": "WFH", "value": "wfh" }
            ],
            "isRequired": true,
            "errorMessage": "Please select work setup"
          },
          {
            "type": "Input.Text",
            "id": "description",
            "style": "multiline",
            "placeholder": "Optional details"
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "← Back",
            "data": { "action": "backToSubcategory" }
          },
          {
            "type": "Action.Submit",
            "title": "Submit Ticket",
            "style": "positive",
            "data": { "action": "submitTicket" }
          }
        ]
      }
    };
  },

  /**
   * Confirmation card after successful submission
   */
  confirmationCard(category, subcategory) {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "✅ Ticket Submitted",
            "size": "large",
            "weight": "Bolder",
            "color": "good"
          },
          {
            "type": "TextBlock",
            "text": `Your ${category}/${subcategory.replace('_', ' ')} ticket has been successfully submitted!`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "A technician will contact you shortly.",
            "wrap": true,
            "isSubtle": true
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Create Another Ticket",
            "data": { "action": "start_new" }
          }
        ]
      }
    };
  },

  /**
   * Error card
   */
  errorCard(message) {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "⚠️ Something went wrong",
            "size": "medium",
            "weight": "Bolder",
            "color": "warning"
          },
          {
            "type": "TextBlock",
            "text": message || "An error occurred. Please try again.",
            "wrap": true
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Try Again",
            "data": { "action": "start_request" }
          }
        ]
      }
    };
  },

  /**
   * Read-only replacement for a previously used card so users cannot
   * submit it again after moving to the next step.
   */
  lockedCard(title, fields = [], note = 'This step has already been used.') {
    const body = [
      {
        "type": "TextBlock",
        "text": title,
        "size": "medium",
        "weight": "Bolder"
      }
    ];

    fields
      .filter(field => field && field.label && field.value)
      .forEach(field => {
        body.push({
          "type": "TextBlock",
          "text": `**${field.label}:** ${field.value}`,
          "wrap": true
        });
      });

    body.push({
      "type": "TextBlock",
      "text": note,
      "wrap": true,
      "isSubtle": true,
      "spacing": "Medium"
    });

    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": body
      }
    };
  },

  /**
   * Ticket details card with colored status emoji
   */
ticketDetailsCard(ticket) {
      const ticketDateTime = `${ticket.date || 'N/A'} ${ticket.start_time || 'N/A'}`;
      let statusDisplay;
      if (ticket.status === 'Pending') {
        statusDisplay = `🔵 ${ticket.status}`;
      } else if (ticket.status === 'Resolved') {
        statusDisplay = `⚪ ${ticket.status}`;
      } else {
        statusDisplay = '🔴 Open';
      }

      return {
       contentType: "application/vnd.microsoft.card.adaptive",
       content: {
         "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
         "type": "AdaptiveCard",
         "version": "1.3",
         body: [
           { type: 'TextBlock', text: '🎫 Ticket Details', size: 'medium', weight: 'Bolder' },
           { type: 'TextBlock', text: `**Date & Time:** ${ticketDateTime}`, wrap: true },
           { type: 'TextBlock', text: `**Category:** ${ticket.category || 'N/A'}`, wrap: true },
           { type: 'TextBlock', text: `**Concern:** ${ticket.concern || 'N/A'}`, wrap: true },
           { type: 'TextBlock', text: `**Agent:** ${ticket.name || ticket.assisted_by || 'Unassigned'}`, wrap: true },
           { type: 'TextBlock', text: `**Status:** ${statusDisplay}`, wrap: true, weight: 'Bolder' }
         ]
       }
     };
   },

  formatCategoryLabel(category) {
    return toTitleCase(category);
  },

  formatSubcategoryLabel(subcategory) {
    return toTitleCase(subcategory);
  }
};

module.exports = { cardTemplates };
