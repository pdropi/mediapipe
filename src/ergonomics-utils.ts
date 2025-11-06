// src/ergonomics-utils.ts

import { NormalizedLandmark } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// Interface para um ponto 2D simples
interface Point {
    x: number;
    y: number;
}

// Limiar de visibilidade ajustável (agora usado como fallback)
const VISIBILITY_THRESHOLD = 0.3;

/**
 * Verifica se um marco é considerado detectado.
 * Primeiro tenta usar 'visibility', se não for um número, considera detectado se x e y forem números válidos.
 * @param landmark O marco a ser verificado.
 * @returns Verdadeiro se o marco for considerado detectado, falso caso contrário.
 */
function isLandmarkDetected(landmark: NormalizedLandmark): boolean {
    // Verifica se 'visibility' é um número
    const vis = landmark.visibility;
    if (typeof vis === 'number' && !isNaN(vis)) {
        return vis >= VISIBILITY_THRESHOLD;
    }
    // Se 'visibility' não for um número, verifica x e y
    // Se x e y forem números válidos (não NaN), considera detectado
    return typeof landmark.x === 'number' && typeof landmark.y === 'number' && !isNaN(landmark.x) && !isNaN(landmark.y);
}

/**
 * Calcula o ponto médio (centro) entre os dois ombros,
 * que estima a base do pescoço (C7/T1).
 * @param leftShoulder Marco do ombro esquerdo.
 * @param rightShoulder Marco do ombro direito.
 * @returns Um objeto Point com as coordenadas X e Y do centro do ombro.
 */
function getMidShoulder(
    leftShoulder: NormalizedLandmark,
    rightShoulder: NormalizedLandmark
): Point {
    const x = (leftShoulder.x + rightShoulder.x) / 2;
    const y = (leftShoulder.y + rightShoulder.y) / 2;
    return { x, y };
}

/**
 * Calcula o ponto médio (centro) entre os dois quadris.
 * @param leftHip Marco do quadril esquerdo.
 * @param rightHip Marco do quadril direito.
 * @returns Um objeto Point com as coordenadas X e Y do centro do quadril.
 */
function getMidHip(
    leftHip: NormalizedLandmark,
    rightHip: NormalizedLandmark
): Point {
    const x = (leftHip.x + rightHip.x) / 2;
    const y = (leftHip.y + rightHip.y) / 2;
    return { x, y };
}

/**
 * Calcula o ângulo entre dois pontos e o eixo Y (vertical).
 * Esta função retorna 0° quando o vetor está alinhado com o eixo Y (postura ereta) e aumenta conforme o desvio.
 * @param x1 X da origem do vetor.
 * @param y1 Y da origem do vetor.
 * @param x2 X da extremidade do vetor.
 * @param y2 Y da extremidade do vetor.
 * @returns O ângulo em graus entre o vetor (x1,y1)->(x2,y2) e o eixo Y.
 */
export function findAngle(x1: number, y1: number, x2: number, y2: number): number {
    // Vetor da origem para a extremidade
    const deltaX = x2 - x1;
    const deltaY = y2 - y1;

    // O ângulo com o eixo Y (vertical) é calculado como o complementar do ângulo com o eixo X
    // Mas para a REBA, queremos 0° quando o vetor está vertical (deltaX=0)
    // Usamos atan2 para obter o ângulo completo
    let angleRad = Math.atan2(deltaY, deltaX); // Ângulo com o eixo X
    let angleDeg = angleRad * (180 / Math.PI);

    // O ângulo com o eixo Y é 90 - ângulo com o eixo X
    // Mas precisamos do valor absoluto do desvio da vertical
    // O desvio da vertical é o ângulo entre o vetor e (0, -1) (vetor vertical para cima)
    const verticalUpX = 0;
    const verticalUpY = -1; // Vetor apontando para cima no sistema de coordenadas da imagem
    const dotProduct = deltaX * verticalUpX + deltaY * verticalUpY; // = -deltaY
    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const magnitudeVertical = 1;

    if (magnitude > 0) {
        let angleRadBetween = Math.acos(dotProduct / (magnitude * magnitudeVertical));
        let angleDegBetween = angleRadBetween * (180 / Math.PI);
        // O acos retorna 0 a 180. Precisamos do sinal.
        // Se o vetor está à esquerda do eixo Y (deltaX < 0), o ângulo é negativo.
        if (deltaX < 0) {
            angleDegBetween *= -1;
        }
        // Para a REBA, queremos o desvio absoluto da vertical
        return Math.abs(angleDegBetween);
    } else {
        return 0; // Vetor nulo
    }
}

