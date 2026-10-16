import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { expect, test } from "vitest";

test("Tailwind 4 retains Sigil tokens, compatibility radii and component utilities", async () => {
  const from = resolve("src/app/globals.css");
  const input = readFileSync(from, "utf8") + '\n@source inline("rounded-sm rounded-lg bg-neon text-sigil-error font-sans bg-linear-to-r outline-hidden");';
  const { css } = await postcss([tailwind()]).process(input, { from });
  for (const selector of [".rounded-sm", ".rounded-lg", ".bg-neon", ".text-sigil-error", ".font-sans", ".bg-linear-to-r", ".outline-hidden", ".btn-neon", ".card-dark"]) {
    expect(css).toContain(selector);
  }
  expect(css).toContain("--color-neon: #00ff88");
  expect(css).toContain("--color-sigil-error: #f04452");
  expect(css).toContain("var(--font-inter)");
  expect(css).toContain("border-color: var(--color-gray-200, currentcolor)");
  expect(css).not.toContain("@apply");
}, 30000);
