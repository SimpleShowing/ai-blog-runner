export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Redirect to Google OAuth flow (replaces Manus OAuth)
export const getLoginUrl = () => {
  return `/api/auth/google`;
};
