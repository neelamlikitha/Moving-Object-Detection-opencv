"use strict";

const OUTPUT_WIDTH = 640;
const OUTPUT_HEIGHT = 360;
const CELL_SIZE = 8;
const GRID_COLUMNS = Math.ceil(OUTPUT_WIDTH / CELL_SIZE);
const GRID_ROWS = Math.ceil(OUTPUT_HEIGHT / CELL_SIZE);
const GRID_SIZE = GRID_COLUMNS * GRID_ROWS;
const FRAME_INTERVAL_MS = 80;

const video = document.querySelector("#cameraVideo");
const canvas = document.querySelector("#previewCanvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
const stage = document.querySelector("#previewStage");
const placeholder = document.querySelector("#previewPlaceholder");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const sensitivity = document.querySelector("#sensitivity");
const sensitivityValue = document.querySelector("#sensitivityValue");
const cameraStatus = document.querySelector("#cameraStatus");
const motionStatus = document.querySelector("#motionStatus");
const cameraHelp = document.querySelector("#cameraHelp");
const stageCaption = document.querySelector("#stageCaption");
const liveBadge = document.querySelector("#liveBadge");
const regionCount = document.querySelector("#regionCount");

const previousLuma = new Uint8Array(OUTPUT_WIDTH * OUTPUT_HEIGHT);
const changedPixels = new Uint16Array(GRID_SIZE);
const activeCells = new Uint8Array(GRID_SIZE);
const expandedCells = new Uint8Array(GRID_SIZE);
const visitedCells = new Uint8Array(GRID_SIZE);
const cellQueue = new Int32Array(GRID_SIZE);

let stream = null;
let animationFrame = 0;
let lastFrameTime = 0;
let hasPreviousFrame = false;
let requestVersion = 0;

function setStatus(element, text, state) {
  element.textContent = text;
  element.classList.toggle("is-active", state === "active");
  element.classList.toggle("is-alert", state === "alert");
  const icon = element.parentElement.querySelector(".status-icon");
  if (icon) {
    icon.classList.toggle("is-active", state === "active");
  }
}

function showCameraHelp(message) {
  cameraHelp.textContent = message;
  cameraHelp.hidden = false;
}

function clearCameraHelp() {
  cameraHelp.textContent = "";
  cameraHelp.hidden = true;
}

function getCameraErrorMessage(error) {
  if (error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "Camera permission was denied or blocked. Allow camera access for this site in your browser’s address-bar or site settings, then try again.";
  }
  if (error && error.name === "NotFoundError") {
    return "No camera was found. Connect or enable a camera, then try again.";
  }
  if (error && (error.name === "NotReadableError" || error.name === "AbortError")) {
    return "The camera could not be opened. It may be in use by another app; close that app and try again.";
  }
  if (error && error.name === "OverconstrainedError") {
    return "The camera could not provide a supported video mode. Check your camera and try again.";
  }
  return "The camera could not be started. Check browser permissions and camera availability, then try again.";
}

function updateSensitivity() {
  const value = Number(sensitivity.value);
  sensitivityValue.value = `${value}%`;
  sensitivityValue.textContent = `${value}%`;
  sensitivity.style.background = `linear-gradient(90deg, var(--green) ${value}%, #3b473f ${value}%)`;
}

function resetPreview() {
  context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  stage.classList.remove("is-live");
  liveBadge.hidden = true;
  stageCaption.textContent = "Waiting for camera";
  regionCount.textContent = "No regions detected";
  setStatus(motionStatus, "Standby", "idle");
}

function stopCamera() {
  requestVersion += 1;
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  video.srcObject = null;
  hasPreviousFrame = false;
  lastFrameTime = 0;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus(cameraStatus, "Not started", "idle");
  resetPreview();
}

async function startCamera() {
  const thisRequest = ++requestVersion;
  startButton.disabled = true;
  stopButton.disabled = false;
  clearCameraHelp();
  setStatus(cameraStatus, "Requesting permission…", "alert");
  setStatus(motionStatus, "Waiting for camera", "idle");
  stageCaption.textContent = "Waiting for permission";

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus(cameraStatus, "Unavailable", "alert");
    showCameraHelp("This browser cannot access the camera here. Open the demo in a current browser using localhost or a secure HTTPS connection.");
    stopButton.disabled = true;
    startButton.disabled = false;
    return;
  }

  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    if (thisRequest !== requestVersion) {
      newStream.getTracks().forEach((track) => track.stop());
      return;
    }

    stream = newStream;
    video.srcObject = stream;
    await video.play();

    if (thisRequest !== requestVersion) {
      stopCamera();
      return;
    }

    hasPreviousFrame = false;
    stage.classList.add("is-live");
    liveBadge.hidden = false;
    stageCaption.textContent = "Camera is live";
    setStatus(cameraStatus, "Connected", "active");
    setStatus(motionStatus, "Watching", "active");
    startButton.disabled = true;
    stopButton.disabled = false;
    animationFrame = requestAnimationFrame(processFrame);
  } catch (error) {
    if (thisRequest !== requestVersion) {
      return;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
    hasPreviousFrame = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus(cameraStatus, "Camera unavailable", "alert");
    setStatus(motionStatus, "Standby", "idle");
    stageCaption.textContent = "Waiting for camera";
    showCameraHelp(getCameraErrorMessage(error));
  }
}

