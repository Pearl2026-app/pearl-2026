// `pnpm build` at the repository root. Everywhere (CI, a laptop) it is the turbo build of every package. On a Hostinger
// Web App deployed from GitHub (owner, 11 Nov), whose build runs in .../hbuilds/source and can only call the scripts
// named build/dev/lint/test, it is the one-app Hostinger build instead (scripts/hostinger/build.sh). SP_HOSTINGER=1
// forces the Hostinger build, SP_HOSTINGER=0 the turbo build.
import { spawnSync } from 'node:child_process';

const flag = process.env.SP_HOSTINGER;
const hostinger = flag === '1' || (flag !== '0' && /[\\/]hbuilds[\\/]/.test(process.cwd()));
const [cmd, args] = hostinger ? ['bash', ['scripts/hostinger/build.sh']] : ['turbo', ['run', 'build', ...process.argv.slice(2)]];
const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
