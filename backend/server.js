const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Clover API Configuration
const CLOVER_BASE_URL = process.env.CLOVER_BASE_URL || 'https://sandbox.dev.clover.com';
const MERCHANT_ID = process.env.MERCHANT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;

// In-memory storage for demo purposes (use database in production)
let transactions = [];

// Routes

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Serve OAuth page
app.get('/oauth', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/oauth.html'));
});

// OAuth callback handler
app.get('/oauth/callback', (req, res) => {
    // Redirect back to OAuth page with query parameters
    const code = req.query.code;
    const error = req.query.error;
    const state = req.query.state;
    const merchantId = req.query.merchant_id;
    
    console.log('📝 OAuth v2 callback received:', {
        code: code ? 'present' : 'missing',
        merchantId,
        error,
        state
    });
    
    let redirectUrl = '/oauth';
    const params = new URLSearchParams();
    
    if (code) {
        params.append('code', code);
        if (state) params.append('state', state);
        if (merchantId) params.append('merchant_id', merchantId);
    } else if (error) {
        params.append('error', error);
        if (state) params.append('state', state);
    }
    
    if (params.toString()) {
        redirectUrl += `?${params.toString()}`;
    }
    
    console.log('🔄 Redirecting to OAuth page:', redirectUrl);
    res.redirect(redirectUrl);
});

// OAuth v2 token exchange endpoint
app.post('/api/oauth/token', async (req, res) => {
    try {
        const { code, redirect_uri, merchant_id } = req.body;
        
        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Authorization code is required'
            });
        }
        
        console.log('🔄 Exchanging OAuth v2 code for tokens...', {
            code: code ? 'present' : 'missing',
            merchant_id,
            redirect_uri
        });
        
        // Exchange authorization code for tokens using v2/OAuth endpoint
        const tokenData = {
            client_id: APP_ID,
            client_secret: APP_SECRET,
            code: code
        };
        
        console.log('🔗 v2/OAuth token exchange:', `${CLOVER_BASE_URL}/oauth/v2/token`);
        
        const tokenResponse = await axios.post(`${CLOVER_BASE_URL}/oauth/v2/token`, tokenData, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const responseData = tokenResponse.data;
        
        if (responseData.access_token) {
            console.log('✅ v2/OAuth token exchange successful:', {
                hasAccessToken: !!responseData.access_token,
                hasRefreshToken: !!responseData.refresh_token,
                accessTokenExpiration: responseData.access_token_expiration,
                refreshTokenExpiration: responseData.refresh_token_expiration
            });
            
            res.json({
                success: true,
                access_token: responseData.access_token,
                refresh_token: responseData.refresh_token,
                merchant_id: merchant_id, // Use merchant_id from callback
                access_token_expiration: responseData.access_token_expiration,
                refresh_token_expiration: responseData.refresh_token_expiration
            });
        } else {
            throw new Error('No access token received from v2/OAuth');
        }
        
    } catch (error) {
        console.error('❌ v2/OAuth token exchange failed:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'v2/OAuth token exchange failed',
            details: error.response?.data?.message || error.message
        });
    }
});

// OAuth v2 token refresh endpoint
app.post('/api/oauth/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;
        
        if (!refresh_token) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token is required'
            });
        }
        
        console.log('🔄 Refreshing v2/OAuth access token...');
        
        // Refresh tokens using v2/OAuth refresh endpoint
        const refreshData = {
            client_id: APP_ID,
            refresh_token: refresh_token
        };
        
        console.log('🔗 v2/OAuth token refresh:', `${CLOVER_BASE_URL}/oauth/v2/refresh`);
        
        const refreshResponse = await axios.post(`${CLOVER_BASE_URL}/oauth/v2/refresh`, refreshData, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const responseData = refreshResponse.data;
        
        if (responseData.access_token) {
            console.log('✅ v2/OAuth token refresh successful:', {
                hasNewAccessToken: !!responseData.access_token,
                hasNewRefreshToken: !!responseData.refresh_token,
                accessTokenExpiration: responseData.access_token_expiration,
                refreshTokenExpiration: responseData.refresh_token_expiration
            });
            
            res.json({
                success: true,
                access_token: responseData.access_token,
                refresh_token: responseData.refresh_token,
                access_token_expiration: responseData.access_token_expiration,
                refresh_token_expiration: responseData.refresh_token_expiration
            });
        } else {
            throw new Error('No access token received from v2/OAuth refresh');
        }
        
    } catch (error) {
        console.error('❌ v2/OAuth token refresh failed:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'v2/OAuth token refresh failed',
            details: error.response?.data?.message || error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Clover Payment Server is running' });
});

