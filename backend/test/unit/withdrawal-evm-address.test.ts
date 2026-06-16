import { describe, it, expect } from 'vitest';
import {
  feeForChain,
  isSupportedChain,
  isValidAddressForChain,
} from '../../src/modules/withdrawal/withdrawal.types';
import { addAddressSchema, createWithdrawalSchema } from '../../src/modules/withdrawal/withdrawal.validators';

const EVM = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

describe('withdrawal chain + address validation', () => {
  it('accepts well-formed EVM addresses only for EVM chains', () => {
    expect(isValidAddressForChain('ETHEREUM', EVM)).toBe(true);
    expect(isValidAddressForChain('BSC', EVM)).toBe(true);
    expect(isValidAddressForChain('ETHEREUM', TRON)).toBe(false);
    expect(isValidAddressForChain('ETHEREUM', '0x123')).toBe(false);
    expect(isValidAddressForChain('ETHEREUM', `${EVM}ZZ`)).toBe(false);
  });

  it('accepts TRON base58 addresses only for TRON', () => {
    expect(isValidAddressForChain('TRON', TRON)).toBe(true);
    expect(isValidAddressForChain('TRON', EVM)).toBe(false);
    expect(isValidAddressForChain('BSC', TRON)).toBe(false);
  });

  it('reports supported chains', () => {
    for (const c of ['TRON', 'ETHEREUM', 'BSC']) expect(isSupportedChain(c)).toBe(true);
    expect(isSupportedChain('POLYGON')).toBe(false);
  });

  it('returns chain-specific fees (ETH > BSC > TRON)', () => {
    expect(feeForChain('ETHEREUM').gt(feeForChain('BSC'))).toBe(true);
    expect(feeForChain('BSC').gt(feeForChain('TRON'))).toBe(true);
  });

  it('validator rejects an EVM address on TRON and vice-versa', () => {
    expect(addAddressSchema.safeParse({ chain: 'ETHEREUM', address: EVM }).success).toBe(true);
    expect(addAddressSchema.safeParse({ chain: 'ETHEREUM', address: TRON }).success).toBe(false);
    expect(addAddressSchema.safeParse({ chain: 'TRON', address: EVM }).success).toBe(false);

    expect(createWithdrawalSchema.safeParse({ chain: 'BSC', toAddress: EVM, amount: '10' }).success).toBe(true);
    expect(createWithdrawalSchema.safeParse({ chain: 'BSC', toAddress: TRON, amount: '10' }).success).toBe(false);
    // chain defaults to TRON when omitted (back-compat).
    expect(createWithdrawalSchema.safeParse({ toAddress: TRON, amount: '10' }).success).toBe(true);
  });
});
