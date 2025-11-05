// Copyright 2023 The MediaPipe Authors.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");

let poseLandmarker: PoseLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton: HTMLButtonElement;
let webcamRunning: Boolean = false;
const videoHeight = "360px";
const videoWidth = "480px";

// Before we can use PoseLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
      delegate: "GPU",
    },
    runningMode: runningMode,
    numPoses: 2,
  });
  demosSection.classList.remove("invisible");
  console.log("✅ PoseLandmarker carregado");

  // Ativa botões e input SOMENTE após carregar o modelo
  setupWebcamDemo();
  setupVideoUploadDemo();
};
createPoseLandmarker();

/********************************************************************
// Demo 1: Grab a bunch of images from the page and detection them
// upon click.
********************************************************************/

// In this demo, we have put all our clickable images in divs with the
// CSS class 'detectionOnClick'. Lets get all the elements that have
// this class.
const imageContainers = document.getElementsByClassName("detectOnClick");

// Now let's go through all of these and add a click event listener.
for (let i = 0; i < imageContainers.length; i++) {
  // Add event listener to the child element whichis the img element.
  imageContainers[i].children[0].addEventListener("click", handleClick);
}

// When an image is clicked, let's detect it and display results!
async function handleClick(event) {
  if (!poseLandmarker) {
    console.log("Wait for poseLandmarker to load before clicking!");
    return;
  }

  if (runningMode === "VIDEO") {
    runningMode = "IMAGE";
    await poseLandmarker.setOptions({ runningMode: "IMAGE" });
  }
  // Remove all landmarks drawed before
  const allCanvas = event.target.parentNode.getElementsByClassName("canvas");
  for (var i = allCanvas.length - 1; i >= 0; i--) {
    const n = allCanvas[i];
    n.parentNode.removeChild(n);
  }

  // We can call poseLandmarker.detect as many times as we like with
  // different image data each time. The result is returned in a callback.
  poseLandmarker.detect(event.target, (result) => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("class", "canvas");
    canvas.setAttribute("width", event.target.naturalWidth + "px");
    canvas.setAttribute("height", event.target.naturalHeight + "px");
    canvas.style =
      "left: 0px;" +
      "top: 0px;" +
      "width: " +
      event.target.width +
      "px;" +
      "height: " +
      event.target.height +
      "px;";

    event.target.parentNode.appendChild(canvas);
    const canvasCtx = canvas.getContext("2d");
    const drawingUtils = new DrawingUtils(canvasCtx);
    for (const landmark of result.landmarks) {
      drawingUtils.drawLandmarks(landmark, {
        radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
      });
      drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
    }
  });
}

/********************************************************************
// Demo 2: Continuously grab image from webcam stream and detect it.
********************************************************************/

/********************************************************************
 * Webcam demo (mesmo código de antes, mas dentro de função)
 ********************************************************************/
function setupWebcamDemo() {
  const video = document.getElementById("webcam") as HTMLVideoElement;
  const canvasElement = document.getElementById(
    "output_canvas"
  ) as HTMLCanvasElement;
  const canvasCtx = canvasElement.getContext("2d");
  const drawingUtils = new DrawingUtils(canvasCtx);

  const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
  enableWebcamButton = document.getElementById(
    "webcamButton"
  ) as HTMLButtonElement;

  if (hasGetUserMedia()) {
    enableWebcamButton.addEventListener("click", enableCam);
  } else {
    console.warn("getUserMedia() não suportado neste navegador.");
  }

  function enableCam() {
    if (!poseLandmarker) {
      console.log("Aguarde o modelo carregar.");
      return;
    }

    webcamRunning = !webcamRunning;
    enableWebcamButton.innerText = webcamRunning
      ? "DISABLE PREDICTIONS"
      : "ENABLE PREDICTIONS";

    const constraints = { video: true };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      video.srcObject = stream;
      video.addEventListener("loadeddata", predictWebcam);
    });
  }

  let lastVideoTime = -1;
  async function predictWebcam() {
    canvasElement.style.height = videoHeight;
    video.style.height = videoHeight;
    canvasElement.style.width = videoWidth;
    video.style.width = videoWidth;

    if (runningMode === "IMAGE") {
      runningMode = "VIDEO";
      await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }

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
          drawingUtils.drawConnectors(
            landmark,
            PoseLandmarker.POSE_CONNECTIONS
          );
        }
        canvasCtx.restore();
      });
    }

    if (webcamRunning) requestAnimationFrame(predictWebcam);
  }
}