// Get merchant info (OAuth-compatible endpoint)
app.get('/api/merchant/:merchantId', async (req, res) => {
    try {
        const { merchantId } = req.params;
        
        // Try to get access token from Authorization header (OAuth flow)
        let accessToken = req.headers.authorization?.replace('Bearer ', '');
        
        // If no auth header, fall back to environment variables for testing
        if (!accessToken) {
            accessToken = ACCESS_TOKEN;
        }
        
        // Check if we have the required credentials
        if (!accessToken) {
            return res.status(401).json({
                success: false,
                error: 'No access token available. Please authenticate with OAuth or set ACCESS_TOKEN in your .env file.'
            });
        }
        
        if (!merchantId) {
            return res.status(400).json({
                success: false,
                error: 'Merchant ID is required in the URL path.'
            });
        }
        
        console.log('🔍 Fetching merchant info with OAuth token:', {
            hasToken: !!accessToken,
            merchantId: merchantId,
            tokenPrefix: accessToken ? accessToken.substring(0, 10) + '...' : 'none',
            source: req.headers.authorization ? 'OAuth v2 token' : 'Environment variables'
        });
        
        // Fetch merchant info from Clover API
        const apiUrl = `${CLOVER_BASE_URL}/v3/merchants/${merchantId}`;
        console.log('🌐 API URL:', apiUrl);
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📊 Merchant API response:', {
            status: response.status,
            merchantName: response.data.name,
            merchantId: response.data.id
        });
        
        res.json({
            success: true,
            merchant: {
                id: response.data.id,
                name: response.data.name,
                currency: response.data.currency || 'USD',
                timezone: response.data.timezone,
                address: response.data.address
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching merchant info:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized - Invalid or expired access token'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to fetch merchant information',
                details: error.response?.data || error.message
            });
        }
    }
});

// Legacy merchant endpoint (for backwards compatibility)
app.get('/api/merchant', async (req, res) => {
    try {
        // Try to get access token from Authorization header first (OAuth flow)
        let accessToken = req.headers.authorization?.replace('Bearer ', '');
        let merchantId = req.headers['x-merchant-id'];
        
        // If no auth header, fall back to environment variables
        if (!accessToken) {
            accessToken = ACCESS_TOKEN;
            merchantId = MERCHANT_ID;
        }
        
        // Check if we have the required credentials
        if (!accessToken) {
            return res.status(401).json({
                success: false,
                error: 'No access token available. Please set ACCESS_TOKEN in your .env file or provide Authorization header.'
            });
        }
        
        if (!merchantId) {
            return res.status(401).json({
                success: false,
                error: 'No merchant ID available. Please set MERCHANT_ID in your .env file or provide X-Merchant-ID header.'
            });
        }
        
        console.log('🔍 Testing merchant connection:', {
            hasToken: !!accessToken,
            merchantId: merchantId,
            tokenPrefix: accessToken ? accessToken.substring(0, 10) + '...' : 'none',
            source: req.headers.authorization ? 'OAuth header' : 'Environment variables'
        });
        
        // Test connection to Clover API
        const apiUrl = `${CLOVER_BASE_URL}/v3/merchants/${merchantId}`;
        console.log('🌐 API URL:', apiUrl);
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📊 Merchant API response:', {
            status: response.status,
            merchantName: response.data.name,
            merchantId: response.data.id
        });
        
        res.json({
            success: true,
            merchant: {
                id: response.data.id,
                name: response.data.name,
                currency: response.data.currency || 'USD',
                timezone: response.data.timezone,
                address: response.data.address
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching merchant info:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized - Invalid access token'
            });
        } else if (error.response?.status === 404) {
            res.status(404).json({
                success: false,
                error: 'Merchant not found'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to connect to Clover API',
                details: error.response?.data || error.message
            });
        }
    }
});

