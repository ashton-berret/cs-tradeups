import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { BuyQueueResult, CandidateDTO, InventoryItemDTO, PlanDTO } from '$lib/types/services';
import type { PaginatedResponse } from '$lib/types/domain';
import { db } from '$lib/server/db/client';
import { buildDiscoveryTargets } from '$lib/server/discovery/watchlistService';

export interface BuyQueueItemDetail {
	marketHashName: string;
	floatValue: number | null;
	listingUrl: string | null;
}

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const planId = url.searchParams.get('planId') ?? undefined;
		const queuePath = planId
			? `/api/tradeups/buy-queue?planId=${encodeURIComponent(planId)}`
			: '/api/tradeups/buy-queue';
		const [queue, plansPage, discovery] = await Promise.all([
			apiFetch<BuyQueueResult>(fetch, queuePath),
			apiFetch<PaginatedResponse<PlanDTO>>(fetch, '/api/tradeups/plans?isActive=true&limit=100'),
			buildDiscoveryTargets()
		]);

		// Batch-load reference data for every assigned row so the listing card
		// can show market hash name, float, and the Steam listings URL without
		// needing N separate fetches per row.
		const candidateIds: string[] = [];
		const inventoryIds: string[] = [];
		for (const a of queue.assignments) {
			if (a.poolItemKind === 'CANDIDATE') candidateIds.push(a.sourceId);
			else inventoryIds.push(a.sourceId);
		}
		const [candidates, inventoryItems] = await Promise.all([
			candidateIds.length
				? db.candidateListing.findMany({
						where: { id: { in: candidateIds } },
						select: { id: true, marketHashName: true, floatValue: true, listingUrl: true }
					})
				: Promise.resolve([]),
			inventoryIds.length
				? db.inventoryItem.findMany({
						where: { id: { in: inventoryIds } },
						select: { id: true, marketHashName: true, floatValue: true }
					})
				: Promise.resolve([])
		]);
		const itemDetails: Record<string, BuyQueueItemDetail> = {};
		for (const c of candidates) {
			itemDetails[`candidate:${c.id}`] = {
				marketHashName: c.marketHashName,
				floatValue: c.floatValue,
				listingUrl: c.listingUrl
			};
		}
		for (const i of inventoryItems) {
			itemDetails[`inventory:${i.id}`] = {
				marketHashName: i.marketHashName,
				floatValue: i.floatValue,
				listingUrl: null
			};
		}

		return { queue, plans: plansPage.data, planId: planId ?? null, itemDetails, discovery };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	markBought: async ({ request, fetch }) => {
		const form = await request.formData();
		const candidateId = form.get('candidateId');
		const purchasePrice = form.get('purchasePrice');
		const intendedBasketId = form.get('intendedBasketId');
		const intendedSlotIndex = form.get('intendedSlotIndex');

		if (typeof candidateId !== 'string' || candidateId === '') {
			return fail(400, { error: 'Missing candidateId.' });
		}
		const price = typeof purchasePrice === 'string' ? Number(purchasePrice) : NaN;
		if (!Number.isFinite(price) || price < 0) {
			return fail(400, { error: 'Invalid purchase price.' });
		}

		const body: Record<string, unknown> = { purchasePrice: price };
		if (typeof intendedBasketId === 'string' && intendedBasketId) {
			body.intendedBasketId = intendedBasketId;
		}
		if (typeof intendedSlotIndex === 'string' && intendedSlotIndex !== '') {
			const slot = Number(intendedSlotIndex);
			if (Number.isInteger(slot)) body.intendedSlotIndex = slot;
		}

		try {
			const result = await apiFetch<{
				candidate: CandidateDTO;
				inventoryItem: InventoryItemDTO;
				basketReservation?: { basketId: string; slotIndex: number } | { warning: string } | null;
			}>(fetch, `/api/candidates/${encodeURIComponent(candidateId)}/buy`, {
				method: 'POST',
				body: JSON.stringify(body)
			});
			return { success: 'Marked bought.', result };
		} catch (err) {
			if (err instanceof ApiError) {
				return fail(err.status, { error: err.message, issues: err.issues });
			}
			throw err;
		}
	},
	discard: async ({ request, fetch }) => {
		const form = await request.formData();
		const candidateId = form.get('candidateId');
		if (typeof candidateId !== 'string' || candidateId === '') {
			return fail(400, { error: 'Missing candidateId.' });
		}
		try {
			await apiFetch(fetch, `/api/candidates/${encodeURIComponent(candidateId)}`, {
				method: 'PATCH',
				body: JSON.stringify({ status: 'PASSED', pinnedByUser: true })
			});
			return { success: 'Discarded.' };
		} catch (err) {
			if (err instanceof ApiError) {
				return fail(err.status, { error: err.message, issues: err.issues });
			}
			throw err;
		}
	}
};
