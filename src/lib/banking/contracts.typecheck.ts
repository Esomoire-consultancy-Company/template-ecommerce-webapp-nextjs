import type { BankConnectionRequestScope } from './types';
import type {
  BankReplayEvidence,
  BankSettlementRiverHandoff,
  RiverBankIngestionContext,
} from './river-ingestion';
import { compileBankRiverEvent } from './river-ingestion';

export const validReadScope: BankConnectionRequestScope =
  'TRANSACTION_READ';

// @ts-expect-error PAYMENT_INITIATE is deliberately excluded from bank connection requests.
export const invalidPaymentScope: BankConnectionRequestScope =
  'PAYMENT_INITIATE';

type CompileInput = Parameters<typeof compileBankRiverEvent>[0];

const handoff = {} as BankSettlementRiverHandoff;
const context: RiverBankIngestionContext = {
  workspaceId: 'typecheck-workspace',
};
const replay: BankReplayEvidence = {
  deterministic: true,
  observationSetHash: 'observation-hash',
  reconciliationHash: 'reconciliation-hash',
  replayedAt: '2026-09-23T00:00:00.000Z',
};

export const validRiverCompileInput: CompileInput = {
  handoff,
  context,
  replay,
};

// @ts-expect-error A caller-supplied boolean cannot substitute for hash-bound replay evidence.
export const invalidRiverCompileInput: CompileInput = {
  handoff,
  context,
  replayVerified: true,
};
