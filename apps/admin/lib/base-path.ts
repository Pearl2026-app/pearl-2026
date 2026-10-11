/** The admin is served under this path on the shared domain (www.example.in/admin). Keep in sync with next.config.ts. */
export const BASE_PATH = '/admin';

/** Full browser path for an admin page, e.g. adminPath('/login') → '/admin/login'. */
export const adminPath = (path: string) => `${BASE_PATH}${path}`;

/** The current page inside the admin, without the base path (what the login page expects in ?next=). */
export const currentAdminPath = () =>
  typeof window === 'undefined' ? '/' : (window.location.pathname.replace(new RegExp(`^${BASE_PATH}(?=/|$)`), '') || '/') + window.location.search;