/**
 * Calcula o ângulo de inclinação do pescoço em relação à vertical (eixo Y).
 * Usa a ORELHA com maior visibilidade ou o NARIZ como referência da cabeça.
 * @param leftEar Marco da orelha esquerda.
 * @param rightEar Marco da orelha direita.
 * @param nose Marco do nariz.
 * @param midShoulder Ponto central entre os dois ombros (base do pescoço).
 * @returns O ângulo em graus, onde 0 graus é a postura ereta (vertical).
 * Ângulos positivos indicam flexão (cabeça para frente), negativos extensão (cabeça para trás).
 */
export function calculateNeckAngle(
    leftEar: NormalizedLandmark,
    rightEar: NormalizedLandmark,
    nose: NormalizedLandmark,
    midShoulder: Point
): number {
    // Escolhe a referência da cabeça com base na detecção (e visibilidade, se disponível)
    let headReference: NormalizedLandmark | null = null;
    const leftEarVis = leftEar.visibility;
    const rightEarVis = rightEar.visibility;
    const noseVis = nose.visibility;

    // Seleciona o marco com maior visibilidade que atenda ao limiar (ou qualquer um detectado se visibilidade for NaN)
    const leftEarDetected = isLandmarkDetected(leftEar);
    const rightEarDetected = isLandmarkDetected(rightEar);
    const noseDetected = isLandmarkDetected(nose);

    // Verifica se as visibilidades são números
    const leftEarVisIsNum = typeof leftEarVis === 'number' && !isNaN(leftEarVis);
    const rightEarVisIsNum = typeof rightEarVis === 'number' && !isNaN(rightEarVis);
    const noseVisIsNum = typeof noseVis === 'number' && !isNaN(noseVis);

    // Prioridade: Orelha com maior visibilidade (se for número), depois nariz (se for número), depois qualquer um detectado
    if (leftEarVisIsNum && rightEarVisIsNum && leftEarVis >= rightEarVis && leftEarVis >= noseVis) {
        if (leftEarDetected) headReference = leftEar;
    } else if (rightEarVisIsNum && leftEarVisIsNum && rightEarVis >= leftEarVis && rightEarVis >= noseVis) {
        if (rightEarDetected) headReference = rightEar;
    } else if (noseVisIsNum && noseVis > leftEarVis && noseVis > rightEarVis) {
        if (noseDetected) headReference = nose;
    } else {
        // Se visibilidade não for confiável, tenta orelha esquerda, depois direita, depois nariz
        if (leftEarDetected) {
            headReference = leftEar;
        } else if (rightEarDetected) {
            headReference = rightEar;
        } else if (noseDetected) {
            headReference = nose;
        }
    }

    if (!headReference) {
        return NaN; // Nenhuma referência válida encontrada
    }

    // Vetor do centro dos ombros para a referência da cabeça
    const neckAngleDeg = findAngle(midShoulder.x, midShoulder.y, headReference.x, headReference.y);
    return neckAngleDeg;
}

/**
 * Calcula o ângulo de inclinação do tronco em relação à vertical (eixo Y).
 * @param midShoulder Ponto central entre os dois ombros.
 * @param midHip Ponto central entre os dois quadris.
 * @returns O ângulo em graus, onde 0 graus é a postura ereta (vertical).
 * Ângulos positivos indicam inclinação para frente, negativos para trás.
 */
export function calculateTrunkAngle(
    midShoulder: Point,
    midHip: Point
): number {
    // Vetor do centro dos quadris para o centro dos ombros
    const trunkAngleDeg = findAngle(midHip.x, midHip.y, midShoulder.x, midShoulder.y);
    return trunkAngleDeg;
}

