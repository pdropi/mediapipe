// src/ergonomics-utils.ts

import { NormalizedLandmark } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// Interface para um ponto 2D simples
interface Point {
    x: number;
    y: number;
}

// Limiar de visibilidade ajustável
const VISIBILITY_THRESHOLD = 0.3;

/**
 * Verifica se um marco é considerado detectado.
 * @param landmark O marco a ser verificado.
 * @returns Verdadeiro se o marco for considerado detectado, falso caso contrário.
 */
export function isLandmarkDetected(landmark: NormalizedLandmark): boolean {
    const vis = landmark.visibility;
    if (typeof vis === 'number' && !isNaN(vis)) {
        return vis >= VISIBILITY_THRESHOLD;
    }
    return typeof landmark.x === 'number' && typeof landmark.y === 'number' && !isNaN(landmark.x) && !isNaN(landmark.y);
}

/**
 * Calcula o ponto médio entre os dois ombros.
 * @param leftShoulder Marco do ombro esquerdo.
 * @param rightShoulder Marco do ombro direito.
 * @returns Um objeto Point com as coordenadas do centro do ombro.
 */
export function getMidShoulder(
    leftShoulder: NormalizedLandmark,
    rightShoulder: NormalizedLandmark
): Point {
    const x = (leftShoulder.x + rightShoulder.x) / 2;
    const y = (leftShoulder.y + rightShoulder.y) / 2;
    return { x, y };
}

/**
 * Calcula o ponto médio entre os dois quadris.
 * @param leftHip Marco do quadril esquerdo.
 * @param rightHip Marco do quadril direito.
 * @returns Um objeto Point com as coordenadas do centro do quadril.
 */
export function getMidHip(
    leftHip: NormalizedLandmark,
    rightHip: NormalizedLandmark
): Point {
    const x = (leftHip.x + rightHip.x) / 2;
    const y = (leftHip.y + rightHip.y) / 2;
    return { x, y };
}

/**
 * Calcula o ângulo entre dois pontos e o eixo Y (vertical).
 * @param x1 X da origem do vetor.
 * @param y1 Y da origem do vetor.
 * @param x2 X da extremidade do vetor.
 * @param y2 Y da extremidade do vetor.
 * @returns O ângulo em graus.
 */
export function findAngle(x1: number, y1: number, x2: number, y2: number): number {
    const deltaX = x2 - x1;
    const deltaY = y2 - y1;
    const verticalUpX = 0;
    const verticalUpY = -1;
    const dotProduct = deltaX * verticalUpX + deltaY * verticalUpY;
    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const magnitudeVertical = 1;

    if (magnitude > 0) {
        let angleRadBetween = Math.acos(dotProduct / (magnitude * magnitudeVertical));
        let angleDegBetween = angleRadBetween * (180 / Math.PI);
        if (deltaX < 0) angleDegBetween *= -1;
        return Math.abs(angleDegBetween);
    } else {
        return 0;
    }
}

/**
 * Calcula o ângulo entre dois pontos e o eixo Y NEGATIVO (postura ereta).
 * @param x1 X da origem do vetor.
 * @param y1 Y da origem do vetor.
 * @param x2 X da extremidade do vetor.
 * @param y2 Y da extremidade do vetor.
 * @returns O ângulo em graus.
 */
export function findAngleForLimbs(x1: number, y1: number, x2: number, y2: number): number {
    const deltaX = x2 - x1;
    const deltaY = y2 - y1;
    const verticalDownX = 0;
    const verticalDownY = 1;
    const dotProduct = deltaX * verticalDownX + deltaY * verticalDownY;
    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const magnitudeVertical = 1;

    if (magnitude > 0) {
        let angleRadBetween = Math.acos(dotProduct / (magnitude * magnitudeVertical));
        let angleDegBetween = angleRadBetween * (180 / Math.PI);
        if (deltaX < 0) angleDegBetween *= -1;
        return Math.abs(angleDegBetween);
    } else {
        return 0;
    }
}

/**
 * Calcula o ângulo de inclinação do pescoço.
 * @param leftEar Marco da orelha esquerda.
 * @param rightEar Marco da orelha direita.
 * @param nose Marco do nariz.
 * @param midShoulder Ponto central entre os ombros.
 * @returns O ângulo em graus.
 */
