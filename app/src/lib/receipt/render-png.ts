import { formatMoney } from '$lib/money';
import { RECEIPT_WIDTH_PX, type ReceiptData } from './types';

const PAD = 16;
const CONTENT_W = RECEIPT_WIDTH_PX - PAD * 2;
const QR_SIZE = 160;

type Font = { size: number; weight?: string; family?: string };

function formatWhen(createdAt: string | null): string {
	if (createdAt) {
		const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(createdAt);
		if (m) {
			const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
			return d.toLocaleString('ru-RU', {
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		}
	}
	return new Date().toLocaleString('ru-RU', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function titleLine(data: ReceiptData): string {
	if (data.isDraft) return 'Новый заказ';
	return data.isClosed ? `Чек №${data.orderId}` : `Заказ №${data.orderId}`;
}

function setFont(ctx: CanvasRenderingContext2D, font: Font): void {
	const weight = font.weight ?? 'normal';
	const family = font.family ?? 'ui-sans-serif, system-ui, sans-serif';
	ctx.font = `${weight} ${font.size}px ${family}`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [''];
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const test = line ? `${line} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && line) {
			lines.push(line);
			line = word;
		} else {
			line = test;
		}
	}
	if (line) lines.push(line);
	return lines;
}

function lineHeight(fontSize: number): number {
	return Math.round(fontSize * 1.35);
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = url;
	});
}

type LayoutBlock = { height: number; draw: (ctx: CanvasRenderingContext2D, y: number) => number };

function centeredTextBlock(
	text: string,
	font: Font,
	color = '#000'
): LayoutBlock {
	const h = lineHeight(font.size);
	return {
		height: h,
		draw(ctx, y) {
			setFont(ctx, font);
			ctx.fillStyle = color;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			ctx.fillText(text, RECEIPT_WIDTH_PX / 2, y);
			ctx.textAlign = 'left';
			return y + h;
		}
	};
}

function ruleBlock(): LayoutBlock {
	const h = 12;
	return {
		height: h,
		draw(ctx, y) {
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(PAD, y + 5);
			ctx.lineTo(RECEIPT_WIDTH_PX - PAD, y + 5);
			ctx.stroke();
			return y + h;
		}
	};
}

function leftTextBlock(text: string, font: Font, color = '#000'): LayoutBlock {
	const h = lineHeight(font.size);
	return {
		height: h,
		draw(ctx, y) {
			setFont(ctx, font);
			ctx.fillStyle = color;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'top';
			ctx.fillText(text, PAD, y);
			return y + h;
		}
	};
}

function guestSection(data: ReceiptData, guestId: number, guestName: string): LayoutBlock[] {
	const guestItems = data.items.filter((i) => i.guest_id === guestId);
	const blocks: LayoutBlock[] = [leftTextBlock(guestName, { size: 14, weight: 'bold' })];

	const measureCanvas = document.createElement('canvas');
	const mctx = measureCanvas.getContext('2d')!;
	setFont(mctx, { size: 14, family: 'ui-monospace, monospace' });

	for (const item of guestItems) {
		const left = `${item.quantity}× ${item.title}`;
		const right = formatMoney(item.price_cents * item.quantity);
		const rightW = mctx.measureText(right).width;
		const leftMax = CONTENT_W - rightW - 8;
		setFont(mctx, { size: 14 });
		const leftLines = wrapText(mctx, left, leftMax);
		const monoH = lineHeight(14);

		blocks.push({
			height: leftLines.length * monoH,
			draw(ctx, y) {
				setFont(ctx, { size: 14 });
				ctx.fillStyle = '#000';
				ctx.textBaseline = 'top';
				let cy = y;
				for (let i = 0; i < leftLines.length; i++) {
					ctx.textAlign = 'left';
					ctx.fillText(leftLines[i], PAD, cy);
					if (i === leftLines.length - 1) {
						setFont(ctx, { size: 14, family: 'ui-monospace, monospace' });
						ctx.textAlign = 'right';
						ctx.fillText(right, RECEIPT_WIDTH_PX - PAD, cy);
						ctx.textAlign = 'left';
					}
					cy += monoH;
				}
				return cy;
			}
		});
	}
	return blocks;
}

function totalBlock(totalCents: number): LayoutBlock {
	const h = lineHeight(16);
	return {
		height: h,
		draw(ctx, y) {
			setFont(ctx, { size: 16, weight: 'bold' });
			ctx.fillStyle = '#000';
			ctx.textBaseline = 'top';
			ctx.textAlign = 'left';
			ctx.fillText('Итого', PAD, y);
			setFont(ctx, { size: 16, weight: 'bold', family: 'ui-monospace, monospace' });
			ctx.textAlign = 'right';
			ctx.fillText(formatMoney(totalCents), RECEIPT_WIDTH_PX - PAD, y);
			ctx.textAlign = 'left';
			return y + h;
		}
	};
}

function qrBlock(img: HTMLImageElement | null): LayoutBlock {
	if (!img) return { height: 0, draw: (_, y) => y };
	const h = QR_SIZE + 16;
	return {
		height: h,
		draw(ctx, y) {
			const x = (RECEIPT_WIDTH_PX - QR_SIZE) / 2;
			ctx.drawImage(img, x, y + 8, QR_SIZE, QR_SIZE);
			return y + h;
		}
	};
}

export async function renderReceiptPng(data: ReceiptData): Promise<Blob> {
	const qrUrl = data.hallQrPath ? `/api/uploads/${data.hallQrPath}` : null;
	const qrImg = qrUrl ? await loadImage(qrUrl) : null;

	const blocks: LayoutBlock[] = [
		centeredTextBlock(data.hallName, { size: 18, weight: 'bold' }),
		centeredTextBlock(titleLine(data), { size: 14, weight: 'bold' }),
		centeredTextBlock(formatWhen(data.createdAt), { size: 12 }),
		ruleBlock()
	];

	for (const guest of data.guests) {
		blocks.push(...guestSection(data, guest.id, guest.name));
	}

	blocks.push(ruleBlock(), totalBlock(data.totalCents), qrBlock(qrImg));

	const height = PAD + blocks.reduce((n, b) => n + b.height, 0) + PAD;

	const canvas = document.createElement('canvas');
	canvas.width = RECEIPT_WIDTH_PX;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, RECEIPT_WIDTH_PX, height);

	let y = PAD;
	for (const block of blocks) {
		y = block.draw(ctx, y);
	}

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error('canvas_to_blob_failed'));
			},
			'image/png',
			1
		);
	});
}

export function orderToReceiptData(input: {
	hallName: string;
	orderId: number | null;
	isDraft: boolean;
	isClosed: boolean;
	createdAt: string | null;
	guests: { id: number; name: string }[];
	items: { guest_id: number; title: string; price_cents: number; quantity: number }[];
	totalCents: number;
	hallQrPath: string | null;
}): ReceiptData {
	return {
		hallName: input.hallName,
		orderId: input.orderId,
		isDraft: input.isDraft,
		isClosed: input.isClosed,
		createdAt: input.createdAt,
		guests: input.guests.map((g) => ({ id: g.id, name: g.name })),
		items: input.items.map((i) => ({
			guest_id: i.guest_id,
			title: i.title,
			price_cents: i.price_cents,
			quantity: i.quantity
		})),
		totalCents: input.totalCents,
		hallQrPath: input.hallQrPath
	};
}
