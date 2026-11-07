import { expect, test } from "vitest";
import { resolveTheme } from "./theme";

test("a saved light or dark choice wins over the system", () => {
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});

test("nothing saved, or a stray value, follows the system", () => {
  expect(resolveTheme(null, true)).toBe("dark");
  expect(resolveTheme(null, false)).toBe("light");
  expect(resolveTheme("auto", true)).toBe("dark");
  expect(resolveTheme("", false)).toBe("light");
});
