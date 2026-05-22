/**
 * Webhook handler factory for incoming Webex events
 * Returns a middleware function for Express
 */

const crypto = require('crypto');
const axios = require('axios');

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
            "text": "Hi! I'm your Webex assistant. Type **/r <name> <issue>** to create a ticket.",
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
  logger.debug(`Attachment action personId: ${personId}, roomId: ${roomId}`);
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

  // Extract action from inputs before room type check
  const action = inputs.action;

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
      case 'rSelectAgent': {
        const selectedAgentJson = cardData.rSelectedAgent;
        if (!selectedAgentJson) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Please select an agent.'));
          return;
        }

        let selectedAgent;
        try {
          selectedAgent = JSON.parse(selectedAgentJson);
        } catch (e) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Invalid agent selection.'));
          return;
        }

        const convo = ticketService.getConversation(personId);
        if (!convo?.data?.rIssue) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Request details expired. Please use /r <name> <issue> again.'));
          return;
        }

        ticketService.updateConversation(personId, {
          rAgentName: selectedAgent.name,
          rTeamLeader: selectedAgent.teamLeader
        });

        await sendOrUpdateCard(webexBot, roomId, sourceMessageId, cardTemplates.rCategoryCard({
          teamLeader: selectedAgent.teamLeader,
          agentName: selectedAgent.name,
          issue: convo.data.rIssue
        }));
        break;
      }

      case 'rSelectCategory': {
        const category = String(cardData.rCategory || '').trim();
        if (!category) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Please select a category.'));
          return;
        }

        const convo = ticketService.getConversation(personId);
        if (!convo?.data?.rAgentName || !convo?.data?.rIssue) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Request details expired. Please use /r <name> <issue> again.'));
          return;
        }

        ticketService.updateConversation(personId, { rCategory: category });

        await sendOrUpdateCard(webexBot, roomId, sourceMessageId, cardTemplates.rConfirmationCard({
          teamLeader: convo.data.rTeamLeader,
          agentName: convo.data.rAgentName,
          category,
          issue: convo.data.rIssue
        }));
        break;
      }

      case 'rSubmit': {
        const convo = ticketService.getConversation(personId);
        if (!convo?.data?.rAgentName || !convo?.data?.rIssue || !convo?.data?.rCategory) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Request details expired. Please use /r <name> <issue> again.'));
          return;
        }

        const affectedFive9 = String(cardData.affectedFive9 || 'false') === 'true';
        const onsite = String(cardData.onsite || 'false') === 'true';
        const startTime = parseTimeFromComponents(cardData.startTimeHours, cardData.startTimeMinutes, cardData.startTimePeriod);
        if (!startTime) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Invalid start time. Please enter valid hours and minutes.'));
          return;
        }

        const ticket = await ticketService.createDirectRequestTicket({
          category: convo.data.rCategory,
          concern: convo.data.rIssue,
          name: convo.data.rAgentName,
          teamLeader: convo.data.rTeamLeader,
          affectedFive9,
          onsite,
          startTime
        });

        let sentMessageId = null;
        try {
          const apiResult = await triggerTicketMessage(ticket.ticketid);
          sentMessageId = apiResult?.message?.id || apiResult?.message?.messageId || null;
          if (sentMessageId) {
            await ticketService.updateTicketWebexMessageId(ticket.ticketid, sentMessageId);
          }
        } catch (error) {
          logger.error(`Ticket ${ticket.ticketid} saved but /api/ticket/message failed: ${error.message}`);
          await webexBot.sendCard(roomId, cardTemplates.errorCard(`Ticket #${ticket.ticketid} was saved, but failed to send the ticket room message.`));
          ticketService.cancelConversation(personId);
          return;
        }

        await sendOrUpdateCard(webexBot, roomId, sourceMessageId, cardTemplates.rSubmittedCard(ticket.ticketid));
        ticketService.cancelConversation(personId);
        break;
      }

      case 'rCancel': {
        ticketService.cancelConversation(personId);
        if (sourceMessageId) {
          try {
            await webexBot.updateMessage(sourceMessageId, {
              roomId,
              text: 'Operation cancelled.',
              attachments: []
            });
            return;
          } catch (e) {
            logger.debug('Could not update /r message on cancel:', e.message);
          }
        }
        await webexBot.sendMessage({ roomId, markdown: 'Operation cancelled.' });
        break;
      }

      case 'selectReport': {
        const reportType = cardData.reportType;
        if (!reportType) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Please select a report.'));
          return;
        }
        await lockPreviousCard(webexBot, logger, cardTemplates, roomId, sourceMessageId, {
          title: 'Select Report',
          fields: [
            { label: 'Report Type', value: reportType === 'five9_logout' ? 'Five9 Logout Report' : 'IT Issue Report' }
          ],
          note: 'Report selected. The next step will be added next.'
        });
        await webexBot.sendMessage({
          roomId,
          markdown: `**Report selected:** ${reportType === 'five9_logout' ? 'Five9 Logout Report' : 'IT Issue Report (Requires IT Troubleshooting)'}\n\nThe next step will be implemented.`
        });
        break;
      }

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

      case 'f9SelectAgent': {
        logger.debug(`f9SelectAgent - personId: ${personId}, conversation exists: ${!!ticketService.getConversation(personId)}`);
        const selectedAgentJson = cardData.f9SelectedAgent;
        if (!selectedAgentJson) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Please select an agent.'));
          return;
        }

        let selectedAgent;
        try {
          selectedAgent = JSON.parse(selectedAgentJson);
        } catch (e) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Invalid agent selection.'));
          return;
        }

        const convo = ticketService.getConversation(personId);
        const logoutTimeFormatted = formatTime12Hour(convo?.data?.f9StartTime || '00:00');

        ticketService.updateConversation(personId, {
          f9AgentName: selectedAgent.name,
          f9TeamLeader: selectedAgent.teamLeader
        });

        if (sourceMessageId) {
          await webexBot.updateMessage(sourceMessageId, {
            roomId,
            text: ' ',
            attachments: [
              {
                contentType: "application/vnd.microsoft.card.adaptive",
                content: cardTemplates.f9UnifiedCard('confirm', {
                  teamLeader: selectedAgent.teamLeader,
                  agentName: selectedAgent.name,
                  logoutTime: logoutTimeFormatted
                }).content
              }
            ]
          });
        } else {
          await webexBot.sendCard(roomId, cardTemplates.f9UnifiedCard('confirm', {
            teamLeader: selectedAgent.teamLeader,
            agentName: selectedAgent.name,
            logoutTime: logoutTimeFormatted
          }));
        }
        break;
      }

      case 'f9CheckNext': {
        const loginTime = parseTimeFromComponents(cardData.endTimeHours, cardData.endTimeMinutes, cardData.endTimePeriod);
        if (!loginTime) {
           await webexBot.sendCard(roomId, cardTemplates.errorCard('Invalid login time. Please enter valid hours and minutes.'));
           return;
        }

        const convo = ticketService.getConversation(personId);
        const records = convo?.data?.f9CheckRecords || [];
        const currentIndex = Number(convo?.data?.f9CheckIndex || 0);
        const currentRecord = records[currentIndex];

        if (!currentRecord?.id) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('No Five9 backlog record found. Please run /f9check again.'));
          return;
        }

        await ticketService.updateFive9EndTimeForSender(currentRecord.id, personId, loginTime);

        const nextIndex = currentIndex + 1;
        if (nextIndex < records.length) {
          ticketService.updateConversation(personId, { f9CheckIndex: nextIndex });
          await sendOrUpdateCard(
            webexBot,
            roomId,
            sourceMessageId,
            cardTemplates.f9CheckCard(records[nextIndex], nextIndex, records.length)
          );
          return;
        }

        await sendOrUpdateCard(
          webexBot,
          roomId,
          sourceMessageId,
          cardTemplates.f9CheckCompleteCard(records.length)
        );
        ticketService.cancelConversation(personId);
        break;
      }

      case 'f9CheckCancel': {
        ticketService.cancelConversation(personId);
        if (sourceMessageId) {
          try {
            await webexBot.updateMessage(sourceMessageId, {
              roomId,
              text: 'Five9 backlog check cancelled.',
              attachments: []
            });
            return;
          } catch (e) {
            logger.debug('Could not update /f9check message on cancel:', e.message);
          }
        }
        await webexBot.sendMessage({ roomId, markdown: 'Five9 backlog check cancelled.' });
        break;
      }

      case 'f9Submit': {
        logger.debug(`f9Submit - personId: ${personId}, action: ${action}`);
        const notes = String(cardData.notes || '').trim();
        const convo = ticketService.getConversation(personId);
        logger.debug(`f9Submit - personId: ${personId}, convo exists: ${!!convo}, f9AgentName: ${convo?.data?.f9AgentName}`);
        if (!convo?.data?.f9AgentName) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('No agent selected.'));
          return;
        }

        const logoutTimeFormatted = formatTime12Hour(convo.data.f9StartTime);

        try {
          const record = await ticketService.insertFive9Record(
            convo.data.f9AgentName,
            convo.data.f9StartTime,
            sourceMessageId,
            personId,
            notes
          );

          ticketService.updateConversation(personId, {
            f9RecordId: record.id,
            f9Notes: notes,
            f9Step: 'endTime'
          });

          if (sourceMessageId) {
            await webexBot.updateMessage(sourceMessageId, {
              roomId,
              text: ' ',
              attachments: [
                {
                  contentType: "application/vnd.microsoft.card.adaptive",
                  content: cardTemplates.f9UnifiedCard('loginTime', {
                    teamLeader: convo.data.f9TeamLeader,
                    agentName: convo.data.f9AgentName,
                    logoutTime: logoutTimeFormatted,
                    notes
                  }).content
                }
              ]
            });
          } else {
            await webexBot.sendCard(roomId, cardTemplates.f9UnifiedCard('loginTime', {
              teamLeader: convo.data.f9TeamLeader,
              agentName: convo.data.f9AgentName,
              logoutTime: logoutTimeFormatted,
              notes
            }));
          }
        } catch (error) {
          logger.error('Failed to save Five9 record:', error.message);
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Failed to save record. Please try again.'));
        }
        break;
      }

      case 'f9Cancel': {
        ticketService.cancelConversation(personId);
        if (sourceMessageId) {
          try {
            await webexBot.updateMessage(sourceMessageId, {
              roomId,
              text: 'Operation cancelled.',
              attachments: []
            });
            return;
          } catch (e) {
            logger.debug('Could not update message on cancel:', e.message);
          }
        }
        await webexBot.sendMessage({ roomId, markdown: 'Operation cancelled.' });
        break;
      }

      case 'f9EndTimeSubmit': {
        const loginTime = parseTimeFromComponents(cardData.endTimeHours, cardData.endTimeMinutes, cardData.endTimePeriod);
        if (!loginTime) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Invalid login time. Please enter valid hours and minutes.'));
          return;
        }

        const convo = ticketService.getConversation(personId);
        if (!convo?.data?.f9RecordId) {
          await webexBot.sendCard(roomId, cardTemplates.errorCard('No record found.'));
          return;
        }

        try {
          await ticketService.updateFive9EndTime(convo.data.f9RecordId, loginTime);

          const logoutTimeFormatted = formatTime12Hour(convo.data.f9StartTime);
          const loginTimeFormatted = formatTime12Hour(loginTime);

          if (sourceMessageId) {
            await webexBot.updateMessage(sourceMessageId, {
              roomId,
              text: ' ',
              attachments: [
                {
                  contentType: "application/vnd.microsoft.card.adaptive",
                  content: cardTemplates.f9UnifiedCard('complete', {
                    teamLeader: convo.data.f9TeamLeader,
                    agentName: convo.data.f9AgentName,
                    logoutTime: logoutTimeFormatted,
                    loginTime: loginTimeFormatted,
                    notes: convo.data.f9Notes
                  }).content
                }
              ]
            });
          } else {
            await webexBot.sendCard(roomId, cardTemplates.f9UnifiedCard('complete', {
              teamLeader: convo.data.f9TeamLeader,
              agentName: convo.data.f9AgentName,
              logoutTime: logoutTimeFormatted,
              loginTime: loginTimeFormatted,
              notes: convo.data.f9Notes
            }));
          }

          ticketService.cancelConversation(personId);
        } catch (error) {
          logger.error('Failed to update login time:', error.message);
          await webexBot.sendCard(roomId, cardTemplates.errorCard('Failed to update login time.'));
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

function formatTime12Hour(time24) {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function getCurrentTimeUTC8() {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const utcPlus8 = new Date(utcTime + 8 * 60 * 60 * 1000);
  const hours = utcPlus8.getHours();
  const minutes = String(utcPlus8.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function parseTimeFromDropdown(timeValue) {
  if (!timeValue) return null;
  const parts = String(timeValue).split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1] ? parts[1].padStart(2, '0') : '00';
  if (isNaN(hours) || hours < 0 || hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function parseTimeFromComponents(hours, minutes, period) {
  if (!hours || !period) return null;
  let hour = parseInt(hours, 10);
  if (isNaN(hour) || hour < 1 || hour > 12) return null;
  const min = String(minutes || '00').padStart(2, '0');

  if (period === 'PM' && hour !== 12) {
    hour = (hour + 12) % 24;
  } else if (period === 'AM' && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, '0')}:${min}`;
}

function validateTimeFormat(timeValue) {
  const parts = String(timeValue).split(':');
  if (parts.length !== 2) return false;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return !isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

async function triggerTicketMessage(ticketId) {
  const port = process.env.PORT || 3000;
  const baseUrl = (process.env.INTERNAL_API_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
  const response = await axios.get(`${baseUrl}/api/ticket/message`, {
    params: { id: ticketId },
    timeout: 15000
  });
  return response.data;
}

/**
 * Process incoming message and generate response
 * Customize this function based on your bot's functionality
 */
async function processMessage(webexBot, logger, ticketService, cardTemplates, messageData) {
  const { text, roomId, personId, personEmail } = messageData;
  const lowerText = text.toLowerCase().trim();

  if (lowerText === '/r' || lowerText.startsWith('/r ')) {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 3) {
      return cardTemplates.errorCard('Usage: /r <name> <issue>\nExample: /r John cannot access Zendesk');
    }

    const searchName = parts[1];
    const issue = parts.slice(2).join(' ').trim();
    if (!issue) {
      return cardTemplates.errorCard('Please include the issue after the agent name.\nExample: /r John cannot access Zendesk');
    }

    try {
      const results = await ticketService.searchAgentsByName(searchName);

      if (results.length === 0) {
        return cardTemplates.errorCard(`No agent found matching "${searchName}".`);
      }

      ticketService.startConversation(personId, personEmail, roomId, '');
      ticketService.updateConversation(personId, {
        rSearchName: searchName,
        rIssue: issue,
        rStep: results.length === 1 ? 'category' : 'selectAgent'
      });

      if (results.length === 1) {
        const agent = results[0];
        ticketService.updateConversation(personId, {
          rAgentName: agent.name,
          rTeamLeader: agent.teamLeader
        });

        return cardTemplates.rCategoryCard({
          teamLeader: agent.teamLeader,
          agentName: agent.name,
          issue
        });
      }

      return cardTemplates.rAgentSelectionCard(searchName, issue, results);
    } catch (error) {
      logger.error('/r search error:', error.message);
      return cardTemplates.errorCard('Failed to search agents. Please try again.');
    }
  }

  if (lowerText === '/f9check') {
    try {
      const records = await ticketService.getFive9BacklogBySender(personId);
      if (records.length === 0) {
        return cardTemplates.f9CheckEmptyCard();
      }

      ticketService.startConversation(personId, personEmail, roomId, '');
      ticketService.updateConversation(personId, {
        f9CheckRecords: records,
        f9CheckIndex: 0,
        f9Step: 'checkBacklog'
      });

      return cardTemplates.f9CheckCard(records[0], 0, records.length);
    } catch (error) {
      logger.error('/f9check error:', error.message);
      return cardTemplates.errorCard('Failed to load Five9 backlog. Please try again.');
    }
  }

// Five9 logout command: /f9 <name> <time>
    if (lowerText === '/f9' || lowerText.startsWith('/f9 ')) {
      const parts = text.trim().split(/\s+/);
      const args = parts.slice(1); // Remove '/f9'

if (args.length < 2) {
         return cardTemplates.errorCard('Usage: /f9 <agent name> <time in 24h format>\nExample: /f9 John 22:30\n\nTimes are in UTC+8 timezone.');
       }

       const time = args[args.length - 1];
       const nameParts = args.slice(0, -1);
       const searchName = nameParts.join(' ');

       if (!validateTimeFormat(time)) {
         return cardTemplates.errorCard('Invalid time format. Use 24-hour format (HH:MM)\nExample: 22:30\n\nTimes are in UTC+8 timezone.');
       }

      try {
        const results = await ticketService.searchAgentsByName(searchName);

        if (results.length === 0) {
          return cardTemplates.errorCard(`No agent found matching "${searchName}".`);
        }

        if (results.length === 1) {
          const agent = results[0];
          const logoutTimeFormatted = formatTime12Hour(time);

          ticketService.startConversation(personId, personEmail, roomId, '');
          ticketService.updateConversation(personId, {
            f9AgentName: agent.name,
            f9TeamLeader: agent.teamLeader,
            f9StartTime: time,
            f9Step: 'confirm'
          });
          logger.debug(`Started conversation for personId ${personId} with agent ${agent.name}`);

          // Store messageId for tracking but we'll update the card later
          return cardTemplates.f9UnifiedCard('confirm', {
            teamLeader: agent.teamLeader,
            agentName: agent.name,
            logoutTime: logoutTimeFormatted
          });
        }

        const choices = results.map(r => ({ title: r.name, value: JSON.stringify({ name: r.name, teamLeader: r.teamLeader }) }));
        ticketService.startConversation(personId, personEmail, roomId, '');
        ticketService.updateConversation(personId, { f9StartTime: time });
        logger.debug(`Started conversation for personId ${personId} with f9StartTime ${time}`);
        return {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": [
              {
                "type": "TextBlock",
                "text": "Five9 Logout",
                "size": "medium",
                "weight": "Bolder"
              },
              {
                "type": "TextBlock",
                "text": `Logout Time: ${formatTime12Hour(time)}`,
                "wrap": true
              },
              {
                "type": "TextBlock",
                "text": `Found ${results.length} agents matching "${searchName}". Please select one:`,
                "wrap": true
              },
              {
                "type": "Input.ChoiceSet",
                "id": "f9SelectedAgent",
                "style": "compact",
                "choices": choices,
                "isRequired": true
              }
            ],
            "actions": [
              {
                "type": "Action.Submit",
                "title": "Next",
                "data": { "action": "f9SelectAgent" }
              }
            ]
          }
        };
      } catch (error) {
        logger.error('F9 search error:', error.message);
        return cardTemplates.errorCard('Failed to search agents. Please try again.');
      }
    }

  if (lowerText === '/help') {
    return cardTemplates.userHelpCard();
  }

  if (lowerText === '//help') {
    return cardTemplates.internalHelpCard();
  }

  if (lowerText === '//ping') {
    return 'Pong! Bot is alive and responding.';
  }

  if (lowerText === '//status') {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    return `Bot Status: Online\nUptime: ${hours}h ${minutes}m\nRoom: ${roomId}`;
  }

  if (lowerText === '//rooms') {
    const rooms = await webexBot.getRooms();
    const roomList = rooms
      .slice(0, 10)
      .map(r => `- ${r.title}`)
      .join('\n');
    return `**Bot is in ${rooms.length} rooms:**\n${roomList}`;
  }

  if (lowerText === '//info') {
    const botInfo = await webexBot.getBotInfo();
    return `**Bot Information:**\n- Name: ${botInfo.displayName}\n- Email: ${botInfo.emails[0]}\n- ID: ${botInfo.id}`;
  }

  return cardTemplates.unknownCommandCard(text);

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
