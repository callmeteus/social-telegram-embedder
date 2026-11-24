import { buildFirefoxExtension, firefoxDist } from "./build-lib.mjs";

await buildFirefoxExtension();

console.log("Firefox build complete:", firefoxDist);
