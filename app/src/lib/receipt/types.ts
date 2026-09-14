export type ReceiptGuest = {
	id: number;
	name: string;
};

export type ReceiptItem = {
	guest_id: number;
	title: string;
	price_cents: number;
	quantity: number;
};

export type ReceiptData = {
	hallName: string;
	orderId: number | null;
	isDraft: boolean;
	isClosed: boolean;
	createdAt: string | null;
	guests: ReceiptGuest[];
	items: ReceiptItem[];
	totalCents: number;
	hallQrPath: string | null;
};

export const RECEIPT_WIDTH_PX = 384;
