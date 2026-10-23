/**
 * KisaanDost AI - High-Accessibility Client Logic
 * Hacktoberfest 2026 Open-Source Project
 * 
 * Features:
 * - Agriculture Topic & Crop Filtering (Wheat, Cotton, Rice, Vegetables, Fertilizers, Livestock)
 * - Real Farmer Imagery & Agricultural Theming
 * - Simple English UI & Clean Conversational Interaction
 * - Speech-to-Text (STT) & Text-to-Speech (TTS) via Web Speech API
 * - Local AI Health Monitoring (Gemma 4 via Ollama)
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  const chatViewport = document.getElementById('chat-viewport');
  const chatStream = document.getElementById('chat-stream');
  const chatForm = document.getElementById('chat-form');
  const promptInput = document.getElementById('prompt-input');
  const sendBtn = document.getElementById('send-btn');
  const micBtn = document.getElementById('mic-btn');
  const cameraBtn = document.getElementById('camera-btn');
  const cameraInput = document.getElementById('camera-input');
  const listeningBanner = document.getElementById('listening-banner');
  const stopListeningBtn = document.getElementById('stop-listening-btn');
  const imagePreviewTray = document.getElementById('image-preview-tray');
  const imagePreview = document.getElementById('image-preview');
  const removeImageBtn = document.getElementById('remove-image-btn');
  const aiStatusPill = document.getElementById('ai-status-pill');
  const aiStatusText = document.getElementById('ai-status-text');
  const ttsToggleBtn = document.getElementById('tts-toggle-btn');
  const thinkingIndicator = document.getElementById('thinking-indicator');
  const suggestionChips = document.querySelectorAll('.chip');
  const filterTabs = document.querySelectorAll('.filter-tab');

  // --- State Variables ---
  let selectedImageBase64 = null;
  let conversationHistory = [];
  let autoTTS = true; // Enabled by default for voice-first accessibility
  let isRecording = false;
  let recognition = null;
  let currentUtterance = null;

  // ==========================================================================
  // 1. Agriculture Crop & Topic Filtering
  // ==========================================================================

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab styling
      filterTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const selectedCategory = tab.getAttribute('data-category');

      // Filter chips based on chosen category
      suggestionChips.forEach(chip => {
        const chipCategory = chip.getAttribute('data-category');
        if (selectedCategory === 'all' || chipCategory === selectedCategory) {
          chip.classList.remove('filtered-out');
        } else {
          chip.classList.add('filtered-out');
        }
      });
    });
  });

  // Suggestion chips click-to-ask
  suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      promptInput.value = prompt;
      handleSendMessage(prompt);
    });
  });

  // ==========================================================================
  // 2. Text-to-Speech (TTS) Voice Readout
  // ==========================================================================

  function getBestVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Prefer clear English or South Asian regional voices for natural delivery
    const preferredVoice = voices.find(v => v.lang.startsWith('en-IN')) ||
                          voices.find(v => v.lang.startsWith('en-GB')) ||
                          voices.find(v => v.lang.startsWith('en-US')) ||
                          voices.find(v => v.lang.startsWith('ur')) ||
                          voices.find(v => v.lang.startsWith('hi')) ||
                          voices[0];
    return preferredVoice;
  }

  // Preload voices
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      getBestVoice();
    };
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  function speakText(rawText) {
    if (!('speechSynthesis' in window) || !rawText) return;

    stopSpeaking();

    // Clean formatting and punctuation for fluid speech
    const cleanSpokenText = rawText
      .replace(/[*#_`~>]/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanSpokenText) return;

    const utterance = new SpeechSynthesisUtterance(cleanSpokenText);
    const voice = getBestVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }

    utterance.rate = 0.95; // Friendly and clear pace
    utterance.pitch = 1.0;

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  // Toggle Auto-TTS
  ttsToggleBtn.addEventListener('click', () => {
    autoTTS = !autoTTS;
    if (autoTTS) {
      ttsToggleBtn.classList.add('active');
      ttsToggleBtn.setAttribute('aria-pressed', 'true');
      ttsToggleBtn.querySelector('.btn-label').textContent = 'Voice On';
      speakText('Voice readout enabled.');
    } else {
      ttsToggleBtn.classList.remove('active');
      ttsToggleBtn.setAttribute('aria-pressed', 'false');
      ttsToggleBtn.querySelector('.btn-label').textContent = 'Voice Off';
      stopSpeaking();
    }
  });

  // ==========================================================================
  // 3. Speech-to-Text (STT) Voice Input
  // ==========================================================================

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US'; // English voice input with multi-dialect support

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
      listeningBanner.classList.remove('hidden');
      stopSpeaking();
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      promptInput.value = transcript;
    };

    recognition.onerror = (event) => {
      console.warn('[Speech Recognition Error]:', event.error);
      stopRecordingSession();
    };

    recognition.onend = () => {
      stopRecordingSession();
      if (promptInput.value.trim().length > 2) {
        promptInput.focus();
      }
    };
  } else {
    micBtn.title = 'Voice input is not supported in this browser. Please use Chrome or Edge.';
  }

  function startRecordingSession() {
    if (!recognition) {
      alert('Your browser does not support voice input. Please use Google Chrome or Microsoft Edge.');
      return;
    }
    try {
      recognition.start();
    } catch (err) {
      console.warn('Recognition start error:', err);
      stopRecordingSession();
    }
  }

  function stopRecordingSession() {
    isRecording = false;
    micBtn.classList.remove('recording');
    listeningBanner.classList.add('hidden');
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
  }

  micBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecordingSession();
    } else {
      startRecordingSession();
    }
  });

  stopListeningBtn.addEventListener('click', () => {
    stopRecordingSession();
  });

  // ==========================================================================
  // 4. Camera & Crop Image Upload
  // ==========================================================================

  cameraBtn.addEventListener('click', () => {
    cameraInput.click();
  });

  cameraInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert('Photo is too large (Maximum 8MB allowed).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      selectedImageBase64 = event.target.result;
      imagePreview.src = selectedImageBase64;
      imagePreviewTray.classList.remove('hidden');
      promptInput.placeholder = "Ask any question about this crop photo or click send...";
    };
    reader.readAsDataURL(file);
  });

  removeImageBtn.addEventListener('click', () => {
    clearSelectedImage();
  });

  function clearSelectedImage() {
    selectedImageBase64 = null;
    cameraInput.value = '';
    imagePreview.src = '';
    imagePreviewTray.classList.add('hidden');
    promptInput.placeholder = "Type or speak your farming problem (e.g. Yellow leaves on wheat)...";
  }

  // ==========================================================================
  // 5. Message Rendering & Markdown Formatter
  // ==========================================================================

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMarkdown(text) {
    if (!text) return '';
    let escaped = escapeHTML(text);

    // Bold formatting: **text**
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic formatting: *text*
    escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Code inline: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bullet points starting with - or *
    escaped = escaped.replace(/(?:^|\n)[-*]\s+(.+)/g, '<br>• $1');

    // Numbered lists: 1. Item
    escaped = escaped.replace(/(?:^|\n)(\d+)\.\s+(.+)/g, '<br><strong>$1.</strong> $2');

    // Line breaks
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
  }

  function appendUserMessage(text, imageBase64) {
    const card = document.createElement('div');
    card.className = 'message-card user-message';

    let imageHTML = '';
    if (imageBase64) {
      imageHTML = `<img src="${imageBase64}" class="message-image-thumb" alt="Uploaded crop disease leaf" />`;
    }

    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Real Farmer Avatar Image with fallback to emoji
    card.innerHTML = `
      <div class="message-avatar" title="Farmer">
        <img 
          src="https://images.unsplash.com/photo-1595956553066-fe24a8c33395?auto=format&fit=crop&w=120&q=80" 
          alt="Farmer Avatar" 
          class="avatar-img"
          loading="lazy"
          onerror="this.outerHTML='👨‍🌾'"
        />
      </div>
      <div class="message-body">
        ${imageHTML}
        ${text ? `<p>${escapeHTML(text)}</p>` : ''}
        <div class="message-meta">
          <span class="message-time">${timeString}</span>
        </div>
      </div>
    `;

    chatStream.appendChild(card);
    scrollToBottom();
  }

  function appendBotMessage(replyText, audioText) {
    const card = document.createElement('div');
    card.className = 'message-card bot-message';

    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedBody = formatMarkdown(replyText);

    card.innerHTML = `
      <div class="message-avatar" title="Agricultural Expert">🌾</div>
      <div class="message-body">
        <div class="bot-text-content">${formattedBody}</div>
        <div class="message-meta">
          <span class="message-time">${timeString}</span>
          <button type="button" class="speech-btn" title="Listen to this advice aloud" aria-label="Listen to this advice aloud">
            🔊
          </button>
        </div>
      </div>
    `;

    const speakBtn = card.querySelector('.speech-btn');
    speakBtn.addEventListener('click', () => {
      speakText(audioText || replyText);
    });

    chatStream.appendChild(card);
    scrollToBottom();
  }

  function scrollToBottom() {
    chatViewport.scrollTo({
      top: chatViewport.scrollHeight,
      behavior: 'smooth'
    });
  }

  // ==========================================================================
  // 6. Sending Messages & Backend Fetch
  // ==========================================================================

  async function handleSendMessage(customPrompt = null) {
    const textPrompt = customPrompt !== null ? customPrompt : promptInput.value.trim();
    const attachedImage = selectedImageBase64;

    if (!textPrompt && !attachedImage) {
      promptInput.focus();
      return;
    }

    stopRecordingSession();

    // 1. Render user message in UI
    appendUserMessage(textPrompt, attachedImage);

    // 2. Clear input fields immediately
    promptInput.value = '';
    clearSelectedImage();

    // 3. Show Thinking Indicator
    thinkingIndicator.classList.remove('hidden');
    scrollToBottom();

    // 4. Update conversation history
    if (textPrompt) {
      conversationHistory.push({ role: 'user', content: textPrompt });
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textPrompt,
          image: attachedImage,
          history: conversationHistory
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned error code ${response.status}`);
      }

      const data = await response.json();
      thinkingIndicator.classList.add('hidden');

      const botReply = data.reply || 'Sorry, no agricultural advice could be generated. Please try again.';
      const audioToSpeak = data.audioSuggested || botReply;

      // Append Bot message
      appendBotMessage(botReply, audioToSpeak);

      // Save assistant reply to history
      conversationHistory.push({ role: 'assistant', content: botReply });

      // Auto Readout if active
      if (autoTTS) {
        speakText(audioToSpeak);
      }

    } catch (err) {
      console.error('[Chat Fetch Error]:', err);
      thinkingIndicator.classList.add('hidden');

      const offlineNotice = `
**Hello Farmer Friend!** 🌾
Cannot connect to the local AI engine.
Please check that:
1. The backend server is running (\`npm start\`).
2. Local Ollama engine is running (\`ollama run gemma4\`).
      `.trim();

      appendBotMessage(offlineNotice, 'Could not connect to the local AI engine. Please make sure Ollama with Gemma 4 is running.');
    }
  }

  // Form submission
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  // Enter key handling
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // ==========================================================================
  // 7. Local AI Health Monitoring
  // ==========================================================================

  async function checkAIHealth() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Health check non-200');
      const data = await res.json();

      if (data.ollama && data.ollama.connected) {
        aiStatusPill.className = 'status-pill status-online';
        const modelLabel = data.ollama.targetModel ? data.ollama.targetModel.toUpperCase() : 'GEMMA 4';
        aiStatusText.textContent = `${modelLabel} Active`;
        aiStatusPill.title = `Connected to Ollama on ${data.ollama.endpoint} (${data.ollama.targetModel})`;
      } else {
        aiStatusPill.className = 'status-pill status-offline';
        aiStatusText.textContent = 'AI Offline';
        aiStatusPill.title = 'Ollama is unreachable. Run `ollama run gemma4`';
      }
    } catch (err) {
      aiStatusPill.className = 'status-pill status-offline';
      aiStatusText.textContent = 'Server Offline';
      aiStatusPill.title = 'Cannot reach backend server at /api/health';
    }
  }

  // Initial check & interval polling
  checkAIHealth();
  setInterval(checkAIHealth, 12000);

})();