export function calculateNeckAngle(
    leftEar: NormalizedLandmark,
    rightEar: NormalizedLandmark,
    nose: NormalizedLandmark,
    midShoulder: Point
): number {
    let headReference: NormalizedLandmark | null = null;
    const leftEarVis = leftEar.visibility;
    const rightEarVis = rightEar.visibility;
    const noseVis = nose.visibility;

    const leftEarDetected = isLandmarkDetected(leftEar);
    const rightEarDetected = isLandmarkDetected(rightEar);
    const noseDetected = isLandmarkDetected(nose);

    const leftEarVisIsNum = typeof leftEarVis === 'number' && !isNaN(leftEarVis);
    const rightEarVisIsNum = typeof rightEarVis === 'number' && !isNaN(rightEarVis);
    const noseVisIsNum = typeof noseVis === 'number' && !isNaN(noseVis);

    if (leftEarVisIsNum && rightEarVisIsNum && leftEarVis >= rightEarVis && leftEarVis >= noseVis) {
        if (leftEarDetected) headReference = leftEar;
    } else if (rightEarVisIsNum && leftEarVisIsNum && rightEarVis >= leftEarVis && rightEarVis >= noseVis) {
        if (rightEarDetected) headReference = rightEar;
    } else if (noseVisIsNum && noseVis > leftEarVis && noseVis > rightEarVis) {
        if (noseDetected) headReference = nose;
    } else {
        if (leftEarDetected) headReference = leftEar;
        else if (rightEarDetected) headReference = rightEar;
        else if (noseDetected) headReference = nose;
    }

    if (!headReference) return NaN;

    const neckAngleDeg = findAngle(midShoulder.x, midShoulder.y, headReference.x, headReference.y);
    return neckAngleDeg;
}

/**
 * Calcula o ângulo de inclinação do tronco.
 * @param midShoulder Ponto central entre os ombros.
 * @param midHip Ponto central entre os quadris.
 * @returns O ângulo em graus.
 */
export function calculateTrunkAngle(
    midShoulder: Point,
    midHip: Point
): number {
    const trunkAngleDeg = findAngle(midHip.x, midHip.y, midShoulder.x, midShoulder.y);
    return trunkAngleDeg;
}

/**
 * Calcula o ângulo do cotovelo.
 * @param shoulder Marco do ombro correspondente.
 * @param elbow Marco do cotovelo.
 * @param wrist Marco do punho.
 * @returns O ângulo em graus.
 */
export function calculateElbowAngle(
    shoulder: NormalizedLandmark,
    elbow: NormalizedLandmark,
    wrist: NormalizedLandmark
): number {
    const v1x = elbow.x - shoulder.x;
    const v1y = elbow.y - shoulder.y;
    const v2x = wrist.x - elbow.x;
    const v2y = wrist.y - elbow.y;
    const dotProduct = v1x * v2x + v1y * v2y;
    const magV1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const magV2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (magV1 > 0 && magV2 > 0) {
        let angleRad = Math.acos(dotProduct / (magV1 * magV2));
        let elbowAngleDeg = angleRad * (180 / Math.PI);
        return elbowAngleDeg;
    } else {
        return 180;
    }
}

/**
 * Calcula o ângulo do braço.
 * @param shoulder Marco do ombro correspondente.
 * @param elbow Marco do cotovelo.
 * @returns O ângulo em graus.
 */
export function calculateArmAngle(
    shoulder: NormalizedLandmark,
    elbow: NormalizedLandmark
): number {
    const armAngleDeg = findAngleForLimbs(shoulder.x, shoulder.y, elbow.x, elbow.y);
    return armAngleDeg;
}

/**
 * Calcula o ângulo do antebraço.
 * @param elbow Marco do cotovelo.
 * @param wrist Marco do punho.
 * @returns O ângulo em graus.
 */
export function calculateForearmAngle(
    elbow: NormalizedLandmark,
    wrist: NormalizedLandmark
): number {
    const forearmAngleDeg = findAngleForLimbs(elbow.x, elbow.y, wrist.x, wrist.y);
    return forearmAngleDeg;
}

/**
 * Calcula o ângulo do punho.
 * @param wrist Marco do punho.
 * @param indexFinger Marco do dedo indicador.
 * @returns O ângulo em graus.
 */
export function calculateWristAngle(
    wrist: NormalizedLandmark,
    indexFinger: NormalizedLandmark
): number {
    const wristAngleDeg = findAngleForLimbs(wrist.x, wrist.y, indexFinger.x, indexFinger.y);
    return wristAngleDeg;
}

/**
 * Calcula o ângulo das pernas.
 * @param hip Marco do quadril correspondente.
 * @param knee Marco do joelho correspondente.
 * @returns O ângulo em graus.
 */
