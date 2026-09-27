// apps/backend/src/common/services/webhook-verifier.service.ts
// Issue #1143: Extract shared webhook signature verification utility

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface WebhookVerificationOptions {
  secret: string;
  signatureHeader?: string;
  timestampHeader?: string;
  tolerance?: number; // Tolerance in seconds for timestamp validation
  algorithm?: 'sha256' | 'sha1' | 'sha512';
}

export interface VerifiedWebhook<T = any> {
  payload: T;
  headers: Record<string, string>;
  signature: string;
  timestamp: number;
  isValid: boolean;
  verificationDetails: {
    signatureMatch: boolean;
    timestampValid: boolean;
    replayCheck: boolean;
  };
}

@Injectable()
export class WebhookVerifierService {
  private readonly logger = new Logger(WebhookVerifierService.name);
  private readonly defaultOptions: Required<WebhookVerificationOptions>;

  constructor(options: WebhookVerificationOptions) {
    this.defaultOptions = {
      secret: options.secret,
      signatureHeader: options.signatureHeader || 'x-hub-signature-256',
      timestampHeader: options.timestampHeader || 'x-hub-timestamp',
      tolerance: options.tolerance || 300, // 5 minutes default
      algorithm: options.algorithm || 'sha256',
    };
  }

  /**
   * Verify a webhook payload with signature
   */
  async verify<T = any>(
    payload: string | Buffer,
    headers: Record<string, string>
  ): Promise<VerifiedWebhook<T>> {
    const signature = this.extractSignature(headers);
    const timestamp = this.extractTimestamp(headers);
    const payloadString = typeof payload === 'string' ? payload : payload.toString();
    
    const verificationDetails = {
      signatureMatch: false,
      timestampValid: false,
      replayCheck: false,
    };

    // 1. Verify timestamp
    const timestampValid = this.verifyTimestamp(timestamp);
    verificationDetails.timestampValid = timestampValid;
    
    if (!timestampValid) {
      this.logger.warn(`Invalid timestamp: ${timestamp}`);
    }

    // 2. Verify signature
    const expectedSignature = this.generateSignature(payloadString, timestamp);
    const signatureMatch = this.compareSignatures(signature, expectedSignature);
    verificationDetails.signatureMatch = signatureMatch;
    
    if (!signatureMatch) {
      this.logger.warn('Signature mismatch');
    }

    // 3. Check for replay attacks (basic check - could be enhanced with Redis store)
    const replayCheck = this.checkReplay(signature, timestamp);
    verificationDetails.replayCheck = replayCheck;
    
    if (!replayCheck) {
      this.logger.warn('Potential replay attack detected');
    }

    // 4. Parse payload
    let parsedPayload: T;
    try {
      parsedPayload = JSON.parse(payloadString);
    } catch (error) {
      this.logger.error('Failed to parse webhook payload', error);
      throw new Error('Invalid webhook payload format');
    }

    const isValid = signatureMatch && timestampValid && replayCheck;

    return {
      payload: parsedPayload,
      headers,
      signature,
      timestamp,
      isValid,
      verificationDetails,
    };
  }

  /**
   * Generate signature for testing or verification
   */
  generateSignature(payload: string, timestamp?: number): string {
    const { algorithm, secret } = this.defaultOptions;
    const timestampStr = timestamp ? timestamp.toString() : '';
    const data = timestampStr ? `${timestampStr}.${payload}` : payload;
    
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(data);
    
    return `${algorithm}=${hmac.digest('hex')}`;
  }

  /**
   * Extract signature from headers
   */
  private extractSignature(headers: Record<string, string>): string {
    const signatureHeader = this.defaultOptions.signatureHeader.toLowerCase();
    
    for (const [header, value] of Object.entries(headers)) {
      if (header.toLowerCase() === signatureHeader) {
        return value;
      }
    }
    
    throw new Error(`Signature header '${this.defaultOptions.signatureHeader}' not found`);
  }

  /**
   * Extract timestamp from headers
   */
  private extractTimestamp(headers: Record<string, string>): number {
    const timestampHeader = this.defaultOptions.timestampHeader.toLowerCase();
    
    for (const [header, value] of Object.entries(headers)) {
      if (header.toLowerCase() === timestampHeader) {
        const timestamp = parseInt(value, 10);
        if (isNaN(timestamp)) {
          throw new Error(`Invalid timestamp value: ${value}`);
        }
        return timestamp;
      }
    }
    
    // If timestamp header is not required, use current time
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Verify timestamp is within tolerance
   */
  private verifyTimestamp(timestamp: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const tolerance = this.defaultOptions.tolerance;
    
    return Math.abs(now - timestamp) <= tolerance;
  }

  /**
   * Compare signatures using timing-safe comparison
   */
  private compareSignatures(signature: string, expected: string): boolean {
    try {
      // Parse algorithm and hash
      const [algo, hash] = signature.split('=');
      const [expectedAlgo, expectedHash] = expected.split('=');
      
      if (algo !== expectedAlgo) {
        return false;
      }
      
      // Convert hex strings to buffers for timing-safe comparison
      const signatureBuffer = Buffer.from(hash, 'hex');
      const expectedBuffer = Buffer.from(expectedHash, 'hex');
      
      // Ensure buffers are same length
      if (signatureBuffer.length !== expectedBuffer.length) {
        return false;
      }
      
      return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      this.logger.error('Error comparing signatures', error);
      return false;
    }
  }

  /**
   * Basic replay check (in production, this should use Redis or similar)
   */
  private checkReplay(signature: string, timestamp: number): boolean {
    // Basic implementation - checks if timestamp is within tolerance
    // In production, you'd want to store seen signatures in Redis with TTL
    const now = Math.floor(Date.now() / 1000);
    const tolerance = this.defaultOptions.tolerance;
    
    // If timestamp is too old or in the future beyond tolerance, reject
    if (Math.abs(now - timestamp) > tolerance) {
      return false;
    }
    
    // TODO: Implement proper replay store (Redis with TTL)
    // This would check if we've seen this exact signature before
    
    return true;
  }

  /**
   * Create GitHub-specific verifier
   */
  static createGitHubVerifier(secret: string): WebhookVerifierService {
    return new WebhookVerifierService({
      secret,
      signatureHeader: 'x-hub-signature-256',
      timestampHeader: 'x-hub-timestamp',
      algorithm: 'sha256',
      tolerance: 600, // 10 minutes for GitHub
    });
  }

  /**
   * Create Stripe-specific verifier
   */
  static createStripeVerifier(secret: string): WebhookVerifierService {
    return new WebhookVerifierService({
      secret,
      signatureHeader: 'stripe-signature',
      timestampHeader: 'stripe-timestamp',
      algorithm: 'sha256',
      tolerance: 300, // 5 minutes for Stripe
    });
  }

  /**
   * Create Slack-specific verifier
   */
  static createSlackVerifier(secret: string): WebhookVerifierService {
    return new WebhookVerifierService({
      secret,
      signatureHeader: 'x-slack-signature',
      timestampHeader: 'x-slack-request-timestamp',
      algorithm: 'sha256',
      tolerance: 300, // 5 minutes for Slack
    });
  }

  /**
   * Create generic verifier
   */
  static createGenericVerifier(
    secret: string,
    signatureHeader: string = 'x-signature',
    timestampHeader: string = 'x-timestamp'
  ): WebhookVerifierService {
    return new WebhookVerifierService({
      secret,
      signatureHeader,
      timestampHeader,
      algorithm: 'sha256',
      tolerance: 300, // 5 minutes default
    });
  }
}