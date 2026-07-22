import { NextResponse } from 'next/server';

const SUPABASE_URL  = 'https://rfzuzuobwuanmbrcthqe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/platform_settings?key=eq.tc_logo_url&select=value&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          Accept: 'application/json',
        },
        // Cache 60s no servidor
        next: { revalidate: 60 },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const logoValue: string | undefined = data[0]?.value;

      if (logoValue) {
        // Suporte a data URI (PNG/JPEG/GIF/WEBP/SVG base64)
        const dataMatch = logoValue.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
        if (dataMatch) {
          const [, contentType, b64] = dataMatch;
          const binary = Buffer.from(b64, 'base64');
          return new NextResponse(binary, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
            },
          });
        }

        // Suporte a URL HTTP(S)
        if (logoValue.startsWith('http://') || logoValue.startsWith('https://')) {
          return NextResponse.redirect(logoValue, 302);
        }
      }
    }
  } catch {
    // fallback abaixo
  }

  // Fallback: SVG verde com T (idêntico ao original inline do index.html)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#16A34A"/>
    <text y="24" x="6" font-size="20" font-weight="800" fill="white" font-family="sans-serif">T</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=10',
    },
  });
}
