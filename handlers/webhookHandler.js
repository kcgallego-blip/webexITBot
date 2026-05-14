/**
 * Webhook handler factory for incoming Webex events
 * Returns a middleware function for Express
 */

const crypto = require('crypto');

function webhookHandler(webexBot, logger, ticketService, cardTemplates) {
  return async (req, res) => {
    try {
      const { resource, event, data } = req.body;

      // Log all incoming webhooks with full details
      logger.info(`Webhook received - Resource: ${resource}, Event: ${event}`);
      logger.debug(`Webhook full data: ${JSON.stringify(data)}`);

      // Handle different event types
      switch (resource) {
        case 'messages':
          await handleMessageEvent(webexBot, logger, ticketService, cardTemplates, event, data);
          break;

        case 'attachmentActions':
          await handleAttachmentActionEvent(webexBot, logger, ticketService, cardTemplates, event, data);
          break;

        case 'memberships':
          await handleMembershipEvent(webexBot, logger, event, data);
          break;

        case 'rooms':
          await handleRoomEvent(webexBot, logger, event, data);
          break;

        default:
          logger.warn(`Unhandled resource type: ${resource}`);
      }

      // Acknowledge receipt
      res.status(200).json({ received: true });

    } catch (error) {
      logger.error('Webhook processing error:', error.message);
      logger.debug('Error stack:', error.stack);
      res.status(500).json({
        error: 'Webhook processing failed',
        details: error.message
      });
    }
  };
}

/**
 * Handle message events
 */
async function handleMessageEvent(webexBot, logger, ticketService, cardTemplates, event, data) {
  const { id: messageId, roomId } = data;

  if (event !== 'created') return;

  // Fetch full message details (webhook only provides ID and roomId)
  let message;
  try {
    message = await webexBot.getMessageDetails(messageId);
  } catch (error) {
    logger.error('Failed to fetch message details:', error.message);
    return;
  }

  const { personId, personEmail, text } = message;
  const attachment = message.attachment || (message.attachments && message.attachments[0]);

  // Log the full message for debugging
  logger.debug(`Full message received: ${JSON.stringify(message, null, 2)}`);

  // Ignore messages from the bot itself
  const botInfo = await webexBot.getBotInfo();
  if (personId === botInfo.id) {
    logger.debug('Ignoring bot\'s own message');
    return;
  }

  // Check if this is a direct message (1-on-1) vs a room
  let roomDetails = null;
  try {
    roomDetails = await webexBot.getRoomDetails(roomId);
  } catch (error) {
    logger.error('Failed to get room details:', error.message);
    return;
  }

  // Only respond to direct messages (type === 'direct'), not to group rooms
  if (roomDetails.type !== 'direct') {
    logger.info(`Ignoring message in ${roomDetails.type} room: ${roomDetails.title || roomId}`);
    return;
  }

  logger.info(`Direct message from ${personEmail || 'unknown'}${text ? `: "${text}"` : ''}`);

  // Check if this is a card submission (has attachment)
  if (attachment && attachment.contentType === 'application/vnd.microsoft.card.adaptive') {
    logger.info(`Card submission received`);
    logger.debug(`Full attachment: ${JSON.stringify(attachment)}`);
    logger.debug(`Card content: ${JSON.stringify(attachment.content)}`);
    await handleCardSubmission(webexBot, logger, ticketService, cardTemplates, personId, personEmail, roomId, attachment.content);
    return;
  }

  // Process text commands
  if (text) {
    const lowerText = text.toLowerCase().trim();
    logger.info(`Processing text command: "${lowerText}"`);
    
    const response = await processMessage(webexBot, logger, ticketService, cardTemplates, {
      messageId,
      roomId,
      personId,
      personEmail,
      text
    });

    // If response is text, send it; if it's a card object, send card
    if (response) {
      if (response.contentType) {
        logger.info(`Sending Adaptive Card (${response.contentType})`);
        await webexBot.sendCard(roomId, response);
      } else {
        logger.info(`Sending text response: "${response.substring(0, 50)}..."`);
        await webexBot.sendMessage({
          roomId,
          markdown: response
        });
      }
    } else {
      logger.debug('No response generated for message');
    }
  } else {
    logger.debug('Received direct message with no text content');
  }
}

