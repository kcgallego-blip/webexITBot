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

function toTimeDisplay(value = '') {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);

  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
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
  },

  rAgentSelectionCard(searchName, issue, agentResults = []) {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "Create Ticket",
            "size": "medium",
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": `Found ${agentResults.length} agents matching "${searchName}". Please select one:`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": `**Issue:** ${issue}`,
            "wrap": true
          },
          {
            "type": "Input.ChoiceSet",
            "id": "rSelectedAgent",
            "style": "compact",
            "choices": agentResults.map(agent => ({
              title: agent.teamLeader ? `${agent.name} (${agent.teamLeader})` : agent.name,
              value: JSON.stringify({ name: agent.name, teamLeader: agent.teamLeader })
            })),
            "isRequired": true,
            "errorMessage": "Please select an agent"
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Next",
            "data": { "action": "rSelectAgent" }
          },
          {
            "type": "Action.Submit",
            "title": "Cancel",
            "style": "destructive",
            "data": { "action": "rCancel" }
          }
        ]
      }
    };
  },

  rCategoryCard({ teamLeader = '', agentName = '', issue = '' } = {}) {
    const categories = [
      'Hardware',
      'Internet Connection',
      'Zendesk',
      'Five9',
      'Google',
      'Credentials',
      'Others'
    ];

    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "Create Ticket",
            "size": "medium",
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": `**Team Leader:** ${teamLeader || 'N/A'}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": `**Agent:** ${agentName || 'N/A'}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": `**Issue:** ${issue || 'N/A'}`,
            "wrap": true
          },
          {
            "type": "Input.ChoiceSet",
            "id": "rCategory",
            "style": "compact",
            "choices": categories.map(category => ({
              title: category,
              value: category
            })),
            "isRequired": true,
            "errorMessage": "Please select a category"
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Next",
            "data": { "action": "rSelectCategory" }
          },
          {
            "type": "Action.Submit",
            "title": "Cancel",
            "style": "destructive",
            "data": { "action": "rCancel" }
          }
        ]
      }
    };
  },

  rConfirmationCard({ teamLeader = '', agentName = '', category = '', issue = '' } = {}) {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "Confirm Ticket",
            "size": "medium",
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": `**Team Leader:** ${teamLeader || 'N/A'}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": `**Agent:** ${agentName || 'N/A'}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": `**Category:** ${category || 'N/A'}`,
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": `**Issue:** ${issue || 'N/A'}`,
            "wrap": true
          },
          {
            "type": "Input.Toggle",
            "id": "affectedFive9",
            "title": "Does this affect the agent's Five9 login hours?",
            "value": "false",
            "valueOn": "true",
            "valueOff": "false"
          },
          {
            "type": "Input.Toggle",
            "id": "onsite",
            "title": "Is agent onsite?",
            "value": "true",
            "valueOn": "true",
            "valueOff": "false"
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Submit",
            "style": "positive",
            "data": { "action": "rSubmit" }
          },
          {
            "type": "Action.Submit",
            "title": "Cancel",
            "style": "destructive",
            "data": { "action": "rCancel" }
          }
        ]
      }
    };
  },

  rSubmittedCard(ticketId) {
    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "Ticket Submitted",
            "size": "medium",
            "weight": "Bolder",
            "color": "good"
          },
          {
            "type": "TextBlock",
            "text": `Ticket #${ticketId} has been created.`,
            "wrap": true
          }
        ]
      }
    };
  },

/**
    * Report selection card for /r command
    */
   reportSelectionCard() {
     return {
       contentType: "application/vnd.microsoft.card.adaptive",
       content: {
         "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
         "type": "AdaptiveCard",
         "version": "1.3",
         "body": [
           {
             "type": "TextBlock",
             "text": "Select Report",
             "size": "medium",
             "weight": "Bolder"
           },
           {
             "type": "Input.ChoiceSet",
             "id": "reportType",
             "style": "compact",
             "choices": [
               { "title": "Five9 Logout Report", "value": "five9_logout" },
               { "title": "IT Issue Report (Requires IT Troubleshooting)", "value": "it_issue" }
             ],
             "isRequired": true,
             "errorMessage": "Please select a report"
           }
         ],
         "actions": [
           {
             "type": "Action.Submit",
             "title": "Next",
             "data": { "action": "selectReport" }
           }
         ]
       }
     };
   },

