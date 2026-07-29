import { describe, expect, it } from 'vitest';
import { blogPathForSlug, markdownToHtml } from '../src/lib/blog';

describe('markdownToHtml security boundary', () => {
  it('renders raw HTML as inert text', () => {
    const html = markdownToHtml('<script>alert(1)</script><img src=x onerror="alert(2)">');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rejects executable markdown URLs', () => {
    const html = markdownToHtml('[click](javascript:alert(1))');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('href="javascript:');
  });

  it('keeps approved web URLs', () => {
    const html = markdownToHtml('[docs](https://sigil.codes/docs?a=1&b=2)');
    expect(html).toContain('href="https://sigil.codes/docs?a=1&amp;b=2"');
    expect(html).not.toContain('&amp;amp;');
  });

  it('maps only known blog slugs to article routes', () => {
    expect(blogPathForSlug('introducing-sigil-protocol')).toBe('/blog/introducing-sigil-protocol');
    expect(blogPathForSlug('javascript:alert(1)')).toBe('/blog');
  });
});