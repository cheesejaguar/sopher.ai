import { describe, it, expect } from 'vitest';

/**
 * Tests for error display functionality in the frontend
 * These tests verify the error parsing and display logic that handles
 * structured error responses from the backend API.
 */

/**
 * Simulate the error parsing logic from page.tsx
 */
function parseSSEErrorEvent(eventData) {
  try {
    const err = JSON.parse(eventData);
    return {
      message: err.message,
      hint: err.hint,
      diagnostics: {
        error_id: err.error_id,
        request_id: err.request_id,
        error_code: err.error_code,
        timestamp: err.timestamp,
      },
    };
  } catch (e) {
    return null;
  }
}

/**
 * Generate connection error info (from page.tsx fallback logic)
 */
function generateConnectionError() {
  const ts = new Date().toISOString();
  return {
    message: 'Connection issue: outline stream',
    hint: 'Possible CORS, network, or server issue. Retry in a few seconds.',
    diagnostics: { timestamp: ts, error_code: 'CONNECTION_ERROR' },
  };
}

/**
 * Validate error info structure matches expected frontend format
 */
function validateErrorInfo(errorInfo) {
  if (typeof errorInfo.message !== 'string') {
    throw new Error('Error message should be string');
  }

  if (errorInfo.hint && typeof errorInfo.hint !== 'string') {
    throw new Error('Error hint should be string if present');
  }

  if (!errorInfo.diagnostics) {
    throw new Error('Error diagnostics should be present');
  }

  if (typeof errorInfo.diagnostics.timestamp !== 'string') {
    throw new Error('Timestamp should be string');
  }

  if (typeof errorInfo.diagnostics.error_code !== 'string') {
    throw new Error('Error code should be string');
  }

  if (errorInfo.diagnostics.error_id && typeof errorInfo.diagnostics.error_id !== 'string') {
    throw new Error('Error ID should be string if present');
  }

  if (errorInfo.diagnostics.request_id && typeof errorInfo.diagnostics.request_id !== 'string') {
    throw new Error('Request ID should be string if present');
  }

  return true;
}

/**
 * Format diagnostics for clipboard copy (matches page.tsx logic)
 */
function formatDiagnostics(diagnostics) {
  return JSON.stringify(diagnostics);
}

describe('SSE Error Event Parsing', () => {
  it('should parse structured server error event', () => {
    const serverErrorData = JSON.stringify({
      error_id: '12345678-1234-4000-8000-123456789012',
      error_code: 'OUTLINE_STREAM_INIT_FAILED',
      message: 'Could not start the outline stream.',
      hint: 'Retry in a few seconds. If it persists, check service readiness or credentials.',
      request_id: 'req-98765432-1234-4000-8000-987654321098',
      timestamp: '2025-01-15T10:30:00Z',
      details: { agent: 'outliner' },
    });

    const parsedError = parseSSEErrorEvent(serverErrorData);

    expect(parsedError).not.toBeNull();
    expect(parsedError.message).toBe('Could not start the outline stream.');
    expect(parsedError.hint).toBe('Retry in a few seconds. If it persists, check service readiness or credentials.');
    expect(parsedError.diagnostics.error_id).toBe('12345678-1234-4000-8000-123456789012');
    expect(parsedError.diagnostics.error_code).toBe('OUTLINE_STREAM_INIT_FAILED');
    expect(parsedError.diagnostics.request_id).toBe('req-98765432-1234-4000-8000-987654321098');
    expect(parsedError.diagnostics.timestamp).toBe('2025-01-15T10:30:00Z');
    expect(validateErrorInfo(parsedError)).toBe(true);
  });

  it('should parse validation error', () => {
    const validationErrorData = JSON.stringify({
      error_id: '11111111-2222-4000-8000-333333333333',
      error_code: 'OUTLINE_INVALID_PARAMETER',
      message: 'Brief must be between 10 and 10000 characters.',
      hint: "Ensure 'brief' is 10-10000 characters.",
      request_id: 'req-validation-test',
      timestamp: '2025-01-15T10:31:00Z',
      details: { field: 'brief' },
    });

    const validationError = parseSSEErrorEvent(validationErrorData);

    expect(validationError).not.toBeNull();
    expect(validationError.message).toBe('Brief must be between 10 and 10000 characters.');
    expect(validationError.hint).toBe("Ensure 'brief' is 10-10000 characters.");
    expect(validationError.diagnostics.error_code).toBe('OUTLINE_INVALID_PARAMETER');
    expect(validateErrorInfo(validationError)).toBe(true);
  });

  it('should return null for malformed JSON', () => {
    const malformedData = '{invalid json}';
    const malformedResult = parseSSEErrorEvent(malformedData);
    expect(malformedResult).toBeNull();
  });
});

