/**
 * LinkedIn Auto-Connect Agent - Content Script
 * 
 * This script runs on linkedin.com and handles all DOM manipulation:
 * - Extracting profile URLs from search results
 * - Clicking Connect buttons
 * - Navigating to user activity/posts
 * - Extracting post text
 * - Injecting AI comments
 * - Clicking Post button
 * 
 * =====================================================
 * DOM SELECTORS - UPDATE THESE WHEN LINKEDIN CHANGES
 * =====================================================
 */
const DOM_SELECTORS = {
  // Search results page
  PROFILE_CARD: 'li.reusable-search__result-container',
  PROFILE_LINK: 'a.app-aware-link',
  PROFILE_NAME: 'span.entity-result__title-text a',
  
  // Connect button - LinkedIn changes these often!
  CONNECT_BUTTON: 'button[aria-label*="Connect"]',
  CONNECT_BUTTON_ALT: 'button[aria-label*="invite"]',
  CONNECT_BUTTON_2: '.pv-s-profile-actions--connect',
  
  // Send invite modal
  INVITE_MODAL: '.send-invite',
  INVITE_MODAL_CLOSE: 'button[aria-label="Dismiss"]',
  ADD_NOTE_BUTTON: 'button[aria-label="Add a note"]',
  SEND_BUTTON: 'button[aria-label="Send invitation"]',
  
  // Profile page
  ACTIVITY_TAB: 'a[href*="/overlay/activity"]',
  ACTIVITY_TAB_ALT: 'a[href*="/profile_details/"]',
  POST_CONTAINER: 'div.feed-shared-update-v2',
  POST_TEXT: '.feed-shared-update-v2__description .feed-shared-text',
  
  // Comment section
  COMMENT_BOX: 'div.comments-comment-box__input',
  COMMENT_BOX_ALT: '.ql-editor',
  COMMENT_BUTTON: 'button[aria-label="Post comment"]',
  COMMENT_BUTTON_ALT: 'button.comment-button',
  
  // Misc
  LOAD_MORE: 'button[aria-label="See more"]',
  SCROLL_CONTAINER: 'main.scaffold-finite-scroll'
};

/**
 * =====================================================
 * STEALTH & SAFETY UTILITIES
 * =====================================================
 */

/**
 * Async sleep function with random delay
 * @param {number} minSeconds - Minimum seconds to wait
 * @param {number} maxSeconds - Maximum seconds to wait
 * @returns {Promise<void>}
 */
function sleep(minSeconds = 35, maxSeconds = 85) {
  const delay = Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
  console.log(`[Content] Sleeping for ${delay} seconds...`);
  return new Promise(resolve => setTimeout(resolve, delay * 1000));
}

/**
 * Scroll the page randomly up/down to mimic human reading
 * @param {number} minPixels - Minimum pixels to scroll
 * @param {number} maxPixels - Maximum pixels to scroll
 */
async function humanScroll(minPixels = 200, maxPixels = 600) {
  const scrollAmount = Math.floor(Math.random() * (maxPixels - minPixels + 1)) + minPixels;
  const direction = Math.random() > 0.5 ? 1 : -1;
  const currentScroll = window.scrollY;
  
  console.log(`[Content] Human scroll: ${scrollAmount * direction} pixels`);
  
  window.scrollBy({
    top: scrollAmount * direction,
    behavior: 'smooth'
  });
  
  // Wait for smooth scroll to complete
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Sometimes scroll back partially
  if (Math.random() > 0.6) {
    const returnAmount = Math.floor(scrollAmount * (0.3 + Math.random() * 0.4));
    window.scrollBy({
      top: -returnAmount,
      behavior: 'smooth'
    });
    await new Promise(resolve => setTimeout(resolve, 600));
  }
}

/**
 * Check if we've hit the daily limit by querying background
 */
async function checkDailyLimit() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response && response.dailyCount >= response.dailyLimit) {
        resolve(true);
      }
      resolve(false);
    });
  });
}

