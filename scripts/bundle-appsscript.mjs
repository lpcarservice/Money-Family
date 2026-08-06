/**
 * รวม dist/ ที่ vite build ออกมา ให้เหลือไฟล์ HTML ไฟล์เดียว
 * เพื่อเอาไปวางเป็นไฟล์ Index.html ในโปรเจกต์ Apps Script
 *
 *   node scripts/bundle-appsscript.mjs [distDir] [outFile]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve(process.argv[2] || 'dist');
const outFile = resolve(process.argv[3] || 'AppsScript-Index.html');

const assetsDir = join(distDir, 'assets');
const assets = readdirSync(assetsDir);
const jsFile = assets.find(f => f.endsWith('.js'));
const cssFile = assets.find(f => f.endsWith('.css'));
if (!jsFile) throw new Error('ไม่พบไฟล์ .js ใน ' + assetsDir);

const js = readFileSync(join(assetsDir, jsFile), 'utf8');
const css = cssFile ? readFileSync(join(assetsDir, cssFile), 'utf8') : '';

// </script> ในสตริงของโค้ดจะปิดแท็กก่อนเวลา — ต้องหลบก่อนฝัง
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const html = `<!-- สร้างอัตโนมัติจาก scripts/bundle-appsscript.mjs — อย่าแก้ไฟล์นี้ตรงๆ -->
<!doctype html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>สมุดบัญชีส่วนตัว</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${safeJs}</script>
</body>
</html>
`;

writeFileSync(outFile, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`เขียน ${outFile} แล้ว (${kb} kB)`);
