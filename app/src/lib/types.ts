export type UserRole = 'waiter' | 'kitchen';
export type DeviceStatus = 'pending' | 'active' | 'suspended' | 'terminated';
export type OrderStatus = 'open' | 'closed' | 'cancelled';
export type ItemStatus = 'held' | 'pending' | 'ready' | 'out_of_stock';
export type PaymentMethod = 'cash' | 'cashless';

export interface DeviceSession {
	id: number;
	deviceCode: string;
	status: DeviceStatus;
	userId: number | null;
	userName: string | null;
	role: UserRole | null;
	locationId: number | null;
	locationName: string | null;
}

export interface AdminSession {
	id: number;
	name: string;
	isSuperadmin: boolean;
	locationId: number | null;
}

export function roleHome(role: UserRole): string {
	if (role === 'waiter') return '/waiter';
	if (role === 'kitchen') return '/kitchen';
	return '/';
}