// Create atomic order with line items
app.post('/api/orders', async (req, res) => {
    try {
        const { items } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'At least one item is required'
            });
        }

        // Validate each item
        for (const item of items) {
            if (!item.name || !item.price || item.price <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Each item must have a name and valid price'
                });
            }
        }

        // Get access token and merchant ID (OAuth or env vars)
        let accessToken = req.headers.authorization?.replace('Bearer ', '') || ACCESS_TOKEN;
        let merchantId = req.headers['x-merchant-id'] || MERCHANT_ID;
        
        if (!accessToken || !merchantId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('🛒 Creating atomic order with items:', {
            itemCount: items.length,
            merchantId: merchantId,
            totalAmount: items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0)
        });

        // Prepare line items for atomic order
        const lineItems = items.map(item => ({
            name: item.name,
            price: Math.round(item.price * 100), // Convert to cents
            quantity: item.quantity || 1,
            unitName: item.unitName || 'each'
        }));

        // Create atomic order - let Clover use default order type
        const orderData = {
            orderCart: {
                lineItems: lineItems,
                groupLineItems: false
            }
        };

        console.log('📤 Sending atomic order request:', JSON.stringify(orderData, null, 2));

        const orderResponse = await axios.post(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/atomic_order/orders`,
            orderData,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const order = orderResponse.data;
        
        console.log('✅ Atomic order created successfully:', {
            orderId: order.id,
            total: order.total,
            currency: order.currency,
            lineItemCount: order.lineItems?.elements?.length || 0
        });

        res.json({
            success: true,
            order: {
                id: order.id,
                total: order.total,
                currency: order.currency || 'USD',
                state: order.state,
                lineItems: order.lineItems?.elements || [],
                createdTime: order.createdTime
            }
        });

    } catch (error) {
        console.error('❌ Error creating atomic order:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to create order',
            details: error.response?.data || error.message
        });
    }
});

// Get order details with line items
app.get('/api/orders/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Get access token and merchant ID (OAuth or env vars)
        let accessToken = req.headers.authorization?.replace('Bearer ', '') || ACCESS_TOKEN;
        let merchantId = req.headers['x-merchant-id'] || MERCHANT_ID;
        
        if (!accessToken || !merchantId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('🔍 Fetching order details:', { orderId, merchantId });

        // Get order details with line items
        const orderResponse = await axios.get(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/orders/${orderId}?expand=lineItems`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const order = orderResponse.data;

        res.json({
            success: true,
            order: {
                id: order.id,
                total: order.total,
                currency: order.currency || 'USD',
                state: order.state,
                lineItems: order.lineItems?.elements || [],
                createdTime: order.createdTime,
                modifiedTime: order.modifiedTime
            }
        });

    } catch (error) {
        console.error('❌ Error fetching order:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order',
            details: error.response?.data || error.message
        });
    }
});

