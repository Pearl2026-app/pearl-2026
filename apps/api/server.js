// Vercel Functions entrypoint (vercel.json "api" service): runs the compiled API from dist/, built by
// scripts/vercel/api-build.sh. Kept as plain JS so the path exists before the build runs.
require('./dist/main.js');
