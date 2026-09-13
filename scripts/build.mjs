import { buildExtension, dist } from "./build-lib.mjs";

await buildExtension();

console.log("Build complete:", dist);
