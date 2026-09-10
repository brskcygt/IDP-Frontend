'use strict';

/**
 * remoteBackend.issueAgentCredentials against a throwaway local HTTP server
 * (127.0.0.1, ephemeral port) — no real IDP server is contacted.
 *   node --test desktop/main/remoteBackend.test.js
 */

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const http = require('node:http');
const { createRemoteBackend } = require('./remoteBackend');

let server;
let origin;
let lastRequest = null;
let reply = { status: 500, payload: {} };

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      lastRequest = { method: req.method, url: req.url, cookie: req.headers.cookie, body };
      res.writeHead(reply.status, { 'content-type': reply.raw ? 'text/html' : 'application/json' });
      res.end(reply.raw ?? JSON.stringify(reply.payload));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

function loggedInBackend() {
  const remote = createRemoteBackend({ serverOrigin: origin, frontendRoot: __dirname, contentSecurityPolicy: "default-src 'self'" });
  remote.cookieJar.store(['connect.sid=s%3Aabc; Path=/; HttpOnly'], '/api/auth/login');
  return remote;
}

test('issueAgentCredentials POSTs with the session cookie and returns the 201 body', async () => {
  reply = { status: 201, payload: { agentId: 'WIN.01', secret: 'x', gatewayUrl: 'wss://gw.example.com', cfAccess: null } };
  const body = await loggedInBackend().issueAgentCredentials('WIN.01');
  assert.deepEqual(body, reply.payload);
  assert.equal(lastRequest.method, 'POST');
  assert.equal(lastRequest.url, '/api/agents/WIN.01/credentials');
  assert.equal(lastRequest.cookie, 'connect.sid=s%3Aabc');
});

test('issueAgentCredentials maps error statuses to readable messages', async () => {
  const remote = loggedInBackend();
  const expectations = [
    [{ status: 503, payload: { error: 'IDP_AGENT_PUBLIC_URL is not configured' } }, /agent kimliği üretemiyor: IDP_AGENT_PUBLIC_URL is not configured$/],
    [{ status: 503, payload: {} }, /IDP_AGENT_PUBLIC_URL tanımlı değil/],
    [{ status: 400, payload: { error: 'Invalid agent id' } }, /agent ID'sini reddetti: Invalid agent id$/],
    [{ status: 401, payload: { error: 'Unauthorized' } }, /oturumu bulunamadı veya süresi doldu/],
    [{ status: 403, payload: { message: 'Forbidden' } }, /yetkiniz yok: Forbidden$/],
    [{ status: 502, raw: '<html>bad gateway</html>' }, /\(HTTP 502\)\.$/],
  ];
  for (const [nextReply, pattern] of expectations) {
    reply = nextReply;
    await assert.rejects(remote.issueAgentCredentials('WIN-01'), (err) => pattern.test(err.message) && !err.message.includes('<html>'), String(nextReply.status));
  }
});
