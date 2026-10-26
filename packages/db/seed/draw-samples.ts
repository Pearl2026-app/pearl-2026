// Draws the sample artwork into STORAGE_LOCAL_DIR/public/samples. No database needed.
import { join, resolve } from 'node:path';
import { copyRealPhotos, drawSamples } from './samples';

const dir = resolve(process.env.STORAGE_LOCAL_DIR ?? join(__dirname, '../../../uploads'));
console.log(`Drew ${drawSamples(dir)} sample images and copied ${copyRealPhotos(dir)} stock photos in ${dir}`);
