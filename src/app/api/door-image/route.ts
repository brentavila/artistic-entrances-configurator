import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PATH_PREFIX = "/storage/v1/object/public/artistic-entrances-doors/";

function isAllowedDoorImage(src: string) {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (!url.pathname.startsWith(PATH_PREFIX)) return false;

  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configured) {
    try {
      return url.host === new URL(configured).host;
    } catch {
      return false;
    }
  }

  return url.host.endsWith(".supabase.co");
}

export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src");
  if (!src || !isAllowedDoorImage(src)) {
    return NextResponse.json(
      { message: "Door image is not available." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(src, { signal: AbortSignal.timeout(15_000) });
    if (!upstream.ok) {
      return NextResponse.json(
        { message: "Door image is not available." },
        { status: 502 },
      );
    }

    const type = upstream.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      return NextResponse.json(
        { message: "Door image is not available." },
        { status: 502 },
      );
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > 12 * 1024 * 1024) {
      return NextResponse.json(
        { message: "Door image is too large." },
        { status: 502 },
      );
    }

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Door image is not available." },
      { status: 502 },
    );
  }
}
