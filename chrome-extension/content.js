/**
 * LinkedIn Auto-Connect Agent - Content Script
 * 
 * This script runs on linkedin.com and handles all DOM manipulation:
 * - Extracting profile URLs from search results
 * - Clicking Connect buttons (fuzzy selectors)
 * - Navigating to user activity/posts
 * - Extracting post text (fuzzy selectors)
 * - Injecting AI comments (contenteditable handling)
 * - Clicking Post button
 * 
 * Uses fuzzy DOM selectors to handle LinkedIn's dynamic DOM:
 * - Finds buttons by innerText or aria-label
 * - Finds post text using structural divs
 * - Handles contenteditable divs for comments
 */

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
 * Short sleep for between actions
 * @param {number} minMs - Minimum milliseconds
 * @param {number} maxMs - Maximum milliseconds
 * @returns {Promise<void>}
 */
function sleepMs(minMs = 500, maxMs = 1500) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
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
// FUZZY DOM SELECTORS - BUTTON FINDING
// =====================================================

/**
 * Find a button by exact innerText match using XPath
 * @param {string} text - Exact text to match
 * @returns {HTMLElement|null}
 */
function findButtonByText(text) {
  const xpath = `//button[normalize-space()="${text}"]`;
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue;
}

/**
 * Find a button by partial innerText match using XPath
 * @param {string} text - Partial text to match
 * @returns {HTMLElement|null}
 */
function findButtonByPartialText(text) {
  const xpath = `//button[contains(normalize-space(), "${text}")]`;
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue;
}

/**
 * Find a button by aria-label using XPath
 * @param {string} label - aria-label to match
 * @returns {HTMLElement|null}
 */
function findButtonByAriaLabel(label) {
  const xpath = `//button[contains(@aria-label, "${label}")]`;
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue;
}

/**
 * Find Connect button using multiple fuzzy strategies
 * @returns {HTMLElement|null}
 */
function findConnectButton() {
  // Try exact text match first
  let button = findButtonByText('Connect');
  if (button) return button;
  
  // Try partial text match
  button = findButtonByPartialText('Connect');
  if (button) return button;
  
  // Try aria-label
  button = findButtonByAriaLabel('Connect');
  if (button) return button;
  
  // Try aria-label with "invite"
  button = findButtonByAriaLabel('invite');
  if (button) return button;
  
  // Fallback: query all buttons and check for Connect text
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const btnText = btn.textContent?.trim().toLowerCase();
    if (btnText === 'connect' || btnText?.includes('connect')) {
      return btn;
    }
  }
  
  return null;
}

/**
 * Find Follow button using multiple fuzzy strategies
 * @returns {HTMLElement|null}
 */
function findFollowButton() {
  // Try exact text match first
  let button = findButtonByText('Follow');
  if (button) return button;
  
  // Try partial text match
  button = findButtonByPartialText('Follow');
  if (button) return button;
  
  // Try aria-label
  button = findButtonByAriaLabel('Follow');
  if (button) return button;
  
  return null;
}

/**
 * Find Post/Comment button using multiple fuzzy strategies
 * @returns {HTMLElement|null}
 */
function findPostButton() {
  // Try exact text match
  let button = findButtonByText('Post');
  if (button) return button;
  
  // Try aria-label
  button = findButtonByAriaLabel('Post');
  if (button) return button;
  
  button = findButtonByAriaLabel('Comment');
  if (button) return button;
  
  // Try partial text
  button = findButtonByPartialText('Post');
  if (button) return button;
  
  return null;
}

/**
 * Find Send button for connection requests
 * @returns {HTMLElement|null}
 */
function findSendButton() {
  // Try exact text match
  let button = findButtonByText('Send');
  if (button) return button;
  
  // Try aria-label
  button = findButtonByAriaLabel('Send invitation');
  if (button) return button;
  
  button = findButtonByAriaLabel('Send');
  if (button) return button;
  
  return null;
}

/**
 * Find Add a note button
 * @returns {HTMLElement|null}
 */
