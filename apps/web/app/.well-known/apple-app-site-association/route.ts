// iOS Universal Links for the customer app. Set APPLE_TEAM_ID (Apple Developer → Membership).
// Until it is set this answers 404, so iPhones open links in the browser.
export const dynamic = 'force-dynamic';

export function GET() {
  const team = process.env.APPLE_TEAM_ID?.trim();
  if (!team) return new Response('Not configured', { status: 404 });
  return Response.json({
    applinks: { details: [{ appIDs: [`${team}.in.sahyadripearls.app`], components: [{ '/': '/product/*' }, { '/': '/track/*' }, { '/': '/order/*' }] }] },
  });
}
