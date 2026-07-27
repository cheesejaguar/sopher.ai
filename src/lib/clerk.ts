// Clerk activates once the Marketplace integration provisions keys.
// Until then the app runs unauthenticated so previews stay reviewable.
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
