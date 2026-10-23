/**
 * KisaanDost AI - Model Harness Server
 * Hacktoberfest 2026 Open-Source Project
 * 
 * Compliant with the Agent Skill Open Standard (SKILL.md).
 * Bridges Frontend, Agent System Prompts, and Local Ollama Gemma 4.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  yaml = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4';
const SKILL_PATH = path.join(__dirname, 'SKILL.md');

// Enable CORS & parse JSON with high limits for base64 crop images
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Parses SKILL.md from the repository root.
 * Extracts YAML frontmatter and the markdown system instructions.
 */
function loadAgentSkill() {
  try {
    if (!fs.existsSync(SKILL_PATH)) {
      console.warn(`[WARN] SKILL.md not found at ${SKILL_PATH}. Using fallback agricultural instructions.`);
      return {
        metadata: { name: 'kisaandost-ai', version: '1.0.0' },
        systemPrompt: 'You are KisaanDost, an empathetic agricultural expert in Pakistan/South Asia. Answer in simple, friendly Roman Urdu.'
      };
    }

    const fileContent = fs.readFileSync(SKILL_PATH, 'utf8');
    const frontmatterMatch = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (frontmatterMatch) {
      const frontmatterYaml = frontmatterMatch[1];
      const markdownBody = frontmatterMatch[2];
      let metadata = {};
      
      if (yaml && typeof yaml.load === 'function') {
        try {
          metadata = yaml.load(frontmatterYaml) || {};
        } catch (err) {
          console.warn('[WARN] js-yaml parse error, using basic parsing:', err.message);
        }
      }

      // Basic regex fallback if yaml is not installed
      if (Object.keys(metadata).length === 0) {
        const nameMatch = frontmatterYaml.match(/^name:\s*(.+)$/m);
        const versionMatch = frontmatterYaml.match(/^version:\s*(.+)$/m);
        metadata = {
          name: nameMatch ? nameMatch[1].trim() : 'kisaandost-ai',
          version: versionMatch ? versionMatch[1].trim() : '1.0.0',
          model: { name: 'gemma4', parameters: { temperature: 0.3, max_tokens: 550 } }
        };
      }

      return {
        metadata,
        systemPrompt: markdownBody.trim()
      };
    } else {
      return {
        metadata: {},
        systemPrompt: fileContent.trim()
      };
    }
  } catch (error) {
    console.error('[ERROR] Failed to load SKILL.md:', error.message);
    return {
      metadata: {},
      systemPrompt: 'You are KisaanDost, an empathetic agricultural expert. Answer in simple Roman Urdu.'
    };
  }
}

// Initial Skill Load
let agentSkill = loadAgentSkill();

/**
 * Health check & Ollama status inspection
 */
app.get('/api/health', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const ollamaRes = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!ollamaRes.ok) {
      throw new Error(`Ollama returned status ${ollamaRes.status}`);
    }

    const data = await ollamaRes.json();
    const models = (data.models || []).map(m => m.name);
    const hasConfiguredModel = models.some(m => 
      m.toLowerCase().includes('gemma4') || 
      m.toLowerCase().startsWith(OLLAMA_MODEL.toLowerCase().split(':')[0])
    );

    res.json({
      status: 'healthy',
      app: 'KisaanDost AI',
      timestamp: new Date().toISOString(),
      ollama: {
        connected: true,
        endpoint: OLLAMA_HOST,
        targetModel: OLLAMA_MODEL,
        modelAvailable: hasConfiguredModel,
        installedModels: models
      },
      skill: {
        name: agentSkill.metadata.name || 'kisaandost-ai',
        version: agentSkill.metadata.version || '1.0.0',
        safetyLevel: agentSkill.metadata.safety_level || 'high'
      }
    });
  } catch (err) {
    res.status(200).json({
      status: 'degraded',
      app: 'KisaanDost AI',
      timestamp: new Date().toISOString(),
      ollama: {
        connected: false,
        endpoint: OLLAMA_HOST,
        targetModel: OLLAMA_MODEL,
        error: err.message,
        hint: 'Make sure Ollama is installed and running (`ollama serve`), and pull Gemma 4 with `ollama run gemma4`'
      },
      skill: {
        name: agentSkill.metadata.name || 'kisaandost-ai',
        version: agentSkill.metadata.version || '1.0.0'
      }
    });
  }
});

/**
 * Returns raw Agent Skill metadata conforming to Agent Skill Open Standard
 */
app.get('/api/skill', (req, res) => {
  agentSkill = loadAgentSkill(); // reload for live updates
  res.json({
    standard: 'Agent Skill Open Standard v1.0.0',
    metadata: agentSkill.metadata,
    systemPrompt: agentSkill.systemPrompt
  });
});

/**
 * Formats plain text for Text-to-Speech (TTS)
 * Strips markdown symbols, asterisks, brackets, and truncates to spoken length.
 */
