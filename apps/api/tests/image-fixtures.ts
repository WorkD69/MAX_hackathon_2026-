import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const pixels = Buffer.from([255, 0, 0, 255]);
const image = new PNG({ width: 1, height: 1 });
image.data.set(pixels);
export const validPng = PNG.sync.write(image);
export const validJpeg = jpeg.encode({ width: 1, height: 1, data: pixels }, 80).data;
