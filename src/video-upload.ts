// src/video-upload.ts

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
  PoseLandmarkerResult,
  NormalizedLandmark,
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// Importa os utilitários e dados REBA.
import { analyzeErgonomics, calculateReliability } from "./ergonomics-utils.ts";
import { updateRebaData, initialRebaData, RebaData, getRebaRiskLevel } from "./reba-utils.ts";
// Importa os utilitários e dados NIOSH (placeholder).
import { initialNioshData, NioshData, updateNioshData, getNioshRiskLevel } from "./niosh-utils.ts";

const demosSection = document.getElementById("demos");
let poseLandmarker: PoseLandmarker = undefined;
let angleDisplay: HTMLParagraphElement; // Elemento para exibir os dados REBA
let riskDisplay: HTMLParagraphElement; // Elemento para exibir o risco REBA

// Variável global para armazenar o score de força
let globalForceLoadScore = 0;

const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm" // URL correta
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

  // Cria e anexa o elemento de exibição dos dados REBA (Painel)
  angleDisplay = document.createElement('p');
  angleDisplay.id = 'angleDisplay';
  angleDisplay.style.cssText = 'position: absolute; top: 10px; left: 10px; color: white; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px; z-index: 10; font-weight: bold; font-family: monospace; font-size: 14px; line-height: 1.4; max-width: 400px; white-space: pre-line;';
  const videoContainer = document.getElementById("uploadedVideoContainer");
  if (videoContainer) videoContainer.appendChild(angleDisplay);

  // Cria e anexa o elemento de exibição do risco REBA
  riskDisplay = document.createElement('p');
  riskDisplay.id = 'rebaRiskDisplay';
  riskDisplay.style.cssText = 'position: absolute; top: 10px; right: 10px; color: white; background: rgba(139, 0, 0, 0.7); padding: 10px; border-radius: 5px; z-index: 10; font-weight: bold; font-family: monospace; font-size: 14px; line-height: 1.4; max-width: 300px; white-space: pre-line;';
  if (videoContainer) videoContainer.appendChild(riskDisplay);

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
  let lastTimestamp = performance.now(); // Para calcular deltaTime

  // Armazena os dados REBA
  let currentRebaData: RebaData = initialRebaData;

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
    if (riskDisplay) {
        riskDisplay.textContent = 'Risco: -';
        riskDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Reset cor para padrão
    }

    // Reset dados REBA
    currentRebaData = initialRebaData;

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

      // Exibe o diálogo para informar a carga
      showCargaDialog();
    };

    uploadedVideo.onplay = () => {
      console.log("▶️ Video started. Starting prediction loop...");
      if (!uploadVideoPredicting) {
        uploadVideoPredicting = true;
        lastUploadVideoTime = -1;
        lastTimestamp = performance.now(); // Reinicia o timestamp
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
      if (angleDisplay) {
          // Exibe o resumo final ao terminar
          let finalText = "Análise Concluída - Resumo Final:\n";
          finalText += `Tronco - Pontuação: ${currentRebaData.trunk.score}, Tempo: ${currentRebaData.trunk.exposureTime.toFixed(1)}s\n`;
          finalText += `Pescoço - Pontuação: ${currentRebaData.neck.score}, Tempo: ${currentRebaData.neck.exposureTime.toFixed(1)}s\n`;
          finalText += `Pernas - Pontuação: ${currentRebaData.legs.score}, Tempo: ${currentRebaData.legs.exposureTime.toFixed(1)}s\n`;
          finalText += `Braço - Pontuação: ${currentRebaData.arm.score}, Tempo: ${currentRebaData.arm.exposureTime.toFixed(1)}s\n`;
          finalText += `Antebraço - Pontuação: ${currentRebaData.forearm.score}, Tempo: ${currentRebaData.forearm.exposureTime.toFixed(1)}s\n`;
          finalText += `Punho - Pontuação: ${currentRebaData.wrist.score}, Tempo: ${currentRebaData.wrist.exposureTime.toFixed(1)}s\n`;
          angleDisplay.textContent = finalText;
      }
      if (riskDisplay) {
          const riskLevel = getRebaRiskLevel(currentRebaData.rebaScoreFinal);
          riskDisplay.textContent = `Risco Final: ${riskLevel}\nPontuação: ${currentRebaData.rebaScoreFinal}`;
          // Define a cor de fundo com base no score final
          let bgColor = 'rgba(0, 0, 0, 0.7)'; // Preto semi-transparente como padrão
          if (currentRebaData.rebaScoreFinal <= 1) {
              bgColor = 'rgba(0, 100, 0, 0.7)'; // Verde escuro para negligible
          } else if (currentRebaData.rebaScoreFinal <= 3) {
              bgColor = 'rgba(173, 216, 230, 0.7)'; // Azul claro para low
          } else if (currentRebaData.rebaScoreFinal <= 7) {
              bgColor = 'rgba(255, 255, 0, 0.7)'; // Amarelo para medium
          } else if (currentRebaData.rebaScoreFinal <= 10) {
              bgColor = 'rgba(255, 165, 0, 0.7)'; // Laranja para high
          } else {
              bgColor = 'rgba(139, 0, 0, 0.7)'; // Vermelho escuro para very high
          }
          riskDisplay.style.backgroundColor = bgColor;
      }
    };

    uploadedVideo.onerror = (err) => {
      console.error("❌ Video error:", err);
      uploadVideoPredicting = false;
    };
  }

  // Função para exibir o diálogo e capturar o valor da carga
  function showCargaDialog() {
    // Cria o diálogo dinamicamente se não existir
    let dialog = document.getElementById('cargaDialog') as HTMLDialogElement;
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'cargaDialog';
        dialog.innerHTML = `
            <form method="dialog">
                <h3>Informe a carga manual:</h3>
                <label for="cargaSelect">Carga:</label>
                <select id="cargaSelect" name="carga">
                    <option value="0">carga menor que 2kg</option>
                    <option value="1">carga entre 2kg a 10kg</option>
                    <option value="2">carga acima de 10kg</option>
                </select>
                <br><br>
                <button type="submit">Confirmar</button>
            </form>
        `;
        document.body.appendChild(dialog);
        dialog.addEventListener('close', (event) => {
            // Quando o diálogo é fechado (por submit ou esc), obtenha o valor
            const selectedValue = (document.getElementById('cargaSelect') as HTMLSelectElement).value;
            // Converta para número
            globalForceLoadScore = parseInt(selectedValue, 10);
            // Valide o valor
            if (isNaN(globalForceLoadScore) || globalForceLoadScore < 0 || globalForceLoadScore > 2) {
                globalForceLoadScore = 0; // Valor padrão se inválido
            }
            console.log("Carga selecionada (forceLoadScore):", globalForceLoadScore);
        });
    }
    dialog.showModal(); // Exibe o diálogo
  }

  async function predictUploadedVideo() {
    if (!poseLandmarker || !uploadVideoPredicting || uploadedVideo.ended || uploadedVideo.paused) {
      uploadVideoPredicting = false;
      return;
    }

    const now = performance.now();
    const deltaTime = (now - lastTimestamp) / 1000; // Converte para segundos
    lastTimestamp = now; // Atualiza o timestamp para a próxima iteração

    if (uploadedVideo.currentTime !== lastUploadVideoTime) {
      lastUploadVideoTime = uploadedVideo.currentTime;

      try {
        // Processa no canvas temporário
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(uploadedVideo, 0, 0, tempCanvas.width, tempCanvas.height);

        poseLandmarker.detectForVideo(tempCanvas, now, (result: PoseLandmarkerResult) => {
          uploadCtx.clearRect(0, 0, uploadCanvas.width, uploadCanvas.height);

          if (result.landmarks && result.landmarks.length > 0) {
            // Assume a primeira pose como a principal
            const landmarks: NormalizedLandmark[] = result.landmarks[0];

            // --- REMOÇÃO DA CONFIABILIDADE ---
            // A lógica de "Procurando..." agora depende apenas da detecção de landmarks e do cálculo interno em analyzeErgonomics/updateRebaData
            // Se analyzeErgonomics não conseguir calcular um ângulo, ele retornará null, e updateRebaData usará isso.
            // O desenho do MediaPipe ainda será feito, mas os dados REBA serão marcados como "Não detectado".

            // 1. Cálculo dos ângulos ergonômicos (básicos)
            const currentAngles = analyzeErgonomics(landmarks);

            // 2. Atualiza os dados REBA - Agora passa os landmarks
            // Define o forceLoadScore base antes de chamar updateRebaData
            currentRebaData.forceLoadScore = globalForceLoadScore;
            currentRebaData = updateRebaData(currentRebaData, currentAngles, now, deltaTime, landmarks);

            // 3. Exibição dos dados REBA formatados (Apenas para a primeira pose detectada)
            if (angleDisplay) {
                let displayText = "";
                // Formatação conforme o exemplo fornecido, adicionando a pontuação
                if (currentRebaData.trunk.angle !== null) {
                    displayText += `Tronco\nÂngulo: ${currentRebaData.trunk.angle.toFixed(1)}°\nTempo de exposição: ${currentRebaData.trunk.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.trunk.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.trunk.score}\n\n`;
                } else {
                    displayText += `Tronco\nÂngulo: Não detectado\nTempo de exposição: ${currentRebaData.trunk.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.trunk.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.trunk.score}\n\n`;
                }

                if (currentRebaData.neck.angle !== null) {
                    displayText += `Pescoço\nÂngulo: ${currentRebaData.neck.angle.toFixed(1)}°\nTempo de exposição: ${currentRebaData.neck.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.neck.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.neck.score}\n\n`;
                } else {
                    displayText += `Pescoço\nÂngulo: Não detectado\nTempo de exposição: ${currentRebaData.neck.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.neck.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.neck.score}\n\n`;
                }

                if (currentRebaData.legs.angle !== null) {
                    displayText += `Pernas\nÂngulo: ${currentRebaData.legs.angle.toFixed(1)}°\nTempo de exposição: ${currentRebaData.legs.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.legs.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.legs.score}\n\n`;
                } else {
                    displayText += `Pernas\nÂngulo: Não detectado\nTempo de exposição: ${currentRebaData.legs.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.legs.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.legs.score}\n\n`;
                }

                if (currentRebaData.arm.angle !== null) {
                    displayText += `Braço\nÂngulo: ${currentRebaData.arm.angle.toFixed(1)}°\nTempo de exposição: ${currentRebaData.arm.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.arm.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.arm.score}\n\n`;
                } else {
                    displayText += `Braço\nÂngulo: Não detectado\nTempo de exposição: ${currentRebaData.arm.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.arm.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.arm.score}\n\n`;
                }

                if (currentRebaData.forearm.angle !== null) {
                    displayText += `Antebraço\nÂngulo: ${currentRebaData.forearm.angle.toFixed(1)}°\nTempo de exposição: ${currentRebaData.forearm.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.forearm.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.forearm.score}\n\n`;
                } else {
                    displayText += `Antebraço\nÂngulo: Não detectado\nTempo de exposição: ${currentRebaData.forearm.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.forearm.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.forearm.score}\n\n`;
                }

                if (currentRebaData.wrist.angle !== null) {
                    displayText += `Punho\nÂngulo: ${currentRebaData.wrist.angle.toFixed(1)}°\nTempo de exposição: ${currentRebaData.wrist.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.wrist.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.wrist.score}\n\n`;
                } else {
                    displayText += `Punho\nÂngulo: Não detectado\nTempo de exposição: ${currentRebaData.wrist.exposureTime.toFixed(1)}s\nFrequência: ${currentRebaData.wrist.frequency.toFixed(1)}/min\nPontuação: ${currentRebaData.wrist.score}\n\n`;
                }

                // Remove a última quebra de linha extra
                displayText = displayText.trimEnd();

                angleDisplay.textContent = displayText;
            }

            // 4. Exibe o risco REBA e atualiza a cor
            if (riskDisplay) {
                const riskLevel = getRebaRiskLevel(currentRebaData.rebaScoreFinal);
                // Exibe Score C e Score Final
                riskDisplay.textContent = `Risco: ${riskLevel}\nScore C: ${currentRebaData.tableCScore}\nScore Final: ${currentRebaData.rebaScoreFinal}`;
                // Define a cor de fundo com base no score final
                let bgColor = 'rgba(0, 0, 0, 0.7)'; // Preto semi-transparente como padrão
                if (currentRebaData.rebaScoreFinal <= 1) {
                    bgColor = 'rgba(0, 100, 0, 0.7)'; // Verde escuro para negligible
                } else if (currentRebaData.rebaScoreFinal <= 3) {
                    bgColor = 'rgba(173, 216, 230, 0.7)'; // Azul claro para low
                } else if (currentRebaData.rebaScoreFinal <= 7) {
                    bgColor = 'rgba(255, 255, 0, 0.7)'; // Amarelo para medium
                } else if (currentRebaData.rebaScoreFinal <= 10) {
                    bgColor = 'rgba(255, 165, 0, 0.7)'; // Laranja para high
                } else {
                    bgColor = 'rgba(139, 0, 0, 0.7)'; // Vermelho escuro para very high
                }
                riskDisplay.style.backgroundColor = bgColor;
            }

            // --- Desenho DOS ELEMENTOS VISUAIS (Linhas Ergonômicas e MediaPipe) ---
            // Índices dos landmarks
            const LEFT_SHOULDER = 11;
            const RIGHT_SHOULDER = 12;
            const LEFT_EAR = 7;
            const RIGHT_EAR = 8;
            const NOSE = 0;
            const LEFT_HIP = 23;
            const RIGHT_HIP = 24;

            // Função auxiliar para obter coordenadas escalonadas de um landmark, se detectado
            const getLandmarkPoint = (index: number) => {
                if (index < landmarks.length) {
                    const lm = landmarks[index];
                    // Verifica se o landmark foi detectado (x, y são números válidos)
                    if (typeof lm.x === 'number' && typeof lm.y === 'number' && !isNaN(lm.x) && !isNaN(lm.y)) {
                        return { x: lm.x * (window as any).scaleX, y: lm.y * (window as any).scaleY };
                    }
                }
                return null;
            };

            // Função para desenhar uma linha entre dois pontos com cor específica e espessura
            const drawLine = (p1: {x: number, y: number} | null, p2: {x: number, y: number} | null, color: string, width: number = 3) => {
                if (p1 && p2) {
                    uploadCtx.beginPath();
                    uploadCtx.moveTo(p1.x, p1.y);
                    uploadCtx.lineTo(p2.x, p2.y);
                    uploadCtx.strokeStyle = color;
                    uploadCtx.lineWidth = width;
                    uploadCtx.stroke();
                }
            };

            // Função para desenhar um círculo em um ponto com cor específica
            const drawPoint = (point: {x: number, y: number} | null, color: string, radius: number = 5) => {
                if (point) {
                    uploadCtx.beginPath();
                    uploadCtx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
                    uploadCtx.fillStyle = color;
                    uploadCtx.fill();
                }
            };

            // --- Desenho do Pescoço (Linha entre ombro e cabeça) ---
            // Encontra a referência da cabeça (mesma lógica de analyzeErgonomics)
            const leftEarPoint = getLandmarkPoint(LEFT_EAR);
            const rightEarPoint = getLandmarkPoint(RIGHT_EAR);
            const nosePoint = getLandmarkPoint(NOSE);

            let headRefPoint: {x: number, y: number} | null = null;
            const leftEarVis = leftEarPoint ? landmarks[LEFT_EAR].visibility || 0 : 0;
            const rightEarVis = rightEarPoint ? landmarks[RIGHT_EAR].visibility || 0 : 0;
            const noseVis = nosePoint ? landmarks[NOSE].visibility || 0 : 0;

            // Prioridade: Orelha com maior visibilidade, depois nariz
            if (leftEarVis >= rightEarVis && leftEarVis >= noseVis && leftEarPoint) {
                headRefPoint = leftEarPoint;
            } else if (rightEarVis >= leftEarVis && rightEarVis >= noseVis && rightEarPoint) {
                headRefPoint = rightEarPoint;
            } else if (noseVis > leftEarVis && noseVis > rightEarVis && nosePoint) {
                headRefPoint = nosePoint;
            }

            const leftShoulderPoint = getLandmarkPoint(LEFT_SHOULDER);
            const rightShoulderPoint = getLandmarkPoint(RIGHT_SHOULDER);
            const midShoulderPoint = leftShoulderPoint && rightShoulderPoint ?
                { x: (leftShoulderPoint.x + rightShoulderPoint.x) / 2, y: (leftShoulderPoint.y + rightShoulderPoint.y) / 2 } : null;

            if (headRefPoint && midShoulderPoint) {
                let neckLineColor = 'lime'; // Padrão
                if (currentRebaData.neck.angle !== null && Math.abs(currentRebaData.neck.angle) > 25) neckLineColor = 'red';
                else if (currentRebaData.neck.angle !== null && Math.abs(currentRebaData.neck.angle) > 15) neckLineColor = 'yellow';
                drawLine(midShoulderPoint, headRefPoint, neckLineColor, 4); // Linha mais grossa
            }

            // --- Desenho do Tronco (Linha entre quadril e ombro) ---
            const leftHipPoint = getLandmarkPoint(LEFT_HIP);
            const rightHipPoint = getLandmarkPoint(RIGHT_HIP);
            const midHipPoint = leftHipPoint && rightHipPoint ?
                { x: (leftHipPoint.x + rightHipPoint.x) / 2, y: (leftHipPoint.y + rightHipPoint.y) / 2 } : null;

            if (midShoulderPoint && midHipPoint) {
                let trunkLineColor = 'lime'; // Padrão
                if (currentRebaData.trunk.angle !== null && Math.abs(currentRebaData.trunk.angle) > 10) trunkLineColor = 'red';
                else if (currentRebaData.trunk.angle !== null && Math.abs(currentRebaData.trunk.angle) > 5) trunkLineColor = 'yellow';
                drawLine(midHipPoint, midShoulderPoint, trunkLineColor, 4); // Linha mais grossa
            }

            // --- Desenho dos Landmarks e Conexões (do MediaPipe) DEPOIS ---
            // Escala os landmarks
            const scaledLandmarks = landmarks.map(landmark => ({
              ...landmark,
              // Usa o fator de escala definido no onloadedmetadata
              x: landmark.x * (window as any).scaleX,
              y: landmark.y * (window as any).scaleY
            }));

            // Desenha as conexões padrão do MediaPipe (sobrepostas pelas linhas ergonômicas)
            uploadDrawingUtils.drawConnectors(
              scaledLandmarks,
              PoseLandmarker.POSE_CONNECTIONS
            );
            // Desenha os pontos padrão do MediaPipe (sobrepostos pelos pontos ergonômicos)
            uploadDrawingUtils.drawLandmarks(scaledLandmarks, {
              radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
            });

            // --- Desenho de Pontos Adicionais (Opcional) POR ÚLTIMO ---
            // Desenha círculos nos pontos usados para os cálculos, com cores baseadas no status
            // Ponto do meio dos ombros (base do pescoço)
            if (midShoulderPoint) {
                drawPoint(midShoulderPoint, 'white', 6); // Um pouco maior
            }
            // Ponto do meio dos quadris
            if (midHipPoint) {
                drawPoint(midHipPoint, 'yellow', 6); // Um pouco maior
            }
            // Ponto da cabeça (referência usada)
            if (headRefPoint) {
                drawPoint(headRefPoint, 'white', 6); // Um pouco maior
            }
          } else {
             // Se não houver landmarks detectados
             if (angleDisplay) angleDisplay.textContent = 'Procurando...';
             if (riskDisplay) {
                 riskDisplay.textContent = 'Risco: -';
                 riskDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Cor padrão
             }
             // Limpa o canvas de desenho se não houver landmarks
             uploadCtx.clearRect(0, 0, uploadCanvas.width, uploadCanvas.height);
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