/**
 * Handle membership events
 */
async function handleMembershipEvent(webexBot, logger, event, data) {
  const { roomId, personId, personEmail, isModerator } = data;

  // Get bot info
  const botInfo = await webexBot.getBotInfo();

  // If bot was added to room
  if (personId === botInfo.id && event === 'created') {
    logger.info(`Bot added to room ${roomId} by ${personEmail || 'unknown'}`);
    
    // Send Get Started card with button
    await webexBot.sendCard(roomId, {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.3",
        "body": [
          {
            "type": "TextBlock",
            "text": "Welcome!",
            "size": "large",
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": "Hi! I'm your Webex assistant. Type **/r** to create a request.",
            "wrap": true
          }
        ],
        "actions": [
          {
            "type": "Action.Submit",
            "title": "Get Started",
            "data": { "action": "get_started" }
          }
        ]
      }
    });
  }
  
  // If someone joined a room where bot is present
  else if (event === 'created') {
    logger.info(`${personEmail || 'User'} joined room ${roomId}`);
    
    // Optional: Greet new member
    try {
      await webexBot.sendMessage({
        roomId,
        markdown: `Welcome ${personEmail ? `@${personEmail.split('@')[0]}` : 'there'}! 🎉`
      });
    } catch (error) {
      logger.error('Failed to send welcome message:', error);
    }
  }
  
  // If someone left the room
  else if (event === 'deleted') {
    logger.info(`${personEmail || 'User'} left room ${roomId}`);
  }
}

/**
 * Handle attachment action events (card submissions)
 */
async function handleAttachmentActionEvent(webexBot, logger, ticketService, cardTemplates, event, data) {
  if (event !== 'created') return;

  const { id } = data;
  let actionDetails = data;

  if (!id) {
    logger.warn('Attachment action webhook missing action ID');
    return;
  }

  try {
    actionDetails = await webexBot.getAttachmentActionDetails(id);
    logger.debug(`Fetched attachment action details: ${JSON.stringify(actionDetails)}`);
  } catch (error) {
    logger.error('Failed to fetch attachment action details:', error.message);
    return;
  }

  const {
    roomId,
    personId,
    personEmail,
    messageId,
    type,
    inputs = {}
  } = actionDetails;

  logger.info(`Attachment action from ${personEmail || personId || 'unknown'}, type: ${type}`);
  logger.debug(`Attachment action data: ${JSON.stringify(data)}`);

  if (!roomId) {
    logger.warn('Attachment action details missing roomId');
    return;
  }

  // Check if this is a direct message
  let roomDetails = null;
  try {
    roomDetails = await webexBot.getRoomDetails(roomId);
  } catch (error) {
    logger.error('Failed to get room details:', error.message);
    return;
  }

   // Only respond to direct messages (type === 'direct'), not to group rooms
   // Exception: allow assignAgent action from group rooms (for ticket cards)
   const isAssignAgentAction = action === 'assignAgent';
   
   if (roomDetails.type !== 'direct' && !isAssignAgentAction) {
     logger.info(`Ignoring attachment action in ${roomDetails.type} room: ${roomDetails.title || roomId}`);
     return;
   }

  // Handle card submission
  if (type === 'submit') {
    logger.info(`Card submission from ${personEmail || personId || 'unknown'}`);
    logger.debug(`Card inputs: ${JSON.stringify(inputs)}`);

    // Call the card submission handler with the inputs as card content
    const cardContent = { data: inputs };
    await handleCardSubmission(
      webexBot,
      logger,
      ticketService,
      cardTemplates,
      personId,
      personEmail,
      roomId,
      cardContent,
      messageId || id
    );
  }
}

/**
 * Handle room events
 */
async function handleRoomEvent(webexBot, logger, event, data) {
  const { id, title, isLocked, lastActivity } = data;
  logger.info(`Room ${event}: ${title} (${id})`);
}

/**
 * Handle Adaptive Card submissions
 */
