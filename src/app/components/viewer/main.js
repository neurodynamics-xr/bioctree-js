import { initViewer, loadModel, setPickMode, setPickingEnabled } from "./render.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setupPickerControls() {
  // button group behavior
  const buttons = [
    ["btnPickVertex", "vertex"],
    ["btnPickEdge", "edge"],
    ["btnPickFace", "triangle"]
  ];

  function setActive(id) {
    for (const [btnId] of buttons) {
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.toggle("active", btnId === id);
    }
  }

  for (const [btnId, mode] of buttons) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener("click", () => {
        // Toggle: if already active, deactivate
        const isActive = btn.classList.contains("active");
        if (isActive) {
          btn.classList.remove("active");
          setPickingEnabled(false);
        } else {
          setPickMode(mode);
          setActive(btnId);
          setPickingEnabled(true);
        }
      });
    }
  }

  // Start with picking disabled (no mode selected)
  setPickingEnabled(false);
}

async function main() {
  const canvas = document.getElementById("canvas");
  const hud = document.getElementById("hud");

  // Allow loading specific asset via ?asset=... parameter (no default)
  const assetUrl = getParam("asset");
  
  // Setup picker control event listeners
  setupPickerControls();

  // Initialize viewer (empty scene by default - mesh loaded via MATLAB setMesh)
  initViewer({ canvasEl: canvas, hudEl: hud, glbUrl: assetUrl });
}

main().catch((err) => {
  console.error(err);
  const hud = document.getElementById("hud");
  if (hud) hud.textContent = String(err);
});