// =====================================================
// DOM MANIPULATION FUNCTIONS
// =====================================================

/**
 * Find element with retry logic
 * @param {string} selector - CSS selector
 * @param {number} maxAttempts - Maximum retry attempts
 * @param {number} delay - Delay between attempts (ms)
 */
async function findElement(selector, maxAttempts = 3, delay = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const element = document.querySelector(selector);
    if (element) return element;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return null;
}

/**
 * Click an element using JavaScript (more reliable than native click)
 * @param {HTMLElement} element - Element to click
 */
async function clickElement(element) {
  if (!element) return false;
  
  // Perform human scroll before clicking
  await humanScroll(100, 400);
  
  // Random small delay before click
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
  
  // Use both mouse events and click for reliability
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  element.click();
  
  return true;
}

/**
 * Type text into an element with human-like delays
 * @param {HTMLElement} element - Input element
 * @param {string} text - Text to type
 */
async function typeText(element, text) {
  // Focus the element
  element.focus();
  
  // Type character by character with random delays
  for (const char of text) {
    element.value += char;
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 20));
  }
  
  // Trigger blur to ensure change is registered
  element.blur();
}

// =====================================================
// PROFILE EXTRACTION
// =====================================================

/**
 * Extract profile information from search results
 * @returns {Array} Array of profile objects
 */
function extractProfilesFromSearch() {
  const profiles = [];
  const containers = document.querySelectorAll(DOM_SELECTORS.PROFILE_CARD);
  
  containers.forEach(container => {
    const linkEl = container.querySelector(DOM_SELECTORS.PROFILE_LINK);
    const nameEl = container.querySelector(DOM_SELECTORS.PROFILE_NAME);
    
    if (linkEl && nameEl) {
      profiles.push({
        url: linkEl.href.split('?')[0], // Clean URL
        name: nameEl.textContent.trim()
      });
    }
  });
  
  console.log(`[Content] Extracted ${profiles.length} profiles from search`);
  return profiles;
}

// =====================================================
// CONNECT ACTION
// =====================================================

/**
 * Click the connect button on a profile
 * @returns {Promise<boolean>} Success status
 */
async function clickConnectButton() {
  // Try multiple selectors for Connect button
  const selectors = [
    DOM_SELECTORS.CONNECT_BUTTON,
    DOM_SELECTORS.CONNECT_BUTTON_ALT,
    DOM_SELECTORS.CONNECT_BUTTON_2
  ];
  
  for (const selector of selectors) {
    const button = await findElement(selector, 2, 500);
    if (button) {
      console.log('[Content] Found connect button:', selector);
      await clickElement(button);
      await sleep(2, 4); // Wait for modal to open
      return true;
    }
  }
  
  console.log('[Content] Connect button not found');
  return false;
}

/**
 * Send connection request (handle modal)
 * @returns {Promise<boolean>} Success status
 */
async function sendConnectionRequest() {
  // Check if modal has "Add a note" option - skip it for now
  const addNoteBtn = await findElement(DOM_SELECTORS.ADD_NOTE_BUTTON, 2, 500);
  
  if (addNoteBtn) {
    console.log('[Content] Clicking Add a note button');
    await clickElement(addNoteBtn);
    await sleep(1, 2);
  }
  
  // Click send button
  const sendBtn = await findElement(DOM_SELECTORS.SEND_BUTTON, 2, 500);
  if (sendBtn) {
    console.log('[Content] Clicking Send button');
    await clickElement(sendBtn);
    return true;
  }
  
  console.log('[Content] Send button not found');
  return false;
}

// =====================================================
// POST EXTRACTION & COMMENTING
// =====================================================

/**
 * Navigate to user's activity tab
 * @returns {Promise<boolean>} Success status
 */
