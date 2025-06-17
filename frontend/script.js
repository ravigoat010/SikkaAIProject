// API Configuration
const API_BASE_URL = window.location.origin + '/api';

// DOM Elements
const lineItemForm = document.getElementById('lineItemForm');
const createOrderBtn = document.getElementById('createOrderBtn');
const clearItemsBtn = document.getElementById('clearItemsBtn');
const lineItemsList = document.getElementById('lineItemsList');
const orderTotal = document.getElementById('orderTotal');
const orderDetailsSection = document.getElementById('orderDetailsSection');
const orderDetails = document.getElementById('orderDetails');
const paymentForm = document.getElementById('paymentForm');
const payButton = document.getElementById('payButton');
const loadingOverlay = document.getElementById('loadingOverlay');
const paymentStatus = document.getElementById('paymentStatus');
const refreshStatus = document.getElementById('refreshStatus');
const transactionHistory = document.getElementById('transactionHistory');
const refreshHistoryBtn = document.getElementById('refreshHistory');
const connectionStatus = document.getElementById('connectionStatus');
const toastContainer = document.getElementById('toastContainer');

// OAuth Elements
const oauthBtn = document.getElementById('oauthBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

// Application State
let lineItems = [];
let currentOrder = null;
let currentPayment = null;
let isProcessing = false;
let authState = {
    isAuthenticated: false,
    accessToken: null,
    merchantId: null,
    merchantName: null,
    authMethod: null // 'oauth' or 'env'
};

// Initialize Application
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 Clover Payment App Initialized - OAuth2 + Atomic Orders Workflow');

    // Check authentication state
    checkAuthenticationState();

    // Set up event listeners
    setupEventListeners();

    // Update UI
    updateLineItemsDisplay();
    updateOrderTotal();
});

// Event Listeners Setup
function setupEventListeners() {
    lineItemForm.addEventListener('submit', handleAddLineItem);
    createOrderBtn.addEventListener('click', handleCreateOrder);
    clearItemsBtn.addEventListener('click', handleClearItems);
    paymentForm.addEventListener('submit', handlePaymentSubmit);
    refreshStatus.addEventListener('click', handleRefreshStatus);
    refreshHistoryBtn.addEventListener('click', loadTransactionHistory);

    // OAuth event listeners
    oauthBtn.addEventListener('click', handleOAuthConnect);
    disconnectBtn.addEventListener('click', handleDisconnect);

    // Auto-refresh transaction history every 30 seconds
    setInterval(loadTransactionHistory, 30000);
}

// Check Authentication State
async function checkAuthenticationState() {
    console.log('🔐 Checking authentication state...');

    // Check for OAuth tokens first
    const accessToken = localStorage.getItem('clover_access_token');
    const merchantId = localStorage.getItem('clover_merchant_id');
    const merchantName = localStorage.getItem('clover_merchant_name');
    const tokenExpires = localStorage.getItem('clover_token_expires');

    if (accessToken && merchantId) {
        // Check if token is expired
        if (tokenExpires && Date.now() > parseInt(tokenExpires)) {
            console.log('⚠️ OAuth token expired, attempting refresh...');
            const refreshed = await attemptTokenRefresh();
            if (!refreshed) {
                clearOAuthTokens();
                checkServerConnection(); // Fall back to env tokens
                return;
            }
        }

        console.log('✅ OAuth authentication found');
        authState.isAuthenticated = true;
        authState.accessToken = accessToken;
        authState.merchantId = merchantId;
        authState.merchantName = merchantName;
        authState.authMethod = 'oauth';

        updateAuthenticationUI();
        testMerchantConnectionWithToken(accessToken, merchantId);
    } else {
        console.log('ℹ️ No OAuth tokens found, checking environment variables...');
        checkServerConnection(); // Fall back to environment tokens
    }
}

