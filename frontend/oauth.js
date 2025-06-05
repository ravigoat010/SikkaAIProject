// OAuth Configuration based on Clover v2/OAuth official documentation
const OAUTH_CONFIG = {
    clientId: 'YOUR_APP_ID', //Put Your App ID 
    redirectUri: window.location.origin + '/oauth/callback',
    // Use correct v2/OAuth URLs per official docs
    authUrl: 'https://apisandbox.dev.clover.com/oauth/v2/authorize',
    tokenUrl: 'https://apisandbox.dev.clover.com/oauth/v2/token',
    refreshUrl: 'https://apisandbox.dev.clover.com/oauth/v2/refresh',
    baseUrl: 'https://apisandbox.dev.clover.com',
    scope: 'read:orders write:orders read:payments write:payments read:merchant',
    responseType: 'code'
};

// DOM Elements
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const retryBtn = document.getElementById('retryBtn');
const authStatus = document.getElementById('authStatus');
const merchantInfo = document.getElementById('merchantInfo');
const errorMessage = document.getElementById('errorMessage');
const toastContainer = document.getElementById('toastContainer');

// Auth Steps
const steps = {
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    step3: document.getElementById('step3'),
    step4: document.getElementById('step4')
};

// Initialize OAuth Page
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔐 OAuth v2 Page Initialized');
    
    // Check if we're returning from OAuth callback
    checkOAuthCallback();
    
    // Check existing authentication
    checkExistingAuth();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup token refresh timer
    setupTokenRefresh();
});

// Setup Event Listeners
function setupEventListeners() {
    connectBtn.addEventListener('click', initiateOAuth);
    disconnectBtn.addEventListener('click', disconnect);
    retryBtn.addEventListener('click', () => showStep('step1'));
}

// Check if we're returning from OAuth callback
function checkOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const state = urlParams.get('state');
    const merchantId = urlParams.get('merchant_id');
    
    console.log('📝 OAuth v2 callback parameters:', {
        code: code ? 'present' : 'missing',
        merchantId,
        error,
        state,
        expectedState: localStorage.getItem('oauth_state')
    });
    
    if (error) {
        showError(`OAuth Error: ${error}`);
        return;
    }
    
    if (code) {
        // Verify state parameter for CSRF protection
        const expectedState = localStorage.getItem('oauth_state');
        if (state && expectedState && state !== expectedState) {
            showError('OAuth state mismatch - possible CSRF attack');
            return;
        }
        
        console.log('📝 Authorization code received, exchanging for tokens...');
        showStep('step2');
        updateAuthStatus('connecting', 'Connecting...');
        exchangeCodeForToken(code, merchantId);
        return;
    }
}

// Check for existing authentication
function checkExistingAuth() {
    const accessToken = localStorage.getItem('clover_access_token');
    const merchantId = localStorage.getItem('clover_merchant_id');
    const tokenExpires = localStorage.getItem('clover_token_expires');
    
    if (accessToken && merchantId) {
        // Check if token is expired
        if (tokenExpires && Date.now() > parseInt(tokenExpires)) {
            console.log('⚠️ Access token expired, attempting refresh...');
            attemptTokenRefresh();
            return;
        }
        
        console.log('✅ Valid existing authentication found');
        showStep('step3');
        displayMerchantInfo({
            id: merchantId,
            name: localStorage.getItem('clover_merchant_name') || 'Connected Merchant',
            currency: localStorage.getItem('clover_merchant_currency') || 'USD'
        });
        updateAuthStatus('connected', 'Connected');
    } else {
        showStep('step1');
        updateAuthStatus('disconnected', 'Not Connected');
    }
}

// Initiate OAuth v2 Flow per official documentation
function initiateOAuth() {
    console.log('🚀 Starting Clover v2/OAuth flow...');
    
    const state = generateRandomState();
    localStorage.setItem('oauth_state', state);
    
    // Build the v2/OAuth authorization URL according to official Clover docs
    const authUrl = `${OAUTH_CONFIG.authUrl}?` +
        `client_id=${OAUTH_CONFIG.clientId}&` +
        `redirect_uri=${encodeURIComponent(OAUTH_CONFIG.redirectUri)}&` +
        `response_type=${OAUTH_CONFIG.responseType}&` +
        `state=${state}`;
    
    console.log('🔗 v2/OAuth Authorization URL:', authUrl);
    
    updateAuthStatus('connecting', 'Redirecting to Clover...');
    showToast('Redirecting to Clover for secure authentication...', 'info');
    
    // Redirect to Clover v2/OAuth
    setTimeout(() => {
        window.location.href = authUrl;
    }, 1000);
}

