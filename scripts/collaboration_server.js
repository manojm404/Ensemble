/**
 * scripts/collaboration_server.js
 * 
 * Lightweight Yjs WebSocket signaling server for Ensemble V3.
 * Enables real-time multi-user canvas synchronization with CRDTs.
 */
const WebSocket = require('ws');
const http = require('http');
const setupWSConnection = require('y-websocket/bin/utils').setupWSConnection;

const port = process.env.PORT || 1234;
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Ensemble Collaboration Server Active\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req, { gc: true });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`📡 [Ensemble] Collaboration Server running on port ${port}`);
  console.log(`🔗 Signaling for multi-user DAG synchronization active.`);
});