describe('Connection Error Generation', () => {
  it('should generate proper connection error info', () => {
    const connectionError = generateConnectionError();

    expect(connectionError.message).toBe('Connection issue: outline stream');
    expect(connectionError.hint).toBe('Possible CORS, network, or server issue. Retry in a few seconds.');
    expect(connectionError.diagnostics.error_code).toBe('CONNECTION_ERROR');
    expect(validateErrorInfo(connectionError)).toBe(true);
  });

  it('should generate timestamp within reasonable time', () => {
    const connectionError = generateConnectionError();
    const timestampMs = new Date(connectionError.diagnostics.timestamp).getTime();
    const nowMs = Date.now();

    expect(Math.abs(nowMs - timestampMs)).toBeLessThan(5000);
  });
});

describe('Diagnostics Formatting', () => {
  it('should format diagnostics for clipboard copy', () => {
    const sampleDiagnostics = {
      error_id: 'test-error-id',
      request_id: 'test-request-id',
      error_code: 'TEST_ERROR',
      timestamp: '2025-01-15T10:30:00Z',
    };

    const formatted = formatDiagnostics(sampleDiagnostics);
    const parsed = JSON.parse(formatted);

    expect(parsed.error_id).toBe('test-error-id');
    expect(parsed.request_id).toBe('test-request-id');
    expect(parsed.error_code).toBe('TEST_ERROR');
    expect(parsed.timestamp).toBe('2025-01-15T10:30:00Z');
  });
});

describe('Error Info Structure Validation', () => {
  it('should require diagnostics', () => {
    expect(() => validateErrorInfo({ message: 'test' })).toThrow('diagnostics');
  });

  it('should require error_code in diagnostics', () => {
    expect(() => validateErrorInfo({
      message: 'test',
      diagnostics: { timestamp: '2025-01-15T10:30:00Z' }
    })).toThrow('Error code');
  });

  it('should require timestamp in diagnostics', () => {
    expect(() => validateErrorInfo({
      message: 'test',
      diagnostics: { error_code: 'TEST_ERROR' }
    })).toThrow('Timestamp');
  });

  it('should accept minimal valid error info', () => {
    const minimalError = {
      message: 'Minimal error',
      diagnostics: {
        timestamp: '2025-01-15T10:30:00Z',
        error_code: 'MINIMAL_ERROR'
      }
    };
    expect(validateErrorInfo(minimalError)).toBe(true);
  });

  it('should accept full error info with optional fields', () => {
    const fullError = {
      message: 'Full error',
      hint: 'This is a hint',
      diagnostics: {
        timestamp: '2025-01-15T10:30:00Z',
        error_code: 'FULL_ERROR',
        error_id: 'error-123',
        request_id: 'req-456'
      }
    };
    expect(validateErrorInfo(fullError)).toBe(true);
  });
});

describe('Real-world Error Scenarios', () => {
  it('should handle agent initialization failure', () => {
    const agentFailureData = JSON.stringify({
      error_id: 'agent-fail-001',
      error_code: 'OUTLINE_STREAM_INIT_FAILED',
      message: 'Could not start the outline stream.',
      hint: 'Retry in a few seconds. If it persists, check service readiness or credentials.',
      request_id: 'req-agent-test',
      timestamp: new Date().toISOString(),
    });

    const agentFailure = parseSSEErrorEvent(agentFailureData);

    expect(agentFailure.message).toContain('outline stream');
    expect(agentFailure.diagnostics.error_code).toBe('OUTLINE_STREAM_INIT_FAILED');
    expect(validateErrorInfo(agentFailure)).toBe(true);
  });

  it('should handle LLM service unavailable', () => {
    const llmFailureData = JSON.stringify({
      error_id: 'llm-fail-001',
      error_code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
      hint: 'The server encountered an error. Please try again later.',
      request_id: 'req-llm-test',
      timestamp: new Date().toISOString(),
    });

    const llmFailure = parseSSEErrorEvent(llmFailureData);

    expect(llmFailure.message).toBe('Internal server error.');
    expect(llmFailure.hint).toContain('try again later');
    expect(validateErrorInfo(llmFailure)).toBe(true);
  });
});
