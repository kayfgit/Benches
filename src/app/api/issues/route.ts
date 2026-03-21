import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const issues = await prisma.issue.findMany({
      include: {
        user: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      content: issue.content,
      type: issue.type,
      status: issue.status,
      benchId: issue.benchId,
      userId: issue.userId,
      userName: issue.user.username,
      createdAt: issue.createdAt.toISOString(),
    }));

    return NextResponse.json(formatted);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const { title, content, type, benchId } = await request.json();

    if (!title || !content || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const issue = await prisma.issue.create({
      data: {
        title,
        content,
        type,
        benchId: benchId || null,
        userId,
      },
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
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 });
  }
}
