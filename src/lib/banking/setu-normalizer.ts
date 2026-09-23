import { BankTransactionObservation } from './types';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function rupeesToMinor(value: unknown): number | undefined {
  const text = asString(value);
  if (!text || !/^-?\d+(?:\.\d{1,2})?$/.test(text)) return undefined;

  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ''] = unsigned.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return Number.isSafeInteger(minor) ? (negative ? -minor : minor) : undefined;
}

/**
 * Privacy-minimizing Setu AA DEPOSIT FI normalizer.
 *
 * It intentionally ignores Profile/KYC fields and emits only the transaction
 * fields required by the commerce settlement reconciliation layer.
 */
export function normalizeSetuDepositTransactions(input: {
  bankConnectionRef: string;
  fiResponse: unknown;
}): BankTransactionObservation[] {
  const root = asRecord(input.fiResponse);
  const observations: BankTransactionObservation[] = [];

  for (const fipValue of asArray(root?.fips)) {
    const fip = asRecord(fipValue);

    for (const accountValue of asArray(fip?.accounts)) {
      const account = asRecord(accountValue);
      const data = asRecord(account?.data);
      const accountData = asRecord(data?.account);
      const transactions = asRecord(accountData?.transactions);

      for (const txnValue of asArray(transactions?.transaction)) {
        const txn = asRecord(txnValue);

        if (!txn) {
          throw new Error(
            'Setu FI normalization failed: transaction record is not an object.'
          );
        }

        const amountMinor = rupeesToMinor(txn.amount);
        const type = asString(txn.type)?.toUpperCase();
        const providerTransactionRef =
          asString(txn.txnId) ?? asString(txn.reference);
        const observedAt =
          asString(txn.transactionTimestamp) ?? asString(txn.valueDate);

        if (
          amountMinor === undefined ||
          !providerTransactionRef ||
          !observedAt ||
          (type !== 'CREDIT' && type !== 'DEBIT')
        ) {
          throw new Error(
            'Setu FI normalization failed: transaction is missing a valid amount, reference, timestamp, or CREDIT/DEBIT direction.'
          );
        }

        observations.push({
          bankConnectionRef: input.bankConnectionRef,
          providerTransactionRef,
          observedAt,
          bookedAt: asString(txn.valueDate),
          amountMinor,
          currency: 'INR',
          direction: type,
          description: asString(txn.narration),
        });
      }
    }
  }

  return observations.sort((a, b) => {
    const byRef = a.providerTransactionRef.localeCompare(
      b.providerTransactionRef
    );
    if (byRef !== 0) return byRef;

    const byObserved = a.observedAt.localeCompare(b.observedAt);
    if (byObserved !== 0) return byObserved;

    if (a.amountMinor !== b.amountMinor) {
      return a.amountMinor - b.amountMinor;
    }

    return a.direction.localeCompare(b.direction);
  });
}
