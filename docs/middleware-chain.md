# Middleware Chain Documentation

## Overview
This document describes the middleware chain implemented in the Brain-Storm backend application, addressing Issue #1141.

## Current Middleware State

### Applied Middleware (in execution order):
1. **SecurityMiddleware** - Sets baseline security headers (X-Content-Type-Options, X-Frame-Options, etc.)
2. **ShutdownMiddleware** - Handles graceful shutdown, rejects requests during shutdown
3. **CacheHeadersMiddleware** - Adds Cache-Control and ETag headers for HTTP caching

### Available but Not Applied:
- **IdempotencyMiddleware** - Prevents duplicate transaction submissions via idempotency keys
- **ValidationMiddleware** - Schema-based request validation (used via @ValidateRequest decorator)
- **RateLimitMiddleware** (from /middleware/) - Configurable rate limiting with presets

### Rate Limiting Systems (Issue #1142):
1. **UserRateLimitGuard** - Global guard with UserRateLimitService (per user role/plan)
2. **@RateLimit decorator** - Per-endpoint rate limiting with RateLimitInterceptor
3. **RateLimitMiddleware** - Configurable middleware (not currently applied)

## Issues Identified

### 1. Security Gap (Fixed)
- **Problem**: SecurityMiddleware existed but wasn't applied globally
- **Solution**: Added SecurityMiddleware to AppModule.configure()

### 2. Redundant RateLimitMiddleware
- **Problem**: Two RateLimitMiddleware implementations:
  - `/middleware/rate-limit.middleware.ts` - Contains RateLimitPresets used by @RateLimit decorator
  - `/rate-limit/rate-limit.middleware.ts` - Part of rate-limit module, uses UserRateLimitService
- **Recommendation**: Consolidate or document which to use

### 3. Idempotency Pattern Inconsistency
- **Problem**: @Idempotent decorator marks endpoints but IdempotencyMiddleware isn't applied
- **Current Behavior**: Middleware checks for Idempotency-Key header regardless of decorator
- **Recommendation**: Apply IdempotencyMiddleware globally or to specific routes

### 4. Incomplete Middleware Exports
- **Problem**: ValidationMiddleware wasn't exported from middleware index
- **Solution**: Added export to middleware/index.ts

## Middleware Execution Order
The order of middleware execution is critical:

1. **Security Headers** (SecurityMiddleware) - Must be first for protection
2. **Shutdown Handling** (ShutdownMiddleware) - Early rejection during shutdown
3. **Caching Headers** (CacheHeadersMiddleware) - Response transformation
4. **Rate Limiting** (UserRateLimitGuard) - Applied as guard, not middleware
5. **Idempotency** (IdempotencyMiddleware) - Should be after auth but before business logic
6. **Validation** (ValidationMiddleware) - Request validation via decorator

## Recommendations

### Short-term (Issue #1141):
1. ✅ Apply SecurityMiddleware globally - **DONE**
2. ✅ Export all middleware consistently - **DONE**
3. Document current middleware chain - **THIS DOCUMENT**

### Medium-term:
1. Apply IdempotencyMiddleware to transaction routes
2. Consolidate rate limiting approaches
3. Create middleware configuration utility
4. Add middleware testing framework

### Long-term:
1. Implement middleware dependency injection patterns
2. Create middleware composition utilities
3. Add middleware metrics and monitoring

## Usage Examples

### Applying Middleware Globally:
```typescript
// In AppModule.configure()
consumer.apply(SecurityMiddleware).forRoutes('*');
consumer.apply(ShutdownMiddleware).forRoutes('*');
consumer.apply(CacheHeadersMiddleware).forRoutes('*');
```

### Using @Idempotent Decorator:
```typescript
@Post('transaction')
@Idempotent()
@RateLimit(RateLimitPresets.transaction)
async submitTransaction(@Body() body: TransactionDto) {
  // IdempotencyMiddleware will cache responses based on Idempotency-Key header
}
```

### Using @ValidateRequest Decorator:
```typescript
@Post('data')
@ValidateRequest({ 
  body: dataSchema,
  query: querySchema 
})
async createData(@Body() body: any, @Query() query: any) {
  // ValidationMiddleware validates against schemas
}
```

## Dependencies
- **IdempotencyMiddleware**: Requires CACHE_MANAGER injection
- **ValidationMiddleware**: Uses Joi schemas via @ValidateRequest decorator
- **SecurityMiddleware**: No dependencies, sets HTTP headers only

## Testing
Each middleware has corresponding test files:
- `*.middleware.spec.ts` - Unit tests for middleware logic
- Integration tests should verify middleware chain order and behavior