/**
 * Calcula o ângulo do cotovelo (ângulo interno entre o braço superior e o antebraço).
 * @param shoulder Marco do ombro correspondente.
 * @param elbow Marco do cotovelo.
 * @param wrist Marco do punho.
 * @returns O ângulo em graus. ~180 graus é o braço estendido.
 */
export function calculateElbowAngle(
    shoulder: NormalizedLandmark,
    elbow: NormalizedLandmark,
    wrist: NormalizedLandmark
): number {
    // Vetor do ombro para o cotovelo
    const v1x = elbow.x - shoulder.x;
    const v1y = elbow.y - shoulder.y;

    // Vetor do cotovelo para o punho
    const v2x = wrist.x - elbow.x;
    const v2y = wrist.y - elbow.y;

    // Produto escalar
    const dotProduct = v1x * v2x + v1y * v2y;

    // Magnitudes
    const magV1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const magV2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (magV1 > 0 && magV2 > 0) { // Evita divisão por zero
        // Ângulo em radianos
        let angleRad = Math.acos(dotProduct / (magV1 * magV2));

        // Converte para graus
        let elbowAngleDeg = angleRad * (180 / Math.PI);
        return elbowAngleDeg;
    } else {
        return 180; // Vetores nulos, assume braço estendido
    }
}

/**
 * Calcula o ângulo do braço (ângulo entre o eixo Y e o braço superior).
 * @param shoulder Marco do ombro correspondente.
 * @param elbow Marco do cotovelo.
 * @returns O ângulo em graus.
 */
export function calculateArmAngle(
    shoulder: NormalizedLandmark,
    elbow: NormalizedLandmark
): number {
    // Vetor do ombro para o cotovelo
    const armAngleDeg = findAngle(shoulder.x, shoulder.y, elbow.x, elbow.y);
    return armAngleDeg;
}

/**
 * Calcula o ângulo do antebraço (ângulo entre o eixo Y e o antebraço).
 * @param elbow Marco do cotovelo.
 * @param wrist Marco do punho.
 * @returns O ângulo em graus.
 */
export function calculateForearmAngle(
    elbow: NormalizedLandmark,
    wrist: NormalizedLandmark
): number {
    // Vetor do cotovelo para o punho
    const forearmAngleDeg = findAngle(elbow.x, elbow.y, wrist.x, wrist.y);
    return forearmAngleDeg;
}

/**
 * Calcula o ângulo do punho (ângulo entre o eixo Y e a mão).
 * @param wrist Marco do punho.
 * @param indexFinger Marco do dedo indicador (exemplo).
 * @returns O ângulo em graus.
 */
export function calculateWristAngle(
    wrist: NormalizedLandmark,
    indexFinger: NormalizedLandmark
): number {
    // Vetor do punho para o dedo indicador (exemplo)
    const wristAngleDeg = findAngle(wrist.x, wrist.y, indexFinger.x, indexFinger.y);
    return wristAngleDeg;
}

/**
 * Calcula o ângulo das pernas (ângulo entre o eixo Y e a coxa).
 * @param hip Marco do quadril correspondente.
 * @param knee Marco do joelho correspondente.
 * @returns O ângulo em graus.
 */
export function calculateLegAngle(
    hip: NormalizedLandmark,
    knee: NormalizedLandmark
): number {
    // Vetor do quadril para o joelho
    const legAngleDeg = findAngle(hip.x, hip.y, knee.x, knee.y);
    return legAngleDeg;
}

/**
 * Analisa os landmarks e calcula métricas ergonômicas básicas (ângulos).
 * Esta função não calcula tempo/frequência, apenas os ângulos atuais.
 */
