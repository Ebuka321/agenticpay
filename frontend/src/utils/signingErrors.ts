/**
 * Heuristics for Stellar auth errors that often indicate multisig / partial signing.
 */

const MULTISIG_AUTH_PATTERN =
  /tx_bad_auth|op_bad_auth|bad[_\s]?auth|wrong signer|additional signature|low signature weight/i;

export function isLikelyPartialSigningOrMultisigAuth(message: string): boolean {
  return MULTISIG_AUTH_PATTERN.test(message);
}

export function appendPartialSigningHint(message: string): string {
  if (!isLikelyPartialSigningOrMultisigAuth(message)) return message;
  if (/partial signature|multisig|additional signer/i.test(message)) return message;
  return `${message} If this account uses multisig, collect the required signatures on the transaction XDR before submitting.`;
}
