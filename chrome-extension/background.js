/**
 * LinkedIn Auto-Connect Agent - Background Script
 * 
 * This script acts as the "brain" of the extension. It:
 * - Manages a queue of profile URLs to process
 * - Makes external API calls to generate AI comments (keeps API key hidden)
 * - Logs all interactions to chrome.storage.local
 * - Enforces daily limits (25 connections max)
 * 
 * =====================================================
 * CONFIGURATION - INSERT YOUR API KEY HERE
 * =====================================================
 */
const CONFIG = {
  // Groq API key - get free at https://console.groq.com/
  // GROQ_API_KEY: 'YOUR_GROQ_API_KEY_HERE',
  
  // Or use Gemini API - get at https://aistudio.google.com/app/apikey
  // GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',
  
  // Which AI provider to use: 'groq' or 'gemini'
  AI_PROVIDER: 'gemini',
  
  // Maximum connections/comments per day
  DAILY_LIMIT: 25,
  
  // Storage keys
  STORAGE_KEYS: {
    QUEUE: 'profileQueue',
    LOGS: 'contactLogs',
    DAILY_COUNT: 'dailyCount',
    LAST_RESET: 'lastResetDate'
  }
};

// =====================================================
// STATE MANAGEMENT
// =====================================================

/**
 * Initialize or reset daily counter if it's a new day
 */
async function ensureDailyReset() {
  const today = new Date().toDateString();
  const lastReset = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.LAST_RESET);
  
  if (lastReset[CONFIG.STORAGE_KEYS.LAST_RESET] !== today) {
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.DAILY_COUNT]: 0,
      [CONFIG.STORAGE_KEYS.LAST_RESET]: today
    });
    console.log('[Background] Daily counter reset for:', today);
  }
}

/**
 * Get current daily count
 */
async function getDailyCount() {
  await ensureDailyReset();
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.DAILY_COUNT);
  return result[CONFIG.STORAGE_KEYS.DAILY_COUNT] || 0;
}

/**
 * Increment daily counter
 */
async function incrementDailyCount() {
  const count = await getDailyCount();
  await chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.DAILY_COUNT]: count + 1
  });
  return count + 1;
}

/**
 * Check if we've reached the daily limit
 */
async function isDailyLimitReached() {
  const count = await getDailyCount();
  return count >= CONFIG.DAILY_LIMIT;
}

// =====================================================
// PROFILE QUEUE MANAGEMENT
// =====================================================

/**
 * Add profiles to the processing queue
 */
async function addToQueue(profiles) {
  const queue = await getQueue();
  const newQueue = [...queue, ...profiles];
  await chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.QUEUE]: newQueue
  });
  console.log('[Background] Added profiles to queue. Total:', newQueue.length);
  return newQueue;
}

/**
 * Get current queue
 */
async function getQueue() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.QUEUE);
  return result[CONFIG.STORAGE_KEYS.QUEUE] || [];
}

/**
 * Remove a profile from queue after processing
 */
async function removeFromQueue(profileUrl) {
  const queue = await getQueue();
  const newQueue = queue.filter(p => p.url !== profileUrl);
  await chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.QUEUE]: newQueue
  });
  return newQueue;
}

// =====================================================
// CONTACT LOGGING
// =====================================================

/**
 * Log a successful contact
 */
async function logContact(profileUrl, name, timestamp) {
  const logs = await getLogs();
  logs.push({
    profileUrl,
    name,
    timestamp: timestamp || new Date().toISOString()
  });
  await chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.LOGS]: logs
  });
  console.log('[Background] Logged contact:', name);
  return logs;
}

/**
 * Get all contact logs
 */
async function getLogs() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.LOGS);
  return result[CONFIG.STORAGE_KEYS.LOGS] || [];
}

/**
 * Check if a profile has already been contacted
 */
async function isProfileContacted(profileUrl) {
  const logs = await getLogs();
  return logs.some(log => log.profileUrl === profileUrl);
}

// =====================================================
// AI COMMENT GENERATION
// =====================================================

/**
 * Generate AI comment using Groq API
 * @param {string} postText - The text of the LinkedIn post to comment on
 * @param {string} authorName - Name of the post author
 * @returns {Promise<string>} Generated comment
 */