function findAddNoteButton() {
  let button = findButtonByText('Add a note');
  if (button) return button;
  
  button = findButtonByAriaLabel('Add a note');
  if (button) return button;
  
  return null;
}

// =====================================================
// FUZZY DOM SELECTORS - POST TEXT EXTRACTION
// =====================================================

/**
 * Extract the latest post text from the feed
 * Uses fuzzy selectors for LinkedIn's dynamic DOM
 * @returns {Promise<string|null>}
 */
async function extractLatestPost() {
  // Wait for posts to load
  await sleepMs(1500, 3000);
  
  // Find post containers using multiple strategies
  let postContainer = null;
  
  // Try feed-shared-update-v2 class (structural div)
  const postsV2 = document.querySelectorAll('div[class*="feed-shared-update-v2"]');
  if (postsV2.length > 0) {
    postContainer = postsV2[0];
    console.log('[Content] Found post using feed-shared-update-v2');
  }
  
  // Try update-components-text class
  if (!postContainer) {
    const postsText = document.querySelectorAll('div[class*="update-components-text"]');
    if (postsText.length > 0) {
      // Find parent container
      postContainer = postsText[0].closest('div[class*="feed-shared"]') || postsText[0].closest('div[class*="update"]');
      console.log('[Content] Found post using update-components-text');
    }
  }
  
  // Try feed-shared-update-v2__description
  if (!postContainer) {
    const descriptions = document.querySelectorAll('div[class*="feed-shared-update-v2__description"]');
    if (descriptions.length > 0) {
      postContainer = descriptions[0].closest('div[class*="feed-shared-update-v2"]');
      console.log('[Content] Found post using feed-shared-update-v2__description');
    }
  }
  
  // Fallback: find any visible post with text
  if (!postContainer) {
    const allDivs = document.querySelectorAll('div[role="article"]');
    if (allDivs.length > 0) {
      postContainer = allDivs[0];
      console.log('[Content] Found post using role=article');
    }
  }
  
  if (!postContainer) {
    console.log('[Content] No post container found');
    return null;
  }
  
  // Extract text from the container
  let textElement = null;
  
  // Try feed-shared-text class
  textElement = postContainer.querySelector('span[class*="feed-shared-text"]');
  
  // Try update-components-text
  if (!textElement) {
    textElement = postContainer.querySelector('div[class*="update-components-text"]');
  }
  
  // Try any paragraph in the post
  if (!textElement) {
    textElement = postContainer.querySelector('p');
  }
  
  if (!textElement) {
    console.log('[Content] Post text element not found');
    return null;
  }
  
  // Click "See more" if available
  const seeMoreBtn = postContainer.querySelector('button, span')?.closest('button');
  const seeMoreSpan = postContainer.querySelector('span[class*="see-more"], button[class*="see-more"]');
  if (seeMoreSpan) {
    const seeMoreButton = seeMoreSpan.closest('button');
    if (seeMoreButton) {
      console.log('[Content] Clicking See more button');
      seeMoreButton.click();
      await sleepMs(500, 1000);
    }
  }
  
  // Clean up the text - remove "see more" artifacts
  let text = textElement.textContent.trim();
  text = text.replace(/\s*\.{3,}see more\s*/gi, '');
  text = text.replace(/\s*\.{3,}\s*$/, '');
  
  console.log('[Content] Extracted post text:', text.substring(0, 100) + '...');
  return text || null;
}

// =====================================================
// CONTENTEDITABLE COMMENT INJECTION
// =====================================================

/**
 * Find the comment box (contenteditable div)
 * LinkedIn uses Quill.js or Draft.js editors
 * @returns {HTMLElement|null}
 */
function findCommentBox() {
  // Try contenteditable="true" first
  const editableDivs = document.querySelectorAll('div[contenteditable="true"]');
  
  // Look for comment-related containers
  for (const div of editableDivs) {
    // Check if it's inside a comment section
    const parent = div.closest('div[class*="comments-comment"]') || 
                   div.closest('div[class*="comment"]') ||
                   div.closest('form');
    if (parent) {
      console.log('[Content] Found comment box (contenteditable)');
      return div;
    }
  }
  
  // Try specific comment box selectors
  const commentBoxSelectors = [
    'div.comments-comment-box__input',
    'div[class*="comments-comment-box__text-editor"]',
    '.ql-editor'
  ];
  
  for (const selector of commentBoxSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log('[Content] Found comment box using selector:', selector);
      return element;
    }
  }
  
  console.log('[Content] Comment box not found');
  return null;
}

