# LinkedIn Auto-Connect Agent

A Manifest V3 Chrome Extension that acts as an autonomous LinkedIn networking agent.

## ⚠️ Important Warnings

- **Use at your own risk**: This extension automates actions on LinkedIn, which may violate their Terms of Service
- **LinkedIn may ban accounts** that use automation tools
- **Daily limit of 25** connections/comments is set to reduce risk
- **Random delays** (35-85 seconds) are implemented to mimic human behavior

## Features

- ✅ Scans LinkedIn search results for profile URLs
- ✅ Sends connection requests automatically
- ✅ Reads latest posts from connected profiles
- ✅ Generates AI-powered comments using Groq or Gemini API
- ✅ Hard stop after 25 successful actions per day
- ✅ Logs all contacts to prevent duplicate messaging
- ✅ Human-like scrolling and random delays

## Setup

### 1. Get an API Key

**Option A: Groq (Recommended - Free)**
1. Go to https://console.groq.com/
2. Sign up for an account
3. Create an API key
4. Copy the key

**Option B: Gemini (Google)**
1. Go to https://aistudio.google.com/app/apikey
2. Create an API key
3. Copy the key

### 2. Configure the Extension

Open [`background.js`](background.js) and update these values:

```javascript
const CONFIG = {
  // YOUR API KEY HERE
  GROQ_API_KEY: 'YOUR_GROQ_API_KEY_HERE',
  
  // Or use Gemini:
  // GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',
  
  // Choose provider: 'groq' or 'gemini'
  AI_PROVIDER: 'groq',
  
  // Maximum per day
  DAILY_LIMIT: 25
};
```

### 3. Add Icons (Required)

Create PNG icon files in the `icons/` folder:
- `icons/icon16.png` (16x16)
- `icons/icon48.png` (48x48)
- `icons/icon128.png` (128x128)

### 4. Install in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `chrome-extension/` folder

## How to Use

1. **Go to LinkedIn** and search for people
2. **Click the extension icon** in your toolbar
3. **Click "Extract Profiles"** to add people to the queue
4. **Click "Start Processing"**
5. The agent will:
   - Visit each profile
   - Send a connection request
   - Navigate to their activity
   - Read their latest post
   - Generate and post an AI comment
   - Wait 35-85 seconds before the next profile

## Files

| File | Purpose |
|------|---------|
| [`manifest.json`](manifest.json) | Extension configuration (Manifest V3) |
| [`background.js`](background.js) | API calls, queue management, logging |
| [`content.js`](content.js) | DOM manipulation, LinkedIn interactions |
| [`popup.html`](popup.html) | User interface |
| [`popup.js`](popup.js) | Popup logic |

## DOM Selectors

LinkedIn changes their DOM selectors frequently. If buttons aren't being clicked, update the selectors in [`content.js`](content.js):

```javascript
const DOM_SELECTORS = {
  CONNECT_BUTTON: 'button[aria-label*="Connect"]',
  COMMENT_BOX: 'div.comments-comment-box__input',
  // etc...
};
```

## Privacy

- All data is stored locally in `chrome.storage.local`
- Your API key is only in the background script (never exposed to web pages)
- No data is sent to any server except the AI provider

## Disclaimer

This tool is for educational purposes only. Use responsibly and at your own risk. LinkedIn's automation policies may result in account restrictions or bans.
