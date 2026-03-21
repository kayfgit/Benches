import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { email, username, password } = await request.json();

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Validate username
    if (username.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }

    if (username.length > 20) {
      return NextResponse.json({ error: 'Username must be 20 characters or less' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    // Check if username already exists
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, username, password: hashed },
    });

    return NextResponse.json({ id: user.id, email: user.email, username: user.username }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