async function handleCardSubmission(webexBot, logger, ticketService, cardTemplates, personId, personEmail, roomId, cardContent, sourceMessageId = null) {
  const cardData = cardContent.data || {};
  const action = cardData.action;

  logger.info(`Card submission from ${personEmail}, action: ${action}`);
  logger.debug(`Card submission data: ${JSON.stringify(cardData)}`);

  try {
    switch (action) {
      case 'selectAgentResult': {
        const agentName = String(cardData.agentName || '').trim();
        if (!agentName) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Please select an agent.'));
          return;
        }

        ticketService.updateConversation(personId, { agentName });
        await lockPreviousCard(webexBot, logger, cardTemplates, roomId, sourceMessageId, {
          title: 'Create Request',
          fields: [
            { label: 'Team Leader', value: ticketService.getConversation(personId)?.data?.teamLeader || '' },
            { label: 'Agent', value: agentName }
          ],
          note: 'Agent selected. The next step will follow in the new workflow.'
        });
        await webexBot.sendMessage({
          roomId,
          markdown: `**Agent selected:** ${agentName}\n\nThe next step in the new workflow will be added next.`
        });
        break;
      }

      case 'selectCategory': {
        const category = cardData.category;
        const personProfile = await resolvePersonProfile(webexBot, logger, personId);
        logger.debug(`Selected category: ${category}`);
        if (!category) {
          logger.warn('No category selected');
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Please select a category.'));
          return;
        }
        await lockPreviousCard(webexBot, logger, cardTemplates, roomId, sourceMessageId, {
          title: 'Support Ticket',
          fields: [
            { label: 'Category', value: cardTemplates.formatCategoryLabel(category) }
          ],
          note: 'Category selected. Continue with the next card.'
        });
        ticketService.startConversation(
          personId,
          personProfile.email || personEmail,
          roomId,
          personProfile.name
        );
        ticketService.updateConversation(personId, { category });
        ticketService.advanceStep(personId, 'subcategory');
        const subcatCard = cardTemplates.subcategoryCard(category);
        logger.debug(`Sending subcategory card for ${category}`);
        await webexBot.sendCard(roomId, subcatCard);
        logger.info(`Subcategory card sent successfully`);
        break;
      }

      case 'backToCategory': {
        const convo = ticketService.getConversation(personId);
        await lockPreviousCard(webexBot, logger, cardTemplates, roomId, sourceMessageId, {
          title: 'Support Ticket',
          fields: convo?.data?.category
            ? [{ label: 'Category', value: cardTemplates.formatCategoryLabel(convo.data.category) }]
            : [],
          note: 'Returned to category selection. Use the latest card below.'
        });
        ticketService.advanceStep(personId, 'category');
        await webexBot.sendCard(roomId, cardTemplates.categoryCard());
        break;
      }

      case 'selectSubcategory': {
        const subcategory = cardData.subcategory;
        if (!subcategory) {
          const convo = ticketService.getConversation(personId);
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Please select a sub-category.'));
          return;
        }
        const convo = ticketService.getConversation(personId);
        await lockPreviousCard(webexBot, logger, cardTemplates, roomId, sourceMessageId, {
          title: 'Support Ticket',
          fields: [
            { label: 'Category', value: cardTemplates.formatCategoryLabel(convo?.data?.category) },
            { label: 'Sub-category', value: cardTemplates.formatSubcategoryLabel(subcategory) }
          ],
          note: 'Sub-category selected. Continue with the next card.'
        });
        ticketService.updateConversation(personId, { subcategory });
        ticketService.advanceStep(personId, 'description');
        const updatedConvo = ticketService.getConversation(personId);
        await webexBot.sendCard(roomId, cardTemplates.descriptionCard(updatedConvo.data.category, updatedConvo.data.subcategory));
        break;
      }

      case 'backToSubcategory': {
        const convo = ticketService.getConversation(personId);
        if (convo) {
          await lockPreviousCard(webexBot, logger, cardTemplates, roomId, sourceMessageId, {
            title: 'Support Ticket',
            fields: [
              { label: 'Category', value: cardTemplates.formatCategoryLabel(convo.data.category) },
              { label: 'Sub-category', value: cardTemplates.formatSubcategoryLabel(convo.data.subcategory) }
            ],
            note: 'Returned to sub-category selection. Use the latest card below.'
          });
          ticketService.advanceStep(personId, 'subcategory');
          await webexBot.sendCard(roomId, cardTemplates.subcategoryCard(convo.data.category));
        }
        break;
      }

       case 'submitTicket': {
         const description = (cardData.description || '').trim();
         const workLocation = cardData.workLocation;
         if (!workLocation) {
           await webexBot.sendCard(roomId, cardTemplates.errorCard('Please select either Onsite or WFH.'));
           return;
         }
         const convo = ticketService.getConversation(personId);
         const personProfile = await resolvePersonProfile(webexBot, logger, personId);
         ticketService.updateConversation(personId, { workLocation, description });
         ticketService.updateConversation(personId, {
           personName: personProfile.name || convo?.data?.personName || '',
           personEmail: personProfile.email || convo?.data?.personEmail || personEmail || ''
         });
         const ticket = await ticketService.submitTicket(personId);
         if (ticket) {
           await lockPreviousCard(webexBot, logger, cardTemplates, roomId, sourceMessageId, {
             title: 'Support Ticket',
             fields: [
               { label: 'Category', value: cardTemplates.formatCategoryLabel(convo?.data?.category) },
               { label: 'Sub-category', value: cardTemplates.formatSubcategoryLabel(convo?.data?.subcategory) },
               { label: 'Work Setup', value: cardTemplates.formatSubcategoryLabel(workLocation) },
               { label: 'Description', value: description }
             ],
             note: 'Ticket submitted. Use the newest card below for any next action.'
           });
           await webexBot.sendCard(roomId, cardTemplates.confirmationCard(ticket.category, ticket.subcategory));
           // Also send a text summary
           await webexBot.sendMessage({
             roomId,
             markdown: `**Ticket Summary**\n• Category: ${ticket.category}\n• Sub-category: ${ticket.subcategory.replace('_', ' ')}\n• Work Setup: ${ticket.workLocation.toUpperCase()}\n• Description: ${ticket.description || '(blank)'}`
           });
           // Send ticket details card with status
           const detailsTicket = {
             date: ticket.date,
             start_time: ticket.startTime,
             category: ticket.category,
             concern: ticket.concern,
             name: null,
             assisted_by: null,
             status: 'Open'
           };
           const detailsCard = cardTemplates.ticketDetailsCard(detailsTicket);
           const cardResult = await webexBot.sendCard(roomId, detailsCard);
           // Store the Webex message ID in the ticket for later updates
           try {
             await ticketService.client.patch(
               `/${ticketService.ticketsTable}`,
               { webex_message_id: cardResult.id },
               {
                 params: {
                   ticketid: `eq.${ticket.ticketId}`
                 }
               }
             );
             logger.info(`✅ Stored webex_message_id ${cardResult.id} for ticket ${ticket.ticketId}`);
           } catch (patchErr) {
             logger.error(`Failed to store webex_message_id: ${patchErr.message}`);
           }
         } else {
           await webexBot.sendCard(roomId, cardTemplates.errorCard('Failed to save ticket. Please try again.'));
         }
         break;
       }

      default:
        logger.warn(`Unknown card action: ${action}`);
    }
  } catch (error) {
    logger.error('Error handling card submission:', error.message);
    logger.debug('Error stack:', error);
    try {
      const message = error.message?.includes('Supabase')
        ? error.message
        : 'An error occurred. Please type **/r** to begin again.';
      await webexBot.sendCard(roomId, cardTemplates.errorCard(message));
    } catch (sendError) {
      logger.error('Failed to send error card:', sendError.message);
    }
  }
}

