import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { BuyQueueResult, CandidateDTO, InventoryItemDTO, PlanDTO } from '$lib/types/services';
import type { PaginatedResponse } from '$lib/types/domain';

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const planId = url.searchParams.get('planId') ?? undefined;
		const queuePath = planId
			? `/api/tradeups/buy-queue?planId=${encodeURIComponent(planId)}`
			: '/api/tradeups/buy-queue';
		const [queue, plansPage] = await Promise.all([
			apiFetch<BuyQueueResult>(fetch, queuePath),
			apiFetch<PaginatedResponse<PlanDTO>>(fetch, '/api/tradeups/plans?isActive=true&limit=100')
		]);
		return { queue, plans: plansPage.data, planId: planId ?? null };
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
	}
};