async function generateCommentGroq(postText, authorName) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are a professional LinkedIn networker. Generate a thoughtful, concise comment (max 280 characters) that:
1. Adds value to the post
2. Is conversational and genuine
3. Shows you've read the content carefully
4. Includes a light call-to-action or question when appropriate
5. Never sounds salesy or spammy`
        },
        {
          role: 'user',
          content: `Write a comment for ${authorName}'s LinkedIn post. The post says:\n\n"${postText}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 150
    })
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Generate AI comment using Gemini API
 * @param {string} postText - The text of the LinkedIn post to comment on
 * @param {string} authorName - Name of the post author
 * @returns {Promise<string>} Generated comment
 */
async function generateCommentGemini(postText, authorName) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are a professional LinkedIn networker. Generate a thoughtful, concise comment (max 280 characters) that adds value to the post, is conversational and genuine, and shows you've read the content carefully. Write a comment for ${authorName}'s LinkedIn post. The post says: "${postText}"`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 150
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
}

/**
 * Main function to generate AI comment
 * @param {string} postText - The text of the LinkedIn post
 * @param {string} authorName - Name of the post author
 * @returns {Promise<string>} Generated comment
 */
async function generateComment(postText, authorName) {
  if (CONFIG.AI_PROVIDER === 'groq') {
    return generateCommentGroq(postText, authorName);
  } else {
    return generateCommentGemini(postText, authorName);
  }
}

// =====================================================
// MESSAGE HANDLING
// =====================================================

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_NEXT_PROFILE':
          // Check daily limit first
          if (await isDailyLimitReached()) {
            sendResponse({ 
              error: 'DAILY_LIMIT_REACHED', 
              message: `Maximum ${CONFIG.DAILY_LIMIT} connections/comments reached for today`
            });
            return;
          }
          
          const queue = await getQueue();
          if (queue.length === 0) {
            sendResponse({ error: 'EMPTY_QUEUE', message: 'No profiles in queue' });
            return;
          }
          
          // Get next profile that hasn't been contacted
          let nextProfile = null;
          for (const profile of queue) {
            if (!await isProfileContacted(profile.url)) {
              nextProfile = profile;
              break;
            }
          }
          
          if (!nextProfile) {
            sendResponse({ error: 'ALL_CONTACTED', message: 'All profiles in queue have been contacted' });
            return;
          }
          
          sendResponse({ profile: nextProfile });
          break;

        case 'GENERATE_COMMENT':
          try {
            const comment = await generateComment(message.postText, message.authorName);
            sendResponse({ comment });
          } catch (err) {
            sendResponse({ error: 'AI_ERROR', message: err.message });
          }
          break;

        case 'LOG_CONTACT':
          await logContact(message.profileUrl, message.name, message.timestamp);
          await incrementDailyCount();
          await removeFromQueue(message.profileUrl);
          sendResponse({ success: true });
          break;

        case 'ADD_PROFILES':
          await addToQueue(message.profiles);
          sendResponse({ success: true, queueLength: (await getQueue()).length });
          break;

        case 'GET_STATUS':
          const count = await getDailyCount();
          const logs = await getLogs();
          const currentQueue = await getQueue();
          sendResponse({
            dailyCount: count,
            dailyLimit: CONFIG.DAILY_LIMIT,
            totalContacted: logs.length,
            queueLength: currentQueue.length
          });
          break;

        case 'CHECK_PROFILE':
          const contacted = await isProfileContacted(message.profileUrl);
          sendResponse({ contacted });
          break;

        default:
          sendResponse({ error: 'UNKNOWN_MESSAGE_TYPE' });
      }
    } catch (err) {
      console.error('[Background] Error handling message:', err);
      sendResponse({ error: 'INTERNAL_ERROR', message: err.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// =====================================================
// INSTALL/UPDATE HANDLERS
// =====================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] LinkedIn Auto-Connect Agent installed');
  
  // Initialize storage
  chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.QUEUE]: [],
    [CONFIG.STORAGE_KEYS.LOGS]: [],
    [CONFIG.STORAGE_KEYS.DAILY_COUNT]: 0,
    [CONFIG.STORAGE_KEYS.LAST_RESET]: new Date().toDateString()
  });
});

console.log('[Background] LinkedIn Auto-Connect Agent initialized');