async function lockPreviousCard(webexBot, logger, cardTemplates, roomId, messageId, options = {}) {
  if (!messageId) {
    return;
  }

  try {
    const card = cardTemplates.lockedCard(
      options.title || 'Previous Step',
      options.fields || [],
      options.note || 'This step has already been used.'
    );

    await webexBot.updateMessage(messageId, {
      roomId,
      text: ' ',
      attachments: [
        {
          contentType: card.contentType,
          content: card.content
        }
      ]
    });
  } catch (error) {
    logger.warn(`Failed to lock previous card ${messageId}: ${error.message}`);
  }
}

async function sendOrUpdateCard(webexBot, roomId, messageId, card) {
  if (messageId) {
    await webexBot.updateMessage(messageId, {
      roomId,
      text: ' ',
      attachments: [
        {
          contentType: card.contentType,
          content: card.content
        }
      ]
    });
    return;
  }

  await webexBot.sendCard(roomId, card);
}

async function resolvePersonProfile(webexBot, logger, personId) {
  if (!personId) {
    return { name: '', email: '' };
  }

  try {
    const person = await webexBot.getPerson(personId);
    return {
      name: person.displayName || [person.firstName, person.lastName].filter(Boolean).join(' '),
      email: Array.isArray(person.emails) ? (person.emails[0] || '') : ''
    };
  } catch (error) {
    logger.warn(`Failed to resolve Webex profile for ${personId}: ${error.message}`);
    return { name: '', email: '' };
  }
}

