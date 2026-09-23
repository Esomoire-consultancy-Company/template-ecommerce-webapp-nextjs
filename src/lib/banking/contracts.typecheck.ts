import type { BankConnectionRequestScope } from './types';
import type { BankReplayEvidence } from './river-ingestion';
import { compileBankRiverEvent } from './river-ingestion';

type AssertTrue<T extends true> = T;
type AssertFalse<T extends false> = T;

type CompileInput = Parameters<typeof compileBankRiverEvent>[0];

export type PaymentInitiationExcludedFromConnectionRequest = AssertFalse<
  'PAYMENT_INITIATE' extends BankConnectionRequestScope ? true : false
>;

export type ReplayEvidenceRequired = AssertTrue<
  'replay' extends keyof CompileInput ? true : false
>;

export type BooleanReplayBypassAbsent = AssertFalse<
  'replayVerified' extends keyof CompileInput ? true : false
>;

export type ReplayMustBeHashBound = AssertTrue<
  BankReplayEvidence extends {
    deterministic: true;
    observationSetHash: string;
    reconciliationHash: string;
  }
    ? true
    : false
>;
