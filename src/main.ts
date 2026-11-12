import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module, Controller, Get, Post, Put, Body, Param, Headers, HttpException, Catch, ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import { attachRealtime } from "./realtime";

const db = new PrismaClient();
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
let events: ReturnType<typeof attachRealtime>;
const slots = z.array(z.number().int().min(0).max(1)).length(336);
const skills = z.array(z.string().trim().min(1).max(40)).max(30);
const profileInput = z.object({ name: z.string().trim().min(2).max(80), skills, ambition: z.number().int().min(1).max(10), availability: slots });
const credentials = z.object({ email: z.string().trim().toLowerCase().email().endsWith("@stud.ubbcluj.ro"), password: z.string().min(8).max(128) });
const teamInput = z.object({ name: z.string().trim().min(3).max(80), description: z.string().trim().min(5).max(1000), requiredSkills: skills, capacity: z.number().int().min(2).max(10) });
const userSelect = { id: true, email: true, name: true, skills: true, ambition: true, availability: true } as const;
const teamInclude = { members: { include: { user: { select: userSelect } } } } as const;
const defaultAvailability = () => Array.from({ length: 336 }, (_, i) => +(Math.floor(i / 48) < 5 && i % 48 >= 18 && i % 48 < 36));
const fail = (status: number, message: string): never => { throw new HttpException(message, status); };

function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
function passwordMatches(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function identity(header?: string) {
  try {
    if (!header?.startsWith("Bearer ")) return fail(401, "Sign in first.");
    const payload = await jwt.verifyAsync(header.slice(7));
    if (typeof payload.sub !== "string") return fail(401, "Invalid token.");
    const user = await db.user.findUnique({ where: { id: payload.sub }, select: userSelect });
    return user ?? fail(401, "Account not found.");
  } catch {
    return fail(401, "Invalid or expired session.");
  }
}
function publicTeam(team: any) {
  return { ...team, members: team.members.map((membership: any) => membership.user), openSpots: team.capacity - team.members.length };
}
async function notice(userId: string, message: string) {
  const created = await db.notice.create({ data: { userId, message } });
  events?.notify(userId, created);
}
async function matching(path: string, payload: unknown) {
  try {
    const response = await fetch((process.env.MATCHING_SERVICE_URL || "http://matching:8001") + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const error = await response.json() as any;
      return fail(response.status >= 500 ? 503 : 400, typeof error.detail === "string" ? error.detail : "Invalid matching input.");
    }
    return await response.json();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    return fail(503, "Matching service unavailable.");
  }
}

@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (error instanceof HttpException) return response.status(error.getStatus()).json({ message: error.message });
    if (error instanceof ZodError) return response.status(400).json({ message: error.issues.map(i => i.path.join(".") + ": " + i.message).join("; ") });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return response.status(409).json({ message: "This record already exists or the student already belongs to a team." });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return response.status(404).json({ message: "Record not found." });
    if (error?.status === 400 || error?.status === 413) return response.status(error.status).json({ message: "Invalid request body." });
    console.error(error);
    return response.status(500).json({ message: "An unexpected error occurred." });
  }
}

@Controller()
class Api {
  @Get("health")
  async health() {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok", service: "core-api" };
  }

  @Post("auth/register")
  async register(@Body() body: unknown) {
    const input = credentials.extend({ name: z.string().trim().min(2).max(80) }).parse(body);
    const user = await db.user.create({ data: { email: input.email, name: input.name, passwordHash: hash(input.password), skills: [], availability: defaultAvailability() }, select: userSelect });
    return { token: await jwt.signAsync({ sub: user.id }, { expiresIn: "8h" }), user };
  }

