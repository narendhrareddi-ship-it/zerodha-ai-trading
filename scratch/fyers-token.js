// Fyers Access Token Generator Utility (Offline Exchange Flow)
// To run: node scratch/fyers-token.js

const crypto = require('crypto');
const readline = require('readline');

// =========================================================================
// ✍️ EDIT THESE TWO VALUES DIRECTLY:
// =========================================================================
const APP_ID = "1WB5OMIR3E-100";         // <-- Paste your Fyers App ID here (e.g., "ABCD1234-100")
const SECRET_KEY = "82S2291TY9";     // <-- Paste your Fyers Secret Key here (e.g., "82S2291TY9")
// =========================================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log('\n=================================================');
  console.log('⚡ FYERS ACCESS TOKEN GENERATOR (v3) ⚡');
  console.log('=================================================\n');

  let appId = APP_ID.trim();
  let secretKey = SECRET_KEY.trim();

  // If not configured in file, ask in terminal
  if (!appId) {
    appId = (await askQuestion('Enter your Fyers App ID (client_id, e.g. XXXXXXXX-100): ')).trim();
  } else {
    console.log(`Using App ID from file: ${appId}`);
  }

  if (!secretKey) {
    secretKey = (await askQuestion('Enter your Fyers App Secret Key: ')).trim();
  } else {
    console.log(`Using Secret Key from file: ${secretKey.substring(0, 3)}...${secretKey.substring(secretKey.length - 3)}`);
  }

  if (!appId || !secretKey) {
    console.error('\n❌ Error: App ID and Secret Key are required.');
    console.log('Please open scratch/fyers-token.js and edit APP_ID and SECRET_KEY at the top.');
    rl.close();
    process.exit(1);
  }

  // Calculate App ID Hash
  const hashStr = appId + ':' + secretKey;
  const appIdHash = crypto.createHash('sha256').update(hashStr).digest('hex');

  // Generate the Auth Url
  const redirectUri = 'https://trade.fyers.in/api-login/redirect-uri/index.html';
  const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=zerodhaai`;

  console.log('\n-------------------------------------------------');
  console.log('Step 2: Authenticate in your browser');
  console.log('-------------------------------------------------');
  console.log('1. Copy and open this link in your browser:');
  console.log(`\n\x1b[34m\x1b[4m${authUrl}\x1b[0m\n`);
  console.log('2. Log in and authorize your app.');
  console.log('3. Fyers will redirect to a page showing your "authorization code".');
  console.log('4. Copy the authorization code from that page.\n');

  const authCode = (await askQuestion('Step 3: Paste the "authorization code" here: ')).trim();

  if (!authCode) {
    console.error('\n❌ Error: Authorization code is required.');
    rl.close();
    process.exit(1);
  }

  console.log('\n🔄 Exchanging Authorization Code for Access Token...');

  try {
    const response = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash,
        code: authCode
      })
    });

    const data = await response.json();

    if (data.s === 'ok' && data.access_token) {
      console.log('\n========================================================================');
      console.log('🎉 SUCCESS: Fyers Access Token Generated!');
      console.log('========================================================================\n');
      console.log('\x1b[32mApp ID:\x1b[0m ', appId);
      console.log('\x1b[32mAccess Token:\x1b[0m\n');
      console.log('\x1b[33m%s\x1b[0m\n', data.access_token);
      console.log('========================================================================');
      console.log('👉 Copy the Access Token above and paste it in Settings inside the app.');
      console.log('========================================================================\n');
    } else {
      console.error('\n❌ Fyers Token Exchange Failed:', data);
    }
  } catch (err) {
    console.error('\n❌ Error during token exchange request:', err.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main().catch(console.error);