export function analyzeErgonomics(landmarks: NormalizedLandmark[]): {
    neckAngle: number | null,
    trunkAngle: number | null,
    leftElbowAngle: number | null,
    rightElbowAngle: number | null,
    leftArmAngle: number | null,
    rightArmAngle: number | null,
    leftForearmAngle: number | null,
    rightForearmAngle: number | null,
    leftWristAngle: number | null,
    rightWristAngle: number | null,
    leftLegAngle: number | null,
    rightLegAngle: number | null
} {
    // Índices dos Landmarks do MediaPipe (PoseLandmarker.POSE_LANDMARKS)
    const LEFT_SHOULDER = 11;
    const RIGHT_SHOULDER = 12;
    const LEFT_EAR = 7;
    const RIGHT_EAR = 8;
    const NOSE = 0;
    const LEFT_ELBOW = 13;
    const RIGHT_ELBOW = 14;
    const LEFT_WRIST = 15;
    const RIGHT_WRIST = 16;
    const LEFT_HIP = 23;
    const RIGHT_HIP = 24;
    const LEFT_KNEE = 25; // Exemplo
    const RIGHT_KNEE = 26; // Exemplo
    const LEFT_INDEX = 19; // Exemplo para punho
    const RIGHT_INDEX = 20; // Exemplo para punho

    const requiredLandmarks = Math.max(
        RIGHT_INDEX, RIGHT_KNEE, RIGHT_WRIST, RIGHT_ELBOW, RIGHT_SHOULDER, RIGHT_EAR, NOSE, LEFT_HIP, RIGHT_HIP
    );

    if (landmarks.length <= requiredLandmarks) {
        return {
            neckAngle: null, trunkAngle: null,
            leftElbowAngle: null, rightElbowAngle: null,
            leftArmAngle: null, rightArmAngle: null,
            leftForearmAngle: null, rightForearmAngle: null,
            leftWristAngle: null, rightWristAngle: null,
            leftLegAngle: null, rightLegAngle: null
        };
    }

    const leftShoulder = landmarks[LEFT_SHOULDER];
    const rightShoulder = landmarks[RIGHT_SHOULDER];
    const leftEar = landmarks[LEFT_EAR];
    const rightEar = landmarks[RIGHT_EAR];
    const nose = landmarks[NOSE];
    const leftElbow = landmarks[LEFT_ELBOW];
    const rightElbow = landmarks[RIGHT_ELBOW];
    const leftWrist = landmarks[LEFT_WRIST];
    const rightWrist = landmarks[RIGHT_WRIST];
    const leftHip = landmarks[LEFT_HIP];
    const rightHip = landmarks[RIGHT_HIP];
    const leftKnee = landmarks[LEFT_KNEE]; // Exemplo
    const rightKnee = landmarks[RIGHT_KNEE]; // Exemplo
    const leftIndex = landmarks[LEFT_INDEX]; // Exemplo
    const rightIndex = landmarks[RIGHT_INDEX]; // Exemplo

    // Usar a função isLandmarkDetected para verificar
    const leftShoulderDetected = isLandmarkDetected(leftShoulder);
    const rightShoulderDetected = isLandmarkDetected(rightShoulder);
    const leftEarDetected = isLandmarkDetected(leftEar);
    const rightEarDetected = isLandmarkDetected(rightEar);
    const noseDetected = isLandmarkDetected(nose);
    const leftElbowDetected = isLandmarkDetected(leftElbow);
    const rightElbowDetected = isLandmarkDetected(rightElbow);
    const leftWristDetected = isLandmarkDetected(leftWrist);
    const rightWristDetected = isLandmarkDetected(rightWrist);
    const leftHipDetected = isLandmarkDetected(leftHip);
    const rightHipDetected = isLandmarkDetected(rightHip);
    const leftKneeDetected = isLandmarkDetected(leftKnee); // Exemplo
    const rightKneeDetected = isLandmarkDetected(rightKnee); // Exemplo
    const leftIndexDetected = isLandmarkDetected(leftIndex); // Exemplo
    const rightIndexDetected = isLandmarkDetected(rightIndex); // Exemplo

    // --- Cálculo do Ângulo do Pescoço (com orelha preferencialmente ou nariz) ---
    let neckAngle: number | null = null;
    if (
        leftShoulderDetected &&
        rightShoulderDetected &&
        (leftEarDetected || rightEarDetected || noseDetected) // Verifica se pelo menos uma referência da cabeça está detectada
    ) {
        const midShoulder = getMidShoulder(leftShoulder, rightShoulder);
        neckAngle = calculateNeckAngle(leftEar, rightEar, nose, midShoulder);
        if (isNaN(neckAngle)) neckAngle = null;
    }

    // --- Cálculo do Ângulo do Tronco ---
    let trunkAngle: number | null = null;
    if (
        leftShoulderDetected &&
        rightShoulderDetected &&
        leftHipDetected &&
        rightHipDetected
    ) {
        const midShoulder = getMidShoulder(leftShoulder, rightShoulder);
        const midHip = getMidHip(leftHip, rightHip);
        trunkAngle = calculateTrunkAngle(midShoulder, midHip);
    }

    // --- Cálculo do Ângulo do Cotovelo Esquerdo ---
    let leftElbowAngle: number | null = null;
    if (
        leftShoulderDetected &&
        leftElbowDetected &&
        leftWristDetected
    ) {
        leftElbowAngle = calculateElbowAngle(leftShoulder, leftElbow, leftWrist);
    }

    // --- Cálculo do Ângulo do Cotovelo Direito ---
    let rightElbowAngle: number | null = null;
    if (
        rightShoulderDetected &&
        rightElbowDetected &&
        rightWristDetected
    ) {
        rightElbowAngle = calculateElbowAngle(rightShoulder, rightElbow, rightWrist);
    }

    // --- Cálculo do Ângulo do Braço Esquerdo ---
    let leftArmAngle: number | null = null;
    if (
        leftShoulderDetected &&
        leftElbowDetected
    ) {
        leftArmAngle = calculateArmAngle(leftShoulder, leftElbow);
    }

    // --- Cálculo do Ângulo do Braço Direito ---
    let rightArmAngle: number | null = null;
    if (
        rightShoulderDetected &&
        rightElbowDetected
    ) {
        rightArmAngle = calculateArmAngle(rightShoulder, rightElbow);
    }

    // --- Cálculo do Ângulo do Antebraço Esquerdo ---
    let leftForearmAngle: number | null = null;
    if (
        leftElbowDetected &&
        leftWristDetected
    ) {
        leftForearmAngle = calculateForearmAngle(leftElbow, leftWrist);
    }

    // --- Cálculo do Ângulo do Antebraço Direito ---
    let rightForearmAngle: number | null = null;
    if (
        rightElbowDetected &&
        rightWristDetected
    ) {
        rightForearmAngle = calculateForearmAngle(rightElbow, rightWrist);
    }

    // --- Cálculo do Ângulo do Punho Esquerdo (exemplo com dedo) ---
    let leftWristAngle: number | null = null;
    if (
        leftWristDetected &&
        leftIndexDetected
    ) {
        leftWristAngle = calculateWristAngle(leftWrist, leftIndex);
    }

    // --- Cálculo do Ângulo do Punho Direito (exemplo com dedo) ---
    let rightWristAngle: number | null = null;
    if (
        rightWristDetected &&
        rightIndexDetected
    ) {
        rightWristAngle = calculateWristAngle(rightWrist, rightIndex);
    }

    // --- Cálculo do Ângulo da Perna Esquerda ---
    let leftLegAngle: number | null = null;
    if (
        leftHipDetected &&
        leftKneeDetected
    ) {
        leftLegAngle = calculateLegAngle(leftHip, leftKnee);
    }

    // --- Cálculo do Ângulo da Perna Direita ---
    let rightLegAngle: number | null = null;
    if (
        rightHipDetected &&
        rightKneeDetected
    ) {
        rightLegAngle = calculateLegAngle(rightHip, rightKnee);
    }

    return {
        neckAngle, trunkAngle,
        leftElbowAngle, rightElbowAngle,
        leftArmAngle, rightArmAngle,
        leftForearmAngle, rightForearmAngle,
        leftWristAngle, rightWristAngle,
        leftLegAngle, rightLegAngle
    };
}

