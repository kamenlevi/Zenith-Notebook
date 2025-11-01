import type { Subject, Path, TextObject, CustomFont, Theme } from '../types';

const PAGE_HEIGHT = 1056;
const PAGE_WIDTH = 816;
const PAGE_GAP = 24;
const DPI = 96;
const CM_TO_INCH = 1 / 2.54;
const cmToPx = (cm: number) => cm * CM_TO_INCH * DPI;

const FONT_DRAW_CANVAS_HEIGHT = 400;

export const getPageBackgroundColor = (theme: Theme) => theme === 'light' ? '#FFFFFF' : '#1E293B';

export const drawPageBackground = (ctx: CanvasRenderingContext2D, subject: Subject, pageIndex: number, totalHeight: number) => {
    const pageTop = pageIndex * (PAGE_HEIGHT + PAGE_GAP);
    if (pageTop > totalHeight) return;

    ctx.fillStyle = getPageBackgroundColor(subject.theme);
    ctx.fillRect(0, pageTop, PAGE_WIDTH, PAGE_HEIGHT);
    
    const lineColor = subject.lineColor || (subject.theme === 'light' ? '#E2E8F0' : '#475569'); 
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;

    switch (subject.pageBackground) {
        case 'ruled': {
            const SMALL_LINE_HEIGHT = 28; 
            for (let y = SMALL_LINE_HEIGHT; y < PAGE_HEIGHT; y += SMALL_LINE_HEIGHT) {
                ctx.beginPath();
                ctx.moveTo(0, pageTop + y);
                ctx.lineTo(PAGE_WIDTH, pageTop + y);
                ctx.stroke();
            }
            break;
        }
        case 'grid': {
            const GRID_SIZE = 28;
            for (let y = GRID_SIZE; y < PAGE_HEIGHT; y += GRID_SIZE) {
                ctx.beginPath();
                ctx.moveTo(0, pageTop + y);
                ctx.lineTo(PAGE_WIDTH, pageTop + y);
                ctx.stroke();
            }
            for (let x = GRID_SIZE; x < PAGE_WIDTH; x += GRID_SIZE) {
                ctx.beginPath();
                ctx.moveTo(x, pageTop);
                ctx.lineTo(x, pageTop + PAGE_HEIGHT);
                ctx.stroke();
            }
            break;
        }
        case 'custom-ruled': {
            const customLineHeight = cmToPx(subject.lineSpacingCm);
            if (customLineHeight <= 1) break;
            for (let y = customLineHeight; y < PAGE_HEIGHT; y += customLineHeight) {
                ctx.beginPath();
                ctx.moveTo(0, pageTop + y);
                ctx.lineTo(PAGE_WIDTH, pageTop + y);
                ctx.stroke();
            }
            break;
        }
    }
};

export const drawTextOnCanvas = (
    context: CanvasRenderingContext2D,
    textObj: TextObject,
    fonts: CustomFont[],
    fontCache: Map<string, { image: HTMLCanvasElement, width: number, yOffset: number }>,
) => {
    const { text, x, y, fontSize, fontFamily, color } = textObj;
    const lineHeight = fontSize * 1.2;
    const lines = text.split('\n');

    const isCustom = fonts.some(f => f.id === fontFamily);

    if (isCustom) {
        let currentY = y;
        for (const line of lines) {
            let currentX = x;
            for (const char of line) {
                if (char === ' ') {
                    currentX += fontSize * 0.5;
                    continue;
                }
                const charInfo = fontCache.get(char);
                if (charInfo) {
                    const img = charInfo.image; 
                    const yOffsetRatio = charInfo.yOffset / FONT_DRAW_CANVAS_HEIGHT;
                    const scaledYOffset = yOffsetRatio * fontSize;
                    const aspectRatio = img.width / img.height;
                    const charHeight = fontSize;
                    const charWidth = charHeight * aspectRatio;
                    context.drawImage(img, currentX, currentY - charHeight + scaledYOffset, charWidth, charHeight);
                    currentX += charWidth + 1; 
                }
            }
            currentY += lineHeight;
        }
    } else {
        context.font = `${fontSize}px ${fontFamily}`;
        context.fillStyle = color;
        context.textBaseline = 'bottom';

        let currentY = y;
        for (const line of lines) {
            context.fillText(line, x, currentY);
            currentY += lineHeight;
        }
    }
};

export const drawSmoothPath = (context: CanvasRenderingContext2D, path: Path) => {
    context.globalCompositeOperation = path.globalCompositeOperation;
    context.globalAlpha = path.globalAlpha;
    context.strokeStyle = path.color;
    context.lineWidth = path.size;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    const p = path.points;
    if (p.length < 2) {
        if (p.length === 1) { // Draw a dot for a single point
            context.beginPath();
            context.fillStyle = path.color;
            context.arc(p[0].x, p[0].y, path.size / 2, 0, 2 * Math.PI);
            context.fill();
        }
        return;
    }

    context.beginPath();
    context.moveTo(p[0].x, p[0].y);

    if (p.length === 2) {
        context.lineTo(p[1].x, p[1].y);
    } else {
        // Use quadratic curves for smoothing
        for (let i = 1; i < p.length - 2; i++) {
            const xc = (p[i].x + p[i + 1].x) / 2;
            const yc = (p[i].y + p[i + 1].y) / 2;
            context.quadraticCurveTo(p[i].x, p[i].y, xc, yc);
        }
        // Curve to the last point
        context.quadraticCurveTo(
            p[p.length - 2].x,
            p[p.length - 2].y,
            p[p.length - 1].x,
            p[p.length - 1].y
        );
    }
    context.stroke();
};
