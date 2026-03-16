import { Currency } from '../enums';

export function orderedCurrencyPair(
  a: Currency,
  b: Currency,
): [Currency, Currency] {
  return a < b ? [a, b] : [b, a];
}
