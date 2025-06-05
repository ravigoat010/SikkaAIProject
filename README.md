# Clover Payment Gateway

A Clover API integration following the proper payment flow: **Create Atomic Orders → Add Line Items → Process Payments → Check Status**.

## Setup Clover Account

Follow these steps to create and configure your Clover sandbox account so that your application can connect successfully.

1. **Create a Clover Sandbox Account**
   - Go to the Clover Developer Dashboard and sign up for a sandbox account.
   - Once you’re logged in, click **“Create App”**. Give your app any name you like (for example, “My Test App”).

2. **Configure Permissions**
   Under **“Requested Permissions”**, select the following:
   - **READ & WRITE**: Customers
   - **READ & WRITE**: Payments
   - **READ**: Merchant  
   > These permissions let your app view and update customer records, process payments, and read basic merchant information.

3. **Set the Site URL (REST Configuration)**
   - In the **“REST Configuration”** section, find **“Site URL”** and enter:
     ```
     http://localhost:3000
     ```
   - Make sure your front-end is running on port 3000 exactly. Clover will redirect to this URL after the user authorizes the app.

4. **Skip Webhooks and Other Settings**
   - You do **not** need to enable webhooks, merchant availability, or receipt customizations for this setup. Leave those options at their default values.

5. **Install the App on Your Test Merchant**
   - After saving your app settings, go to **“Market Listing”** (still in the Clover Developer Dashboard).
   - Click **“Preview in Market”**. You should see a green **“Connect App”** button.
   - Click **“Connect App”** to install it on your sandbox merchant. If you don’t have a sandbox merchant yet, Clover will automatically create a default one for you.

6. **Generate an API Token**
   - Once the app is installed, click **“Settings” → “View All Settings” → “API Tokens”**.
   - Click **“Create API Token”**.
   - Copy the new token and add it to your project’s `.env` file as:
     ```
     CLOVER_API_TOKEN=your_generated_token_here
     ```

That’s it! At this point, your Clover sandbox account and application are fully set up. Your frontend (http://localhost:3000) can now connect to Clover, and you have an API token ready to use.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Create `backend/.env`:
   ```env
   CLOVER_BASE_URL=https://sandbox.dev.clover.com
   MERCHANT_ID=your_merchant_id_here
   ACCESS_TOKEN=your_access_token_here
   APP_ID=your_app_id_here
   APP_SECRET=your_app_secret_here
   PORT=3000
   ```

3. **Get Clover Credentials**
   - Create account at [Clover Developer Dashboard](https://sandbox.dev.clover.com/)
   - Create test app → get `APP_ID` and `APP_SECRET`
   - Create test merchant → get `MERCHANT_ID`
   - Generate API token → get `ACCESS_TOKEN`

4. **Run Application**
   From the main directory run
   ```bash
   npm start
   ```
   Visit http://localhost:3000

   ## How to use app
   1. press connect oauth
   2. you will be redirected to clover login
   3. login and you will be redirected back to application
   4. create order, process payments, etc


