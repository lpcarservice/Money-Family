import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // path แบบสัมพัทธ์ → ใช้ได้ทั้ง user site (user.github.io) และ project site (user.github.io/repo/)
  // โดยไม่ต้องแก้ config ตามชื่อ repo
  base: './',
  plugins: [react()],
});
