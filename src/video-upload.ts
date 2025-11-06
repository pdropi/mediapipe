import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
let poseLandmarker: PoseLandmarker = undefined;

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
  console.log("✅ PoseLandmarker loaded for video upload");
  
  setupVideoUpload();
};
createPoseLandmarker();

function setupVideoUpload() {
  const videoUpload = document.getElementById("videoUpload") as HTMLInputElement;
  const uploadedVideo = document.getElementById("uploadedVideo") as HTMLVideoElement;
  const uploadCanvas = document.getElementById("uploadCanvas") as HTMLCanvasElement;
  const uploadCtx = uploadCanvas.getContext("2d")!;
  const uploadDrawingUtils = new DrawingUtils(uploadCtx);

  // Canvas temporário para processamento
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d')!;
  
  // Dimensões máximas compatíveis
  const MAX_WIDTH = 1280;
  const MAX_HEIGHT = 720;

  let uploadVideoPredicting = false;
  let lastUploadVideoTime = -1;

  videoUpload.addEventListener("change", handleVideoUpload);

  async function handleVideoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const fileURL = URL.createObjectURL(file);
    uploadedVideo.src = fileURL;
    console.log("📂 File loaded:", file.name);

    // Reset canvas
    uploadCtx.clearRect(0, 0, uploadCanvas.width, uploadCanvas.height);
    uploadVideoPredicting = false;

    uploadedVideo.onloadedmetadata = () => {
      console.log("🎞️ Video metadata loaded");
      console.log("Original video dimensions:", uploadedVideo.videoWidth, uploadedVideo.videoHeight);
      
      // Calcula dimensões para processamento
      let processedWidth = uploadedVideo.videoWidth;
      let processedHeight = uploadedVideo.videoHeight;
      
      if (processedWidth > MAX_WIDTH || processedHeight > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / processedWidth, MAX_HEIGHT / processedHeight);
        processedWidth = Math.floor(processedWidth * ratio);
        processedHeight = Math.floor(processedHeight * ratio);
        console.log(`📐 Resizing for processing: ${processedWidth}x${processedHeight}`);
      }
      
      // Configura canvas temporário
      tempCanvas.width = processedWidth;
      tempCanvas.height = processedHeight;
      
      // Configura canvas de exibição mantendo proporção original
      const displayRatio = Math.min(MAX_WIDTH / uploadedVideo.videoWidth, MAX_HEIGHT / uploadedVideo.videoHeight);
      const displayWidth = Math.floor(uploadedVideo.videoWidth * displayRatio);
      const displayHeight = Math.floor(uploadedVideo.videoHeight * displayRatio);
      
      uploadCanvas.width = displayWidth;
      uploadCanvas.height = displayHeight;
      
      console.log("Processing canvas:", tempCanvas.width, tempCanvas.height);
      console.log("Display canvas:", uploadCanvas.width, uploadCanvas.height);

      // Fatores de escala
      (window as any).scaleX = uploadCanvas.width / tempCanvas.width;
      (window as any).scaleY = uploadCanvas.height / tempCanvas.height;
    };

    uploadedVideo.onplay = () => {
      console.log("▶️ Video started. Starting prediction loop...");
      if (!uploadVideoPredicting) {
        uploadVideoPredicting = true;
        lastUploadVideoTime = -1;
        predictUploadedVideo();
      }
    };

    uploadedVideo.onpause = () => {
      console.log("⏸️ Video paused");
      uploadVideoPredicting = false;
    };

    uploadedVideo.onended = () => {
      console.log("⏹️ Video ended");
      uploadVideoPredicting = false;
      uploadCtx.clearRect(0, 0, uploadCanvas.width, uploadCanvas.height);
    };

    uploadedVideo.onerror = (err) => {
      console.error("❌ Video error:", err);
      uploadVideoPredicting = false;
    };
  }

  async function predictUploadedVideo() {
    if (!poseLandmarker || !uploadVideoPredicting || uploadedVideo.ended || uploadedVideo.paused) {
      uploadVideoPredicting = false;
      return;
    }

    const now = performance.now();
    
    if (uploadedVideo.currentTime !== lastUploadVideoTime) {
      lastUploadVideoTime = uploadedVideo.currentTime;

      try {
        // Processa no canvas temporário
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(uploadedVideo, 0, 0, tempCanvas.width, tempCanvas.height);
        
        poseLandmarker.detectForVideo(tempCanvas, now, (result) => {
          uploadCtx.clearRect(0, 0, uploadCanvas.width, uploadCanvas.height);
          
          if (result.landmarks && result.landmarks.length > 0) {
            for (const landmarks of result.landmarks) {
              // Escala os landmarks
              const scaledLandmarks = landmarks.map(landmark => ({
                ...landmark,
                x: landmark.x * (window as any).scaleX,
                y: landmark.y * (window as any).scaleY
              }));
              
              uploadDrawingUtils.drawLandmarks(scaledLandmarks, {
                radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
              });
              uploadDrawingUtils.drawConnectors(
                scaledLandmarks,
                PoseLandmarker.POSE_CONNECTIONS
              );
            }
          }
        });
      } catch (error) {
        console.error("Detection error:", error);
        uploadVideoPredicting = false;
      }
    }

    if (uploadVideoPredicting && !uploadedVideo.paused && !uploadedVideo.ended) {
      requestAnimationFrame(predictUploadedVideo);
    } else {
      uploadVideoPredicting = false;
    }
  }
}