import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
let poseLandmarker: PoseLandmarker = undefined;
let webcamRunning: Boolean = false;

const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 2,
  });
  demosSection.classList.remove("invisible");
  console.log("✅ PoseLandmarker loaded for webcam");
  
  setupWebcam();
};
createPoseLandmarker();

function setupWebcam() {
  const video = document.getElementById("webcam") as HTMLVideoElement;
  const canvasElement = document.getElementById("output_canvas") as HTMLCanvasElement;
  const canvasCtx = canvasElement.getContext("2d");
  const drawingUtils = new DrawingUtils(canvasCtx);
  const enableWebcamButton = document.getElementById("webcamButton") as HTMLButtonElement;

  const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

  if (hasGetUserMedia()) {
    enableWebcamButton.addEventListener("click", enableCam);
  } else {
    console.warn("getUserMedia() not supported in this browser.");
    enableWebcamButton.disabled = true;
  }

  function enableCam() {
    if (!poseLandmarker) {
      console.log("Wait for poseLandmarker to load.");
      return;
    }

    webcamRunning = !webcamRunning;
    enableWebcamButton.innerText = webcamRunning ? "DISABLE WEBCAM" : "ENABLE WEBCAM";

    if (webcamRunning) {
      const constraints = { video: true };
      navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
      });
    } else {
      video.srcObject = null;
    }
  }

  let lastVideoTime = -1;
  async function predictWebcam() {
    if (!webcamRunning) return;

    // Set canvas dimensions to match video
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    const startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        for (const landmark of result.landmarks) {
          drawingUtils.drawLandmarks(landmark, {
            radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
          });
          drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
        }
        canvasCtx.restore();
      });
    }

    if (webcamRunning) {
      requestAnimationFrame(predictWebcam);
    }
  }
}