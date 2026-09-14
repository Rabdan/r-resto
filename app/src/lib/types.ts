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
	roles: UserRole[];
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

export function deviceHasRole(
	device: Pick<DeviceSession, 'roles' | 'role'> | null | undefined,
	role: UserRole
): boolean {
	if (!device) return false;
	if (device.roles?.includes(role)) return true;
	return device.role === role;
}

export function posRolesOf(device: Pick<DeviceSession, 'roles' | 'role'> | null | undefined): UserRole[] {
	if (!device) return [];
	if (device.roles?.length) return device.roles;
	return device.role ? [device.role] : [];
}
