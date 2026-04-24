import { describe, expect, it } from 'bun:test';
import { resolveCatalogIdentity } from '$lib/server/catalog/linkage';

describe('catalog linkage', () => {
	it('matches an exact exterior-qualified market hash name', async () => {
		const match = await resolveCatalogIdentity({
			marketHashName: 'AK-47 | Slate (Field-Tested)',
		});

		expect(match).not.toBeNull();
		expect(match).toMatchObject({
			weaponName: 'AK-47',
			skinName: 'Slate',
			collection: 'The Snakebite Collection',
			catalogWeaponDefIndex: 7,
			exterior: 'FIELD_TESTED',
		});
	});

	it('matches a base market hash name even when the input includes a quality prefix', async () => {
		const match = await resolveCatalogIdentity({
			marketHashName: 'StatTrak™ USP-S | The Traitor (Field-Tested)',
		});

		expect(match).not.toBeNull();
		expect(match).toMatchObject({
			weaponName: 'USP-S',
			skinName: 'The Traitor',
			collection: 'The Snakebite Collection',
			exterior: 'FIELD_TESTED',
		});
	});
});