// Attempt Token Refresh
async function attemptTokenRefresh() {
    const refreshToken = localStorage.getItem('clover_refresh_token');

    if (!refreshToken) {
        console.log('⚠️ No refresh token available');
        return false;
    }

    try {
        console.log('🔄 Refreshing OAuth tokens...');

        const response = await fetch(`${API_BASE_URL}/oauth/refresh`, {
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
            // Update stored tokens
            localStorage.setItem('clover_access_token', data.access_token);
            if (data.refresh_token) {
                localStorage.setItem('clover_refresh_token', data.refresh_token);
            }

            // Update expiration times
            if (data.access_token_expiration) {
                localStorage.setItem('clover_token_expires', (data.access_token_expiration * 1000).toString());
            }

            console.log('✅ Token refresh successful');
            showToast('Authentication tokens refreshed', 'success');
            return true;
        } else {
            throw new Error(data.error || 'Token refresh failed');
        }
    } catch (error) {
        console.error('❌ Token refresh failed:', error);
        return false;
    }
}

// Clear OAuth Tokens
function clearOAuthTokens() {
    localStorage.removeItem('clover_access_token');
    localStorage.removeItem('clover_refresh_token');
    localStorage.removeItem('clover_merchant_id');
    localStorage.removeItem('clover_merchant_name');
    localStorage.removeItem('clover_merchant_currency');
    localStorage.removeItem('clover_token_expires');
    localStorage.removeItem('clover_refresh_expires');

    authState.isAuthenticated = false;
    authState.accessToken = null;
    authState.merchantId = null;
    authState.merchantName = null;
    authState.authMethod = null;
}

// Handle OAuth Connect
function handleOAuthConnect() {
    console.log('🔐 Redirecting to OAuth authentication...');
    showToast('Redirecting to OAuth authentication...', 'info');
    window.location.href = '/oauth';
}

// Handle Disconnect
function handleDisconnect() {
    if (authState.authMethod === 'oauth') {
        clearOAuthTokens();
        showToast('Disconnected from OAuth session', 'info');
        updateAuthenticationUI();
        checkServerConnection(); // Fall back to environment tokens
    }
}

// Update Authentication UI
function updateAuthenticationUI() {
    if (authState.isAuthenticated && authState.authMethod === 'oauth') {
        updateConnectionStatus('oauth-connected', `OAuth: ${authState.merchantName || authState.merchantId}`);
        oauthBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-flex';
    } else {
        oauthBtn.style.display = 'inline-flex';
        disconnectBtn.style.display = 'none';
    }
}

// Check Server Connection
async function checkServerConnection() {
    try {
        updateConnectionStatus('checking', 'Checking connection...');

        const response = await fetch(`${API_BASE_URL}/health`);
        const data = await response.json();

        if (data.status === 'OK') {
            updateConnectionStatus('checking', 'Testing merchant connection...');

            // Test merchant connection with environment variables if no OAuth
            if (!authState.isAuthenticated) {
                await testMerchantConnection();
            }
        } else {
            throw new Error('Server health check failed');
        }
    } catch (error) {
        console.error('Connection check failed:', error);
        updateConnectionStatus('disconnected', 'Server connection failed');
        showToast('Unable to connect to payment server', 'error');
    }
}

// Test Merchant Connection (Environment Variables)
async function testMerchantConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/merchant`);
        const data = await response.json();

        if (data.success) {
            console.log('✅ Merchant authenticated via environment:', data.merchant.name);
            authState.isAuthenticated = true;
            authState.merchantName = data.merchant.name;
            authState.authMethod = 'env';

            updateConnectionStatus('connected', `ENV: ${data.merchant.name}`);
            updateAuthenticationUI();
            loadTransactionHistory();
            showToast(`Connected via environment: ${data.merchant.name}`, 'success');
        } else {
            throw new Error(data.error || 'Merchant authentication failed');
        }
    } catch (error) {
        console.error('❌ Merchant connection failed:', error);
        updateConnectionStatus('disconnected', 'Authentication required');
        updateAuthenticationUI();
        showToast('Authentication required. Use OAuth or configure environment variables.', 'warning');
    }
}

// Test Merchant Connection with OAuth Token
async function testMerchantConnectionWithToken(accessToken, merchantId) {
    try {
        const response = await fetch(`${API_BASE_URL}/merchant/${merchantId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Merchant-Id': merchantId
            }
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ OAuth merchant authenticated:', data.merchant.name);
            authState.merchantName = data.merchant.name;

            updateConnectionStatus('oauth-connected', `OAuth: ${data.merchant.name}`);
            updateAuthenticationUI();
            loadTransactionHistory();
            showToast(`Connected via OAuth: ${data.merchant.name}`, 'success');
        } else {
            throw new Error(data.error || 'OAuth merchant authentication failed');
        }
    } catch (error) {
        console.error('❌ OAuth merchant connection failed:', error);

        if (error.message.includes('Unauthorized') || error.message.includes('expired')) {
            console.log('🔄 Token expired, attempting refresh...');
            const refreshed = await attemptTokenRefresh();
            if (refreshed) {
                // Retry with new token
                const newToken = localStorage.getItem('clover_access_token');
                testMerchantConnectionWithToken(newToken, merchantId);
                return;
            }
        }

        clearOAuthTokens();
        updateConnectionStatus('disconnected', 'OAuth authentication failed');
        updateAuthenticationUI();
        showToast('OAuth authentication failed. Please reconnect.', 'error');

        // Fall back to environment variables
        checkServerConnection();
    }
}

