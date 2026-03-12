// coach.js — Async coach chat (messages sync via cloud relay, responses arrive within ~30 min)

const CoachChat = {
  async render(date) {
    const summary = await DB.getDailySummary(date);
    const analysis = await DB.getAnalysis(date);
    const isToday = date === UI.today();

    // Merge user messages from dailySummary with coach responses from analysis
    const userMessages = (summary.coachChat || []).filter(m => m.role === 'user');
    const coachMessages = (analysis?.coachResponses || []);

    // Build timeline: pair user messages with coach responses by matching
    const timeline = [];
    for (const msg of userMessages) {
      timeline.push(msg);
      const response = coachMessages.find(r => r.replyTo === msg.id);
      if (response) {
        timeline.push({ role: 'coach', text: response.text, timestamp: response.timestamp || msg.timestamp + 1 });
      }
    }
    // Add any coach messages that aren't replies (general advice pushed by processing)
    for (const cm of coachMessages) {
      if (!cm.replyTo) {
        timeline.push({ role: 'coach', text: cm.text, timestamp: cm.timestamp || 0 });
      }
    }

    timeline.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const hasUnanswered = userMessages.some(m => !coachMessages.find(r => r.replyTo === m.id));

    let html = '<div class="coach-chat">';

    if (timeline.length > 0) {
      html += '<div class="coach-messages" id="coach-messages">';
      for (const msg of timeline) {
        const isUser = msg.role === 'user';
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        html += `
          <div class="chat-bubble ${isUser ? 'chat-user' : 'chat-coach'}">
            <div class="chat-text">${UI.escapeHtml(msg.text)}</div>
            ${time ? `<div class="chat-time">${time}</div>` : ''}
          </div>
        `;
      }
      if (hasUnanswered) {
        html += '<div class="chat-waiting">Waiting for coach...</div>';
      }
      html += '</div>';
    }

    // Input field (only for today)
    if (isToday) {
      html += `
        <div class="coach-input-row">
          <input type="text" class="coach-input" id="coach-input" placeholder="Ask your coach..." autocomplete="off">
          <button class="coach-send" id="coach-send">Send</button>
        </div>
      `;
    }

    html += '</div>';
    return html;
  },

  bindEvents(date) {
    const input = document.getElementById('coach-input');
    const sendBtn = document.getElementById('coach-send');
    if (!input || !sendBtn) return;

    const send = async () => {
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      input.disabled = true;
      sendBtn.disabled = true;

      try {
        const summary = await DB.getDailySummary(date);
        const chat = summary.coachChat || [];
        const msg = {
          id: `coach_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: 'user',
          text,
          timestamp: Date.now(),
        };
        chat.push(msg);
        await DB.updateDailySummary(date, { coachChat: chat });

        // Trigger cloud relay upload so the processing script sees the message
        if (await CloudRelay.isConfigured()) {
          CloudRelay.queueUpload(date);
        }

        // Re-render chat
        const container = document.getElementById('today-coach');
        if (container) {
          // Re-render tips + chat together
          const tips = await Coach.getSuggestions(date);
          let html = Coach.render(tips);
          html += await CoachChat.render(date);
          container.innerHTML = html;
          CoachChat.bindEvents(date);
          const messages = document.getElementById('coach-messages');
          if (messages) messages.scrollTop = messages.scrollHeight;
        }
      } catch (err) {
        console.error('Coach send failed:', err);
        UI.toast('Failed to send message', 'error');
      }

      // Re-target fresh DOM elements (old ones may be detached after re-render)
      const freshInput = document.getElementById('coach-input');
      const freshBtn = document.getElementById('coach-send');
      if (freshInput) { freshInput.disabled = false; freshInput.focus(); }
      if (freshBtn) freshBtn.disabled = false;
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
  },
};