// --- Estrutura de dados para armazenar informações REBA ---
export interface RebaData {
    trunk: {
        angle: number | null;
        exposureTime: number; // Tempo acumulado em segundos
        frequency: number;   // Eventos por minuto
        lastChangeTime: number; // Timestamp da última mudança significativa
        eventCount: number;  // Contador de eventos
        score: number;       // Pontuação calculada com base no tempo de exposição
        exposureTimeBins: { [key: string]: number }; // Tempo em cada faixa de ângulo
    };
    neck: {
        angle: number | null;
        exposureTime: number;
        frequency: number;
        lastChangeTime: number;
        eventCount: number;
        score: number;
        exposureTimeBins: { [key: string]: number };
    };
    legs: {
        angle: number | null;
        exposureTime: number;
        frequency: number;
        lastChangeTime: number;
        eventCount: number;
        score: number;
        exposureTimeBins: { [key: string]: number };
    };
    arm: {
        angle: number | null;
        exposureTime: number;
        frequency: number;
        lastChangeTime: number;
        eventCount: number;
        score: number;
        exposureTimeBins: { [key: string]: number };
    };
    forearm: {
        angle: number | null;
        exposureTime: number;
        frequency: number;
        lastChangeTime: number;
        eventCount: number;
        score: number;
        exposureTimeBins: { [key: string]: number };
    };
    wrist: {
        angle: number | null;
        exposureTime: number;
        frequency: number;
        lastChangeTime: number;
        eventCount: number;
        score: number;
        exposureTimeBins: { [key: string]: number };
    };
}