function drawCoverFrame() {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = OUTPUT_WIDTH / OUTPUT_HEIGHT;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    cropX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetAspect;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  context.drawImage(
    video,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT
  );
}

function findMotionRegions(imageData) {
  changedPixels.fill(0);
  activeCells.fill(0);
  expandedCells.fill(0);
  visitedCells.fill(0);

  const frameData = imageData.data;
  const sensitivityLevel = Number(sensitivity.value) / 100;
  const pixelThreshold = 55 - sensitivityLevel * 42;
  const changedRatio = 0.22 - sensitivityLevel * 0.15;

  for (let y = 0; y < OUTPUT_HEIGHT; y += 1) {
    const rowOffset = y * OUTPUT_WIDTH;
    const cellRowOffset = Math.floor(y / CELL_SIZE) * GRID_COLUMNS;
    for (let x = 0; x < OUTPUT_WIDTH; x += 1) {
      const pixelOffset = (rowOffset + x) * 4;
      const luma = Math.round(
        frameData[pixelOffset] * 0.299 +
        frameData[pixelOffset + 1] * 0.587 +
        frameData[pixelOffset + 2] * 0.114
      );
      const pixelIndex = rowOffset + x;
      if (Math.abs(luma - previousLuma[pixelIndex]) >= pixelThreshold) {
        const cellIndex = cellRowOffset + Math.floor(x / CELL_SIZE);
        changedPixels[cellIndex] += 1;
      }
      previousLuma[pixelIndex] = luma;
    }
  }

  for (let cellY = 0; cellY < GRID_ROWS; cellY += 1) {
    for (let cellX = 0; cellX < GRID_COLUMNS; cellX += 1) {
      const cellIndex = cellY * GRID_COLUMNS + cellX;
      const cellWidth = Math.min(CELL_SIZE, OUTPUT_WIDTH - cellX * CELL_SIZE);
      const cellHeight = Math.min(CELL_SIZE, OUTPUT_HEIGHT - cellY * CELL_SIZE);
      const requiredChanges = Math.max(3, Math.floor(cellWidth * cellHeight * changedRatio));
      if (changedPixels[cellIndex] >= requiredChanges) {
        activeCells[cellIndex] = 1;
      }
    }
  }

  for (let cellY = 0; cellY < GRID_ROWS; cellY += 1) {
    for (let cellX = 0; cellX < GRID_COLUMNS; cellX += 1) {
      const cellIndex = cellY * GRID_COLUMNS + cellX;
      if (!activeCells[cellIndex]) {
        continue;
      }
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const neighborY = cellY + offsetY;
        if (neighborY < 0 || neighborY >= GRID_ROWS) {
          continue;
        }
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const neighborX = cellX + offsetX;
          if (neighborX >= 0 && neighborX < GRID_COLUMNS) {
            expandedCells[neighborY * GRID_COLUMNS + neighborX] = 1;
          }
        }
      }
    }
  }

  const regions = [];
  for (let startIndex = 0; startIndex < GRID_SIZE; startIndex += 1) {
    if (!expandedCells[startIndex] || visitedCells[startIndex]) {
      continue;
    }

    let queueStart = 0;
    let queueEnd = 0;
    cellQueue[queueEnd] = startIndex;
    queueEnd += 1;
    visitedCells[startIndex] = 1;
    let minX = GRID_COLUMNS;
    let minY = GRID_ROWS;
    let maxX = 0;
    let maxY = 0;
    let cellCount = 0;

    while (queueStart < queueEnd) {
      const currentIndex = cellQueue[queueStart];
      queueStart += 1;
      const cellY = Math.floor(currentIndex / GRID_COLUMNS);
      const cellX = currentIndex - cellY * GRID_COLUMNS;
      minX = Math.min(minX, cellX);
      minY = Math.min(minY, cellY);
      maxX = Math.max(maxX, cellX);
      maxY = Math.max(maxY, cellY);
      cellCount += 1;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const neighborY = cellY + offsetY;
        if (neighborY < 0 || neighborY >= GRID_ROWS) {
          continue;
        }
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const neighborX = cellX + offsetX;
          if (neighborX < 0 || neighborX >= GRID_COLUMNS) {
            continue;
          }
          const neighborIndex = neighborY * GRID_COLUMNS + neighborX;
          if (expandedCells[neighborIndex] && !visitedCells[neighborIndex]) {
            visitedCells[neighborIndex] = 1;
            cellQueue[queueEnd] = neighborIndex;
            queueEnd += 1;
          }
        }
      }
    }

    if (cellCount >= 4) {
      regions.push({
        x: minX * CELL_SIZE,
        y: minY * CELL_SIZE,
        width: Math.min(OUTPUT_WIDTH, (maxX + 1) * CELL_SIZE) - minX * CELL_SIZE,
        height: Math.min(OUTPUT_HEIGHT, (maxY + 1) * CELL_SIZE) - minY * CELL_SIZE
      });
    }
  }

  return regions;
}