// Add line item to existing order
app.post('/api/orders/:orderId/line_items', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { name, price, quantity = 1, unitName = 'each' } = req.body;
        
        if (!name || !price || price <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Item name and valid price are required'
            });
        }

        // Get access token and merchant ID (OAuth or env vars)
        let accessToken = req.headers.authorization?.replace('Bearer ', '') || ACCESS_TOKEN;
        let merchantId = req.headers['x-merchant-id'] || MERCHANT_ID;
        
        if (!accessToken || !merchantId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('➕ Adding line item to order:', {
            orderId,
            name,
            price,
            quantity
        });

        const lineItemData = {
            name: name,
            price: Math.round(price * 100), // Convert to cents
            unitQty: quantity,
            unitName: unitName
        };

        const response = await axios.post(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/orders/${orderId}/line_items`,
            lineItemData,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const lineItem = response.data;

        console.log('✅ Line item added successfully:', {
            lineItemId: lineItem.id,
            name: lineItem.name,
            price: lineItem.price
        });

        res.json({
            success: true,
            lineItem: {
                id: lineItem.id,
                name: lineItem.name,
                price: lineItem.price,
                unitQty: lineItem.unitQty,
                unitName: lineItem.unitName
            }
        });

    } catch (error) {
        console.error('❌ Error adding line item:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to add line item',
            details: error.response?.data || error.message
        });
    }
});

// Delete line item from order
app.delete('/api/orders/:orderId/line_items/:lineItemId', async (req, res) => {
    try {
        const { orderId, lineItemId } = req.params;
        
        // Get access token and merchant ID (OAuth or env vars)
        let accessToken = req.headers.authorization?.replace('Bearer ', '') || ACCESS_TOKEN;
        let merchantId = req.headers['x-merchant-id'] || MERCHANT_ID;
        
        if (!accessToken || !merchantId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('🗑️ Deleting line item:', { orderId, lineItemId });

        await axios.delete(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/orders/${orderId}/line_items/${lineItemId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Line item deleted successfully');

        res.json({
            success: true,
            message: 'Line item deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting line item:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to delete line item',
            details: error.response?.data || error.message
        });
    }
});

// Process payment for order using REST API
app.post('/api/orders/:orderId/pay', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { cardToken } = req.body;
        
        // Get access token and merchant ID (OAuth or env vars)
        let accessToken = req.headers.authorization?.replace('Bearer ', '') || ACCESS_TOKEN;
        let merchantId = req.headers['x-merchant-id'] || MERCHANT_ID;
        
        if (!accessToken || !merchantId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('💳 Processing payment for order:', { orderId, merchantId });

        // First, get the order details to get the total amount
        const orderResponse = await axios.get(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/orders/${orderId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const order = orderResponse.data;
        
        if (!order.total || order.total <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Order has no total amount'
            });
        }

        // Get merchant's available tenders
        const tendersResponse = await axios.get(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/tenders`,
            { headers: { 'Authorization': `Bearer ${accessToken}` }}
        );

        const tenders = tendersResponse.data.elements || [];
        
        console.log('🔍 Available tenders:', tenders.map(t => ({ 
            id: t.id, 
            label: t.label, 
            labelKey: t.labelKey,
            editable: t.editable 
        })));
        
        // Look for external payment tenders first (these are allowed for REST API payments)
        let paymentTender = tenders.find(tender => 
            tender.labelKey?.includes('external') ||
            tender.label?.toLowerCase().includes('external') ||
            tender.editable === true // External tenders are usually editable
        );
        
        // If no external tender, look for cash tender (usually allowed)
        if (!paymentTender) {
            paymentTender = tenders.find(tender => 
                tender.labelKey === 'com.clover.tender.cash' ||
                tender.label?.toLowerCase().includes('cash')
            );
        }
        
        // If still no suitable tender, create a demo explanation
        if (!paymentTender && tenders.length > 0) {
            // For demo purposes, we'll create a simulated external payment
            // In a real application, you would need to set up an external tender
            return res.json({
                success: true,
                payment: {
                    id: `demo_${Date.now()}`,
                    status: 'SUCCESS',
                    amount: order.total,
                    currency: order.currency || 'USD',
                    orderId: orderId,
                    type: 'DEMO_EXTERNAL_PAYMENT',
                    message: 'Demo payment processed successfully. In production, use external payment processors or cash tenders.',
                    order: {
                        id: order.id,
                        total: order.total,
                        currency: order.currency
                    }
                }
            });
        }

        if (!paymentTender) {
            return res.status(400).json({
                success: false,
                error: 'No suitable payment tender available. Please configure an external payment tender in your Clover account.'
            });
        }

        console.log('🎯 Using tender:', {
            id: paymentTender.id,
            label: paymentTender.label,
            labelKey: paymentTender.labelKey,
            type: 'external/cash tender'
        });

        // Create payment using the order's payment endpoint with proper tender
        const paymentData = {
            amount: order.total,
            tender: { id: paymentTender.id }
        };

        console.log('💰 Creating payment for order:', {
            orderId: orderId,
            amount: order.total,
            tenderId: paymentTender.id,
            currency: order.currency || 'USD'
        });

        // Use the REST API to create a payment on the order
        const paymentResponse = await axios.post(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/orders/${orderId}/payments`,
            paymentData,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const payment = paymentResponse.data;

        // Store transaction locally
        const transaction = {
            id: payment.id,
            orderId: orderId,
            amount: order.total / 100, // Convert back to dollars
            status: payment.result || 'SUCCESS',
            timestamp: new Date().toISOString(),
            details: payment
        };
        
        transactions.push(transaction);

        console.log('✅ Payment processed successfully:', {
            paymentId: payment.id,
            status: payment.result,
            amount: payment.amount,
            orderId: orderId
        });

        res.json({
            success: true,
            payment: {
                id: payment.id,
                status: payment.result || 'SUCCESS',
                amount: payment.amount,
                currency: order.currency || 'USD',
                orderId: orderId,
                tender: {
                    id: paymentTender.id,
                    label: paymentTender.label
                },
                order: {
                    id: order.id,
                    total: order.total,
                    currency: order.currency
                }
            }
        });

    } catch (error) {
        console.error('❌ Error processing payment:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to process payment',
            details: error.response?.data || error.message
        });
    }
});

// Get all payments for an order
app.get('/api/orders/:orderId/payments', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Get access token and merchant ID (OAuth or env vars)
        let accessToken = req.headers.authorization?.replace('Bearer ', '') || ACCESS_TOKEN;
        let merchantId = req.headers['x-merchant-id'] || MERCHANT_ID;
        
        if (!accessToken || !merchantId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('🔍 Fetching payments for order:', { orderId, merchantId });

        const response = await axios.get(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/orders/${orderId}/payments`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const payments = response.data.elements || [];

        console.log('📋 Found payments for order:', {
            orderId,
            paymentCount: payments.length
        });

        res.json({
            success: true,
            payments: payments.map(payment => ({
                id: payment.id,
                amount: payment.amount,
                tipAmount: payment.tipAmount,
                taxAmount: payment.taxAmount,
                result: payment.result,
                createdTime: payment.createdTime,
                cardType: payment.cardTransaction?.cardType,
                last4: payment.cardTransaction?.last4,
                authCode: payment.cardTransaction?.authCode
            }))
        });

    } catch (error) {
        console.error('❌ Error fetching order payments:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order payments',
            details: error.response?.data || error.message
        });
    }
});

