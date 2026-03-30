/**
 * Stubs for Node.js built-in modules used by @nuucognition/prompt-loader.
 *
 * The prompt-loader package imports node:fs/promises and node:path at the
 * module level for its loadPrompt() function. Since this plate only uses the
 * browser-safe parsePrompt() and renderPrompt() functions, these stubs
 * satisfy the import without pulling in Node.js APIs.
 */

export const readFile = (): never => {
  throw new Error('node:fs/promises is not available in the browser');
};

export const readdir = (): never => {
  throw new Error('node:fs/promises is not available in the browser');
};

export const join = (...segments: string[]): string => segments.join('/');
export const resolve = (...segments: string[]): string => segments.join('/');

export default { join, resolve };
