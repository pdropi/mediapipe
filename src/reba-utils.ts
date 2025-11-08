// src/reba-utils.ts

import { NormalizedLandmark } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";
import { isLandmarkDetected, findAngle, findAngleForLimbs, getMidShoulder, getMidHip } from "./ergonomics-utils.ts"; // Importa funções genéricas

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
    // Novos campos para os ajustes REBA
    neckTwisted: boolean;
    trunkTwisted: boolean;
    shoulderRaised: boolean;
    armAbducted: boolean;
    armSupported: boolean;
    wristBent: boolean;
    wristTwisted: boolean;
    forceLoadScore: number; // 0, 1, 2
    couplingScore: number; // 0, 1, 2, 3
    activityScore: number; // 0, 1, 2
    rebaScore: number; // Score final REBA (Score C + Activity)
    postureScoreA: number; // Score A (Neck, Trunk, Legs) - antes dos ajustes
    postureScoreB: number; // Score B (Upper Arm, Lower Arm, Wrist) - antes dos ajustes
    tableCScore: number; // Score da Tabela C (Posture A + Posture B)
    rebaScoreFinal: number; // Score final REBA (Score C + Force/Load + Coupling + Activity)
}

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
        return "bilateral"; // Proxy para postura estável (default)
    }
}

// --- Função para calcular a pontuação com base no tempo acumulado em faixas ---
// Exemplo: pontuação é a da faixa com mais tempo acumulado.
function calculateScoreFromBins(bins: { [key: string]: number }, component: keyof typeof REBA_ANGLE_BINS): number {
    // Itera sobre as faixas de ângulo definidas para o componente
    const angleBins = REBA_ANGLE_BINS[component];
    let maxTime = 0;
    let scoreForMaxTime = 0;

    for (const [range, score] of Object.entries(angleBins)) {
        // Verifica o tempo acumulado para *esta* faixa específica
        const time = bins[range] || 0; // Se a faixa não existe em bins, tempo é 0
        if (time > maxTime) {
            maxTime = time;
            scoreForMaxTime = score; // Pontuação da faixa com mais tempo
        }
    }

    // Se todos os bins tiverem 0 tempo, scoreForMaxTime será 0
    return scoreForMaxTime;
}

// --- Limiares para detecção de mudança (em graus) ---
const CHANGE_THRESHOLD = 5;

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
    },
    neckTwisted: false,
    trunkTwisted: false,
    shoulderRaised: false,
    armAbducted: false,
    armSupported: false,
    wristBent: false,
    wristTwisted: false,
    forceLoadScore: 0, // Inicializado com 0, o valor real virá do input do usuário
    couplingScore: 0,
    activityScore: 0,
    rebaScore: 0, // Agora será o Score C + Activity
    postureScoreA: 0,
    postureScoreB: 0,
    tableCScore: 0, // Score da Tabela C (Posture A + Posture B)
    rebaScoreFinal: 0 // Score final REBA (Score C + Force/Load + Coupling + Activity)
};

/**
 * Atualiza os dados REBA com base nos ângulos atuais e no tempo decorrido.
 * @param rebaData Dados REBA atuais.
 * @param newAngles Ângulos calculados mais recentes.
 * @param currentTime Tempo atual em milissegundos (performance.now()).
 * @param deltaTime Tempo decorrido desde a última atualização em segundos.
 * @param landmarks Landmarks atuais usados para cálculos específicos (como pernas).
 * @returns Dados REBA atualizados.
 */
