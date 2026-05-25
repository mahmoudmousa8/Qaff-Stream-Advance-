const http = require('http');

const data = JSON.stringify({
  action: 'setTitleDescListAll',
  listId: 'test-list-id-123',
  slotIndexes: undefined // just omitting it
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/slots/bulk',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Cookie': 'auth_session={"role":"admin"}' // Mock auth if needed? Wait, auth is via next-auth or custom cookie?
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Response:', res.statusCode, body));
});
req.on('error', console.error);
req.write(data);
req.end();