// Exchange authorization code for v2/OAuth tokens
async function exchangeCodeForToken(code, merchantId) {
    try {
        console.log('🔄 Exchanging code for v2/OAuth tokens...');
        
        const response = await fetch('/api/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                redirect_uri: OAUTH_CONFIG.redirectUri,
                merchant_id: merchantId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ v2/OAuth token exchange successful:', {
                hasAccessToken: !!data.access_token,
                hasRefreshToken: !!data.refresh_token,
                merchantId: data.merchant_id,
                accessTokenExpiration: data.access_token_expiration,
                refreshTokenExpiration: data.refresh_token_expiration
            });
            
            // Store v2/OAuth tokens securely
            localStorage.setItem('clover_access_token', data.access_token);
            localStorage.setItem('clover_merchant_id', data.merchant_id || merchantId);
            
            // Store refresh token (v2/OAuth feature)
            if (data.refresh_token) {
                localStorage.setItem('clover_refresh_token', data.refresh_token);
            }
            
            // Store token expiration times (Unix timestamps from v2/OAuth)
            if (data.access_token_expiration) {
                localStorage.setItem('clover_token_expires', (data.access_token_expiration * 1000).toString());
            }
            if (data.refresh_token_expiration) {
                localStorage.setItem('clover_refresh_expires', (data.refresh_token_expiration * 1000).toString());
            }
            
            // Get merchant info using new token
            const finalMerchantId = data.merchant_id || merchantId;
            const merchantData = await fetchMerchantInfo(data.access_token, finalMerchantId);
            
            if (merchantData) {
                localStorage.setItem('clover_merchant_name', merchantData.name);
                localStorage.setItem('clover_merchant_currency', merchantData.currency);
                
                showStep('step3');
                displayMerchantInfo(merchantData);
                updateAuthStatus('connected', 'Connected');
                showToast('Successfully connected with Clover v2/OAuth!', 'success');
                
                // Clean up OAuth state
                localStorage.removeItem('oauth_state');
                
                // Clear URL parameters after successful authentication
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Setup automatic token refresh
                setupTokenRefresh();
            } else {
                throw new Error('Failed to fetch merchant information');
            }
        } else {
            throw new Error(data.error || 'v2/OAuth token exchange failed');
        }
        
    } catch (error) {
        console.error('❌ OAuth v2 error:', error);
        showError(`Authentication failed: ${error.message}`);
        showStep('step4');
        updateAuthStatus('disconnected', 'Authentication Failed');
    }
}

// Setup automatic token refresh using v2/OAuth refresh tokens
function setupTokenRefresh() {
    const tokenExpires = localStorage.getItem('clover_token_expires');
    const refreshToken = localStorage.getItem('clover_refresh_token');
    
    if (!tokenExpires || !refreshToken) return;
    
    const expirationTime = parseInt(tokenExpires);
    const currentTime = Date.now();
    const timeToExpiry = expirationTime - currentTime;
    
    // Refresh token 5 minutes before expiration
    const refreshTime = Math.max(0, timeToExpiry - (5 * 60 * 1000));
    
    console.log('⏰ Token refresh scheduled for:', new Date(currentTime + refreshTime));
    
    setTimeout(() => {
        attemptTokenRefresh();
    }, refreshTime);
}

// Attempt to refresh access token using v2/OAuth refresh token
async function attemptTokenRefresh() {
    const refreshToken = localStorage.getItem('clover_refresh_token');
    const refreshExpires = localStorage.getItem('clover_refresh_expires');
    
    if (!refreshToken) {
        console.log('⚠️ No refresh token available, need to re-authenticate');
        disconnect();
        return;
    }
    
    // Check if refresh token is expired
    if (refreshExpires && Date.now() > parseInt(refreshExpires)) {
        console.log('⚠️ Refresh token expired, need to re-authenticate');
        disconnect();
        return;
    }
    
    try {
        console.log('🔄 Refreshing access token using v2/OAuth...');
        
        const response = await fetch('/api/oauth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                refresh_token: refreshToken
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Token refresh successful');
            
            // Update stored tokens
            localStorage.setItem('clover_access_token', data.access_token);
            if (data.refresh_token) {
                localStorage.setItem('clover_refresh_token', data.refresh_token);
            }
            
            // Update expiration times
            if (data.access_token_expiration) {
                localStorage.setItem('clover_token_expires', (data.access_token_expiration * 1000).toString());
            }
            if (data.refresh_token_expiration) {
                localStorage.setItem('clover_refresh_expires', (data.refresh_token_expiration * 1000).toString());
            }
            
            // Schedule next refresh
            setupTokenRefresh();
            
            showToast('Access token refreshed automatically', 'success');
        } else {
            throw new Error(data.error || 'Token refresh failed');
        }
        
    } catch (error) {
        console.error('❌ Token refresh failed:', error);
        showToast('Session expired, please reconnect', 'warning');
        disconnect();
    }
}

