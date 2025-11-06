// src/ergonomics-utils.ts

import { NormalizedLandmark } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// Interface para um ponto 2D simples
interface Point {
    x: number;
    y: number;
}

/**
 * Calcula o ponto médio (centro) entre os dois ombros.
 * Este ponto é usado para estimar a base do pescoço (T1/C7).
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
 * Usamos a Orelha (ponto de referência da cabeça) e o Centro do Ombro (base do pescoço)
 * para definir o vetor do pescoço.
 * @param ear Marco da orelha (preferencialmente a mais visível, aqui usaremos a esquerda como exemplo).
 * @param midShoulder Ponto central entre os dois ombros.
 * @returns O ângulo em graus (de 0 a 180), onde 90 graus é a postura vertical ideal.
 */
export function calculateNeckAngle(
    ear: NormalizedLandmark,
    midShoulder: Point
): number {
    // 1. Calcula a diferença (vetor) entre a orelha e o centro do ombro
    const deltaX = ear.x - midShoulder.x;
    const deltaY = ear.y - midShoulder.y;

    // 2. Usa a função atan2 para encontrar o ângulo em radianos entre o vetor e o eixo X
    // Atenção: O eixo Y no canvas/coordenadas de imagem é invertido (cresce para baixo).
    const angleRad = Math.atan2(deltaY, deltaX);

    // 3. Converte para graus
    let angleDeg = angleRad * (180 / Math.PI);

    // 4. Normaliza para que 90 graus seja a linha vertical (postura ideal)
    // O vetor vertical (eixo Y) é nossa referência.
    // - O vetor (0, -1) para cima daria 90 graus (cabeça para cima).
    // - O vetor (0, 1) para baixo daria -90 ou 270 graus.
    // Usamos '180 - angleDeg' para alinhar com a vertical e garantir que 90° seja reto.
    // Subtraímos de 90 para ter o ângulo de desvio da vertical:
    // (Ajuste para a rotação):
    let angleFromVertical = Math.abs(angleDeg - 90);

    // Ajuste final para flexão frontal (onde o pescoço está mais inclinado para a frente)
    // Se o ponto da orelha estiver mais à frente que o ombro (postura correta/ereta),
    // o ângulo deve ser próximo de 90 graus.

    // A inclinação do pescoço é mais fácil de ser medida como o ângulo entre o vetor P1->P2 e a vertical.
    // Para simplificar a interpretação:
    // Queremos que um ângulo entre 70 e 110 (ou 80 e 100) seja considerado bom.
    
    // Calcula o ângulo em relação ao eixo X e subtrai 90 para ter em relação à vertical (eixo Y).
    // Math.abs(angleRad * (180 / Math.PI) - 90)

    // Se a orelha (ear.y) está ACIMA do ombro (midShoulder.y), o deltaY é negativo.
    // Se a orelha (ear.x) está À DIREITA do ombro (midShoulder.x), o deltaX é positivo.

    // Vamos usar a convenção: 90 graus = ERETO.
    // Ângulos < 90 graus = Flexão (cabeça para baixo/frente).
    // Ângulos > 90 graus = Extensão (cabeça para trás).
    
    // O ângulo que queremos é o ângulo do vetor com o eixo vertical negativo.
    // Basta ajustar a função atan2 para dar o ângulo em relação ao eixo Y.
    angleDeg = Math.abs(angleDeg); // Garante que seja positivo
    let finalAngle = 180 - (angleDeg + 90); // O ângulo que o vetor faz com o eixo Y.
    
    // Para simplificar, vamos retornar o ângulo entre o vetor Pescoço e o Eixo Y.
    // 90 graus é ereto (o vetor é vertical).
    // Se deltaX for 0 (vertical), atan2(dy, 0) é +/- PI/2 (90 graus).
    
    // Retornamos o ângulo que o vetor faz com o eixo Y em graus.
    return Math.abs(angleDeg);
}

/**
 * Funções de conveniência para análise ergonômica.
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
    
    // Usa o ponto com maior visibilidade (score > 0.5) ou o esquerdo como fallback
    let ear = leftEar.visibility > rightEar.visibility ? leftEar : rightEar;
    if (ear.visibility < 0.5) {
        ear = leftEar.visibility > 0 ? leftEar : rightEar; // Tenta o melhor visível
    }
    
    // Verifica se os pontos cruciais estão visíveis
    if (
        leftShoulder.visibility < 0.5 || 
        rightShoulder.visibility < 0.5 || 
        ear.visibility < 0.5
    ) {
        return { neckAngle: null }; // Pontos não confiáveis
    }

    const midShoulder = getMidShoulder(leftShoulder, rightShoulder);
    
    // O cálculo do ângulo do pescoço (cervical) é complexo, pois depende da profundidade (Z).
    // No nosso caso 2D, vamos calcular o ângulo em relação à vertical (eixo Y).
    
    const neckAngle = calculateNeckAngle(ear, midShoulder);
    
    return { neckAngle };
}
