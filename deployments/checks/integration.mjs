import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
const require = createRequire("/app/package.json");
const { io } = require("socket.io-client");
const base = process.env.API_URL || "http://localhost:8000";
let checks = 0;
const passed = label => { checks++; console.log("PASS " + label); };
async function request(path, token, method = "GET", body, expected = 200) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(10000), method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json();
  assert.equal(response.status, expected, path + ": " + JSON.stringify(json));
  return json;
}
const sockets = [];
async function connect(token) {
  const socket = io(base, { auth: { token }, transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); setTimeout(() => reject(new Error("Socket connection timed out")), 5000).unref(); });
  return socket;
}
function nextEvent(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(name + " did not arrive")); }, 5000);
    const listener = data => { clearTimeout(timer); resolve(data); };
    socket.once(name, listener);
  });
}
async function run() {
  if (process.argv.includes("--persistence")) {
    const proof = JSON.parse(await readFile("/tmp/rostersync-proof.json", "utf8"));
    const login = await request("/auth/login", null, "POST", proof.login, 201);
    const teams = await request("/teams", login.token);
    const team = teams.find(t => t.id === proof.teamId);
    assert.equal(team.members.length, 2);
    assert(team.members.some(m => m.id === proof.memberId));
    passed("Database and membership survive API restart");
    return;
  }
  await request("/health");
  await request("/me", null, "GET", undefined, 401);
  await request("/auth/register", null, "POST", { name: "Outside Student", email: "outside@gmail.com", password: "Demo12345!" }, 400);
  await request("/auth/login", null, "POST", { email: "alex@stud.ubbcluj.ro", password: "Wrong12345!" }, 401);
  passed("Health, anonymous access, institutional domain and invalid passwords");

  const demo = await request("/auth/login", null, "POST", { email: "alex@stud.ubbcluj.ro", password: "Demo12345!" }, 201);
  assert(!("passwordHash" in demo.user));
  await request("/me", demo.token.slice(0, -4) + "xxxx", "GET", undefined, 401);
  passed("Seeded demo login, safe profile and tampered JWT rejection");

  const suffix = Date.now();
  const accounts = [];
  for (const name of ["owner", "first", "second", "observer", "inviteowner", "invited"]) {
    const credentials = { name: name + " Test", email: name + suffix + "@stud.ubbcluj.ro", password: "Test12345!" };
    accounts.push({ ...await request("/auth/register", null, "POST", credentials, 201), credentials });
  }
  const [owner, first, second, observer, inviteowner, invited] = accounts;
  await request("/auth/register", null, "POST", owner.credentials, 409);
  const profile = await request("/me", first.token);
  const updated = await request("/me", first.token, "PUT", { name: profile.name, skills: ["React", "Python"], ambition: 9, availability: profile.availability });
  assert.deepEqual(updated.skills, ["React", "Python"]);
  await request("/me", first.token, "PUT", { ...updated, availability: [1] }, 400);
  passed("Registration, duplicate prevention, profile updates and bitmask validation");

  const calendar = await readFile("/app/demo-calendar.ics", "utf8");
  const imported = await request("/calendar/import", first.token, "POST", { ics: calendar, weekStart: "2026-11-09", timezone: "Europe/Bucharest" }, 201);
  assert.equal(imported.eventsImported, 2);
  assert.deepEqual(imported.availability.slice(20, 24), [0, 0, 0, 0]);
  assert.equal((await request("/me", first.token)).availability[20], 0);
  await request("/calendar/import", first.token, "POST", { ics: "bad calendar", weekStart: "2026-11-09" }, 400);
  passed("Calendar import through API and matching service persists busy slots");

  const ranking = await request("/teams/rank", first.token);
  assert(ranking.length >= 3);
  for (const rank of ranking) assert(rank.score >= 0 && rank.score <= 100 && rank.commonHours >= 0);
  assert(ranking.every((rank, i) => i === 0 || ranking[i - 1].score >= rank.score));
  passed("Live compatibility ranking combines profile, skills and schedules");

  const ownerSocket = await connect(owner.token);
  const observerSocket = await connect(observer.token);
  let privateLeaks = 0;
  observerSocket.on("notification", () => privateLeaks++);
  const anonymousSocket = io(base, { transports: ["websocket"], reconnection: false });
  sockets.push(anonymousSocket);
  await new Promise((resolve, reject) => {
    anonymousSocket.once("connect_error", error => error.message === "Unauthorized" ? resolve() : reject(error));
    anonymousSocket.once("connect", () => reject(new Error("Anonymous WebSocket was accepted")));
    setTimeout(() => reject(new Error("Anonymous WebSocket test timed out")), 5000).unref();
  });
  passed("Authenticated WebSocket handshake and anonymous connection rejection");

  const changeEvent = nextEvent(observerSocket, "team.updated");
  const team = await request("/teams", owner.token, "POST", { name: "Race Test " + suffix, description: "One vacancy with concurrent applicant approvals.", requiredSkills: ["React", "Python"], capacity: 2 }, 201);
  assert.equal((await changeEvent).teamId, team.id);
  await request("/teams", owner.token, "POST", { name: "Duplicate Team", description: "A second team for the same owner.", requiredSkills: [], capacity: 2 }, 409);
  passed("Team creation and exactly one team per student");

  const notification = nextEvent(ownerSocket, "notification");
  const application1 = await request("/teams/" + team.id + "/apply", first.token, "POST", {}, 201);
  assert.match((await notification).message, /applied/);
  const application2 = await request("/teams/" + team.id + "/apply", second.token, "POST", {}, 201);
  await request("/teams/" + team.id + "/apply", first.token, "POST", {}, 409);
  await request("/applications/" + application1.id + "/approve", first.token, "POST", {}, 403);
  const outsiderRequests = await request("/applications", observer.token);
  assert.equal(outsiderRequests.length, 0);
  const applicants = await request("/applications", owner.token);
  assert.equal(applicants.filter(r => r.teamId === team.id).length, 2);
  assert.equal(privateLeaks, 0);
  passed("Applications, ownership checks, scoped request access and private notifications");

  const approve = id => fetch(base + "/applications/" + id + "/approve", { signal: AbortSignal.timeout(10000), method: "POST", headers: { Authorization: "Bearer " + owner.token, "Content-Type": "application/json" }, body: "{}" });
  const responses = await Promise.all([approve(application1.id), approve(application2.id)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  const after = (await request("/teams", owner.token)).find(t => t.id === team.id);
  assert.equal(after.members.length, 2);
  assert.equal(after.openSpots, 0);
  const winner = after.members.find(m => m.id !== owner.user.id);
  const winningApplication = winner.id === first.user.id ? application1 : application2;
  await request("/applications/" + winningApplication.id + "/approve", owner.token, "POST", {}, 409);
  await request("/teams/" + team.id + "/apply", observer.token, "POST", {}, 409);
  assert(!(await request("/teams/rank", observer.token)).some(r => r.teamId === team.id));
  const exported = await request("/teams/" + team.id + "/roster", owner.token);
  assert(exported.csv.includes(winner.email));
  await request("/teams/" + team.id + "/roster", observer.token, "GET", undefined, 403);
  passed("Concurrent final-vacancy approvals: one success, one conflict, zero overbooking");
  passed("Full teams excluded, duplicate approvals blocked and roster export protected");

  const invitationTeam = await request("/teams", inviteowner.token, "POST", { name: "Invite Test " + suffix, description: "A team built using invitations.", requiredSkills: ["UX"], capacity: 2 }, 201);
  await request("/teams/" + invitationTeam.id + "/invite", observer.token, "POST", { email: invited.user.email }, 403);
  const invitation = await request("/teams/" + invitationTeam.id + "/invite", inviteowner.token, "POST", { email: invited.user.email }, 201);
  await request("/invitations/" + invitation.id + "/accept", observer.token, "POST", {}, 403);
  await request("/invitations/" + invitation.id + "/accept", invited.token, "POST", {}, 201);
  await request("/invitations/" + invitation.id + "/accept", invited.token, "POST", {}, 409);
  const finalTeam = (await request("/teams", invited.token)).find(t => t.id === invitationTeam.id);
  assert.equal(finalTeam.members.length, 2);
  assert((await request("/notifications", invited.token)).length >= 2);
  passed("Invitation owner and recipient authorization, acceptance and persisted activity feed");

  const web = await fetch(process.env.WEB_URL || "http://web:3000", { signal: AbortSignal.timeout(10000) });
  assert.equal(web.status, 200);
  const html = await web.text();
  assert(html.includes("RosterSync") && html.includes("/_next/static/") && html.includes("Loading RosterSync"));
  passed("Production Next.js web responds with metadata and application assets");
  await writeFile("/tmp/rostersync-proof.json", JSON.stringify({ accountIds: accounts.map(a => a.user.id), login: { email: owner.credentials.email, password: owner.credentials.password }, teamId: team.id, memberId: winner.id }));
  console.log(checks + " integration groups passed.");
}
try {
  await run();
} finally {
  for (const socket of sockets) socket.disconnect();
}
