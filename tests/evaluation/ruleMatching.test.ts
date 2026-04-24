import { describe, expect, it } from 'bun:test';
import { matchCandidateToPlan, toCandidateLike } from '$lib/server/tradeups/evaluation/ruleMatching';
import { candidateRow, plan, rule } from '../helpers/factories';

describe('rule matching', () => {
  it('matches by catalog collection id before falling back to collection text', () => {
    const candidate = candidateRow({
      collection: 'Renamed Alpha Collection',
      catalogCollectionId: 'collection-alpha',
    });
    const testPlan = plan({}, {
      rules: [
        rule({
          collection: 'Alpha Collection',
          catalogCollectionId: 'collection-alpha',
        }),
      ],
    });

    expect(matchCandidateToPlan(toCandidateLike(candidate), testPlan)?.ruleId).toBe('rule-1');
  });

  it('rejects mismatched catalog collection ids even when collection text matches', () => {
    const candidate = candidateRow({
      collection: 'Alpha Collection',
      catalogCollectionId: 'collection-bravo',
    });
    const testPlan = plan({}, {
      rules: [
        rule({
          collection: 'Alpha Collection',
          catalogCollectionId: 'collection-alpha',
        }),
      ],
    });

    expect(matchCandidateToPlan(toCandidateLike(candidate), testPlan)).toBeNull();
  });
});
