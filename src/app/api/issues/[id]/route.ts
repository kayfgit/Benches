import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if admin
    const userRole = (session.user as Record<string, unknown>).role;
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const { id: issueId } = await params;
    const { status } = await request.json();

    if (!status || !['open', 'resolved', 'closed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const issue = await prisma.issue.update({
      where: { id: issueId },
      data: { status },
      include: {
        user: { select: { username: true } },
      },
    });

    return NextResponse.json({
      id: issue.id,
      title: issue.title,
      content: issue.content,
      type: issue.type,
      status: issue.status,
      benchId: issue.benchId,
      userId: issue.userId,
      userName: issue.user.username,
      createdAt: issue.createdAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update issue' }, { status: 500 });
  }
}

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
    const userRole = (session.user as Record<string, unknown>).role;
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const { id: issueId } = await params;

    await prisma.issue.delete({
      where: { id: issueId },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete issue' }, { status: 500 });
  }
}
