import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
const output = process.argv[2];
if (!output || !isAbsolute(output)) throw new Error('Absolute output path required');
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit=0;bit<8;bit++) crc = (crc>>>1)^((crc&1) ? 0xedb88320 : 0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(type,bytes) {
  const name = Buffer.from(type);const length = Buffer.alloc(4);length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([name,bytes])));
  return Buffer.concat([length,name,bytes,checksum]);
}
const ihdr = Buffer.alloc(13);ihdr.writeUInt32BE(64,0);ihdr.writeUInt32BE(64,4);ihdr[8]=8;ihdr[9]=2;
const pixels = Buffer.alloc((64*3+1)*64);
for (let y=0;y<64;y++) for (let x=0;x<64;x++) {
  const offset=y*193+1+x*3;const grid=(x%16<2||y%16<2);
  pixels[offset]=grid?240:40;pixels[offset+1]=grid?240:105;pixels[offset+2]=grid?240:170;
}
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),
  chunk('tEXt',Buffer.from('Description\0SYNTHETIC test result material; no real repair or personal data')),
  chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
await writeFile(output,png,{flag:'wx'});
process.stdout.write(`SYNTHETIC PNG sha256=${createHash('sha256').update(png).digest('hex')} bytes=${png.length}\n`);