export function updateRebaData(rebaData: RebaData, newAngles: { // Usando a assinatura de analyzeErgonomics
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
}, currentTime: number, deltaTime: number, landmarks: NormalizedLandmark[]): RebaData {
    const updatedData = { ...rebaData };

    // Função auxiliar para atualizar um componente
    const updateComponent = (componentKey: keyof RebaData, newAngle: number | null) => {
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
            // Para pernas, usa a função específica e os landmarks
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

    updatedData.trunk = updateComponent('trunk', newAngles.trunkAngle);
    updatedData.neck = updateComponent('neck', newAngles.neckAngle);
    // Para pernas, braço, antebraço e punho, vamos usar a média dos lados direito e esquerdo detectados
    // ou o primeiro disponível detectado.
    const avgLegAngle = (newAngles.leftLegAngle !== null && newAngles.rightLegAngle !== null) ?
        (Math.abs(newAngles.leftLegAngle) + Math.abs(newAngles.rightLegAngle)) / 2 : // Média dos absolutos
        (newAngles.leftLegAngle !== null ? Math.abs(newAngles.leftLegAngle) : (newAngles.rightLegAngle !== null ? Math.abs(newAngles.rightLegAngle) : null));
    updatedData.legs = updateComponent('legs', avgLegAngle);

    const avgArmAngle = (newAngles.leftArmAngle !== null && newAngles.rightArmAngle !== null) ?
        (Math.abs(newAngles.leftArmAngle) + Math.abs(newAngles.rightArmAngle)) / 2 :
        (newAngles.leftArmAngle !== null ? Math.abs(newAngles.leftArmAngle) : (newAngles.rightArmAngle !== null ? Math.abs(newAngles.rightArmAngle) : null));
    updatedData.arm = updateComponent('arm', avgArmAngle);

    const avgForearmAngle = (newAngles.leftForearmAngle !== null && newAngles.rightForearmAngle !== null) ?
        (Math.abs(newAngles.leftForearmAngle) + Math.abs(newAngles.rightForearmAngle)) / 2 :
        (newAngles.leftForearmAngle !== null ? Math.abs(newAngles.leftForearmAngle) : (newAngles.rightForearmAngle !== null ? Math.abs(newAngles.rightForearmAngle) : null));
    updatedData.forearm = updateComponent('forearm', avgForearmAngle);

    const avgWristAngle = (newAngles.leftWristAngle !== null && newAngles.rightWristAngle !== null) ?
        (Math.abs(newAngles.leftWristAngle) + Math.abs(newAngles.rightWristAngle)) / 2 :
        (newAngles.leftWristAngle !== null ? Math.abs(newAngles.leftWristAngle) : (newAngles.rightWristAngle !== null ? Math.abs(newAngles.rightWristAngle) : null));
    updatedData.wrist = updateComponent('wrist', avgWristAngle);

    // --- Atualização dos ajustes REBA ---

    // Detectar torção do pescoço (baseado na diferença de altura entre as orelhas)
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const nose = landmarks[0];
    const leftEarDetected = isLandmarkDetected(leftEar);
    const rightEarDetected = isLandmarkDetected(rightEar);
    const noseDetected = isLandmarkDetected(nose);

    if (leftEarDetected && rightEarDetected) {
        // Se a diferença de altura entre as orelhas for significativa, considera torção
        const earHeightDiff = Math.abs(leftEar.y - rightEar.y);
        // Limiar arbitrário, pode ser ajustado
        updatedData.neckTwisted = earHeightDiff > 0.05;
    } else if (noseDetected) {
        // Se a orelha não for detectada, usar o nariz como referência
        // Se o nariz estiver fora da linha central, pode indicar torção
        const midShoulder = getMidShoulder(landmarks[11], landmarks[12]);
        const noseXDiff = Math.abs(nose.x - midShoulder.x);
        updatedData.neckTwisted = noseXDiff > 0.05;
    }

    // Detectar torção do tronco (baseado na diferença de altura entre os ombros)
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftShoulderDetected = isLandmarkDetected(leftShoulder);
    const rightShoulderDetected = isLandmarkDetected(rightShoulder);

    if (leftShoulderDetected && rightShoulderDetected) {
        const shoulderHeightDiff = Math.abs(leftShoulder.y - rightShoulder.y);
        updatedData.trunkTwisted = shoulderHeightDiff > 0.05;
    }

    // Detectar ombro levantado (baseado na altura do ombro em relação ao quadril)
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftHipDetected = isLandmarkDetected(leftHip);
    const rightHipDetected = isLandmarkDetected(rightHip);

    if (leftShoulderDetected && leftHipDetected) {
        const shoulderHipDiff = leftShoulder.y - leftHip.y; // Se positivo, ombro está acima do quadril
        updatedData.shoulderRaised = shoulderHipDiff > 0.05;
    } else if (rightShoulderDetected && rightHipDetected) {
        const shoulderHipDiff = rightShoulder.y - rightHip.y;
        updatedData.shoulderRaised = shoulderHipDiff > 0.05;
    }

    // Detectar abdução do braço (baseado no ângulo do braço)
    // Se o ângulo do braço for maior que 20°, considera abdução
    const leftArmAngle = newAngles.leftArmAngle;
    const rightArmAngle = newAngles.rightArmAngle;
    if (leftArmAngle !== null && leftArmAngle > 20) {
        updatedData.armAbducted = true;
    } else if (rightArmAngle !== null && rightArmAngle > 20) {
        updatedData.armAbducted = true;
    }

    // Detectar apoio do braço (baseado na posição do cotovelo em relação ao corpo)
    // Se o cotovelo estiver próximo ao corpo e o braço estiver em um ângulo pequeno, pode estar apoiado
    // Esta é uma heurística simples
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftElbowDetected = isLandmarkDetected(leftElbow);
    const rightElbowDetected = isLandmarkDetected(rightElbow);

    if (leftElbowDetected && leftShoulderDetected) {
        const elbowShoulderDist = Math.sqrt((leftElbow.x - leftShoulder.x)**2 + (leftElbow.y - leftShoulder.y)**2);
        // Se o cotovelo estiver muito próximo do ombro, pode estar apoiado
        updatedData.armSupported = elbowShoulderDist < 0.05;
    } else if (rightElbowDetected && rightShoulderDetected) {
        const elbowShoulderDist = Math.sqrt((rightElbow.x - rightShoulder.x)**2 + (rightElbow.y - rightShoulder.y)**2);
        updatedData.armSupported = elbowShoulderDist < 0.05;
    }

    // Detectar punho dobrado (baseado no ângulo do punho)
    // Se o ângulo do punho for maior que 15°, considera dobrado
    const leftWristAngle = newAngles.leftWristAngle;
    const rightWristAngle = newAngles.rightWristAngle;
    if (leftWristAngle !== null && leftWristAngle > 15) {
        updatedData.wristBent = true;
    } else if (rightWristAngle !== null && rightWristAngle > 15) {
        updatedData.wristBent = true;
    }

    // Detectar torção do punho (baseado na posição do dedo indicador em relação ao punho)
    const leftIndex = landmarks[19];
    const rightIndex = landmarks[20];
    const leftIndexDetected = isLandmarkDetected(leftIndex);
    const rightIndexDetected = isLandmarkDetected(rightIndex);
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftWristDetected = isLandmarkDetected(leftWrist);
    const rightWristDetected = isLandmarkDetected(rightWrist);

    if (leftWristDetected && leftIndexDetected) {
        // Calcular o ângulo entre o vetor do punho para o dedo e o eixo Y
        const wristIndexAngle = findAngleForLimbs(leftWrist.x, leftWrist.y, leftIndex.x, leftIndex.y);
        // Se o ângulo for maior que 15°, considera torção
        updatedData.wristTwisted = wristIndexAngle > 15;
    } else if (rightWristDetected && rightIndexDetected) {
        const wristIndexAngle = findAngleForLimbs(rightWrist.x, rightWrist.y, rightIndex.x, rightIndex.y);
        updatedData.wristTwisted = wristIndexAngle > 15;
    }

    // --- Cálculo do Score REBA Final (Corrigido e com segurança) ---

    // 1. Pontuar o Grupo A (Neck, Trunk, Legs) - Pontuação Postural
    const neckScorePostural = updatedData.neck.score;
    const trunkScorePostural = updatedData.trunk.score;
    const legsScorePostural = updatedData.legs.score; // Este valor deve ser 1 ou 2

    // 2. Pontuar o Grupo B (Upper Arm, Lower Arm, Wrist) - Pontuação Postural
    const upperArmScorePostural = updatedData.arm.score;
    const lowerArmScorePostural = updatedData.forearm.score;
    const wristScorePostural = updatedData.wrist.score;

    // 3. Aplicar ajustes para o Score A (torção, etc.)
    let adjustedNeckScoreA = neckScorePostural;
    if (updatedData.neckTwisted) {
        adjustedNeckScoreA += 1;
        if (adjustedNeckScoreA > 6) adjustedNeckScoreA = 6; // Limite conforme Tabela A
    }

    let adjustedTrunkScoreA = trunkScorePostural;
    if (updatedData.trunkTwisted) {
        adjustedTrunkScoreA += 1;
        if (adjustedTrunkScoreA > 6) adjustedTrunkScoreA = 6; // Limite conforme Tabela A
    }

    // Tabela A: Score A = lookup(adjustedNeckScoreA, adjustedTrunkScoreA, legsScorePostural)
    // A Tabela A é uma matriz 3D.
    // Linhas: Tronco (1-5), Colunas: Pescoço (1-3), Profundidade: Pernas (1-2)
    // Ajustado para indexação 0-based.
    // Tabela A conforme especificações:
    // Pernas 1: 1,2,3,4 (Neck 1,2,3,4) | 1,2,3,4 (Neck 1,2,3,4) | 3,5,6 (Neck 1,2,3)
    // Pernas 2: 2,3,4,5 (Neck 1,2,3,4) | 3,4,5,6 (Neck 1,2,3,4) | 4,5,6,7 (Neck 1,2,3,4)
    // Ajustado para índices: [perna_idx][tronco_idx][pescoco_idx]
    const tableA = [
        // legsScore = 1 (idx 0)
        [
            [1, 2, 3, 4], // trunkScore=1 (idx 0), neckScore=1,2,3,4
            [2, 3, 4, 5], // trunkScore=2 (idx 1), neckScore=1,2,3,4
            [3, 4, 5, 6], // trunkScore=3 (idx 2), neckScore=1,2,3,4
            [4, 5, 6, 7], // trunkScore=4 (idx 3), neckScore=1,2,3,4
            [5, 6, 7, 8]  // trunkScore=5 (idx 4), neckScore=1,2,3,4
        ],
        // legsScore = 2 (idx 1)
        [
            [1, 2, 3, 4], // trunkScore=1 (idx 0), neckScore=1,2,3,4
            [3, 4, 5, 6], // trunkScore=2 (idx 1), neckScore=1,2,3,4
            [4, 5, 6, 7], // trunkScore=3 (idx 2), neckScore=1,2,3,4
            [5, 6, 7, 8], // trunkScore=4 (idx 3), neckScore=1,2,3,4
            [6, 7, 8, 9]  // trunkScore=5 (idx 4), neckScore=1,2,3,4
        ]
    ];

    // Mapear os scores para índices (1->0, 2->1, 3->2, 4->3, 5->4, 6->5) - Limitado a 5 para Tabela A
    // Calcula os índices brutos
    let neckIdxA = adjustedNeckScoreA - 1;
    let trunkIdxA = adjustedTrunkScoreA - 1; // Tabela A vai até 5 para tronco
    // CORREÇÃO AQUI:
    // O legsScorePostural é 1 ou 2, então o índice deve ser legsScorePostural - 1 (0 ou 1)
    let legsIdxA = legsScorePostural - 1; // 1->0, 2->1

    // --- VERIFICAÇÃO DE LIMITES: Aplicar limites ANTES de usar na matriz ---
    neckIdxA = Math.max(0, Math.min(5, neckIdxA)); // Garante 0 <= neckIdxA <= 5
    trunkIdxA = Math.max(0, Math.min(4, trunkIdxA)); // Garante 0 <= trunkIdxA <= 4 (Tabela A vai até 5 para tronco)
    legsIdxA = Math.max(0, Math.min(1, legsIdxA)); // Garante 0 <= legsIdxA <= 1

    // --- SEGURANÇA: Verificar se tableA e os índices intermediários existem ---
    let postureScoreA = 0; // Valor padrão seguro
    // Acesso: tableA[legsIdxA][trunkIdxA][neckIdxA]
    if (tableA[legsIdxA] && tableA[legsIdxA][trunkIdxA] && typeof tableA[legsIdxA][trunkIdxA][neckIdxA] === 'number') {
        postureScoreA = tableA[legsIdxA][trunkIdxA][neckIdxA];
    } else {
        console.warn("WARNING: tableA lookup failed, defaulting to 0. Indices:", legsIdxA, trunkIdxA, neckIdxA, "Table structure:", tableA);
    }

    // 4. Aplicar ajustes para o Score B (raised, abducted, supported, bent, twisted)
    let adjustedUpperArmScoreB = upperArmScorePostural;
    if (updatedData.shoulderRaised) {
        adjustedUpperArmScoreB += 1;
        if (adjustedUpperArmScoreB > 6) adjustedUpperArmScoreB = 6; // Limite conforme Tabela B
    }
    if (updatedData.armAbducted) {
        adjustedUpperArmScoreB += 1;
        if (adjustedUpperArmScoreB > 6) adjustedUpperArmScoreB = 6; // Limite conforme Tabela B
    }
    if (updatedData.armSupported) {
        adjustedUpperArmScoreB -= 1;
        if (adjustedUpperArmScoreB < 1) adjustedUpperArmScoreB = 1;
    }

    let adjustedLowerArmScoreB = lowerArmScorePostural;
    // No adjustments for lower arm in this implementation

    let adjustedWristScoreB = wristScorePostural;
    if (updatedData.wristBent) {
        adjustedWristScoreB += 1;
        if (adjustedWristScoreB > 3) adjustedWristScoreB = 3; // Limite para punho
    }
    if (updatedData.wristTwisted) {
        adjustedWristScoreB += 1;
        if (adjustedWristScoreB > 3) adjustedWristScoreB = 3; // Limite para punho
    }

    // Tabela B: Score B = lookup(adjustedUpperArmScoreB, adjustedLowerArmScoreB, adjustedWristScoreB)
    // A Tabela B é uma matriz 3D.
    // Linhas: Braço (1-6), Colunas: Antebraço (1-2), Profundidade: Punho (1-3)
    // Ajustado para indexação 0-based.
    // Tabela B conforme especificações:
    // Antebraço 1: 1,2,2,3 (Braço 1,2,3,4) | 3,4,5,5 (Braço 1,2,3,4) | 6,7,8,8 (Braço 1,2,3,4)
    // Antebraço 2: 1,2,3,4 (Braço 1,2,3,4) | 2,3,4,5 (Braço 1,2,3,4) | 5,6,7,8 (Braço 1,2,3,4)
    // Ajustado para índices: [wrist_idx][arm_idx][forearm_idx] - Ordem correta para acesso
    const tableB = [
        // wristScore = 1 (idx 0)
        [
            [1, 1], // armScore=1 (idx 0), forearmScore=1,2
            [2, 2], // armScore=2 (idx 1), forearmScore=1,2
            [2, 3], // armScore=3 (idx 2), forearmScore=1,2
            [3, 4], // armScore=4 (idx 3), forearmScore=1,2
            [4, 5], // armScore=5 (idx 4), forearmScore=1,2
            [5, 6]  // armScore=6 (idx 5), forearmScore=1,2
        ],
        // wristScore = 2 (idx 1)
        [
            [1, 2], // armScore=1 (idx 0), forearmScore=1,2
            [2, 3], // armScore=2 (idx 1), forearmScore=1,2
            [3, 4], // armScore=3 (idx 2), forearmScore=1,2
            [4, 5], // armScore=4 (idx 3), forearmScore=1,2
            [5, 6], // armScore=5 (idx 4), forearmScore=1,2
            [6, 7]  // armScore=6 (idx 5), forearmScore=1,2
        ],
        // wristScore = 3 (idx 2)
        [
            [3, 4], // armScore=1 (idx 0), forearmScore=1,2
            [4, 5], // armScore=2 (idx 1), forearmScore=1,2
            [5, 5], // armScore=3 (idx 2), forearmScore=1,2
            [5, 6], // armScore=4 (idx 3), forearmScore=1,2
            [6, 7], // armScore=5 (idx 4), forearmScore=1,2
            [7, 8]  // armScore=6 (idx 5), forearmScore=1,2
        ]
    ];

    // Mapear os scores para índices (1->0, 2->1, 3->2, 4->3, 5->4, 6->5)
    // Calcula os índices brutos
    let armIdxB = adjustedUpperArmScoreB - 1;
    let forearmIdxB = adjustedLowerArmScoreB - 1; // Tabela B vai até 2 para antebraço
    let wristIdxB = adjustedWristScoreB - 1;

    // --- VERIFICAÇÃO DE LIMITES: Aplicar limites ANTES de usar na matriz ---
    armIdxB = Math.max(0, Math.min(5, armIdxB)); // Garante 0 <= armIdxB <= 5
    forearmIdxB = Math.max(0, Math.min(1, forearmIdxB)); // Garante 0 <= forearmIdxB <= 1 (Tabela B vai até 2 para antebraço, mas índice vai até 1)
    wristIdxB = Math.max(0, Math.min(2, wristIdxB)); // Garante 0 <= wristIdxB <= 2

    // --- SEGURANÇA: Verificar se tableB e os índices intermediários existem ---
    let postureScoreB = 0; // Valor padrão seguro
    // Acesso: tableB[wristIdxB][armIdxB][forearmIdxB]
    if (tableB[wristIdxB] && tableB[wristIdxB][armIdxB] && typeof tableB[wristIdxB][armIdxB][forearmIdxB] === 'number') {
        postureScoreB = tableB[wristIdxB][armIdxB][forearmIdxB];
    } else {
        console.warn("WARNING: tableB lookup failed, defaulting to 0. Indices (w,a,f):", wristIdxB, armIdxB, forearmIdxB, "Table structure:", tableB);
    }

    // 5. Combinar as pontuações A e B usando Tabela C
    // Tabela C: Score C = lookup(postureScoreA, postureScoreB)
    // Linhas: Score A (1-12), Colunas: Score B (1-12)
    const tableC = [
        [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
        [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
        [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
        [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
        [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
        [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
        [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
        [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
        [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
        [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
        [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
        [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]
    ];

    // Mapear os scores para índices (1->0, 2->1, ..., 12->11)
    // Calcula os índices brutos
    let scoreAIdx = postureScoreA - 1;
    let scoreBIdx = postureScoreB - 1;

    // --- VERIFICAÇÃO DE LIMITES: Aplicar limites ANTES de usar na matriz ---
    scoreAIdx = Math.max(0, Math.min(11, scoreAIdx)); // Garante 0 <= scoreAIdx <= 11
    scoreBIdx = Math.max(0, Math.min(11, scoreBIdx)); // Garante 0 <= scoreBIdx <= 11

    let tableCScore = 0; // Valor padrão seguro
    // Acesso: tableC[scoreAIdx][scoreBIdx]
    if (typeof scoreAIdx === 'number' && typeof scoreBIdx === 'number' && scoreAIdx >= 0 && scoreAIdx < tableC.length && scoreBIdx >= 0 && scoreBIdx < tableC[scoreAIdx].length) {
        tableCScore = tableC[scoreAIdx][scoreBIdx];
    } else {
        console.warn("WARNING: tableC lookup failed, defaulting to 0. Indices (A,B):", scoreAIdx, scoreBIdx, "Scores (A,B post):", postureScoreA, postureScoreB, "TableC length:", tableC.length, "TableC[0] length:", tableC[0]?.length);
    }

    // --- SEGURANÇA: Garantir que tableCScore seja um número ---
    if (typeof tableCScore !== 'number' || isNaN(tableCScore)) {
        console.warn("WARNING: tableCScore is not a valid number after lookup, defaulting to 0. postureScoreA:", postureScoreA, "postureScoreB:", postureScoreB, "scoreAIdx:", scoreAIdx, "scoreBIdx:", scoreBIdx);
        tableCScore = 0; // Valor padrão seguro
    }

    // 6. Pontuar os fatores de ajuste (Força/Carga e Acoplamento)
    // --- NOVO CÁLCULO: Força/Carga (Substitui o bloco antigo) ---
    // A variável updatedData.forceLoadScore deve ser definida externamente (pelo usuário ou por uma função global)
    // Heurística para "choque/força rápida":
    // Se a frequência de eventos do tronco ou pescoço for alta (> 10 eventos por minuto), pode indicar movimento brusco.
    // Ajuste: +1 se frequência > 10 por minuto.
    let forceLoadScoreAdjustment = 0;
    if (updatedData.trunk.frequency > 10 || updatedData.neck.frequency > 10) {
        forceLoadScoreAdjustment = 1;
    }
    // O forceLoadScore base (0, 1 ou 2) deve ser somado ao adjustment (0 ou 1).
    // A soma final é limitada a 2, pois a REBA Worksheet original tem 0, 1, 2.
    updatedData.forceLoadScore = Math.min(updatedData.forceLoadScore + forceLoadScoreAdjustment, 2);

    // Calcular Coupling Score
    // Baseado em heurísticas (pode ser ajustado)
    // Se o punho estiver dobrado ou torcido, pode indicar mau acoplamento
    if (updatedData.wristBent || updatedData.wristTwisted) {
        updatedData.couplingScore = 2; // Poor coupling
    } else {
        updatedData.couplingScore = 0; // Good coupling
    }

    // 7. Calcular a Pontuação C ajustada (Score A + Score B + Force/Load + Coupling)
    // Certifique-se de que tableCScore é um número antes de somar
    const scoreCAdjusted = (typeof tableCScore === 'number' ? tableCScore : 0) + updatedData.forceLoadScore + updatedData.couplingScore;

    // 8. Pontuar a atividade (já está feito)

    // 9. Calcular a Pontuação REBA final (Score C ajustada + Activity)
    // Certifique-se de que os componentes são números antes de somar
    const rebaScoreFinal = scoreCAdjusted + (typeof updatedData.activityScore === 'number' ? updatedData.activityScore : 0);

    // --- SEGURANÇA: Garantir que rebaScoreFinal seja um número ---
    if (isNaN(rebaScoreFinal)) {
        console.warn("WARNING: rebaScoreFinal is NaN, defaulting to 0. scoreCAdjusted:", scoreCAdjusted, "activityScore:", updatedData.activityScore);
        rebaScoreFinal = 0; // Valor padrão seguro
    }

    // Atualizar os dados finais
    updatedData.postureScoreA = postureScoreA;
    updatedData.postureScoreB = postureScoreB;
    updatedData.tableCScore = tableCScore; // Pontuação da Tabela C (Score A + Score B)
    updatedData.rebaScore = rebaScoreFinal; // Score final REBA (Score C + Force/Load + Coupling + Activity)
    updatedData.rebaScoreFinal = rebaScoreFinal; // Mantido para compatibilidade e clareza

    return updatedData;
}

/**
 * Função para obter a classificação de risco com base no score REBA.
 * @param rebaScore Score REBA calculado.
 * @returns String com a classificação de risco.
 */
export function getRebaRiskLevel(rebaScore: number): string {
    if (rebaScore <= 1) {
        return "Risco ignorável, nenhuma ação necessária";
    } else if (rebaScore <= 3) {
        return "Risco baixo, mudanças podem ser implementadas";
    } else if (rebaScore <= 7) {
        return "Risco médio, investigue mais e aplique possíveis mudanças";
    } else if (rebaScore <= 10) {
        return "Risco alto, investigue a aplique mudanças";
    } else {
        return "Risco muito alto, implemente mudanças o quanto antes";
    }
}