// --- Limiares para detecção de mudança (em graus) ---
const CHANGE_THRESHOLD = 5;

// --- Definição das faixas de ângulo e suas pontuações (Baseado no REBA Worksheet) ---
// Para o TRONCO:
// 0°-20° -> 1 ponto
// 20°-60° -> 2 pontos
// >60° -> 3 pontos
// Para o PESCOÇO:
// 0°-20° -> 1 ponto
// >20° -> 2 pontos
// Para as PERNAS:
// Pés bilaterais/andando/sentado -> 1 ponto
// Pés unilaterais/postura instável -> 2 pontos
// Para os BRAÇOS:
// 0°-20° -> 1 ponto
// 20°-60° -> 2 pontos
// >60° -> 3 pontos
// Para os ANTEBRAÇOS:
// 0°-20° -> 1 ponto
// 20°-60° -> 2 pontos
// >60° -> 3 pontos
// Para os PUNHOS:
// 0°-20° -> 1 ponto
// 20°-60° -> 2 pontos
// >60° -> 3 pontos
const REBA_ANGLE_BINS = {
    trunk: { "0-20": 1, "21-60": 2, "61+": 3 },
    neck: { "0-20": 1, "21+": 2 },
    legs: { "bilateral": 1, "unilateral": 2 }, // Não usa ângulo, usa postura
    arm: { "0-20": 1, "21-60": 2, "61+": 3 },
    forearm: { "0-20": 1, "21-60": 2, "61+": 3 },
    wrist: { "0-20": 1, "21-60": 2, "61+": 3 },
};

// --- Função para determinar a faixa de ângulo para TRONCO, PESCOÇO, BRAÇO, ANTEBRAÇO, PUNHO ---
function getRebaAngleBin(angle: number, component: keyof typeof REBA_ANGLE_BINS): string {
    const bins = REBA_ANGLE_BINS[component];
    const absAngle = Math.abs(angle); // Sempre positivo
    for (const [range, score] of Object.entries(bins)) {
        if (range.endsWith('+')) {
            const lower = parseInt(range.slice(0, -1));
            if (absAngle >= lower) return range;
        } else {
            const [lower, upper] = range.split('-').map(Number);
            if (absAngle >= lower && absAngle <= upper) return range;
        }
    }
    return "0-20"; // Faixa padrão se não encontrar nenhuma
}

// --- Função para determinar a faixa de ângulo para PERNAS (baseado em postura, não em ângulo) ---
function getLegsBin(leftHip: NormalizedLandmark, rightHip: NormalizedLandmark, leftKnee: NormalizedLandmark, rightKnee: NormalizedLandmark): string {
    // Esta é uma simplificação. Na prática, a REBA considera a postura dos pés (bilateral/unilateral) e a flexão dos joelhos.
    // Como não temos dados dos pés, vamos usar a diferença de altura entre os quadris e joelhos como proxy para a postura.
    // Se os joelhos estiverem muito abaixo dos quadris, pode ser uma postura instável.
    // Este é um placeholder. Em uma implementação completa, seria necessário detectar a postura dos pés.
    const leftHipY = leftHip.y;
    const rightHipY = rightHip.y;
    const leftKneeY = leftKnee.y;
    const rightKneeY = rightKnee.y;

    // Se ambos os joelhos estiverem abaixo dos quadris, pode ser uma postura instável
    if (leftKneeY > leftHipY && rightKneeY > rightHipY) {
        return "unilateral"; // Proxy para postura instável
    } else {
        return "bilateral"; // Proxy para postura estável
    }
}

