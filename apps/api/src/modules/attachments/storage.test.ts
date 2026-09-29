import { describe, expect, it } from 'vitest';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { validateFiles } from './storage.js';

const image = new PNG({ width: 1, height: 1 });
image.data.set([255, 0, 0, 255]);
const png = PNG.sync.write(image);
const jpegBytes = jpeg.encode({ width: 1, height: 1, data: Buffer.from([255, 0, 0, 255]) }, 80).data;
const file = (mimeType: string, bytes: Buffer, fileName = 'arbitrary.bin') =>
  [{ field: 'file', mimeType, bytes, fileName }];

describe('attachment content validation', () => {
  it('rejects fake PNG and JPEG, even with matching names and MIME', () => {
    expect(() => validateFiles(file('image/png', Buffer.from('plain text'), 'photo.png'))).toThrow();
    expect(() => validateFiles(file('image/jpeg', Buffer.from('plain text'), 'photo.jpg'))).toThrow();
    expect(() => validateFiles(file('image/png', Buffer.from('89504e470d0a1a0a', 'hex'), 'photo.png'))).toThrow();
  });
  it('accepts decoded PNG and JPEG regardless of filename', () => {
    expect(() => validateFiles(file('image/png', png))).not.toThrow();
    expect(() => validateFiles(file('image/jpeg', jpegBytes))).not.toThrow();
  });
  it('rejects executable, empty, oversized and MIME/content mismatch', () => {
    expect(() => validateFiles(file('application/x-msdownload', Buffer.from('MZbinary'), 'program.exe'))).toThrow();
    expect(() => validateFiles(file('image/png', Buffer.alloc(0)))).toThrow();
    expect(() => validateFiles(file('image/png', Buffer.alloc(10 * 1024 * 1024 + 1)))).toThrow();
    expect(() => validateFiles(file('image/jpeg', png))).toThrow();
    expect(() => validateFiles(file('image/png', jpegBytes))).toThrow();
  });
  it('retains the exact 10 MiB limit for permitted text files', () => {
    expect(() => validateFiles(file('text/plain', Buffer.alloc(10 * 1024 * 1024, 0x78)))).not.toThrow();
    expect(() => validateFiles(file('text/plain', Buffer.alloc(10 * 1024 * 1024 + 1, 0x78)))).toThrow();
  });
});