/********************************************************************
 * Upload de vídeo demo (versão funcional)
 ********************************************************************/
function setupVideoUploadDemo() {
  const videoUpload = document.getElementById(
    "videoUpload"
  ) as HTMLInputElement;
  const uploadedVideo = document.getElementById(
    "uploadedVideo"
  ) as HTMLVideoElement;
  const uploadCanvas = document.getElementById(
    "uploadCanvas"
  ) as HTMLCanvasElement;
  const uploadCtx = uploadCanvas.getContext("2d")!;
  const uploadDrawingUtils = new DrawingUtils(uploadCtx);

  console.log("🎬 Configurando upload de vídeo...");

  videoUpload.addEventListener("change", handleVideoUpload);

  async function handleVideoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const fileURL = URL.createObjectURL(file);
    uploadedVideo.src = fileURL;
    console.log("📂 Arquivo carregado:", file.name);

    uploadedVideo.onloadedmetadata = async () => {
      console.log("🎞️ Metadados do vídeo carregados");
      console.log("Vídeo dimensões:", uploadedVideo.videoWidth, uploadedVideo.videoHeight);
      uploadCanvas.width = uploadedVideo.videoWidth;
      uploadCanvas.height = uploadedVideo.videoHeight;

      // Garante o modo "VIDEO"
      if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await poseLandmarker.setOptions({ runningMode: "VIDEO" });
      }
    };

    uploadedVideo.onplay = () => {
      console.log("▶️ Vídeo iniciou. Iniciando loop de predição...");
      if (!uploadVideoPredicting) {
        uploadVideoPredicting = true;
        lastTime = -1; // reset para garantir nova detecção no frame 0
        predictUploadedVideo();
      }
    };

    uploadedVideo.onpause = () => {
      console.log("⏸️ Vídeo pausado");
    };

    uploadedVideo.onerror = (err) => {
      console.error("❌ Erro ao carregar vídeo:", err);
    };

    // Reprodução automática pode ser bloqueada — o usuário pode clicar manualmente
    try {
      await uploadedVideo.play();
    } catch {
      console.warn(
        "⚠️ O navegador bloqueou o autoplay — clique no vídeo para iniciar."
      );
    }
  }

  let lastTime = -1;
  let uploadVideoPredicting = false;

  async function predictUploadedVideo() {
    if (!poseLandmarker || uploadedVideo.ended) {
      uploadVideoPredicting = false;
      return;
    }

    // Garante que o modo seja VIDEO
    if (runningMode !== "VIDEO") {
      runningMode = "VIDEO";
      await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    const now = performance.now();
    if (uploadedVideo.currentTime !== lastTime && !uploadedVideo.paused) {
      lastTime = uploadedVideo.currentTime;

      poseLandmarker.detectForVideo(uploadedVideo, now, (result) => {
        uploadCtx.clearRect(0, 0, uploadCanvas.width, uploadCanvas.height);
        for (const landmarks of result.landmarks) {
          uploadDrawingUtils.drawLandmarks(landmarks, {
            radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
          });
          uploadDrawingUtils.drawConnectors(
            landmarks,
            PoseLandmarker.POSE_CONNECTIONS
          );
        }
      });
    }

    // Só continua se o vídeo estiver em execução
    if (!uploadedVideo.paused && !uploadedVideo.ended) {
      requestAnimationFrame(predictUploadedVideo);
    } else {
      uploadVideoPredicting = false;
    }
  }
}