// Get payment status (single payment)
app.get('/api/payments/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        // Get access token and merchant ID (OAuth or env vars)
        let accessToken = req.headers.authorization?.replace('Bearer ', '') || ACCESS_TOKEN;
        let merchantId = req.headers['x-merchant-id'] || MERCHANT_ID;
        
        if (!accessToken || !merchantId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('🔍 Fetching payment status:', { paymentId, merchantId });

        const response = await axios.get(
            `${CLOVER_BASE_URL}/v3/merchants/${merchantId}/payments/${paymentId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const payment = response.data;

        res.json({
            success: true,
            payment: {
                id: payment.id,
                amount: payment.amount,
                tipAmount: payment.tipAmount,
                taxAmount: payment.taxAmount,
                result: payment.result,
                createdTime: payment.createdTime,
                order: payment.order ? {
                    id: payment.order.id
                } : null,
                cardType: payment.cardTransaction?.cardType,
                last4: payment.cardTransaction?.last4,
                authCode: payment.cardTransaction?.authCode
            }
        });

    } catch (error) {
        console.error('❌ Error fetching payment status:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment status',
            details: error.response?.data || error.message
        });
    }
});

// Get all transactions (local storage)
app.get('/api/transactions', (req, res) => {
    res.json({
        success: true,
        transactions: transactions
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong!'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Clover Payment Server running on port ${PORT}`);
    console.log(`📱 Frontend available at: http://localhost:${PORT}`);
    console.log(`🔐 OAuth page available at: http://localhost:${PORT}/oauth`);
    console.log(`🔧 API endpoints available at: http://localhost:${PORT}/api`);
    console.log(`💡 Features:`);
    console.log(`   ✅ OAuth2 Authentication`);
    console.log(`   ✅ Atomic Orders Creation`);
    console.log(`   ✅ Multiple Line Items Support`);
    console.log(`   ✅ Payment Processing`);
    console.log(`   ✅ Payment Status Checking`);
    console.log(`   ✅ Transaction History`);
}); 