function drawRegions(regions) {
  context.save();
  context.strokeStyle = "#a4f47b";
  context.lineWidth = 2;
  context.shadowColor = "rgba(164, 244, 123, 0.7)";
  context.shadowBlur = 7;
  for (const region of regions) {
    context.strokeRect(
      region.x + 1,
      region.y + 1,
      Math.max(1, region.width - 2),
      Math.max(1, region.height - 2)
    );
  }
  context.restore();
}

function processFrame(timestamp) {
  if (!stream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    animationFrame = requestAnimationFrame(processFrame);
    return;
  }
  if (timestamp - lastFrameTime < FRAME_INTERVAL_MS) {
    animationFrame = requestAnimationFrame(processFrame);
    return;
  }
  lastFrameTime = timestamp;

  try {
    drawCoverFrame();
    const imageData = context.getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    if (!hasPreviousFrame) {
      for (let pixel = 0; pixel < previousLuma.length; pixel += 1) {
        const offset = pixel * 4;
        previousLuma[pixel] = Math.round(
          imageData.data[offset] * 0.299 +
          imageData.data[offset + 1] * 0.587 +
          imageData.data[offset + 2] * 0.114
        );
      }
      hasPreviousFrame = true;
      setStatus(motionStatus, "Watching", "active");
    } else {
      const regions = findMotionRegions(imageData);
      drawRegions(regions);
      if (regions.length > 0) {
        const regionLabel = regions.length === 1 ? "1 region detected" : `${regions.length} regions detected`;
        regionCount.textContent = regionLabel;
        setStatus(motionStatus, "Movement detected", "alert");
      } else {
        regionCount.textContent = "No regions detected";
        setStatus(motionStatus, "Watching", "active");
      }
    }
  } catch (error) {
    stopCamera();
    setStatus(cameraStatus, "Camera error", "alert");
    showCameraHelp("The camera feed could not be processed. Check that the browser supports Canvas and camera access, then start the camera again.");
    return;
  }

  animationFrame = requestAnimationFrame(processFrame);
}

startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
sensitivity.addEventListener("input", updateSensitivity);

video.addEventListener("ended", () => {
  if (stream) {
    stopCamera();
    setStatus(cameraStatus, "Camera stopped", "idle");
  }
});

updateSensitivity();
resetPreview();
