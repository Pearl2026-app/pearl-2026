// Android App Links: lets https://<site>/product/… and /track/… open the customer app.
// Set ANDROID_APP_SHA256 to the app signing certificate fingerprint(s), comma-separated (Play Console →
// App integrity). Until it is set this answers 404, so Android simply opens links in the browser.
export const dynamic = 'force-dynamic';

export function GET() {
  const prints = (process.env.ANDROID_APP_SHA256 ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!prints.length) return new Response('Not configured', { status: 404 });
  return Response.json([
    { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'in.sahyadripearls.app', sha256_cert_fingerprints: prints } },
  ]);
}