// Get Authentication Headers
function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (authState.isAuthenticated && authState.authMethod === 'oauth' && authState.accessToken) {
        headers['Authorization'] = `Bearer ${authState.accessToken}`;
        headers['X-Merchant-Id'] = authState.merchantId;
    }

    return headers;
}

// Update Connection Status
function updateConnectionStatus(status, message) {
    connectionStatus.className = `status-indicator ${status}`;
    connectionStatus.querySelector('span').textContent = message;
}

// Handle Add Line Item
async function handleAddLineItem(event) {
    event.preventDefault();

    const formData = new FormData(lineItemForm);
    const name = formData.get('itemName').trim();
    const price = parseFloat(formData.get('itemPrice'));
    const quantity = parseInt(formData.get('itemQuantity'));

    // Validate input
    if (!name) {
        showToast('Please enter an item name', 'error');
        return;
    }

    if (!price || price <= 0) {
        showToast('Please enter a valid price', 'error');
        return;
    }

    if (!quantity || quantity <= 0) {
        showToast('Please enter a valid quantity', 'error');
        return;
    }

    // Add item to line items
    const lineItem = {
        id: Date.now().toString(), // Temporary ID for frontend
        name: name,
        price: price,
        quantity: quantity,
        total: price * quantity
    };

    lineItems.push(lineItem);

    // Reset form
    lineItemForm.reset();
    document.getElementById('itemQuantity').value = '1';

    // Update display
    updateLineItemsDisplay();
    updateOrderTotal();

    showToast(`Added ${name} to order`, 'success');
}

// Handle Remove Line Item
function handleRemoveLineItem(itemId) {
    lineItems = lineItems.filter(item => item.id !== itemId);
    updateLineItemsDisplay();
    updateOrderTotal();
    showToast('Item removed from order', 'info');
}

// Handle Clear Items
function handleClearItems() {
    if (lineItems.length === 0) return;

    lineItems = [];
    updateLineItemsDisplay();
    updateOrderTotal();
    showToast('All items cleared', 'info');
}

// Update Line Items Display
function updateLineItemsDisplay() {
    if (lineItems.length === 0) {
        lineItemsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket"></i>
                <p>No items added yet</p>
            </div>
        `;
        createOrderBtn.disabled = true;
    } else {
        const itemsHtml = lineItems.map(item => `
            <div class="line-item" data-id="${item.id}">
                <div class="item-info">
                    <span class="item-name">${item.name}</span>
                    <span class="item-details">
                        $${item.price.toFixed(2)} × ${item.quantity} = $${item.total.toFixed(2)}
                    </span>
                </div>
                <button type="button" class="btn-remove" onclick="handleRemoveLineItem('${item.id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');

        lineItemsList.innerHTML = itemsHtml;
        createOrderBtn.disabled = false;
    }
}