export function calculateLegAngle(
    hip: NormalizedLandmark,
    knee: NormalizedLandmark
): number {
    const legAngleDeg = findAngleForLimbs(hip.x, hip.y, knee.x, knee.y);
    return legAngleDeg;
}

/**
 * Analisa os landmarks e calcula ângulos ergonômicos básicos.
 * @param landmarks Conjunto de landmarks do MediaPipe.
 * @returns Objeto contendo os ângulos calculados.
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
    const LEFT_KNEE = 25;
    const RIGHT_KNEE = 26;
    const LEFT_INDEX = 19;
    const RIGHT_INDEX = 20;

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
    const leftKnee = landmarks[LEFT_KNEE];
    const rightKnee = landmarks[RIGHT_KNEE];
    const leftIndex = landmarks[LEFT_INDEX];
    const rightIndex = landmarks[RIGHT_INDEX];

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
    const leftKneeDetected = isLandmarkDetected(leftKnee);
    const rightKneeDetected = isLandmarkDetected(rightKnee);
    const leftIndexDetected = isLandmarkDetected(leftIndex);
    const rightIndexDetected = isLandmarkDetected(rightIndex);

    let neckAngle: number | null = null;
    if (leftShoulderDetected && rightShoulderDetected && (leftEarDetected || rightEarDetected || noseDetected)) {
        const midShoulder = getMidShoulder(leftShoulder, rightShoulder);
        neckAngle = calculateNeckAngle(leftEar, rightEar, nose, midShoulder);
        if (isNaN(neckAngle)) neckAngle = null;
    }

    let trunkAngle: number | null = null;
    if (leftShoulderDetected && rightShoulderDetected && leftHipDetected && rightHipDetected) {
        const midShoulder = getMidShoulder(leftShoulder, rightShoulder);
        const midHip = getMidHip(leftHip, rightHip);
        trunkAngle = calculateTrunkAngle(midShoulder, midHip);
    }

    let leftElbowAngle: number | null = null;
    if (leftShoulderDetected && leftElbowDetected && leftWristDetected) {
        leftElbowAngle = calculateElbowAngle(leftShoulder, leftElbow, leftWrist);
    }

    let rightElbowAngle: number | null = null;
    if (rightShoulderDetected && rightElbowDetected && rightWristDetected) {
        rightElbowAngle = calculateElbowAngle(rightShoulder, rightElbow, rightWrist);
    }

    let leftArmAngle: number | null = null;
    if (leftShoulderDetected && leftElbowDetected) {
        leftArmAngle = calculateArmAngle(leftShoulder, leftElbow);
    }

    let rightArmAngle: number | null = null;
    if (rightShoulderDetected && rightElbowDetected) {
        rightArmAngle = calculateArmAngle(rightShoulder, rightElbow);
    }

    let leftForearmAngle: number | null = null;
    if (leftElbowDetected && leftWristDetected) {
        leftForearmAngle = calculateForearmAngle(leftElbow, leftWrist);
    }

    let rightForearmAngle: number | null = null;
    if (rightElbowDetected && rightWristDetected) {
        rightForearmAngle = calculateForearmAngle(rightElbow, rightWrist);
    }

    let leftWristAngle: number | null = null;
    if (leftWristDetected && leftIndexDetected) {
        leftWristAngle = calculateWristAngle(leftWrist, leftIndex);
    }

    let rightWristAngle: number | null = null;
    if (rightWristDetected && rightIndexDetected) {
        rightWristAngle = calculateWristAngle(rightWrist, rightIndex);
    }

    let leftLegAngle: number | null = null;
    if (leftHipDetected && leftKneeDetected) {
        leftLegAngle = calculateLegAngle(leftHip, leftKnee);
    }

    let rightLegAngle: number | null = null;
    if (rightHipDetected && rightKneeDetected) {
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

// --- Função para calcular a confiabilidade da detecção ---
export function calculateReliability(landmarks: NormalizedLandmark[]): number {
    const primaryLandmarks = [11, 12, 13, 14, 23, 24, 25, 26]; // Ombros, cotovelos, quadris, joelhos
    let totalVisibility = 0;
    let validLandmarks = 0;

    for (const idx of primaryLandmarks) {
        if (idx < landmarks.length) {
            const vis = landmarks[idx].visibility;
            if (typeof vis === 'number' && !isNaN(vis) && vis >= 0.1) {
                totalVisibility += vis;
                validLandmarks++;
            }
        }
    }

    return validLandmarks > 0 ? totalVisibility / validLandmarks : 0;
}