// Fetch merchant information
async function fetchMerchantInfo(accessToken, merchantId) {
    try {
        console.log('📊 Fetching merchant info...');
        
        const response = await fetch(`/api/merchant/${merchantId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Merchant-Id': merchantId
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            return {
                id: data.merchant.id,
                name: data.merchant.name,
                currency: data.merchant.currency || 'USD',
                timezone: data.merchant.timezone || 'UTC',
                address: data.merchant.address
            };
        } else {
            throw new Error(data.error || 'Failed to fetch merchant info');
        }
        
    } catch (error) {
        console.error('❌ Error fetching merchant info:', error);
        return null;
    }
}

// Display merchant information
function displayMerchantInfo(merchant) {
    const merchantInfo = document.getElementById('merchantInfo');
    merchantInfo.innerHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <span class="label">Merchant ID:</span>
                <span class="value">${merchant.id}</span>
            </div>
            <div class="detail-item">
                <span class="label">Business Name:</span>
                <span class="value">${merchant.name}</span>
            </div>
            <div class="detail-item">
                <span class="label">Currency:</span>
                <span class="value">${merchant.currency}</span>
            </div>
            <div class="detail-item">
                <span class="label">OAuth Version:</span>
                <span class="value">v2 (Expiring Tokens)</span>
            </div>
            <div class="detail-item">
                <span class="label">Token Status:</span>
                <span class="value" style="color: #27ae60;">✓ Active & Auto-Refreshing</span>
            </div>
            <div class="detail-item">
                <span class="label">Connected:</span>
                <span class="value">${new Date().toLocaleString()}</span>
            </div>
        </div>
    `;
}

// Disconnect OAuth
function disconnect() {
    console.log('🔌 Disconnecting OAuth session...');
    
    // Clear all stored authentication data
    localStorage.removeItem('clover_access_token');
    localStorage.removeItem('clover_refresh_token');
    localStorage.removeItem('clover_merchant_id');
    localStorage.removeItem('clover_merchant_name');
    localStorage.removeItem('clover_merchant_currency');
    localStorage.removeItem('clover_token_expires');
    localStorage.removeItem('clover_refresh_expires');
    localStorage.removeItem('oauth_state');
    
    showStep('step1');
    updateAuthStatus('disconnected', 'Disconnected');
    showToast('Successfully disconnected from Clover', 'info');
}

// Show specific step
function showStep(stepId) {
    Object.values(steps).forEach(step => step.classList.remove('active'));
    if (steps[stepId]) {
        steps[stepId].classList.add('active');
    }
}

// Show error
function showError(message) {
    if (errorMessage) {
        errorMessage.textContent = message;
    }
    console.error('❌ OAuth Error:', message);
    showStep('step4');
}

// Update authentication status
function updateAuthStatus(status, message) {
    if (!authStatus) return;
    
    authStatus.className = `status-indicator ${status}`;
    authStatus.innerHTML = `
        <i class="fas ${getStatusIcon(status)}"></i>
        <span>${message}</span>
    `;
}

// Get status icon based on status
function getStatusIcon(status) {
    switch (status) {
        case 'connected': return 'fa-check-circle';
        case 'connecting': return 'fa-spinner fa-spin';
        case 'disconnected': return 'fa-times-circle';
        default: return 'fa-question-circle';
    }
}

// Generate random state for OAuth security
function generateRandomState() {
    return btoa(String.fromCharCode.apply(null, 
        new Uint8Array(Array.from({length: 32}, () => Math.floor(Math.random() * 256)))
    )).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${getToastIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Get toast icon based on type
function getToastIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'info': return 'fa-info-circle';
        default: return 'fa-info-circle';
    }
}

// Export authentication status for other pages
window.CloverAuth = {
    isAuthenticated: () => {
        return localStorage.getItem('clover_access_token') && 
               localStorage.getItem('clover_merchant_id');
    },
    getAccessToken: () => localStorage.getItem('clover_access_token'),
    getMerchantId: () => localStorage.getItem('clover_merchant_id'),
    getMerchantName: () => localStorage.getItem('clover_merchant_name'),
    disconnect: disconnect
}; 