  @Post("auth/login")
  async login(@Body() body: unknown) {
    const input = credentials.parse(body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (!user || !passwordMatches(input.password, user.passwordHash)) return fail(401, "Email or password is incorrect.");
    const { passwordHash, ...publicUser } = user;
    return { token: await jwt.signAsync({ sub: user.id }, { expiresIn: "8h" }), user: publicUser };
  }

  @Get("me")
  async me(@Headers("authorization") auth: string) { return identity(auth); }

  @Put("me")
  async update(@Headers("authorization") auth: string, @Body() body: unknown) {
    const user = await identity(auth);
    return db.user.update({ where: { id: user.id }, data: profileInput.parse(body), select: userSelect });
  }

  @Post("calendar/import")
  async calendar(@Headers("authorization") auth: string, @Body() body: unknown) {
    const user = await identity(auth);
    const input = z.object({ ics: z.string().min(1).max(1000000), weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timezone: z.string().max(80).default("Europe/Bucharest") }).parse(body);
    const imported = await matching("/calendar/import", input) as any;
    await db.user.update({ where: { id: user.id }, data: { availability: imported.availability } });
    return imported;
  }

  @Get("teams")
  async teams(@Headers("authorization") auth: string) {
    await identity(auth);
    return (await db.team.findMany({ include: teamInclude, orderBy: { createdAt: "asc" } })).map(publicTeam);
  }

  @Get("teams/rank")
  async rank(@Headers("authorization") auth: string) {
    const user = await identity(auth);
    const teams = (await db.team.findMany({ include: teamInclude })).map(publicTeam);
    return matching("/rank", { profile: user, teams });
  }

  @Post("teams")
  async createTeam(@Headers("authorization") auth: string, @Body() body: unknown) {
    const user = await identity(auth);
    const input = teamInput.parse(body);
    const team = await db.team.create({ data: { ...input, ownerId: user.id, members: { create: { userId: user.id } } }, include: teamInclude });
    events.teamUpdated(team.id);
    return publicTeam(team);
  }

  @Post("teams/:id/apply")
  async apply(@Headers("authorization") auth: string, @Param("id") teamId: string) {
    const user = await identity(auth);
    const application = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
      const team = await tx.team.findUnique({ where: { id: teamId }, include: { members: true } });
      if (!team) return fail(404, "Team not found.");
      if (team.members.length >= team.capacity) return fail(409, "Team is full.");
      if (await tx.membership.findUnique({ where: { userId: user.id } })) return fail(409, "You already belong to a team.");
      return tx.application.create({ data: { teamId, userId: user.id } });
    });
    const team = await db.team.findUniqueOrThrow({ where: { id: teamId } });
    await notice(team.ownerId, user.name + " applied to " + team.name + ".");
    events.teamUpdated(teamId);
    return application;
  }

  @Get("applications")
  async applications(@Headers("authorization") auth: string) {
    const user = await identity(auth);
    return db.application.findMany({ where: { OR: [{ team: { ownerId: user.id } }, { userId: user.id }] }, include: { user: { select: userSelect }, team: true }, orderBy: { createdAt: "desc" } });
  }

  @Post("applications/:id/approve")
  async approve(@Headers("authorization") auth: string, @Param("id") id: string) {
    const user = await identity(auth);
    return admit(id, user.id, false);
  }

  @Post("applications/:id/reject")
  async reject(@Headers("authorization") auth: string, @Param("id") id: string) {
    const user = await identity(auth);
    const result = await db.$transaction(async tx => {
      const found = await tx.application.findUnique({ where: { id } });
      if (!found) return fail(404, "Application not found.");
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${found.teamId} FOR UPDATE`;
      const application = await tx.application.findUniqueOrThrow({ where: { id }, include: { team: true } });
      if (application.team.ownerId !== user.id) return fail(403, "Only the team owner can reject applications.");
      if (application.status !== "PENDING") return fail(409, "Application already resolved.");
      return tx.application.update({ where: { id }, data: { status: "REJECTED" } });
    });
    await notice(result.userId, "Your application was declined.");
    events.teamUpdated(result.teamId);
    return result;
  }

  @Post("teams/:id/invite")
  async invite(@Headers("authorization") auth: string, @Param("id") teamId: string, @Body() body: unknown) {
    const user = await identity(auth);
    const { email } = z.object({ email: z.string().email().toLowerCase() }).parse(body);
    const invitation = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
      const team = await tx.team.findUnique({ where: { id: teamId }, include: { members: true } });
      if (!team) return fail(404, "Team not found.");
      if (team.ownerId !== user.id) return fail(403, "Only the team owner can invite.");
      if (team.members.length >= team.capacity) return fail(409, "Team is full.");
      const target = await tx.user.findUnique({ where: { email } });
      if (!target) return fail(404, "Student not found.");
      if (await tx.membership.findUnique({ where: { userId: target.id } })) return fail(409, "Student already belongs to a team.");
      return tx.application.create({ data: { teamId, userId: target.id, kind: "INVITE" } });
    });
    await notice(invitation.userId, "You received a team invitation.");
    events.teamUpdated(teamId);
    return invitation;
  }

  @Post("invitations/:id/accept")
  async accept(@Headers("authorization") auth: string, @Param("id") id: string) {
    const user = await identity(auth);
    return admit(id, user.id, true);
  }

  @Get("notifications")
  async notifications(@Headers("authorization") auth: string) {
    const user = await identity(auth);
    return db.notice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 });
  }

  @Get("teams/:id/roster")
  async roster(@Headers("authorization") auth: string, @Param("id") id: string) {
    const user = await identity(auth);
    const team = await db.team.findUnique({ where: { id }, include: teamInclude });
    if (!team) return fail(404, "Team not found.");
    if (team.ownerId !== user.id) return fail(403, "Only the team owner can export.");
    const escape = (value: string) => '"' + value.replace(/"/g, '""') + '"';
    return { filename: "roster.csv", csv: "name,email,skills\r\n" + team.members.map(m => [m.user.name, m.user.email, m.user.skills.join("; ")].map(escape).join(",")).join("\r\n") };
  }
}

async function admit(id: string, actorId: string, invitation: boolean) {
  const result = await db.$transaction(async tx => {
    const found = await tx.application.findUnique({ where: { id } });
    if (!found) return fail(404, "Application not found.");
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${found.teamId} FOR UPDATE`;
    const application = await tx.application.findUniqueOrThrow({ where: { id }, include: { team: { include: { members: true } } } });
    if (invitation ? application.kind !== "INVITE" || application.userId !== actorId : application.kind !== "APPLICATION" || application.team.ownerId !== actorId) return fail(403, "You cannot approve this request.");
    if (application.status !== "PENDING") return fail(409, "Request already resolved.");
    if (application.team.members.length >= application.team.capacity) return fail(409, "Team is full.");
    if (await tx.membership.findUnique({ where: { userId: application.userId } })) return fail(409, "Student already belongs to a team.");
    await tx.membership.create({ data: { teamId: application.teamId, userId: application.userId } });
    return tx.application.update({ where: { id }, data: { status: "APPROVED" } });
  });
  await notice(result.userId, "You joined a team.");
  events.teamUpdated(result.teamId);
  return result;
}

