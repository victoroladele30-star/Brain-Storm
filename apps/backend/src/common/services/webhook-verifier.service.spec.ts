// apps/backend/src/common/services/webhook-verifier.service.spec.ts
// Issue #1143: Tests for shared webhook verification utility

import { Test, TestingModule } from '@nestjs/testing';
import { WebhookVerifierService } from './webhook-verifier.service';

describe('WebhookVerifierService', () => {
  let service: WebhookVerifierService;
  const secret = 'test-secret-123';
  const payload = JSON.stringify({ event: 'test', data: { foo: 'bar' } });
  const timestamp = Math.floor(Date.now() / 1000);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: WebhookVerifierService,
          useFactory: () => new WebhookVerifierService({ secret }),
        },
      ],
    }).compile();

    service = module.get<WebhookVerifierService>(WebhookVerifierService);
  });

  describe('signature verification', () => {
    it('should verify valid signature', async () => {
      const expectedSignature = service.generateSignature(payload, timestamp);
      const headers = {
        'x-signature': expectedSignature,
        'x-timestamp': timestamp.toString(),
      };

      const result = await service.verify(payload, headers);

      expect(result.isValid).toBe(true);
      expect(result.verificationDetails.signatureMatch).toBe(true);
      expect(result.verificationDetails.timestampValid).toBe(true);
      expect(result.verificationDetails.replayCheck).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const validSignature = service.generateSignature(payload, timestamp);
      const invalidSignature = `${validSignature}tampered`;
      
      const headers = {
        'x-signature': invalidSignature,
        'x-timestamp': timestamp.toString(),
      };

      const result = await service.verify(payload, headers);

      expect(result.isValid).toBe(false);
      expect(result.verificationDetails.signatureMatch).toBe(false);
    });

    it('should reject missing signature header', async () => {
      const headers = {
        'x-timestamp': timestamp.toString(),
      };

      await expect(service.verify(payload, headers)).rejects.toThrow(
        "Signature header 'x-signature' not found"
      );
    });

    it('should handle case-insensitive headers', async () => {
      const expectedSignature = service.generateSignature(payload, timestamp);
      
      const headers = {
        'X-SIGNATURE': expectedSignature, // Uppercase
        'X-TIMESTAMP': timestamp.toString(),
      };

      const result = await service.verify(payload, headers);

      expect(result.isValid).toBe(true);
    });
  });

  describe('timestamp verification', () => {
    it('should accept current timestamp', async () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const signature = service.generateSignature(payload, currentTimestamp);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': currentTimestamp.toString(),
      };

      const result = await service.verify(payload, headers);

      expect(result.isValid).toBe(true);
      expect(result.verificationDetails.timestampValid).toBe(true);
    });

    it('should accept timestamp within tolerance', async () => {
      const withinTolerance = Math.floor(Date.now() / 1000) - 150; // 2.5 minutes ago
      const signature = service.generateSignature(payload, withinTolerance);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': withinTolerance.toString(),
      };

      const result = await service.verify(payload, headers);

      expect(result.isValid).toBe(true);
      expect(result.verificationDetails.timestampValid).toBe(true);
    });

    it('should reject timestamp outside tolerance', async () => {
      const outsideTolerance = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signature = service.generateSignature(payload, outsideTolerance);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': outsideTolerance.toString(),
      };

      const result = await service.verify(payload, headers);

      expect(result.isValid).toBe(false);
      expect(result.verificationDetails.timestampValid).toBe(false);
    });
  });

  describe('provider-specific verifiers', () => {
    it('should create GitHub verifier with correct defaults', () => {
      const githubVerifier = WebhookVerifierService.createGitHubVerifier(secret);
      
      expect(githubVerifier).toBeInstanceOf(WebhookVerifierService);
    });

    it('should create Stripe verifier with correct defaults', () => {
      const stripeVerifier = WebhookVerifierService.createStripeVerifier(secret);
      
      expect(stripeVerifier).toBeInstanceOf(WebhookVerifierService);
    });

    it('should create Slack verifier with correct defaults', () => {
      const slackVerifier = WebhookVerifierService.createSlackVerifier(secret);
      
      expect(slackVerifier).toBeInstanceOf(WebhookVerifierService);
    });

    it('should create generic verifier with custom headers', () => {
      const customVerifier = WebhookVerifierService.createGenericVerifier(
        secret,
        'custom-signature',
        'custom-timestamp'
      );
      
      expect(customVerifier).toBeInstanceOf(WebhookVerifierService);
    });
  });

  describe('signature generation', () => {
    it('should generate consistent signatures', () => {
      const signature1 = service.generateSignature(payload, timestamp);
      const signature2 = service.generateSignature(payload, timestamp);

      expect(signature1).toBe(signature2);
      expect(signature1).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should generate different signatures for different payloads', () => {
      const payload1 = JSON.stringify({ event: 'first' });
      const payload2 = JSON.stringify({ event: 'second' });
      
      const signature1 = service.generateSignature(payload1, timestamp);
      const signature2 = service.generateSignature(payload2, timestamp);

      expect(signature1).not.toBe(signature2);
    });

    it('should generate different signatures for different timestamps', () => {
      const timestamp1 = timestamp;
      const timestamp2 = timestamp + 1;
      
      const signature1 = service.generateSignature(payload, timestamp1);
      const signature2 = service.generateSignature(payload, timestamp2);

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('error handling', () => {
    it('should handle malformed signature format', async () => {
      const headers = {
        'x-signature': 'not-a-valid-signature-format',
        'x-timestamp': timestamp.toString(),
      };

      const result = await service.verify(payload, headers);

      expect(result.isValid).toBe(false);
      expect(result.verificationDetails.signatureMatch).toBe(false);
    });

    it('should reject invalid JSON payload', async () => {
      const invalidJson = 'not-valid-json';
      const signature = service.generateSignature(invalidJson, timestamp);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': timestamp.toString(),
      };

      await expect(service.verify(invalidJson, headers)).rejects.toThrow(
        'Invalid webhook payload format'
      );
    });
  });
});