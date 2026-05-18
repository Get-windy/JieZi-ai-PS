export * from "../../upstream/src/infra/boundary-file-read.js";
export const openBoundaryFileSync = (filePath: string, options?: Record<string, unknown>) => {
  const { readFileSync } = require("node:fs");
  return readFileSync(filePath, options);
};
export const openBoundaryFile = async (filePath: string, options?: Record<string, unknown>) => {
  const { readFile } = require("node:fs/promises");
  return readFile(filePath, options);
};
