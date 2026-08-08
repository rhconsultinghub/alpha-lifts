import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveOrShareFile } from './files';

// The suite runs in plain node — stub exactly the DOM surface the web anchor path touches.
interface AnchorStub { href: string; download: string; click: () => void }

let clicked: AnchorStub[];
let created: string[];
let revoked: string[];
// Node has real Blob/URL globals — save and restore them rather than deleting built-ins.
const g = globalThis as Record<string, unknown>;
const realBlob = g.Blob;
const realURL = g.URL;
const realDocument = g.document;

beforeEach(() => {
  clicked = [];
  created = [];
  revoked = [];
  g.Blob = class {
    parts: unknown[]; type: string;
    constructor(parts: unknown[], opts?: { type?: string }) { this.parts = parts; this.type = opts?.type || ''; }
  };
  g.URL = {
    createObjectURL: (b: { type: string }) => { const u = `blob:test-${created.length}-${b.type}`; created.push(u); return u; },
    revokeObjectURL: (u: string) => { revoked.push(u); }
  };
  g.document = {
    createElement: () => {
      const a: AnchorStub = { href: '', download: '', click: () => clicked.push(a) };
      return a;
    },
    body: { appendChild: () => {}, removeChild: () => {} }
  };
});

afterEach(() => {
  g.Blob = realBlob;
  g.URL = realURL;
  g.document = realDocument;
  vi.restoreAllMocks();
});

describe('saveOrShareFile (web path)', () => {
  it('drives the anchor download with the requested filename and revokes the URL', async () => {
    const result = await saveOrShareFile({ filename: 'test-export.csv', mime: 'text/csv', data: 'a,b,c' });
    expect(result).toBe('downloaded');
    expect(clicked.length).toBe(1);
    expect(clicked[0].download).toBe('test-export.csv');
    expect(clicked[0].href).toBe(created[0]);
    expect(revoked).toEqual(created);
  });

  it('wraps string data in a Blob carrying the mime type', async () => {
    await saveOrShareFile({ filename: 'x.json', mime: 'application/json', data: '{}' });
    expect(created[0]).toContain('application/json');
  });

  it('passes an existing Blob through untouched', async () => {
    const BlobCtor = (globalThis as Record<string, unknown>).Blob as new (p: unknown[], o?: { type?: string }) => Blob;
    const blob = new BlobCtor(['png-bytes'], { type: 'image/png' });
    await saveOrShareFile({ filename: 'card.png', mime: 'image/png', data: blob });
    expect(created[0]).toContain('image/png');
  });
});
