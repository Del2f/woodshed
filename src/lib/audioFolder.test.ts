import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { displayFileName, isSingleFilePath } from './audioFolder';
import { parseTitleFromFileName } from './format';

describe('파일 하나씩 추가한 곡의 경로', () => {
  const path = 'file:2f1c9a0e-1111-4222-8333-944445555666/Some Band - Great Song.mp3';
  it('폴더 경로와 구분한다', () => {
    expect(isSingleFilePath(path)).toBe(true);
    expect(isSingleFilePath('Metal/Some Band - Great Song.mp3')).toBe(false);
  });
  it('화면에는 파일 이름만 보인다', () => {
    expect(displayFileName(path)).toBe('Some Band - Great Song.mp3');
    expect(displayFileName('Metal/a.mp3')).toBe('Metal/a.mp3');
  });
  it('제목·아티스트도 파일 이름에서 뽑는다', () => {
    expect(parseTitleFromFileName(path)).toEqual({ artist: 'Some Band', title: 'Great Song' });
  });
});
