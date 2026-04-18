import type { LabeledClaimExample } from './types.js';

export const benchmarkExamples: LabeledClaimExample[] = [
  {
    id: 'hist_supported_001',
    domain: 'history',
    expectedTruthState: 'supported',
    expectedMinScore: 0.65,
    expectedMaxScore: 0.90,
    input: {
      claim: {
        id: 'clm_b1',
        claimText: 'The archive memo revised the committee narrative after the incident.',
        predicate: 'revised',
        object: 'committee narrative',
        polarity: 'affirmed',
        modality: 'asserted_fact',
        canonicalFingerprint: 'memo|revised|committee narrative',
        timeStart: '1981-01-01T00:00:00Z',
        timeEnd: '1982-12-31T00:00:00Z',
      },
      evidence: [
        {
          span: { id: 'e1', claimId: 'clm_b1', sourceVersionId: 'sv1', quotedText: 'The memorandum updated the committee narrative in all follow-on briefings.', evidenceRole: 'supporting', pageNumber: 4, extractionConfidence: 0.93 },
          sourceVersion: { id: 'sv1', sourceId: 's1', versionNumber: 1, extractionConfidence: 0.95, contentHash: 'h1' },
          source: { id: 's1', title: 'Archived memo', sourceType: 'government_record', origin: 'National Archive', author: 'Records Office', publishedAt: '1982-01-02T00:00:00Z', acquiredAt: '2026-04-17T00:00:00Z', reliabilityPrior: 0.89, chainOfCustodyScore: 0.94, primarySource: true },
        },
      ],
    },
  },
  {
    id: 'hist_contested_001',
    domain: 'history',
    expectedTruthState: 'contested',
    expectedMinScore: 0.20,
    expectedMaxScore: 0.55,
    input: {
      claim: {
        id: 'clm_b2',
        claimText: 'The official account was never revised.',
        predicate: 'was_never_revised',
        object: 'official account',
        polarity: 'affirmed',
        modality: 'asserted_fact',
        canonicalFingerprint: 'official account|never revised',
      },
      evidence: [
        {
          span: { id: 'e2', claimId: 'clm_b2', sourceVersionId: 'sv2', quotedText: 'The committee states there was no revision to its position.', evidenceRole: 'supporting', extractionConfidence: 0.88 },
          sourceVersion: { id: 'sv2', sourceId: 's2', versionNumber: 1, extractionConfidence: 0.9, contentHash: 'h2' },
          source: { id: 's2', title: 'Press statement', sourceType: 'article', origin: 'Committee Office', author: 'Press Secretary', publishedAt: '1982-02-10T00:00:00Z', acquiredAt: '2026-04-17T00:00:00Z', reliabilityPrior: 0.57, chainOfCustodyScore: 0.70, primarySource: false },
        },
        {
          span: { id: 'e3', claimId: 'clm_b2', sourceVersionId: 'sv3', quotedText: 'The memorandum updated the committee narrative in all follow-on briefings.', evidenceRole: 'contradicting', extractionConfidence: 0.93, pageNumber: 4 },
          sourceVersion: { id: 'sv3', sourceId: 's3', versionNumber: 1, extractionConfidence: 0.95, contentHash: 'h3' },
          source: { id: 's3', title: 'Archived memo', sourceType: 'government_record', origin: 'National Archive', author: 'Records Office', publishedAt: '1982-01-02T00:00:00Z', acquiredAt: '2026-04-17T00:00:00Z', reliabilityPrior: 0.89, chainOfCustodyScore: 0.94, primarySource: true },
        },
      ],
      claimRelations: [{ fromClaimId: 'clm_b2', toClaimId: 'clm_b1', relationType: 'contradicts', confidence: 0.82 }],
    },
  },
  {
    id: 'osint_likely_false_001',
    domain: 'osint',
    expectedTruthState: 'likely_false',
    expectedMinScore: 0.0,
    expectedMaxScore: 0.25,
    input: {
      claim: {
        id: 'clm_b3',
        claimText: 'Anonymous viral posts proved the event happened in 1971.',
        predicate: 'proved',
        object: 'event happened in 1971',
        polarity: 'affirmed',
        modality: 'allegation',
        canonicalFingerprint: 'viral posts|proved|1971 event',
        timeStart: '1971-01-01T00:00:00Z',
        timeEnd: '1971-12-31T00:00:00Z',
      },
      evidence: [
        {
          span: { id: 'e4', claimId: 'clm_b3', sourceVersionId: 'sv4', quotedText: 'Sources say the event happened in 1971.', evidenceRole: 'supporting', extractionConfidence: 0.61 },
          sourceVersion: { id: 'sv4', sourceId: 's4', versionNumber: 1, extractionConfidence: 0.65, contentHash: 'h4' },
          source: { id: 's4', title: 'Anonymous repost', sourceType: 'social_post', origin: null, author: null, publishedAt: null, acquiredAt: '2026-04-17T00:00:00Z', reliabilityPrior: 0.20, chainOfCustodyScore: 0.18, primarySource: false },
        },
      ],
    },
  },
];
