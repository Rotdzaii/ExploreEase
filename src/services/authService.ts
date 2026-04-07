import { supabase } from './supabase';

export type TotpEnrollmentResult = {
  factorId: string;
  friendlyName: string;
  secret: string;
  uri: string;
  qrCode: string | null;
};

const DEFAULT_FRIENDLY_NAME = 'ExploreEase Authenticator';

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
};