/**
 * Inject text into contenteditable div
 * Uses execCommand or event dispatching for React compatibility
 * @param {HTMLElement} element - Contenteditable element
 * @param {string} text - Text to insert
 */
async function insertTextIntoContentEditable(element, text) {
  // Focus the element
  element.focus();
  
  // Try execCommand first (more reliable on some browsers)
  try {
    const success = document.execCommand('insertText', false, text);
    if (success) {
      console.log('[Content] Inserted text using execCommand');
      return;
    }
  } catch (e) {
    console.log('[Content] execCommand failed, trying alternative method');
  }
  
  // Alternative: set textContent and dispatch events
  element.textContent = text;
  
  // Dispatch input event so React registers the change
  const inputEvent = new Event('input', { bubbles: true });
  element.dispatchEvent(inputEvent);
  
  // Dispatch change event
  const changeEvent = new Event('change', { bubbles: true });
  element.dispatchEvent(changeEvent);
  
  // Also dispatch input event on the parent form if exists
  const form = element.closest('form');
  if (form) {
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  console.log('[Content] Inserted text using textContent + events');
}

/**
 * Post a comment on a LinkedIn post
 * @param {string} comment - Comment text
 * @returns {Promise<boolean>}
 */
async function postComment(comment) {
  console.log('[Content] Attempting to post comment...');
  
  // Find the comment box
  const commentBox = findCommentBox();
  if (!commentBox) {
    console.log('[Content] Comment box not found');
    return false;
  }
  
  // Wait a bit before interacting
  await sleepMs(300, 800);
  
  // Click on comment box to focus
  commentBox.click();
  await sleepMs(200, 500);
  
  // Insert the comment text
  await insertTextIntoContentEditable(commentBox, comment);
  
  // Wait for text to be registered
  await sleepMs(500, 1000);
  
  // Find and click the Post button
  const postButton = findPostButton();
  
  if (postButton) {
    console.log('[Content] Clicking Post button');
    postButton.click();
    await sleepMs(500, 1000);
    return true;
  }
  
  console.log('[Content] Post button not found');
  return false;
}

// =====================================================
// PROFILE & ACTIVITY NAVIGATION
// =====================================================

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
 * Extract profile information from search results
 * @returns {Array} Array of profile objects
 */
function extractProfilesFromSearch() {
  const profiles = [];
  
  // Find profile cards using multiple strategies
  let containers = document.querySelectorAll('li.reusable-search__result-container');
  
  if (containers.length === 0) {
    // Try alternative selectors
    containers = document.querySelectorAll('div[data-test-search-result]');
  }
  
  if (containers.length === 0) {
    containers = document.querySelectorAll('li[data-test-search-result]');
  }
  
  containers.forEach(container => {
    const linkEl = container.querySelector('a.app-aware-link') || 
                   container.querySelector('a[href*="/in/"]');
    const nameEl = container.querySelector('span.entity-result__title-text a') ||
                    container.querySelector('span[data-test-search-result-title__go-to-profile]');
    
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

/**
 * Click the connect button on a profile
 * @returns {Promise<boolean>} Success status
 */
async function clickConnectButton() {
  console.log('[Content] Waiting for Connect button to render...');
  const button = await waitForElement(() => findConnectButton(), 15000);
  
  if (button) {
    console.log('[Content] Found connect button');
    await clickElement(button);
    await sleep(2, 4); // Wait for modal to open
    return true;
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
  const addNoteBtn = findAddNoteButton();
  
  if (addNoteBtn) {
    console.log('[Content] Add note button found, skipping for automation');
    // For now, just send without note
  }
  
  // Click send button
  const sendBtn = findSendButton();
  if (sendBtn) {
    console.log('[Content] Clicking Send button');
    await clickElement(sendBtn);
    return true;
  }
  
  console.log('[Content] Send button not found');
  return false;
}

/**
 * Navigate to user's activity tab
 * @returns {Promise<boolean>} Success status
 */
async function navigateToActivity() {
  // Try multiple activity tab selectors
  const activitySelectors = [
    'a[href*="/overlay/activity"]',
    'a[href*="/profile_details/"]',
    'a[href*="/recent-activity/"]'
  ];
  
  for (const selector of activitySelectors) {
    const tab = document.querySelector(selector);
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
 * Get the author's name from the profile
 * @returns {string} Author name
 */
function getAuthorName() {
  // Try to find name in the page header
  const nameSelectors = [
    'h1.text-heading-xlarge',
    'h1[data-test-id="profile-header"]',
    '.pv-top-card--list h1',
    'h1[class*="top-card"]'
  ];
  
  for (const selector of nameSelectors) {
    const nameEl = document.querySelector(selector);
    if (nameEl) {
      return nameEl.textContent.trim();
    }
  }
  
  return 'there';
}

// =====================================================
// LOGGING
// =====================================================

/**
 * Log successful contact to background script
 * @param {Object} profile - Profile object
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
      () => resolve()
    );
  });
}

// =====================================================
// SPA RENDERING - MUTATION OBSERVER & URL CHANGE DETECTION
// =====================================================

let isProcessing = false;
let lastUrl = window.location.href;
let observerInterval = null;
let pollInterval = null;

/**
 * Wait for DOM elements to appear before executing
 * Uses both MutationObserver and polling as fallback
 * @param {Function} targetFn - Function that returns target element
 * @param {number} timeout - Max time to wait in ms (default 30000)
 * @returns {Promise<HTMLElement|null>}
 */
async function waitForElement(targetFn, timeout = 30000) {
  console.log("Waiting for DOM elements to render...");
  
  // First check if element already exists
  const existingElement = targetFn();
  if (existingElement) {
    console.log("[Content] Target element found immediately");
    return existingElement;
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      const element = targetFn();
      if (element) {
        console.log("[Content] Target element found via MutationObserver");
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Polling fallback (in case MutationObserver misses something)
    const pollStartTime = Date.now();
    const pollFn = () => {
      const element = targetFn();
      if (element) {
        console.log("[Content] Target element found via polling");
        observer.disconnect();
        resolve(element);
        return;
      }
      
      if (Date.now() - pollStartTime > timeout) {
        console.log("[Content] Timeout waiting for element");
        observer.disconnect();
        resolve(null);
        return;
      }
    };
    
    pollInterval = setInterval(pollFn, 500);
    
    // Also set a timeout to clean up
    setTimeout(() => {
      observer.disconnect();
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      const element = targetFn();
      resolve(element);
    }, timeout);
  });
}

/**
 * Check if we're on a LinkedIn search results page
 * @returns {boolean}
 */
function isSearchResultsPage() {
  return window.location.href.includes('/search/') || 
         document.querySelector('.reusable-search') !== null ||
         document.querySelector('[data-test-search-result]') !== null;
}

/**
 * Check if we're on a profile page
 * @returns {boolean}
 */
function isProfilePage() {
  return window.location.href.includes('/in/') && 
         document.querySelector('.pv-top-card') !== null;
}

/**
 * Detect URL changes (History API)
 */
function setupUrlChangeDetection() {
  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    console.log("[Content] URL changed (popstate):", window.location.href);
    handleUrlChange();
  });
  
  // Override pushState to detect programmatic navigation
  const originalPushState = window.history.pushState;
  window.history.pushState = function(...args) {
    console.log("[Content] URL changed (pushState):", args[2]);
    handleUrlChange();
    return originalPushState.apply(this, args);
  };
  
  // Override replaceState
  const originalReplaceState = window.history.replaceState;
  window.history.replaceState = function(...args) {
    console.log("[Content] URL changed (replaceState):", args[2]);
    handleUrlChange();
    return originalReplaceState.apply(this, args);
  };
}

/**
 * Handle URL changes - re-trigger processing
 */
function handleUrlChange() {
  const newUrl = window.location.href;
  
  if (newUrl !== lastUrl) {
    console.log("[Content] Page changed from", lastUrl, "to", newUrl);
    lastUrl = newUrl;
    
    // Reset processing state if we were processing
    isProcessing = false;
    
    // Small delay to let the page settle
    setTimeout(() => {
      console.log("[Content] Ready to process new page");
    }, 1000);
  }
}

/**
 * Listen for messages from background script to trigger processing
 */
function setupBackgroundMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_PROCESSING') {
      handleStartProcessing().then(() => sendResponse({ success: true }));
      return true;
    }
    
    if (message.type === 'GET_PROFILES') {
      handleGetProfiles().then(() => sendResponse({ success: true }));
      return true;
    }
    
    if (message.type === 'URL_CHANGED') {
      // Background script notifying us of URL change
      handleUrlChange();
      sendResponse({ received: true });
      return true;
    }
  });
}

/**
 * Wrapper for startProcessing with SPA handling
 */
async function handleStartProcessing() {
  if (isProcessing) {
    console.log("[Content] Already processing, skipping");
    return;
  }
  
  isProcessing = true;
  
  try {
    await startProcessing();
  } catch (error) {
    console.error("[Content] Error in processing:", error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Wrapper for getProfiles with SPA handling
 */
async function handleGetProfiles() {
  console.log("[Content] Getting profiles from search results");
  
  // Wait for search results to render
  await waitForElement(() => {
    return document.querySelector('.reusable-search__result-container') ||
           document.querySelector('[data-test-search-result]') ||
           document.querySelector('li.reusable-search__result-container');
  }, 15000);
  
  // Additional wait for React to render
  await sleepMs(1000, 2000);
  
  const profiles = extractProfilesFromSearch();
  console.log(`[Content] Found ${profiles.length} profiles`);
  
  return { profiles };
}

/**
 * Initialize SPA handling - call this at the end of the script
 */
function initializeSpaHandling() {
  console.log("[Content] Initializing SPA handling...");
  
  // Set up URL change detection
  setupUrlChangeDetection();
  
  // Set up background message listener
  setupBackgroundMessageListener();
  
  // Set up a MutationObserver to detect major page changes
  const pageObserver = new MutationObserver((mutations) => {
    // Check if the main content area changed significantly
    const hasSignificantChange = mutations.some(mutation => {
      return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
    });
    
    if (hasSignificantChange) {
      // Debounce URL check
      clearTimeout(observerInterval);
      observerInterval = setTimeout(() => {
        handleUrlChange();
      }, 500);
    }
  });
  
  pageObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log("[Content] SPA handling initialized");
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
 * Main entry point - process queue from background
 */
async function startProcessing() {
  console.log('[Content] Starting LinkedIn Auto-Connect Agent...');
  
  // Check daily limit first
  const atLimit = await checkDailyLimit();
  if (atLimit) {
    console.log('[Content] Daily limit reached, stopping');
    return;
  }
  
  // Get next profile from queue
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_NEXT_PROFILE' }, resolve);
  });
  
  if (response.error) {
    console.log('[Content] Error getting profile:', response.message);
    return;
  }
  
  if (!response.profile) {
    console.log('[Content] No profiles in queue');
    return;
  }
  
  // Wait for profile page to render fully
  console.log('[Content] Waiting for profile page to render...');
  await waitForElement(() => {
    return document.querySelector('.pv-top-card') ||
           document.querySelector('[data-test-id="profile-header"]') ||
           document.querySelector('h1.text-heading-xlarge');
  }, 20000);
  
  // Additional wait for React
  await sleepMs(1500, 3000);
  
  // Process the profile
  await processProfile(response.profile);
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_PROCESSING') {
    handleStartProcessing().then(() => sendResponse({ success: true }));
    return true;
  }
  
  if (message.type === 'GET_PROFILES') {
    handleGetProfiles().then(() => sendResponse({ success: true }));
    return true;
  }
});

// Initialize SPA handling
initializeSpaHandling();

console.log('[Content] LinkedIn Auto-Connect Agent content script loaded');