// Update Order Total
function updateOrderTotal() {
    const total = lineItems.reduce((sum, item) => sum + item.total, 0);
    orderTotal.textContent = total.toFixed(2);
}

// Handle Create Order
async function handleCreateOrder() {
    if (lineItems.length === 0) {
        showToast('Please add at least one item', 'error');
        return;
    }

    if (isProcessing) return;

    try {
        isProcessing = true;
        showLoading(true);
        updatePayButton(true);

        console.log('📦 Creating atomic order with line items:', lineItems);

        const response = await fetch(`${API_BASE_URL}/orders`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                items: lineItems.map(item => ({
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity
                }))
            })
        });

        const data = await response.json();

        if (data.success) {
            currentOrder = data.order;
            console.log('✅ Atomic order created:', currentOrder.id);

            displayOrderDetails(currentOrder);
            orderDetailsSection.style.display = 'block';

            // Scroll to order details
            orderDetailsSection.scrollIntoView({ behavior: 'smooth' });

            showToast(`Order created successfully: ${currentOrder.id}`, 'success');
        } else {
            throw new Error(data.error || 'Failed to create order');
        }

    } catch (error) {
        console.error('❌ Order creation failed:', error);
        showToast(`Order creation failed: ${error.message}`, 'error');
    } finally {
        isProcessing = false;
        showLoading(false);
        updatePayButton(false);
    }
}

