import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Read admin credentials from environment
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminUsername || !adminPassword) {
    console.error('Missing required environment variables:');
    console.error('  ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD');
    console.error('Please set these in your .env file');
    process.exit(1);
  }

  console.log('Seeding database...');

  // Create admin user
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'admin' },
    create: {
      email: adminEmail,
      username: adminUsername,
      password: hashedPassword,
      role: 'admin',
    },
  });

  console.log(`Created admin: ${admin.email} (${admin.username})`);
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
