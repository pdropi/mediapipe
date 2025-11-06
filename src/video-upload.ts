// src/video-upload.ts

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
  PoseLandmarkerResult,
  NormalizedLandmark,
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// Importa o novo utilitário. Vite resolverá a extensão .ts.
import { analyzeErgonomics } from "./ergonomics-utils.ts"; 

const demosSection = document.getElementById("demos");
let poseLandmarker: PoseLandmarker = undefined;
let angleDisplay: HTMLParagraphElement; // Elemento para exibir o ângulo

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
  
  // 🆕 Cria e anexa o elemento de exibição do ângulo (Painel)
  angleDisplay = document.createElement('p');
  angleDisplay.id = 'angleDisplay';
  angleDisplay.style.cssText = 'position: absolute; top: 10px; right: 10px; color: white; background: rgba(0,0,0,0.7); padding: 5px 10px; border-radius: 5px; z-index: 10; font-weight: bold; font-family: monospace;';
  const videoContainer = document.getElementById("uploadedVideoContainer");
  if (videoContainer) videoContainer.appendChild(angleDisplay);

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
    if (angleDisplay) angleDisplay.textContent = 'Aguardando vídeo...';

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

      // Fatores de escala (globais para acesso fácil)
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
      if (angleDisplay) angleDisplay.textContent = 'Análise concluída.';
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
        
        poseLandmarker.detectForVideo(tempCanvas, now, (result: PoseLandmarkerResult) => {
          uploadCtx.clearRect(0, 0, uploadCanvas.width, uploadCanvas.height);
          
          if (result.landmarks && result.landmarks.length > 0) {
            // Assumimos a primeira pose como a principal
            const landmarks: NormalizedLandmark[] = result.landmarks[0];
            
            // 🆕 1. Cálculo do ângulo cervical
            const { neckAngle } = analyzeErgonomics(landmarks);

            // 🆕 2. Exibição do ângulo (Apenas para a primeira pose)
            if (angleDisplay) {
                if (neckAngle !== null) {
                    const formattedAngle = neckAngle.toFixed(2);
                    // O ângulo é o desvio em relação ao vertical. 0° é ERETO.
                    angleDisplay.textContent = `Ângulo Cervical: ${formattedAngle}°`;

                    // Feedback Ergonômico: Flexão excessiva (e.g., desvio > 10 graus)
                    const MAX_SAFE_DEVIATION = 15; // Exemplo: 15 graus de desvio
                    
                    if (Math.abs(neckAngle) > MAX_SAFE_DEVIATION) {
                        angleDisplay.style.color = 'red';
                    } else if (Math.abs(neckAngle) > 8) {
                        angleDisplay.style.color = 'yellow';
                    } else {
                        angleDisplay.style.color = 'lime';
                    }
                } else {
                    angleDisplay.textContent = 'Ângulo Cervical: Não detectado';
                    angleDisplay.style.color = 'white';
                }
            }


            // 3. Desenho dos Landmarks e Conexões
              // Escala os landmarks
              const scaledLandmarks = landmarks.map(landmark => ({
                ...landmark,
                // Usa o fator de escala definido no onloadedmetadata
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
