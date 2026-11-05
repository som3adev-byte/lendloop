import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Optimistic redirect only. Real authorization lives in the Convex functions.
const isMemberRoute = createRouteMatcher(["/tools(.*)", "/listings(.*)", "/requests(.*)", "/incoming(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isMemberRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