/**
 * Process incoming message and generate response
 * Customize this function based on your bot's functionality
 */
async function processMessage(webexBot, logger, ticketService, cardTemplates, messageData) {
  const { text, roomId, personId, personEmail } = messageData;
  const lowerText = text.toLowerCase().trim();

   // Start request flow
   if (lowerText === '/r') {
     const personProfile = await resolvePersonProfile(webexBot, logger, personId);
     const teamLeaders = await ticketService.getUniqueTeamLeaders();
     if (teamLeaders.length === 0) {
       return cardTemplates.errorCard('No team leaders were found in Supabase.');
     }
     ticketService.startConversation(
       personId,
       personProfile.email || personEmail,
       roomId,
       personProfile.name
     );
     ticketService.advanceStep(personId, 'teamLeader');
     return cardTemplates.teamLeaderCard(teamLeaders);
   }

  if (lowerText === 'help' || lowerText === '/help') {
    return `**Available Commands:**\n- **/r** - Begin request workflow\n- **help** - Show this help message\n- **status** - Bot status\n- **rooms** - List rooms bot is in\n- **info** - Bot information\n- **ping** - Check bot responsiveness`;
  }

  if (lowerText === '/get_started' || lowerText === 'get started') {
    return `Welcome aboard!\n\nType **/r** to create a request.\n\nOther commands:\n- **help** - See all commands\n- **status** - Check bot health`;
  }

  // Command handling
  if (lowerText === 'help' || lowerText === '/help') {
    return `**Available Commands:**\n• **start** - Begin IT support ticket submission\n• **help** - Show this help message\n• **status** - Bot status\n• **rooms** - List rooms bot is in\n• **info** - Bot information\n• **ping** - Check bot responsiveness`;
  }

  if (lowerText === '/get_started' || lowerText === 'get started') {
    return `🎉 **Welcome aboard!**\n\nType **start** to create an IT support ticket.\n\nOther commands:\n• **help** - See all commands\n• **status** - Check bot health`;
  }

  if (lowerText === 'ping') {
    return '🏓 Pong! Bot is alive and responding.';
  }

  if (lowerText === 'status') {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    return `✅ Bot Status: Online\n⏱ Uptime: ${hours}h ${minutes}m\n📍 Room: ${roomId}`;
  }

  if (lowerText === 'rooms') {
    const rooms = await webexBot.getRooms();
    const roomList = rooms
      .slice(0, 10)
      .map(r => `• ${r.title}`)
      .join('\n');
    return `**Bot is in ${rooms.length} rooms:**\n${roomList}`;
  }

  if (lowerText === 'info') {
    const botInfo = await webexBot.getBotInfo();
    return `**Bot Information:**\n• Name: ${botInfo.displayName}\n• Email: ${botInfo.emails[0]}\n• ID: ${botInfo.id}`;
  }

  // Echo command for testing
  if (lowerText.startsWith('echo ')) {
    return text.substring(5);
  }

  // If no command matched, you can:
  // 1. Return null (no response)
  // 2. Return a default message
  // 3. Process NLP/AI integration here
   
   return null; // No response for unrecognized messages
}

/**
 * Verify webhook signature
 * @param {string} secret - Webhook secret
 * @param {string} body - Raw request body
 * @param {string} signature - Signature from X-WEBEX-SIGNATURE header
 * @returns {boolean} True if signature is valid
 */
function verifySignature(secret, body, signature) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(body).digest('hex');
  
  // Convert both hex strings to buffers for timing-safe comparison
  try {
    const computedBuffer = Buffer.from(digest, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');
    return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
  } catch (error) {
    // If conversion fails, fall back to simple comparison
    return digest === signature;
  }
}

module.exports = { webhookHandler, verifySignature };
