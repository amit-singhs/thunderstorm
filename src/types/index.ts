export interface KeySetupRequest {
  publicKey: string;
  pinHash: string;
  authId: string;
}

export interface KeyResponse {
  keyId: string;
}

export interface ActiveKeyResponse {
  keyId?: string;
  publicKey?: string;
  error?: string;
}

export interface DocumentSignRequest {
  documentId: string;
  signature: string;
  keyId: string;
}

export interface DocumentSignResponse {
  success: boolean;
  signatureId: string;
}

export interface SignerInfo {
  userId: string;
  signedAt: string;
  publicKey: string;
}

export interface DocumentVerifyResponse {
  isValid: boolean;
  signerInfo: SignerInfo;
}

export interface AuthenticatedRequest {
  user: {
    id: string;
    // add other user properties if needed
  };
}

export interface DeactivateKeyRequest {
  authId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      // add other user properties if needed
    };
  }
} 