async function seed() {
  if (process.env.DEMO_SEED !== "true") return;
  const people = [
    { email: "alex@stud.ubbcluj.ro", name: "Alex Morgan", skills: ["React", "TypeScript"], ambition: 8 },
    { email: "mara@stud.ubbcluj.ro", name: "Mara Pop", skills: ["Python", "Data science"], ambition: 9 },
    { email: "vlad@stud.ubbcluj.ro", name: "Vlad Ionescu", skills: ["Figma", "UX"], ambition: 8 },
    { email: "ioana@stud.ubbcluj.ro", name: "Ioana Radu", skills: ["Node.js", "PostgreSQL"], ambition: 7 },
    { email: "andrei@stud.ubbcluj.ro", name: "Andrei Stan", skills: ["Docker", "Python"], ambition: 9 },
  ];
  const users = [];
  for (const person of people) users.push(await db.user.upsert({ where: { email: person.email }, update: {}, create: { ...person, passwordHash: hash("Demo12345!"), availability: defaultAvailability() } }));
  const projects = [
    { id: "demo-studyflow", name: "StudyFlow", description: "A smarter workspace for students. Build a beautiful app that turns study chaos into focus.", requiredSkills: ["React", "TypeScript", "Python"], ownerId: users[1].id, capacity: 4 },
    { id: "demo-campus", name: "Campus Connect", description: "Bring the campus together with a real-time hub for events, clubs and student life.", requiredSkills: ["React", "Figma", "Node.js"], ownerId: users[2].id, capacity: 3 },
    { id: "demo-green", name: "Green Route", description: "Help students discover a greener commute with open data and thoughtful design.", requiredSkills: ["Python", "PostgreSQL", "Docker"], ownerId: users[3].id, capacity: 3 },
  ];
  for (const project of projects) await db.team.upsert({ where: { id: project.id }, update: {}, create: { ...project, members: { create: { userId: project.ownerId } } } });
}

@Module({ controllers: [Api] })
class AppModule {}

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must have at least 32 characters.");
  await db.$connect();
  await seed();
  const app = await NestFactory.create(AppModule);
  const origins = (process.env.WEB_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",");
  app.enableCors({ origin: origins });
  app.useGlobalFilters(new ApiErrors());
  events = attachRealtime(app.getHttpServer(), token => jwt.verifyAsync(token), origins);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 8000), "0.0.0.0");
}
bootstrap().catch(error => { console.error(error); process.exit(1); });
