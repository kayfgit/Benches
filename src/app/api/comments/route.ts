import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const benchId = searchParams.get('benchId');

    if (!benchId) {
      return NextResponse.json({ error: 'benchId required' }, { status: 400 });
    }

    const comments = await prisma.comment.findMany({
      where: { benchId },
      include: {
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = comments.map((c) => ({
      id: c.id,
      content: c.content,
      userId: c.userId,
      userName: c.user.name,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json(formatted);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const { benchId, content } = await request.json();

    if (!benchId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const comment = await prisma.comment.create({
      data: {
        benchId,
        userId,
        content,
      },
      include: {
        user: { select: { name: true } },
      },
    });

    return NextResponse.json({
      id: comment.id,
      content: comment.content,
      userId: comment.userId,
      userName: comment.user.name,
      createdAt: comment.createdAt.toISOString(),
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