function createAudioSuggestedText(fullReply) {
  if (!fullReply) return '';
  
  let clean = fullReply
    .replace(/[*#_`~>]/g, '')                // Remove markdown formatting
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert markdown links to text
    .replace(/\n+/g, '. ')                   // Replace linebreaks with pause period
    .replace(/\s+/g, ' ')                    // Normalize spaces
    .trim();

  // Pick first 2-3 natural sentences (max ~220 characters for clean, responsive speech)
  const sentences = clean.split(/(?<=[.?!])\s+/);
  let audioSnippet = '';
  for (const sentence of sentences) {
    if ((audioSnippet + sentence).length > 250) break;
    audioSnippet += (audioSnippet ? ' ' : '') + sentence;
  }

  return audioSnippet || clean.slice(0, 220);
}

/**
 * Primary Multi-Modal Chat Endpoint
 * Accepts: { prompt, image (base64 optional), history (optional) }
 */
app.post('/api/chat', async (req, res) => {
  const { prompt, image, history = [] } = req.body;

  if (!prompt && !image) {
    return res.status(400).json({
      error: 'Sawalan ya tasveer darkaar hai (Prompt or image is required).'
    });
  }

  // Reload skill to ensure latest rules
  agentSkill = loadAgentSkill();

  // Prepare system prompt with agricultural persona and simple English / Roman Urdu flexibility
  const systemPrompt = `
${agentSkill.systemPrompt}

COMMUNICATION & ACCESSIBILITY PROTOCOL:
1. Always respond in simple, clear, friendly terms (Simple English or Roman Urdu matching the farmer's prompt).
2. Keep sentences short, direct, and easy to understand for smallholder farmers. Avoid complicated academic jargon.
3. Warm Greeting: Start with a welcoming tone (e.g. "Hello farmer friend!" or "Aoa pyare kisaan bhai!").
4. Practical Step-by-Step Structure:
   - Diagnosis: Identify what the crop issue, deficiency, or pest looks like.
   - Treatment: Provide practical, immediately actionable remedies and standard doses per acre.
   - Safety & Precaution: Remind the farmer to spray in the evening, avoid windy/rainy conditions, and wear a mask/protective cloth.
5. If a crop photo is provided, carefully inspect the leaf symptoms (yellowing, curling, fungal spots, insect damage) and explain causes.
6. Strictly decline non-farming questions with a polite redirect back to agriculture and livestock.
`.trim();

  // Strip Base64 data header if present (e.g. data:image/jpeg;base64,...)
  let cleanBase64Image = null;
  if (image && typeof image === 'string') {
    cleanBase64Image = image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  }

  // Construct message array for Ollama
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Append recent history (limit to last 6 messages to leverage Gemma 4 context)
  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-6);
    for (const h of recentHistory) {
      if (h.role && h.content) {
        messages.push({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: String(h.content)
        });
      }
    }
  }

  // User message framed for clear agricultural guidance
  const rawPrompt = prompt ? String(prompt).trim() : '';
  const userText = rawPrompt 
    ? `${rawPrompt}\n\n[Instruction: Provide practical, step-by-step agricultural advice in simple, easy terms with clear bullet points.]`
    : 'A farmer has sent this crop photo. Please inspect the visible plant leaf symptoms, diagnose the disease or pest issue, and give simple practical treatment advice.';

  const userMessage = {
    role: 'user',
    content: userText
  };

  if (cleanBase64Image) {
    userMessage.images = [cleanBase64Image];
  }

  messages.push(userMessage);

  try {
    // Send request to Ollama
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: messages,
        stream: false,
        options: {
          temperature: agentSkill.metadata?.model?.parameters?.temperature || 0.3,
          num_predict: agentSkill.metadata?.model?.parameters?.max_tokens || 550
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Ollama API Error]:', errorText);
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rawReply = data.message?.content || 'Pyare kisaan bhai, jawab tayar nahi ho saka. Baraye meherbani dobara koshish karein.';
    const audioSuggested = createAudioSuggestedText(rawReply);

    return res.json({
      status: 'success',
      reply: rawReply,
      audioSuggested: audioSuggested,
      model: OLLAMA_MODEL,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Backend Harness Error]:', error.message);

    // If Ollama is offline or unreachable, provide a gentle fallback message
    const fallbackReply = `
**Aoa Pyare Kisaan Bhai!** 🌾
Abhi aapka local AI engine (Ollama Gemma 4) connect nahi ho saka.

**Engine Chalanay Ka Tareeqa:**
1. Apne computer par command prompt / terminal kholein.
2. Yeh command chalayein:
   \`\`\`bash
   ollama run gemma4
   \`\`\`
3. Jab model load ho jaye, to yahan dubara apna sawal poochein ya mic ka button dabayein!

*KisaanDost AI hamesha aapki khidmat ke liye tayar hai.*
    `.trim();

    return res.status(200).json({
      status: 'offline_notice',
      reply: fallbackReply,
      audioSuggested: 'Aoa pyare kisaan bhai! Abhi aapka local AI engine connect nahi ho saka. Baraye meherbani computer par ollama run gemma 4 chalayein.',
      model: OLLAMA_MODEL,
      error: error.message
    });
  }
});

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🌾 KisaanDost AI - Model Harness Server`);
  console.log(`====================================================`);
  console.log(`🚀 Web Interface : http://localhost:${PORT}`);
  console.log(`🤖 Ollama Target : ${OLLAMA_HOST} (${OLLAMA_MODEL})`);
  console.log(`📜 Agent Skill   : ${SKILL_PATH}`);
  console.log(`💡 Mode          : High Accessibility / Voice & Image First`);
  console.log(`====================================================`);
});
