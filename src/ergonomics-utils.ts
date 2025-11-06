// src/ergonomics-utils.ts

import { NormalizedLandmark } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// Interface para um ponto 2D simples
interface Point {
    x: number;
    y: number;
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
 * Calcula o ângulo de inclinação do pescoço em relação à vertical (90 graus).
 * Usamos a Orelha (ponto da cabeça) e o Centro do Ombro (base do pescoço)
 * para definir o vetor do pescoço.
 * @param ear Marco da orelha (ponto superior da cabeça).
 * @param midShoulder Ponto central entre os dois ombros.
 * @returns O ângulo em graus, onde ~90 graus é a postura vertical ideal.
 * Ângulos menores que 90 indicam flexão (cabeça para frente).
 */
export function calculateNeckAngle(
    ear: NormalizedLandmark,
    midShoulder: Point
): number {
    // Calcula a diferença (vetor) entre a orelha e o centro do ombro
    const deltaX = ear.x - midShoulder.x;
    const deltaY = ear.y - midShoulder.y;

    // Usa a função atan2 para encontrar o ângulo em radianos.
    // O ângulo é medido no sentido anti-horário a partir do eixo X positivo.
    const angleRad = Math.atan2(deltaY, deltaX);

    // Converte para graus
    let angleDeg = angleRad * (180 / Math.PI);

    // O eixo Y na imagem é invertido. 
    // Uma cabeça reta/vertical (deltaX=0) deve dar 90 graus (ou -90).

    // Se o vetor estiver vertical (cabeça ereta), o atan2 retorna 90 ou -90.
    // Queremos que a vertical seja 90.
    let finalAngle = 0;
    
    // Normaliza o ângulo para que 90 graus seja a vertical (eixo Y)
    if (angleDeg < 0) {
        // Se negativo (cabeça inclinada para trás)
        finalAngle = 270 - angleDeg; // Ajusta para o ângulo positivo
    } else {
        // Se positivo (cabeça inclinada para frente)
        finalAngle = 90 - angleDeg;
    }
    
    // Simplificando o resultado para a medida do desvio em relação ao eixo Y
    // 90 - |ângulo com eixo X| -> dá o ângulo com o eixo Y.
    // Usamos a diferença com 90 para ter o ângulo de flexão.
    
    // Se deltaX=0, deltaY<0 (cabeça para cima), angleDeg é -90. (90 - (-90)) = 180? Não.
    // Se deltaX=0, deltaY>0 (cabeça para baixo), angleDeg é 90. (90 - 90) = 0? Não.
    
    // Correção: Queremos o ângulo com o eixo Y (vertical), onde o vetor Pescoço->Orelha aponta.
    // O ângulo com o eixo Y vertical para cima (0, -1) é 0.
    // O ângulo com o eixo X é dado por angleDeg.
    
    // O ângulo em relação à vertical (eixo Y) é: 
    let angleFromVertical = Math.abs(angleDeg - 90);
    
    // Se a cabeça estiver ereta, o ângulo será 0 ou 180.
    // Se a cabeça estiver inclinada para a frente, o ângulo será próximo de 90.
    // O melhor é calcular o ângulo absoluto entre o vetor e a vertical (0, -1).
    
    // Usaremos a convenção mais simples de interpretação:
    // 90 graus = vertical (ereto).
    
    // O ângulo é 90 - angleDeg para ter a relação com a vertical.
    // Se ângulo for 0 (horizontal), 90 - 0 = 90. (O vetor é horizontal - errado)
    
    // A melhor métrica é o ângulo entre o vetor (MidShoulder -> Ear) e o vetor vertical (0, -1)
    
    const verticalX = 0;
    const verticalY = -1; // Vetor vertical para cima no sistema de coordenadas da imagem (y é para baixo)
    
    // Calcula o produto escalar
    const dotProduct = deltaX * verticalX + deltaY * verticalY;
    
    // Calcula as magnitudes
    const magnitudePescoço = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const magnitudeVertical = 1;
    
    // Ângulo (em radianos) entre os dois vetores
    const angleRadBetween = Math.acos(dotProduct / (magnitudePescoço * magnitudeVertical));
    
    // Converte para graus
    let neckAngleDeg = angleRadBetween * (180 / Math.PI);
    
    // Se o ponto da orelha estiver atrás do ombro (flexão), deltaX será negativo.
    // A interpretação mais intuitiva para ergonomia é que 0° é ERETO.
    // No entanto, vamos manter a convenção: Ângulo = desvio da vertical.
    
    // O resultado é o ângulo de desvio da vertical.
    return neckAngleDeg;
}

/**
 * Analisa os landmarks e calcula métricas ergonômicas.
 */
export function analyzeErgonomics(landmarks: NormalizedLandmark[]): { neckAngle: number | null } {
    // Índices dos Landmarks do MediaPipe (PoseLandmarker.POSE_LANDMARKS)
    const LEFT_SHOULDER = 11;
    const RIGHT_SHOULDER = 12;
    const LEFT_EAR = 7;
    const RIGHT_EAR = 8;

    if (landmarks.length < 13) {
        return { neckAngle: null }; // Dados insuficientes
    }

    const leftShoulder = landmarks[LEFT_SHOULDER];
    const rightShoulder = landmarks[RIGHT_SHOULDER];
    const leftEar = landmarks[LEFT_EAR];
    const rightEar = landmarks[RIGHT_EAR];
    
    // Pega os dados com maior visibilidade
    let ear = leftEar.visibility > rightEar.visibility ? leftEar : rightEar;
    
    // Verifica se os pontos cruciais estão visíveis (visibilidade > 0.5)
    if (
        leftShoulder.visibility < 0.5 || 
        rightShoulder.visibility < 0.5 || 
        ear.visibility < 0.5
    ) {
        return { neckAngle: null }; // Pontos não confiáveis
    }

    const midShoulder = getMidShoulder(leftShoulder, rightShoulder);
    
    // Retorna o ângulo de desvio da vertical
    const neckAngle = calculateNeckAngle(ear, midShoulder);
    
    return { neckAngle };
}
