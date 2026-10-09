/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// HashRouter를 쓰므로 상대 경로(base: './')면 GitHub Pages 하위 경로에서도 그대로 동작한다.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Windows 앱 가상화 폴더처럼 실제 경로가 다른 위치로 풀리는 환경에서도 dev 서버가 파일을 찾도록
  resolve: { preserveSymlinks: true },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
