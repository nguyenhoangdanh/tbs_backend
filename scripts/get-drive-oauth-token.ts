/**
 * One-time script to obtain a Google Drive OAuth2 refresh token.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/apis/credentials
 *   2. Create → OAuth 2.0 Client ID → Desktop app → Download JSON
 *   3. Set env vars below (or export them in your shell):
 *        GOOGLE_OAUTH_CLIENT_ID=...
 *        GOOGLE_OAUTH_CLIENT_SECRET=...
 *
 * Run:
 *   npx ts-node scripts/get-drive-oauth-token.ts
 *
 * Then copy the printed refresh_token into your .env:
 *   GOOGLE_OAUTH_REFRESH_TOKEN=<paste here>
 */

import * as http from 'http';
import * as readline from 'readline';
import { google } from 'googleapis';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3333/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/drive'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force consent so refresh_token is always returned
  scope: SCOPES,
});

console.log('\n🔗  Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n⏳  Waiting for redirect on http://localhost:3333/oauth2callback ...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:3333`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('No code found. Close this tab and try again.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.end('<h2>✅ Success! Check your terminal for the refresh token. You can close this tab.</h2>');

    console.log('\n✅  Tokens received:\n');
    console.log('GOOGLE_OAUTH_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nAdd that line to your .env file, then restart the server.\n');
  } catch (err) {
    console.error('Error exchanging code:', err);
    res.end('Error. Check terminal.');
  } finally {
    server.close();
  }
});

server.listen(3333);
