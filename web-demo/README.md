# Motion Lab — Browser Live Demo

A standalone browser demo of the project's frame-difference motion detection. It uses the browser camera API and Canvas; camera frames are processed locally and are never uploaded.

## Run locally

Camera access is available on `localhost` (or over HTTPS). From the repository root, start a simple Python static server:

```powershell
cd web-demo
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in a current browser and select **Start camera**. Approve the browser's camera permission prompt.

To stop the server, press `Ctrl+C` in the terminal. No packages need to be installed for the demo.

## Use the demo

- **Start camera** requests access to the selected camera. The browser handles permission.
- **Stop** immediately stops the camera tracks and clears the live preview.
- **Motion sensitivity** adjusts how large a frame-to-frame pixel change must be before it is highlighted. Higher values detect subtler movement.
- Green rectangles mark connected regions of movement. This simple technique can also react to lighting changes, camera shake, or other changes in the scene.

If camera access is unavailable, use a current browser and the localhost address above. If access was denied, allow camera use in the browser's site settings and try again. Close other apps that may be using the camera.

## Privacy

The app has no backend, network requests, recording, or upload functionality. Video frames are read from the camera into an in-memory Canvas in this browser tab. Camera access ends when you select **Stop** or close the tab.