f9UnifiedCard(state, data = {}) {
    const {
      teamLeader = '',
      agentName = '',
      logoutTime = '',
      loginTime = '',
      searchTerm = '',
      agentResults = []
    } = data;

    const body = [
      {
        "type": "TextBlock",
        "text": "Five9 Logout",
        "size": "medium",
        "weight": "Bolder"
      }
    ];

    if (state === 'selectAgent') {
      body.push(
        {
          "type": "TextBlock",
          "text": `Logout Time: ${logoutTime}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": "Select Agent:",
          "wrap": true
        },
        {
          "type": "Input.ChoiceSet",
          "id": "f9SelectedAgent",
          "style": "compact",
          "choices": agentResults.map(agent => ({
            title: agent.name,
            value: JSON.stringify({ name: agent.name, teamLeader: agent.teamLeader })
          })),
          "isRequired": true
        }
      );
    } else if (state === 'confirm') {
      body.push(
        {
          "type": "TextBlock",
          "text": `**Team Leader:** ${teamLeader}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `**Agent:** ${agentName}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `**Logout Time:** ${logoutTime}`,
          "wrap": true
        }
      );
    } else if (state === 'loginTime') {
      body.push(
        {
          "type": "TextBlock",
          "text": `**Team Leader:** ${teamLeader}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `**Agent:** ${agentName}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `**Logout Time:** ${logoutTime}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": "Enter Login Time (24-hour format, e.g., 22:30):",
          "wrap": true
        },
        {
          "type": "Input.Text",
          "id": "endTime",
          "placeholder": "HH:MM",
          "isRequired": true
        }
      );
    } else if (state === 'complete') {
      body.push(
        {
          "type": "TextBlock",
          "text": `**Team Leader:** ${teamLeader}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `**Agent:** ${agentName}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `**Logout Time:** ${logoutTime}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `**Login Time:** ${loginTime}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": "✅ Five9 logout recorded successfully",
          "wrap": true,
          "weight": "Bolder",
          "color": "good"
        }
      );
    }

    const actions = [];
    if (state === 'selectAgent') {
      actions.push({
        "type": "Action.Submit",
        "title": "Next",
        "data": { "action": "f9SelectAgent" }
      });
    } else if (state === 'confirm') {
      actions.push(
        {
          "type": "Action.Submit",
          "title": "Submit",
          "style": "positive",
          "data": { "action": "f9Submit" }
        },
        {
          "type": "Action.Submit",
          "title": "Cancel",
          "style": "destructive",
          "data": { "action": "f9Cancel" }
        }
      );
    } else if (state === 'loginTime') {
      actions.push({
        "type": "Action.Submit",
        "title": "Update Login Time",
        "style": "positive",
        "data": { "action": "f9EndTimeSubmit" }
      });
    }

    return {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": body,
        "actions": actions
      }
    };
  },

f9CheckCard(record, index, total) {
      const isLast = index >= total - 1;
      const logoutTime = record.startTime ? toTimeDisplay(record.startTime) : 'N/A';

      return {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          "type": "AdaptiveCard",
          "version": "1.3",
          "body": [
            {
              "type": "TextBlock",
              "text": `Five9 Backlog ${index + 1} of ${total}`,
              "size": "medium",
              "weight": "Bolder"
            },
            {
              "type": "TextBlock",
              "text": `**Name:** ${record.name || 'N/A'}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `**Team Leader:** ${record.teamLeader || 'N/A'}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `**Logout Time:** ${logoutTime}`,
              "wrap": true
            },
            {
              "type": "Input.Text",
              "id": "endTime",
              "placeholder": "Login time, e.g. 22:30"
            }
          ],
          "actions": [
            {
              "type": "Action.Submit",
              "title": isLast ? "Submit" : "Next",
              "style": "positive",
              "data": { "action": "f9CheckNext" }
            },
            {
              "type": "Action.Submit",
              "title": "Cancel",
              "style": "destructive",
              "data": { "action": "f9CheckCancel" }
            }
          ]
        }
      };
    },

f9CheckEmptyCard() {
      return {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          "type": "AdaptiveCard",
          "version": "1.3",
          "body": [
            {
              "type": "TextBlock",
              "text": "🎉 Five9 Backlog Clear",
              "size": "medium",
              "weight": "Bolder",
              "color": "good"
            },
            {
              "type": "TextBlock",
              "text": "Nice, no pending Five9 login times were found for your Webex account.",
              "wrap": true
            }
          ]
        }
      };
    },

f9CheckCompleteCard(total) {
      return {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          "type": "AdaptiveCard",
          "version": "1.3",
          "body": [
            {
              "type": "TextBlock",
              "text": "Five9 Backlog Complete",
              "size": "medium",
              "weight": "Bolder",
              "color": "good"
            },
            {
              "type": "TextBlock",
              "text": `${total} backlog ${total === 1 ? 'record has' : 'records have'} been updated.`,
              "wrap": true
            }
          ]
        }
      };
    },

f9EndTimeCard(teamLeader, agentName, startTime) {
      return this.f9UnifiedCard('loginTime', {
        teamLeader,
        agentName,
        logoutTime: startTime
      });
    }
  };

module.exports = { cardTemplates };
