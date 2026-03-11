import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const { benchId, value } = await request.json();

    if (!benchId || value === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // value should be -1, 0, or 1
    const voteValue = Math.max(-1, Math.min(1, Math.round(value)));

    if (voteValue === 0) {
      // Remove vote
      await prisma.vote.deleteMany({
        where: { benchId, userId },
      });
    } else {
      // Upsert vote
      await prisma.vote.upsert({
        where: {
          benchId_userId: { benchId, userId },
        },
        update: { value: voteValue },
        create: { benchId, userId, value: voteValue },
      });
    }

    // Calculate new vote count
    const voteAgg = await prisma.vote.aggregate({
      where: { benchId },
      _sum: { value: true },
    });

    const voteCount = voteAgg._sum.value || 0;

    // Get user's current vote
    const userVoteRecord = await prisma.vote.findUnique({
      where: { benchId_userId: { benchId, userId } },
    });

    return NextResponse.json({
      voteCount,
      userVote: userVoteRecord?.value || 0,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 });
  }
}
