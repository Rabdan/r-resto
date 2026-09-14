export type ShareReceiptMeta = {
	orderId: number | null;
	hallName: string;
	totalLabel: string;
};

function receiptFileName(orderId: number | null): string {
	return orderId != null ? `check-${orderId}.png` : 'check-new.png';
}

function receiptShareText(meta: ShareReceiptMeta): string {
	const num = meta.orderId != null ? `Чек №${meta.orderId}` : 'Новый заказ';
	return `${num} · ${meta.hallName} · ${meta.totalLabel}`;
}

function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(url);
}

export async function shareReceipt(blob: Blob, meta: ShareReceiptMeta): Promise<'shared' | 'downloaded'> {
	const fileName = receiptFileName(meta.orderId);
	const file = new File([blob], fileName, { type: 'image/png' });
	const text = receiptShareText(meta);
	const title = meta.orderId != null ? `Чек №${meta.orderId}` : 'Чек';

	if (typeof navigator !== 'undefined' && navigator.share) {
		const payload = { files: [file], title, text };
		if (!navigator.canShare || navigator.canShare(payload)) {
			await navigator.share(payload);
			return 'shared';
		}
	}

	downloadBlob(blob, fileName);
	return 'downloaded';
}
