import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT version()`;
    console.log('✅ SUCCESS: Connected to Supabase!');
    console.log('PostgreSQL version:', result[0].version.split(' ').slice(0,2).join(' '));
    await prisma.$disconnect();
  } catch (e) {
    console.error('❌ FAILED:', e.message.split('\n')[0]);
    await prisma.$disconnect();
    process.exit(1);
  }
}

testConnection();
