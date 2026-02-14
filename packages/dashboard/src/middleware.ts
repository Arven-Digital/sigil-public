import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const pathname = request.nextUrl.pathname;

  // app.sigil.codes → dashboard app (redirect root to login)
  if (hostname.startsWith("app.")) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // Block landing-only routes on app subdomain
    if (pathname === "/onboarding") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // sigil.codes (no subdomain) → landing page
  if (!hostname.startsWith("app.") && hostname.includes("sigil.codes")) {
    // Allow landing page and onboarding
    if (pathname === "/" || pathname === "/onboarding") {
      return NextResponse.next();
    }
    // Redirect dashboard/login routes to app.sigil.codes
    if (pathname.startsWith("/dashboard") || pathname === "/login") {
      return NextResponse.redirect(new URL(pathname, "https://app.sigil.codes"));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/onboarding", "/dashboard/:path*"],
};
