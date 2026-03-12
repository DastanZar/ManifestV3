/**
 * LinkedIn Auto-Connect Agent - Popup Script
 * 
 * This script handles the extension popup UI and user interactions.
 */

// DOM Elements
const elements = {
  dailyCount: document.getElementById('dailyCount'),
  progressFill: document.getElementById('progressFill'),
  queueLength: document.getElementById('queueLength'),
  totalContacted: document.getElementById('totalContacted'),
  startBtn: document.getElementById('startBtn'),
  extractBtn: document.getElementById('extractBtn'),
  clearQueueBtn: document.getElementById('clearQueueBtn'),
  message: document.getElementById('message')
};

// =====================================================
// STATUS UPDATES
// =====================================================

/**
 * Update the status display
 */
async function updateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    
    if (response) {
      const { dailyCount, dailyLimit, totalContacted, queueLength } = response;
      
      // Update text
      elements.dailyCount.textContent = `${dailyCount} / ${dailyLimit}`;
      elements.queueLength.textContent = queueLength || 0;
      elements.totalContacted.textContent = totalContacted || 0;
      
      // Update progress bar
      const percentage = (dailyCount / dailyLimit) * 100;
      elements.progressFill.style.width = `${percentage}%`;
      
      // Update colors based on progress
      const dailyCountEl = elements.dailyCount;
      const progressFillEl = elements.progressFill;
      
      dailyCountEl.classList.remove('warning', 'danger', 'success');
      progressFillEl.classList.remove('warning', 'danger');
      
      if (dailyCount >= dailyLimit) {
        dailyCountEl.classList.add('danger');
        progressFillEl.classList.add('danger');
        elements.startBtn.disabled = true;
        elements.startBtn.textContent = '⏹️ Daily Limit Reached';
      } else if (dailyCount >= dailyLimit * 0.8) {
        dailyCountEl.classList.add('warning');
        progressFillEl.classList.add('warning');
        elements.startBtn.disabled = false;
      } else {
        dailyCountEl.classList.add('success');
        elements.startBtn.disabled = false;
        elements.startBtn.textContent = '▶ Start Processing';
      }
    }
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

// =====================================================
// MESSAGE DISPLAY
// =====================================================

/**
 * Show a message to the user
 * @param {string} text - Message text
 * @param {string} type - Message type: 'success', 'error', 'warning'
 */
function showMessage(text, type = 'success') {
  elements.message.textContent = text;
  elements.message.className = `message show ${type}`;
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    elements.message.classList.remove('show');
  }, 5000);
}

// =====================================================
// BUTTON HANDLERS
// =====================================================

/**
 * Start processing profiles
 */
elements.startBtn.addEventListener('click', async () => {
  elements.startBtn.disabled = true;
  elements.startBtn.innerHTML = '<span class="spinner"></span>Processing...';
  
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url.includes('linkedin.com')) {
      showMessage('Please navigate to LinkedIn first', 'error');
      elements.startBtn.disabled = false;
      elements.startBtn.textContent = '▶ Start Processing';
      return;
    }
    
    // Send message to content script to start processing
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_PROCESSING' });
    
    if (response && response.success) {
      showMessage('Processing started! Check LinkedIn for actions.', 'success');
    } else {
      showMessage(response?.error || 'Failed to start processing', 'error');
    }
  } catch (error) {
    console.error('Error starting processing:', error);
    showMessage('Make sure you are on a LinkedIn page and try again', 'error');
  }
  
  elements.startBtn.disabled = false;
  elements.startBtn.textContent = '▶ Start Processing';
});

/**
 * Extract profiles from current search page
 */
elements.extractBtn.addEventListener('click', async () => {
  elements.extractBtn.disabled = true;
  elements.extractBtn.innerHTML = '<span class="spinner"></span>Extracting...';
  
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url.includes('linkedin.com')) {
      showMessage('Please navigate to LinkedIn search results first', 'error');
      elements.extractBtn.disabled = false;
      elements.extractBtn.textContent = '📥 Extract Profiles';
      return;
    }
    
    // Send message to content script to extract profiles
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PROFILES' });
    
    if (response && response.success) {
      showMessage(`Extracted ${response.count} profiles!`, 'success');
      await updateStatus();
    } else {
      showMessage(response?.error || 'No profiles found on this page', 'warning');
    }
  } catch (error) {
    console.error('Error extracting profiles:', error);
    showMessage('Make sure you are on a LinkedIn search results page', 'error');
  }
  
  elements.extractBtn.disabled = false;
  elements.extractBtn.textContent = '📥 Extract Profiles';
});

/**
 * Clear the profile queue
 */
elements.clearQueueBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear the queue? This cannot be undone.')) {
    return;
  }
  
  try {
    // Clear queue in storage
    await chrome.storage.local.set({ profileQueue: [] });
    showMessage('Queue cleared!', 'success');
    await updateStatus();
  } catch (error) {
    console.error('Error clearing queue:', error);
    showMessage('Failed to clear queue', 'error');
  }
});

// =====================================================
// INITIALIZATION
// =====================================================

// Update status on load
document.addEventListener('DOMContentLoaded', () => {
  updateStatus();
});

// Update status when popup opens
chrome.storage.onChanged.addListener(() => {
  updateStatus();
});
