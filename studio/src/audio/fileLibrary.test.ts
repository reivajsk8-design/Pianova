import { describe, it, expect } from 'vitest';
import { fileExt, isAudioFile, sortNodes, filterFiles, buildTreeFromFiles, findNode, parentPath, LibNode } from './fileLibrary';

describe('fileExt / isAudioFile', () => {
  it('extensión en minúsculas, sin punto', () => {
    expect(fileExt('Kick.WAV')).toBe('wav');
    expect(fileExt('loop.mp3')).toBe('mp3');
    expect(fileExt('sinext')).toBe('');
  });
  it('isAudioFile por extensión', () => {
    expect(isAudioFile('a.wav')).toBe(true);
    expect(isAudioFile('a.FLAC')).toBe(true);
    expect(isAudioFile('a.txt')).toBe(false);
    expect(isAudioFile('a')).toBe(false);
  });
});

describe('sortNodes', () => {
  it('carpetas antes que archivos, luego alfabético', () => {
    const ns: LibNode[] = [
      { name: 'z.wav', kind: 'file', path: 'z.wav' },
      { name: 'sub', kind: 'dir', path: 'sub', children: [] },
      { name: 'a.wav', kind: 'file', path: 'a.wav' },
      { name: 'abc', kind: 'dir', path: 'abc', children: [] }
    ];
    expect(sortNodes(ns).map(n => n.name)).toEqual(['abc', 'sub', 'a.wav', 'z.wav']);
  });
});

describe('filterFiles', () => {
  it('filtra por subcadena case-insensitive; vacío = todos', () => {
    const fs: LibNode[] = [
      { name: 'Kick.wav', kind: 'file', path: 'Kick.wav' },
      { name: 'snare.wav', kind: 'file', path: 'snare.wav' }
    ];
    expect(filterFiles(fs, 'kick').map(f => f.name)).toEqual(['Kick.wav']);
    expect(filterFiles(fs, '').length).toBe(2);
  });
});

describe('buildTreeFromFiles', () => {
  it('construye el árbol por rutas, ignora no-audios, ordena y puebla fileMap', () => {
    const { tree, fileMap } = buildTreeFromFiles([
      { name: 'x.wav', path: 'a/b/x.wav' },
      { name: 'y.mp3', path: 'a/y.mp3' },
      { name: 'z.txt', path: 'a/z.txt' }
    ], 'root');
    expect(tree.name).toBe('root');
    const a = tree.children!.find(c => c.name === 'a')!;
    expect(a.kind).toBe('dir');
    // dentro de 'a': carpeta 'b' antes que el archivo 'y.mp3'
    expect(a.children!.map(c => c.name)).toEqual(['b', 'y.mp3']);
    expect(a.children!.find(c => c.name === 'b')!.children!.map(c => c.name)).toEqual(['x.wav']);
    expect(Object.keys(fileMap).sort()).toEqual(['a/b/x.wav', 'a/y.mp3']);
  });
});

describe('findNode / parentPath', () => {
  it('findNode localiza por path; parentPath quita el último segmento', () => {
    const { tree } = buildTreeFromFiles([{ name: 'x.wav', path: 'a/b/x.wav' }], 'root');
    expect(findNode(tree, 'a/b/x.wav')!.name).toBe('x.wav');
    expect(findNode(tree, 'nope')).toBe(null);
    expect(parentPath('root/a/b')).toBe('root/a');
    expect(parentPath('root')).toBe('');
  });
});
