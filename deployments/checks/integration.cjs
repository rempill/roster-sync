const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io } = require('socket.io-client');

const base = process.env.API_URL || 'http://127.0.0.1:8000';
async function request(path, token, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, data: await response.json() };
}

test('integrated auth, calendars, matching, private events and concurrent admission', { timeout: 60000 }, async (t) => {
  for (let attempt = 0; ; attempt++) {
    try {
      assert.equal((await request('/health')).status, 200);
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  assert.equal((await request('/teams')).status, 401);
  const run = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const accounts = [];
  for (const name of ['Owner', 'Candidate A', 'Candidate B']) {
    const email = `integration-${accounts.length}-${run}@stud.ubbcluj.ro`;
    const result = await request('/auth/register', undefined, { email, name, password: 'Integration123!' });
    assert.equal(result.status, 201);
    accounts.push(result.data);
  }
  const [owner, candidateA, candidateB] = accounts;
  assert.equal((await request('/auth/login', undefined, { email: owner.user.email, password: 'Integration123!' })).status, 201);
  assert.equal((await request('/auth/login', undefined, { email: owner.user.email, password: 'IncorrectPassword' })).status, 401);

  const connect = async token => {
    const socket = io(base, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false });
    t.after(() => socket.disconnect());
    const connected = once(socket, 'connect', { signal: AbortSignal.timeout(10000) });
    socket.connect();
    await connected;
    return socket;
  };
  const ownerSocket = await connect(owner.token);
  const unrelatedSocket = await connect(candidateB.token);
  const unrelatedNotices = [];
  unrelatedSocket.on('notification', notice => unrelatedNotices.push(notice));
  const teamEvent = once(ownerSocket, 'team.updated', { signal: AbortSignal.timeout(10000) });
  const created = await request('/teams', owner.token, {
    name: `Integration ${run}`, description: 'Integration test team', requiredSkills: ['Python'], capacity: 2,
  });
  assert.equal(created.status, 201);
  const team = created.data;
  assert.equal((await teamEvent)[0].teamId, team.id);

  const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:integration\r\nDTSTART:20261109T100000\r\nDTEND:20261109T110000\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const imported = await request('/calendar/import', candidateA.token, { ics, weekStart: '2026-11-09' });
  assert.equal(imported.status, 201);
  assert.equal(imported.data.availability.length, 336);
  assert.equal(imported.data.availability[20], 0);
  const ranked = await request('/teams/rank', candidateA.token);
  assert.equal(ranked.status, 200);
  assert.ok(ranked.data.some(item => item.teamId === team.id));

  const notice = once(ownerSocket, 'notification', { signal: AbortSignal.timeout(10000) });
  const first = await request(`/teams/${team.id}/apply`, candidateA.token, {});
  assert.equal(first.status, 201);
  assert.equal((await notice)[0].userId, owner.user.id);
  const second = await request(`/teams/${team.id}/apply`, candidateB.token, {});
  assert.equal(second.status, 201);
  assert.equal((await request(`/applications/${first.data.id}/approve`, candidateB.token, {})).status, 403);
  const approvals = await Promise.all([first, second].map(application =>
    request(`/applications/${application.data.id}/approve`, owner.token, {})));
  assert.deepEqual(approvals.map(result => result.status).sort(), [201, 409]);
  const teams = await request('/teams', owner.token);
  const updated = teams.data.find(item => item.id === team.id);
  assert.equal(updated.members.length, 2);
  assert.equal(updated.openSpots, 0);
  assert.equal((await request(`/teams/${team.id}/roster`, owner.token)).status, 200);
  assert.equal((await request(`/teams/${team.id}/roster`, candidateA.token)).status, 403);
  // Only the owner receives application notices; a winning candidate may receive
  // its own admission notice, so test privacy using the stored notification feed.
  const ownerNotices = await request('/notifications', owner.token);
  const otherNotices = await request('/notifications', candidateB.token);
  assert.ok(ownerNotices.data.some(item => item.message.includes('applied to')));
  assert.ok(otherNotices.data.every(item => !item.message.includes('applied to')));
  assert.ok(unrelatedNotices.every(item => item.userId === candidateB.user.id));
});
