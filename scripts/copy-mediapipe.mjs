// Copies the MediaPipe runtime next to the site so the planner's door outline
// loads it from this domain, always matching the installed package version.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const source = "node_modules/@mediapipe/tasks-vision/wasm";
const target = "public/mediapipe/wasm";

if (existsSync(source)) {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log(`Copied MediaPipe runtime to ${target}`);
} else {
  console.warn("MediaPipe runtime not found. Run npm install.");
}
