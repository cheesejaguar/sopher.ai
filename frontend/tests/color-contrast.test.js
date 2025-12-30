import { describe, it, expect } from 'vitest';

/**
 * Convert a hex color string to its relative luminance.
 * @param {string} hex - Hex color in the form '#RRGGBB'
 * @returns {number} Relative luminance
 */
function luminance(hex) {
  const raw = hex.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;

  const [rLin, gLin, bLin] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculate contrast ratio between two hex colors.
 * @param {string} fg - Foreground color
 * @param {string} bg - Background color
 * @returns {number} Contrast ratio
 */
function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [bright, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (bright + 0.05) / (dark + 0.05);
}

const colors = {
  teal: '#11C5B2',
  indigo: '#1B2559',
};

describe('Color Contrast WCAG Compliance', () => {
  it('teal text on indigo background passes WCAG AA (4.5:1 minimum)', () => {
    const ratio = contrast(colors.teal, colors.indigo);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('has adequate contrast ratio for readability', () => {
    const ratio = contrast(colors.teal, colors.indigo);
    // Ratio should be around 6.63
    expect(ratio).toBeGreaterThan(6);
  });
});
