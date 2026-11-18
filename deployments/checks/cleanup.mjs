import { createRequire } from "node:module";
const require = createRequire("/app/package.json");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
try {
  const users = await db.user.findMany({ select: { id: true, name: true, email: true } });
  const ids = users.filter(user =>
    (/^(owner|first|second|observer|inviteowner|invited)\d{13}@stud\.ubbcluj\.ro$/.test(user.email) && /^(owner|first|second|observer|inviteowner|invited) Test$/.test(user.name)) ||
    (/^browsertest\d{13}@stud\.ubbcluj\.ro$/.test(user.email) && user.name === "Browser Student")
  ).map(user => user.id);
  const teams = await db.team.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
  const teamIds = teams.map(team => team.id);
  await db.$transaction([
    db.notice.deleteMany({ where: { userId: { in: ids } } }),
    db.application.deleteMany({ where: { OR: [{ userId: { in: ids } }, { teamId: { in: teamIds } }] } }),
    db.membership.deleteMany({ where: { OR: [{ userId: { in: ids } }, { teamId: { in: teamIds } }] } }),
    db.team.deleteMany({ where: { id: { in: teamIds } } }),
    db.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  if (users.some(user => ids.includes(user.id) && user.name === "Browser Student")) {
    const studyflow = await db.team.findUnique({ where: { id: "demo-studyflow" } });
    if (studyflow) await db.notice.deleteMany({ where: { userId: studyflow.ownerId, message: "Browser Student applied to StudyFlow." } });
  }
  if (process.argv.includes("--restore-demo")) {
    const alex = await db.user.findUnique({ where: { email: "alex@stud.ubbcluj.ro" } });
    if (alex) {
      await db.application.deleteMany({ where: { userId: alex.id, teamId: "demo-studyflow", status: "PENDING", kind: "APPLICATION" } });
      await db.user.update({ where: { id: alex.id }, data: { skills: ["React", "TypeScript"], ambition: 8, availability: Array.from({ length: 336 }, (_, i) => +(Math.floor(i / 48) < 5 && i % 48 >= 18 && i % 48 < 36)) } });
    }
  }
  console.log("Removed " + ids.length + " automated test accounts and " + teamIds.length + " test teams.");
} finally {
  await db.$disconnect();
}
