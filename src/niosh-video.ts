// src/niosh-video.ts

// Placeholder para futuras funções de exibição NIOSH no canvas
export function drawNioshOverlay(canvasContext: CanvasRenderingContext2D, nioshData: any) {
    // Implementação futura
    // Exemplo: Desenhar um ícone ou texto indicando risco NIOSH
    canvasContext.save();
    canvasContext.fillStyle = 'rgba(255, 255, 0, 0.7)'; // Amarelo
    canvasContext.font = 'bold 14px monospace';
    canvasContext.fillText('NIOSH (PLACEHOLDER)', 10, canvasContext.canvas.height - 10);
    canvasContext.restore();
}