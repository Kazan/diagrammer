#!/usr/bin/env node
// Generate a simple Excalidraw flow (start -> process -> end) to stdout.
// Usage: node scripts/generate-basic-diagram.js > diagram.excalidraw

const now = 1700000000000;
const seed = () => Math.floor(Math.random() * 1_000_000_000);

const makeRect = (id, x, y, w, h, backgroundColor) => ({
  id,
  type: "rectangle",
  x,
  y,
  width: w,
  height: h,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor,
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: { type: 2 },
  seed: seed(),
  version: 1,
  versionNonce: seed(),
  isDeleted: false,
  boundElements: [],
  updated: now,
  link: null,
  locked: false
});

const makeText = (id, text, x, y, width, height, containerId) => ({
  id,
  type: "text",
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 1,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: seed(),
  version: 1,
  versionNonce: seed(),
  isDeleted: false,
  boundElements: null,
  updated: now,
  link: null,
  locked: false,
  text,
  fontSize: 20,
  fontFamily: 1,
  textAlign: "center",
  verticalAlign: "middle",
  baseline: 18,
  containerId,
  originalText: text,
  lineHeight: 1.2
});

const makeArrow = (id, x, y, dx, dy, fromId, toId) => ({
  id,
  type: "arrow",
  x,
  y,
  width: dx,
  height: dy,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: seed(),
  version: 1,
  versionNonce: seed(),
  isDeleted: false,
  boundElements: null,
  updated: now,
  link: null,
  locked: false,
  points: [
    [0, 0],
    [dx, dy]
  ],
  lastCommittedPoint: null,
  startBinding: fromId
    ? { elementId: fromId, focus: 0, gap: 4 }
    : null,
  endBinding: toId ? { elementId: toId, focus: 0, gap: 4 } : null,
  startArrowhead: null,
  endArrowhead: "arrow"
});

const elements = [];

const start = makeRect("node-start", 160, 120, 160, 64, "#e0f2ff");
const process = makeRect("node-process", 420, 120, 200, 64, "#fff4e0");
const end = makeRect("node-end", 720, 120, 160, 64, "#e6ffed");

const startText = makeText("text-start", "Start", 190, 142, 100, 25, start.id);
const processText = makeText("text-process", "Process order", 452, 142, 136, 25, process.id);
const endText = makeText("text-end", "Fulfilled", 752, 142, 96, 25, end.id);

const a1 = makeArrow("arrow-1", 320, 152, 100, 0, start.id, process.id);
const a2 = makeArrow("arrow-2", 620, 152, 100, 0, process.id, end.id);

elements.push(start, startText, process, processText, end, endText, a1, a2);

const doc = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    gridSize: 20,
    viewBackgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 }
  },
  files: {}
};

process.stdout.write(JSON.stringify(doc, null, 2));
