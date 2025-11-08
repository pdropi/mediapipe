// src/reba-video.ts

// Placeholder para futuras funções de desenho REBA específicas no canvas
// Por enquanto, o desenho de linhas ergonômicas é feito em video-upload.ts

// Exemplo de função futura (não usada atualmente)
export function drawRebaOverlay(canvasContext: CanvasRenderingContext2D, rebaData: any) {
    // Implementação futura
    // Exemplo: Desenhar uma barra de progresso ou ícones baseados nos scores REBA
    canvasContext.save();
    canvasContext.fillStyle = 'rgba(255, 0, 0, 0.5)'; // Vermelho semi-transparente
    canvasContext.fillRect(canvasContext.canvas.width - 50, 0, 50, rebaData.rebaScoreFinal * 5); // Altura proporcional ao score (exemplo)
    canvasContext.restore();
}