// --- Função para calcular a pontuação com base no tempo acumulado em faixas ---
// Exemplo: pontuação é a da faixa com mais tempo acumulado.
function calculateScoreFromBins(bins: { [key: string]: number }, component: keyof typeof REBA_ANGLE_BINS): number {
    if (Object.keys(bins).length === 0) return 0;

    let maxTime = 0;
    let scoreForMaxTime = 0;

    for (const [range, time] of Object.entries(bins)) {
        if (time > maxTime) {
            maxTime = time;
            scoreForMaxTime = REBA_ANGLE_BINS[component][range] || 0; // Pontuação da faixa com mais tempo
        }
    }
    return scoreForMaxTime;
}

// --- Inicializa os dados REBA ---
export const initialRebaData: RebaData = {
    trunk: {
        angle: null,
        exposureTime: 0,
        frequency: 0,
        lastChangeTime: 0,
        eventCount: 0,
        score: 0,
        exposureTimeBins: { "0-20": 0, "21-60": 0, "61+": 0 } // Inicializa bins
    },
    neck: {
        angle: null,
        exposureTime: 0,
        frequency: 0,
        lastChangeTime: 0,
        eventCount: 0,
        score: 0,
        exposureTimeBins: { "0-20": 0, "21+": 0 }
    },
    legs: {
        angle: null,
        exposureTime: 0,
        frequency: 0,
        lastChangeTime: 0,
        eventCount: 0,
        score: 0,
        exposureTimeBins: { "bilateral": 0, "unilateral": 0 }
    },
    arm: {
        angle: null,
        exposureTime: 0,
        frequency: 0,
        lastChangeTime: 0,
        eventCount: 0,
        score: 0,
        exposureTimeBins: { "0-20": 0, "21-60": 0, "61+": 0 }
    },
    forearm: {
        angle: null,
        exposureTime: 0,
        frequency: 0,
        lastChangeTime: 0,
        eventCount: 0,
        score: 0,
        exposureTimeBins: { "0-20": 0, "21-60": 0, "61+": 0 }
    },
    wrist: {
        angle: null,
        exposureTime: 0,
        frequency: 0,
        lastChangeTime: 0,
        eventCount: 0,
        score: 0,
        exposureTimeBins: { "0-20": 0, "21-60": 0, "61+": 0 }
    }
};

/**
 * Atualiza os dados REBA com base nos ângulos atuais e no tempo decorrido.
 * @param rebaData Dados REBA atuais.
 * @param newAngles Ângulos calculados mais recentes.
 * @param currentTime Tempo atual em milissegundos (performance.now()).
 * @param deltaTime Tempo decorrido desde a última atualização em segundos.
 * @returns Dados REBA atualizados.
 */
