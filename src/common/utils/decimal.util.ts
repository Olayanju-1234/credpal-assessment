import { Decimal } from 'decimal.js';
import { BadRequestException } from '@nestjs/common';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN });

export function add(a: string, b: string): string {
  return new Decimal(a).plus(new Decimal(b)).toFixed(4);
}

export function subtract(a: string, b: string): string {
  const result = new Decimal(a).minus(new Decimal(b));
  if (result.isNegative()) {
    throw new BadRequestException('Insufficient balance');
  }
  return result.toFixed(4);
}

export function multiply(a: string, b: string): string {
  return new Decimal(a).times(new Decimal(b)).toFixed(4);
}

export function divide(a: string, b: string, decimals = 8): string {
  if (new Decimal(b).isZero()) {
    throw new BadRequestException('Division by zero');
  }
  return new Decimal(a).dividedBy(new Decimal(b)).toFixed(decimals);
}

export function multiplyRate(amount: string, rate: string): string {
  return new Decimal(amount).times(new Decimal(rate)).toFixed(4);
}

export function isPositive(a: string): boolean {
  const val = new Decimal(a);
  return val.isPositive() && !val.isZero();
}

export function isGreaterThanOrEqual(a: string, b: string): boolean {
  return new Decimal(a).greaterThanOrEqualTo(new Decimal(b));
}

export function applySpread(
  rate: string,
  spreadPercent: string,
  direction: 'markup' | 'markdown',
): string {
  const spreadMultiplier =
    direction === 'markup'
      ? new Decimal(1).plus(new Decimal(spreadPercent).dividedBy(100))
      : new Decimal(1).minus(new Decimal(spreadPercent).dividedBy(100));
  return new Decimal(rate).times(spreadMultiplier).toFixed(8);
}
