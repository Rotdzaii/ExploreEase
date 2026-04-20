import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type TotpEnrollmentResult = {
  factorId: string;
  friendlyName: string;
  secret: string;
  uri: string;
  qrCode: string | null;
};

const DEFAULT_FRIENDLY_NAME = 'ExploreEase Authenticator';

type AssuranceLevel = 'aal1' | 'aal2' | 'unknown';

type TotpFactorLike = {
  id?: string | null;
  status?: string | null;
};

export type MfaGateInfo = {
  requiresMfa: boolean;
  factorId: string | null;
  hasKnownFactor: boolean;
  assuranceLevel: AssuranceLevel;
  nextAssuranceLevel: AssuranceLevel;
};

const normalizeAal = (value: unknown): AssuranceLevel => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'aal1' || normalized === 'aal2') return normalized;
  return 'unknown';
};

const getSessionUserAal = (sessionUser?: User | null): AssuranceLevel => {
  const directAal = normalizeAal((sessionUser as any)?.aal);
  if (directAal !== 'unknown') return directAal;

  const appMetadataAal = normalizeAal((sessionUser as any)?.app_metadata?.aal);
  if (appMetadataAal !== 'unknown') return appMetadataAal;

  return 'unknown';
};

const getSessionFactorIds = (sessionUser?: User | null): string[] => {
  const factorsRaw = Array.isArray((sessionUser as any)?.factors)
    ? ((sessionUser as any).factors as { id?: unknown }[])
    : [];

  return factorsRaw
    .map((factor) => String(factor?.id ?? '').trim())
    .filter(Boolean);
};

const pickPreferredFactorId = (factors: TotpFactorLike[]): string | null => {
  const normalizedFactors = factors
    .map((factor) => ({
      id: String(factor?.id ?? '').trim(),
      status: String(factor?.status ?? '').trim().toLowerCase(),
    }))
    .filter((factor) => Boolean(factor.id));

  const verified = normalizedFactors.find((factor) => factor.status === 'verified');
  if (verified) return verified.id;

  return normalizedFactors[0]?.id ?? null;
};

export const authService = {
  async enrollMfaTotp(friendlyName: string = DEFAULT_FRIENDLY_NAME): Promise<TotpEnrollmentResult> {
    const normalizedFriendlyName = friendlyName.trim() || DEFAULT_FRIENDLY_NAME;

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: normalizedFriendlyName,
    });

    if (error) throw error;

    const factorId = String((data as any)?.id ?? '').trim();
    const secret = String((data as any)?.totp?.secret ?? '').trim();
    const uri = String((data as any)?.totp?.uri ?? '').trim();
    const qrCodeRaw = (data as any)?.totp?.qr_code;
    const qrCode = typeof qrCodeRaw === 'string' && qrCodeRaw.trim() ? qrCodeRaw : null;

    if (!factorId || !secret || !uri) {
      throw new Error('MFA enrollment response is incomplete.');
    }

    return {
      factorId,
      friendlyName: normalizedFriendlyName,
      secret,
      uri,
      qrCode,
    };
  },

  async verifyMfaTotp(input: { factorId: string; code: string }): Promise<{ verified: boolean }> {
    const factorId = input.factorId.trim();
    const code = input.code.trim();

    if (!factorId) {
      throw new Error('Missing factor id for verification.');
    }

    if (!/^\d{6}$/.test(code)) {
      throw new Error('Invalid OTP code.');
    }

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) throw challengeError;

    const challengeId = String((challengeData as any)?.id ?? '').trim();
    if (!challengeId) {
      throw new Error('Unable to create MFA challenge.');
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });
    if (verifyError) throw verifyError;

    return { verified: true };
  },

  async getMfaGateInfo(sessionUser?: User | null): Promise<MfaGateInfo> {
    const sessionFactorIds = getSessionFactorIds(sessionUser);
    const sessionUserAal = getSessionUserAal(sessionUser);

    const [{ data: aalData, error: aalError }, { data: factorsData, error: factorsError }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

    if (aalError) {
      console.warn('getMfaGateInfo.assuranceLevel failed:', aalError.message);
    }
    if (factorsError) {
      console.warn('getMfaGateInfo.listFactors failed:', factorsError.message);
    }

    const runtimeAssuranceLevel = normalizeAal((aalData as any)?.currentLevel);
    const assuranceLevel = runtimeAssuranceLevel === 'unknown' ? sessionUserAal : runtimeAssuranceLevel;
    const nextAssuranceLevel = normalizeAal((aalData as any)?.nextLevel);
    const totpFactors = Array.isArray((factorsData as any)?.totp)
      ? (((factorsData as any).totp as TotpFactorLike[]) ?? [])
      : [];

    const hasKnownFactor = totpFactors.length > 0 || sessionFactorIds.length > 0;
    const factorId = pickPreferredFactorId(totpFactors) ?? sessionFactorIds[0] ?? null;

    // MFA is required only while user has enrolled factors and has not reached AAL2 yet.
    const requiresMfa = hasKnownFactor && assuranceLevel !== 'aal2';

    return {
      requiresMfa,
      factorId,
      hasKnownFactor,
      assuranceLevel,
      nextAssuranceLevel,
    };
  },

  async challengeAndVerifyTotp(input: { factorId: string; code: string }): Promise<{ verified: boolean }> {
    const factorId = input.factorId.trim();
    const code = input.code.trim();

    if (!factorId) {
      throw new Error('Missing factor id for verification.');
    }

    if (!/^\d{6}$/.test(code)) {
      throw new Error('Invalid OTP code.');
    }

    const mfaApi = (supabase.auth as any)?.mfa;
    const challengeAndVerify = mfaApi?.challengeAndVerify;

    if (typeof challengeAndVerify === 'function') {
      const { error } = await challengeAndVerify({ factorId, code });
      if (error) throw error;
      return { verified: true };
    }

    // Fallback for SDKs that do not expose challengeAndVerify yet.
    return this.verifyMfaTotp({ factorId, code });
  },
};