async function navigateToActivity() {
  const activityTabSelectors = [
    DOM_SELECTORS.ACTIVITY_TAB,
    DOM_SELECTORS.ACTIVITY_TAB_ALT
  ];
  
  for (const selector of activityTabSelectors) {
    const tab = await findElement(selector, 2, 500);
    if (tab) {
      console.log('[Content] Found activity tab:', selector);
      await clickElement(tab);
      await sleep(3, 5); // Wait for page to load
      return true;
    }
  }
  
  console.log('[Content] Activity tab not found');
  return false;
}

/**
 * Extract the latest post text
 * @returns {Promise<string|null>} Post text or null
 */
async function extractLatestPost() {
  // Wait for posts to load
  await sleep(2, 4);
  
  const postContainers = document.querySelectorAll(DOM_SELECTORS.POST_CONTAINER);
  
  if (postContainers.length === 0) {
    console.log('[Content] No posts found');
    return null;
  }
  
  // Get the first (most recent) post
  const latestPost = postContainers[0];
  const textElement = latestPost.querySelector(DOM_SELECTORS.POST_TEXT);
  
  if (!textElement) {
    console.log('[Content] Post text not found');
    return null;
  }
  
  // Click "See more" if available
  const seeMoreBtn = latestPost.querySelector(DOM_SELECTORS.LOAD_MORE);
  if (seeMoreBtn) {
    await clickElement(seeMoreBtn);
    await sleep(1, 2);
  }
  
  const text = textElement.textContent.trim();
  console.log('[Content] Extracted post text:', text.substring(0, 100) + '...');
  return text;
}

/**
 * Get the author's name from the profile
 * @returns {string} Author name
 */
function getAuthorName() {
  // Try to find name in the page header
  const nameSelectors = [
    'h1.text-heading-xlarge',
    'h1[data-test-id="profile-header"]',
    '.pv-top-card--list h1'
  ];
  
  for (const selector of nameSelectors) {
    const nameEl = document.querySelector(selector);
    if (nameEl) {
      return nameEl.textContent.trim();
    }
  }
  
  return 'there';
}

/**
 * Find and fill the comment box
 * @param {string} comment - Comment text
 * @returns {Promise<boolean>} Success status
 */
async function postComment(comment) {
  // Find comment box with multiple selectors
  const commentBoxSelectors = [
    DOM_SELECTORS.COMMENT_BOX,
    DOM_SELECTORS.COMMENT_BOX_ALT,
    'div.comments-comment-box__input',
    '.comments-comment-box__text-editor'
  ];
  
  let commentBox = null;
  for (const selector of commentBoxSelectors) {
    commentBox = await findElement(selector, 2, 500);
    if (commentBox) break;
  }
  
  if (!commentBox) {
    console.log('[Content] Comment box not found');
    return false;
  }
  
  console.log('[Content] Found comment box, typing comment...');
  
  // Click on comment box first
  await clickElement(commentBox);
  await sleep(0.5, 1);
  
  // Type the comment
  await typeText(commentBox, comment);
  await sleep(1, 2);
  
  // Find and click post button
  const postButtonSelectors = [
    DOM_SELECTORS.COMMENT_BUTTON,
    DOM_SELECTORS.COMMENT_BUTTON_ALT,
    'button[aria-label="Comment"]'
  ];
  
  let postButton = null;
  for (const selector of postButtonSelectors) {
    postButton = await findElement(selector, 2, 500);
    if (postButton) break;
  }
  
  if (postButton) {
    console.log('[Content] Clicking Post button');
    await clickElement(postButton);
    return true;
  }
  
  console.log('[Content] Post button not found');
  return false;
}

// =====================================================
// MAIN PROCESSING LOGIC
// =====================================================

/**
 * Process a single profile: connect and comment
 * @param {Object} profile - Profile object with url and name
 * @returns {Promise<boolean>} Success status
 */
