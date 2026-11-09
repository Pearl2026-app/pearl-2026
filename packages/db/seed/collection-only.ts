// Adds the client's signature collection to an existing database (and fixes earlier imports), without the rest of
// the seed. Quick: about 51 lookups. Used by scripts/vercel/api-build.sh for the demo site, whose sample data is
// already in place; the full seed is too slow over the network from Vercel's build machines.
import { PrismaClient } from '@prisma/client';
import { importClientCollection } from './collection';

const prisma = new PrismaClient();
importClientCollection(prisma, process.env.STORAGE_LOCAL_DIR ?? '/tmp/uploads')
  .then(async () => console.log(`Signature collection: ${await prisma.product.count({ where: { collection: { slug: 'signature' } } })} pieces.`))
  .finally(() => prisma.$disconnect());