export function updateRebaData(rebaData: RebaData, newAngles: ReturnType<typeof analyzeErgonomics>, currentTime: number, deltaTime: number): RebaData {
    const updatedData = { ...rebaData };

    // Função auxiliar para atualizar um componente
    const updateComponent = (componentKey: keyof RebaData, newAngle: number | null, landmarks: NormalizedLandmark[]) => {
        const component = updatedData[componentKey];
        if (newAngle === null) {
            // Se o ângulo não for detectado, mantém os dados anteriores
            // Atualiza a pontuação com base nos bins atuais
            component.score = calculateScoreFromBins(component.exposureTimeBins, componentKey);
            return { ...component, angle: null };
        }

        // Atualiza o ângulo atual (usando o valor absoluto)
        const currentAngle = Math.abs(newAngle); // Sempre positivo

        // Verifica se houve uma mudança significativa (opcional para eventos de frequência)
        const angleChanged = Math.abs(currentAngle - (component.angle ?? currentAngle)) > CHANGE_THRESHOLD;

        if (angleChanged) {
            // Incrementa o contador de eventos (opcional, pode ser removido se for apenas tempo)
            component.eventCount++;
            // Atualiza o timestamp da última mudança (opcional)
            component.lastChangeTime = currentTime;
        }

        // Atualiza o tempo de exposição (acumula o tempo delta)
        component.exposureTime += deltaTime;

        // Determina a faixa de ângulo atual
        let bin = "";
        if (componentKey === 'legs') {
            // Para pernas, usa a função específica
            bin = getLegsBin(
                landmarks[23], // LEFT_HIP
                landmarks[24], // RIGHT_HIP
                landmarks[25], // LEFT_KNEE
                landmarks[26]  // RIGHT_KNEE
            );
        } else {
            bin = getRebaAngleBin(currentAngle, componentKey);
        }

        // Acumula o tempo delta na faixa correspondente
        if (component.exposureTimeBins.hasOwnProperty(bin)) {
            component.exposureTimeBins[bin] += deltaTime;
        } else {
            // Caso a faixa não exista, adiciona (isso não deve acontecer com a definição de REBA_ANGLE_BINS)
            component.exposureTimeBins[bin] = deltaTime;
        }

        // Atualiza a frequência: eventos / (tempo total em minutos) - mantido para compatibilidade
        const totalTimeInMinutes = component.exposureTime / 60;
        if (totalTimeInMinutes > 0) {
            component.frequency = component.eventCount / totalTimeInMinutes;
        } else {
            component.frequency = 0;
        }

        // Atualiza o ângulo (absoluto)
        component.angle = currentAngle;

        // Atualiza a pontuação com base nos bins
        component.score = calculateScoreFromBins(component.exposureTimeBins, componentKey);

        return { ...component };
    };

    updatedData.trunk = updateComponent('trunk', newAngles.trunkAngle, landmarks);
    updatedData.neck = updateComponent('neck', newAngles.neckAngle, landmarks);
    // Para pernas, braço, antebraço e punho, vamos usar a média dos lados direito e esquerdo detectados
    // ou o primeiro disponível detectado.
    const avgLegAngle = (newAngles.leftLegAngle !== null && newAngles.rightLegAngle !== null) ?
        (Math.abs(newAngles.leftLegAngle) + Math.abs(newAngles.rightLegAngle)) / 2 : // Média dos absolutos
        (newAngles.leftLegAngle !== null ? Math.abs(newAngles.leftLegAngle) : (newAngles.rightLegAngle !== null ? Math.abs(newAngles.rightLegAngle) : null));
    updatedData.legs = updateComponent('legs', avgLegAngle, landmarks);

    const avgArmAngle = (newAngles.leftArmAngle !== null && newAngles.rightArmAngle !== null) ?
        (Math.abs(newAngles.leftArmAngle) + Math.abs(newAngles.rightArmAngle)) / 2 :
        (newAngles.leftArmAngle !== null ? Math.abs(newAngles.leftArmAngle) : (newAngles.rightArmAngle !== null ? Math.abs(newAngles.rightArmAngle) : null));
    updatedData.arm = updateComponent('arm', avgArmAngle, landmarks);

    const avgForearmAngle = (newAngles.leftForearmAngle !== null && newAngles.rightForearmAngle !== null) ?
        (Math.abs(newAngles.leftForearmAngle) + Math.abs(newAngles.rightForearmAngle)) / 2 :
        (newAngles.leftForearmAngle !== null ? Math.abs(newAngles.leftForearmAngle) : (newAngles.rightForearmAngle !== null ? Math.abs(newAngles.rightForearmAngle) : null));
    updatedData.forearm = updateComponent('forearm', avgForearmAngle, landmarks);

    const avgWristAngle = (newAngles.leftWristAngle !== null && newAngles.rightWristAngle !== null) ?
        (Math.abs(newAngles.leftWristAngle) + Math.abs(newAngles.rightWristAngle)) / 2 :
        (newAngles.leftWristAngle !== null ? Math.abs(newAngles.leftWristAngle) : (newAngles.rightWristAngle !== null ? Math.abs(newAngles.rightWristAngle) : null));
    updatedData.wrist = updateComponent('wrist', avgWristAngle, landmarks);

    return updatedData;
}