async function processProfile(profile) {
  console.log('[Content] Processing profile:', profile.name, profile.url);
  
  // Check if already contacted
  const isContacted = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'CHECK_PROFILE', profileUrl: profile.url },
      (response) => resolve(response && response.contacted)
    );
  });
  
  if (isContacted) {
    console.log('[Content] Profile already contacted, skipping');
    return false;
  }
  
  // Navigate to profile
  console.log('[Content] Navigating to profile...');
  window.location.href = profile.url;
  await sleep(4, 7);
  
  // Click connect button
  console.log('[Content] Clicking connect button...');
  const connected = await clickConnectButton();
  
  if (connected) {
    await sleep(2, 4);
    await sendConnectionRequest();
    console.log('[Content] Connection request sent');
  }
  
  // Wait before navigating to activity
  await sleep(3, 6);
  
  // Navigate to activity
  console.log('[Content] Navigating to activity...');
  await navigateToActivity();
  
  // Extract latest post
  console.log('[Content] Extracting latest post...');
  const postText = await extractLatestPost();
  
  if (!postText) {
    console.log('[Content] No post found, logging contact anyway');
    await logSuccessfulContact(profile);
    return false;
  }
  
  // Generate AI comment
  console.log('[Content] Generating AI comment...');
  const authorName = getAuthorName();
  
  const comment = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { 
        type: 'GENERATE_COMMENT', 
        postText: postText.substring(0, 2000), // Limit text length
        authorName 
      },
      (response) => {
        if (response && response.error) {
          reject(new Error(response.error));
        } else if (response && response.comment) {
          resolve(response.comment);
        } else {
          reject(new Error('No response from background'));
        }
      }
    );
  });
  
  console.log('[Content] Generated comment:', comment);
  
  // Wait before posting comment
  await sleep(2, 5);
  
  // Post comment
  console.log('[Content] Posting comment...');
  const commented = await postComment(comment);
  
  if (commented) {
    console.log('[Content] Comment posted successfully');
  }
  
  // Log the contact
  await logSuccessfulContact(profile);
  
  return commented;
}

/**
 * Log successful contact to background
 */
async function logSuccessfulContact(profile) {
  await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'LOG_CONTACT',
        profileUrl: profile.url,
        name: profile.name,
        timestamp: new Date().toISOString()
      },
      resolve
    );
  });
}

// =====================================================
// STARTUP & MESSAGE HANDLING
// =====================================================

/**
 * Main loop - process next profile in queue
 */
async function startProcessing() {
  console.log('[Content] Starting LinkedIn Auto-Connect Agent...');
  
  // Check daily limit
  const limitReached = await checkDailyLimit();
  if (limitReached) {
    console.log('[Content] Daily limit reached, stopping');
    return;
  }
  
  // Get next profile from queue
  const profile = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_NEXT_PROFILE' }, resolve);
  });
  
  if (profile && profile.error) {
    console.log('[Content] Error getting profile:', profile.error);
    return;
  }
  
  if (!profile || !profile.profile) {
    console.log('[Content] No profiles in queue');
    return;
  }
  
  // Process the profile
  await processProfile(profile.profile);
}

/**
 * Extract profiles from current search results
 */
async function extractCurrentPageProfiles() {
  const profiles = extractProfilesFromSearch();
  
  if (profiles.length > 0) {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'ADD_PROFILES', profiles },
        resolve
      );
    });
    console.log(`[Content] Added ${profiles.length} profiles to queue`);
  }
  
  return profiles;
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'START_PROCESSING':
        await startProcessing();
        sendResponse({ success: true });
        break;
        
      case 'EXTRACT_PROFILES':
        const profiles = await extractCurrentPageProfiles();
        sendResponse({ success: true, count: profiles.length });
        break;
        
      case 'GET_STATUS':
        // Forward to background
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, sendResponse);
        return true; // Keep channel open
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  
  return true;
});

// Auto-extract profiles when on search page
if (window.location.href.includes('linkedin.com/search')) {
  console.log('[Content] Detected search page, extracting profiles...');
  setTimeout(async () => {
    await extractCurrentPageProfiles();
  }, 3000); // Wait for page to load
}

console.log('[Content] LinkedIn Auto-Connect Agent loaded');