// Display Order Details
function displayOrderDetails(order) {
    const orderHtml = `
        <div class="order-summary">
            <div class="order-header">
                <h3><i class="fas fa-file-invoice"></i> Order Created</h3>
                <div class="order-meta">
                    <span class="order-id">Order ID: ${order.id}</span>
                    <span class="order-date">${new Date(order.createdTime).toLocaleString()}</span>
                </div>
            </div>
            
            <div class="order-items">
                ${order.lineItems.map(item => `
                    <div class="order-item">
                        <span class="item-name">${item.name}</span>
                        <span class="item-price">$${(item.price / 100).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="order-totals">
                <div class="total-line">
                    <span class="total-label">Total:</span>
                    <span class="total-amount">$${(order.total / 100).toFixed(2)} ${order.currency}</span>
                </div>
            </div>
        </div>
    `;

    orderDetails.innerHTML = orderHtml;
}

// Handle Payment Submit
async function handlePaymentSubmit(event) {
    event.preventDefault();

    if (!currentOrder) {
        showToast('Please create an order first', 'error');
        return;
    }

    if (isProcessing) return;

    try {
        isProcessing = true;
        showLoading(true);
        updatePayButton(true);

        const formData = new FormData(paymentForm);
        const cardToken = formData.get('cardToken') || 'test_token';

        console.log('💳 Processing payment for order:', currentOrder.id);

        const response = await fetch(`${API_BASE_URL}/orders/${currentOrder.id}/pay`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                cardToken: cardToken
            })
        });

        const data = await response.json();

        if (data.success) {
            currentPayment = data.payment;
            console.log('✅ Payment processed:', currentPayment);

            displayPaymentResult(data);
            refreshStatus.style.display = 'inline-flex';

            // Load updated transaction history
            loadTransactionHistory();

            showToast('Payment processed successfully!', 'success');
        } else {
            throw new Error(data.error || 'Payment processing failed');
        }

    } catch (error) {
        console.error('❌ Payment failed:', error);
        displayPaymentError(error.message);
        showToast(`Payment failed: ${error.message}`, 'error');
    } finally {
        isProcessing = false;
        showLoading(false);
        updatePayButton(false);
    }
}

// Handle Refresh Status
async function handleRefreshStatus() {
    if (!currentOrder) {
        showToast('No order to refresh', 'error');
        return;
    }

    try {
        console.log('🔄 Refreshing payment status for order:', currentOrder.id);

        const response = await fetch(`${API_BASE_URL}/orders/${currentOrder.id}/payments`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (data.success) {
            console.log('📊 Payment status refreshed:', data.payments);
            displayOrderPayments(data.payments);
            showToast('Payment status refreshed', 'success');
        } else {
            throw new Error(data.error || 'Failed to refresh payment status');
        }

    } catch (error) {
        console.error('❌ Status refresh failed:', error);
        showToast(`Status refresh failed: ${error.message}`, 'error');
    }
}

// Display Payment Result
function displayPaymentResult(payment) {
    const statusClass = getStatusClass(payment.status);
    const statusIcon = getStatusIcon(payment.status);

    paymentStatus.innerHTML = `
        <div class="payment-result ${statusClass}">
            <h3>
                <i class="${statusIcon}"></i>
                Payment ${payment.status ? payment.status.charAt(0).toUpperCase() + payment.status.slice(1) : 'Processed'}
            </h3>
            <div class="payment-details">
                <div class="detail-item">
                    <div class="detail-label">Payment ID</div>
                    <div class="detail-value">${payment.id}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Order ID</div>
                    <div class="detail-value">${payment.orderId}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Amount</div>
                    <div class="detail-value">$${payment.amount ? (payment.amount / 100).toFixed(2) : 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Currency</div>
                    <div class="detail-value">${payment.currency || 'USD'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">${payment.status || 'Success'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Timestamp</div>
                    <div class="detail-value">${new Date().toLocaleString()}</div>
                </div>
            </div>
        </div>
    `;
}

// Display Order Payments (from status check)
function displayOrderPayments(payments) {
    if (payments.length === 0) {
        paymentStatus.innerHTML = `
            <div class="status-placeholder">
                <i class="fas fa-credit-card"></i>
                <p>No payments found for this order</p>
            </div>
        `;
        return;
    }

    const paymentsHtml = payments.map(payment => {
        const statusClass = getStatusClass(payment.result);
        const statusIcon = getStatusIcon(payment.result);

        return `
            <div class="payment-result ${statusClass}">
                <h4>
                    <i class="${statusIcon}"></i>
                    Payment ${payment.result || 'Unknown'}
                </h4>
                <div class="payment-details">
                    <div class="detail-item">
                        <div class="detail-label">Payment ID</div>
                        <div class="detail-value">${payment.id}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Amount</div>
                        <div class="detail-value">$${(payment.amount / 100).toFixed(2)}</div>
                    </div>
                    ${payment.tipAmount ? `
                        <div class="detail-item">
                            <div class="detail-label">Tip</div>
                            <div class="detail-value">$${(payment.tipAmount / 100).toFixed(2)}</div>
                        </div>
                    ` : ''}
                    ${payment.taxAmount ? `
                        <div class="detail-item">
                            <div class="detail-label">Tax</div>
                            <div class="detail-value">$${(payment.taxAmount / 100).toFixed(2)}</div>
                        </div>
                    ` : ''}
                    ${payment.cardType ? `
                        <div class="detail-item">
                            <div class="detail-label">Card Type</div>
                            <div class="detail-value">${payment.cardType}</div>
                        </div>
                    ` : ''}
                    ${payment.last4 ? `
                        <div class="detail-item">
                            <div class="detail-label">Card Last 4</div>
                            <div class="detail-value">****${payment.last4}</div>
                        </div>
                    ` : ''}
                    ${payment.authCode ? `
                        <div class="detail-item">
                            <div class="detail-label">Auth Code</div>
                            <div class="detail-value">${payment.authCode}</div>
                        </div>
                    ` : ''}
                    <div class="detail-item">
                        <div class="detail-label">Timestamp</div>
                        <div class="detail-value">${new Date(payment.createdTime).toLocaleString()}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    paymentStatus.innerHTML = paymentsHtml;
}

// Display Payment Error
function displayPaymentError(error) {
    paymentStatus.innerHTML = `
        <div class="payment-result error">
            <h3>
                <i class="fas fa-times-circle"></i>
                Payment Failed
            </h3>
            <div class="payment-details">
                <div class="detail-item">
                    <div class="detail-label">Error</div>
                    <div class="detail-value">${error.message}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Timestamp</div>
                    <div class="detail-value">${new Date().toLocaleString()}</div>
                </div>
            </div>
        </div>
    `;
}

// Load Transaction History
async function loadTransactionHistory() {
    if (!authState.isAuthenticated) {
        showEmptyHistory();
        return;
    }

    try {
        console.log('📚 Loading transaction history...');

        const response = await fetch(`${API_BASE_URL}/transactions`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (data.success) {
            console.log(`📊 Loaded ${data.transactions.length} transactions`);
            displayTransactionHistory(data.transactions);
        } else {
            throw new Error(data.error || 'Failed to load transaction history');
        }

    } catch (error) {
        console.error('❌ Failed to load transaction history:', error);
        showEmptyHistory();

        // Don't show error toast for transaction history - it's a background operation
        if (error.message.includes('Authentication')) {
            console.log('ℹ️ Authentication required for transaction history');
        }
    }
}

// Display Transaction History
function displayTransactionHistory(transactions) {
    console.log('🔍 displayTransactionHistory called with transactions:', transactions);

    const historyHtml = transactions.map(transaction => {
        const statusClass = getStatusClass(transaction.status);
        const isRefund = transaction.type === 'refund';
        const amount = Math.abs(transaction.amount) / 100; // Convert to dollars and make positive for display
        const amountDisplay = isRefund ? `-$${amount.toFixed(2)}` : `$${amount.toFixed(2)}`;
        const typeDisplay = isRefund ? 'Refund' : 'Payment';

        // Only show refund popup for payments, not refunds
        // Make sure to pass the amount in cents (not converted to dollars)
        const amountInCents = Math.abs(transaction.amount);
        const clickHandler = isRefund ? '' : `onclick="showRefundPopup('${transaction.id}', ${amountInCents})"`;

        console.log('🔍 Transaction processing:', {
            id: transaction.id,
            originalAmount: transaction.amount,
            absAmount: Math.abs(transaction.amount),
            displayAmount: amount,
            isRefund,
            clickHandler
        });

        return `
            <div class="transaction-item ${isRefund ? 'refund-item' : ''}" ${clickHandler}>
                <div class="transaction-header">
                    <span class="transaction-id">${transaction.id}</span>
                    <span class="transaction-type">${typeDisplay}</span>
                    <span class="transaction-status ${statusClass}">${transaction.status}</span>
                </div>
                <div class="transaction-details">
                    <span class="transaction-amount ${isRefund ? 'refund-amount' : ''}">${amountDisplay}</span>
                    ${transaction.orderId ? `<span class="transaction-order">Order: ${transaction.orderId}</span>` : ''}
                    ${isRefund && transaction.paymentId ? `<span class="transaction-payment">Payment: ${transaction.paymentId}</span>` : ''}
                    <span class="transaction-date">${new Date(transaction.timestamp).toLocaleString()}</span>
                </div>
            </div>
        `;
    }).join('');

    transactionHistory.innerHTML = historyHtml;
}

// Show empty history
function showEmptyHistory() {
    transactionHistory.innerHTML = `
        <div class="status-placeholder">
            <i class="fas fa-receipt"></i>
            <p>No transactions yet</p>
        </div>
    `;
}

// Utility Functions
function getStatusClass(status) {
    if (!status) return 'success';
    switch (status.toLowerCase()) {
        case 'succeeded':
        case 'success':
        case 'approved':
        case 'captured':
            return 'success';
        case 'failed':
        case 'error':
        case 'declined':
        case 'voided':
            return 'error';
        case 'pending':
        case 'processing':
        case 'authorized':
            return 'pending';
        default:
            return 'pending';
    }
}

function getStatusIcon(status) {
    if (!status) return 'fas fa-check-circle';
    switch (status.toLowerCase()) {
        case 'succeeded':
        case 'success':
        case 'approved':
        case 'captured':
            return 'fas fa-check-circle';
        case 'failed':
        case 'error':
        case 'declined':
        case 'voided':
            return 'fas fa-times-circle';
        case 'pending':
        case 'processing':
        case 'authorized':
            return 'fas fa-clock';
        default:
            return 'fas fa-question-circle';
    }
}

function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function updatePayButton(disabled) {
    payButton.disabled = disabled;
    if (disabled) {
        payButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    } else {
        payButton.innerHTML = '<i class="fas fa-lock"></i> Process Payment';
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-${getToastIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;

    toastContainer.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

function getToastIcon(type) {
    switch (type) {
        case 'success':
            return 'check-circle';
        case 'error':
            return 'times-circle';
        case 'warning':
            return 'exclamation-triangle';
        case 'info':
        default:
            return 'info-circle';
    }
}

// Refund functionality
let currentRefundData = null;

function showRefundPopup(transactionId, amount) {
    console.log('🔍 showRefundPopup called with:', {
        transactionId,
        amount,
        amountType: typeof amount
    });

    currentRefundData = { transactionId, amount };

    document.getElementById('refundTransactionId').textContent = transactionId;
    // Convert from cents to dollars for display
    const amountInDollars = amount / 100;
    document.getElementById('refundAmount').textContent = `$${amountInDollars.toFixed(2)}`;
    document.getElementById('refundPopup').style.display = 'flex';
}

function closeRefundPopup() {
    document.getElementById('refundPopup').style.display = 'none';
    currentRefundData = null;
}

async function processRefund() {
    if (!currentRefundData) return;

    const confirmBtn = document.getElementById('confirmRefundBtn');
    const originalText = confirmBtn.innerHTML;

    try {
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        confirmBtn.disabled = true;

        // Get the correct values from localStorage
        const accessToken = localStorage.getItem('clover_access_token');
        const merchantId = localStorage.getItem('clover_merchant_id') || localStorage.getItem('merchant_id');

        // Debug: Log all localStorage keys to see what's actually stored
        console.log('🔍 All localStorage keys:', Object.keys(localStorage));
        console.log('🔍 localStorage values:', {
            clover_access_token: localStorage.getItem('clover_access_token'),
            clover_merchant_id: localStorage.getItem('clover_merchant_id'),
            // Also check old keys in case they're still being used
            access_token: localStorage.getItem('access_token'),
            merchant_id: localStorage.getItem('merchant_id')
        });

        console.log('🔍 Refund data:', {
            transactionId: currentRefundData.transactionId,
            amount: currentRefundData.amount,
            hasAccessToken: !!accessToken,
            hasMerchantId: !!merchantId,
            accessTokenValue: accessToken ? accessToken.substring(0, 10) + '...' : 'null',
            merchantIdValue: merchantId || 'null'
        });

        // Show detailed error message with what we found
        const missingFields = [];
        if (!accessToken) missingFields.push('accessToken');
        if (!merchantId) missingFields.push('merchantId');
        if (!currentRefundData.transactionId) missingFields.push('paymentId');

        if (missingFields.length > 0) {
            const errorMsg = `Missing required fields: ${missingFields.join(', ')} are required`;
            console.error('❌ Validation failed:', errorMsg);
            console.error('🔍 Available localStorage keys:', Object.keys(localStorage));
            throw new Error(errorMsg);
        }

        const requestBody = {
            merchantId: merchantId,
            paymentId: currentRefundData.transactionId,
            amount: currentRefundData.amount, // Amount should already be in cents
            reason: 'Requested by customer',
            accessToken: accessToken
        };

        console.log('🔍 Sending refund request:', {
            ...requestBody,
            accessToken: accessToken.substring(0, 10) + '...' // Don't log full token
        });

        console.log('🔍 Amount debugging:', {
            originalAmount: currentRefundData.amount,
            amountType: typeof currentRefundData.amount,
            finalAmount: requestBody.amount
        });

        const response = await fetch(`${API_BASE_URL}/refund`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.success) {
            showToast('Refund processed successfully!', 'success');
            closeRefundPopup();
            loadTransactionHistory(); // Refresh transaction history
        } else {
            throw new Error(data.error || 'Refund failed');
        }

    } catch (error) {
        console.error('❌ Refund failed:', error);
        showToast('Refund failed: ' + error.message, 'error');
    } finally {
        confirmBtn.innerHTML = originalText;
        confirmBtn.disabled = false;
    }
}

// Export functions for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleAddLineItem,
        handleCreateOrder,
        loadTransactionHistory
    };
} 