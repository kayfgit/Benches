import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Admin email - must match Forum.tsx
const ADMIN_EMAIL = 'test@test.com';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if admin
    if (session.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const { id: benchId } = await params;

    // Check if bench exists
    const bench = await prisma.bench.findUnique({
      where: { id: benchId },
    });

    if (!bench) {
      return NextResponse.json({ error: 'Bench not found' }, { status: 404 });
    }

    // Delete the bench (photos will cascade delete)
    await prisma.bench.delete({
      where: { id: benchId },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete bench' }, { status: 500 });
  }
}
