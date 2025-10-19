import { PrismaClient } from "@prisma/client";
// simple Prisma singleton
const prisma = new PrismaClient();
export default prisma;
