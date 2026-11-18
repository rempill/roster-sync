const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { io } = require('socket.io-client');
const { attachRealtime } = require('../dist/realtime');

test('socket authentication, private delivery and team broadcasts', { timeout: 10000 }, async t => {
  const server = createServer();
  const events = attachRealtime(server, async token => {
    if (!['alice', 'bob'].includes(token)) throw new Error('Invalid token');
    return { sub: token };
  }, []);
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await events.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = token => {
    const socket = io(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, autoConnect: false });
    sockets.push(socket);
    return socket;
  };
  for (const token of [undefined, 'invalid']) {
    const socket = connect(token);
    const denied = once(socket, 'connect_error');
    socket.connect();
    assert.equal((await denied)[0].message, 'Unauthorized');
  }
  const alice = connect('alice');
  const bob = connect('bob');
  for (const socket of [alice, bob]) {
    const connected = once(socket, 'connect');
    socket.connect();
    await connected;
  }
  const receivedA = [], receivedB = [];
  alice.on('notification', notice => receivedA.push(notice));
  bob.on('notification', notice => receivedB.push(notice));
  const aUpdated = once(alice, 'team.updated');
  const bUpdated = once(bob, 'team.updated');
  events.notify('alice', { message: 'Private to Alice' });
  events.teamUpdated('project-1');
  assert.deepEqual((await aUpdated)[0], { teamId: 'project-1' });
  assert.deepEqual((await bUpdated)[0], { teamId: 'project-1' });
  // The broadcast follows the notice on each ordered Socket.io connection.
  assert.deepEqual(receivedA, [{ message: 'Private to Alice' }]);
  assert.deepEqual(receivedB, []);
});
