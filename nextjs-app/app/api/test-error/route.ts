import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.text();
  console.log('CLIENT ERROR LOGGED:', body);
  return NextResponse.json({ success: true });
}
