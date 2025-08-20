import { injectable } from 'inversify';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface MessageValidationOptions {
  minLength?: number;
  maxLength?: number;
  allowEmptyLines?: boolean;
  allowOnlyWhitespace?: boolean;
  blockedWords?: string[];
  maxConsecutiveChars?: number;
}

@injectable()
export class ValidationService {
  private readonly DEFAULT_MESSAGE_OPTIONS: Required<MessageValidationOptions> = {
    minLength: 1,
    maxLength: 2000,
    allowEmptyLines: false,
    allowOnlyWhitespace: false,
    blockedWords: [],
    maxConsecutiveChars: 10
  };

  /**
   * Validate message content
   */
  validateMessage(content: string, options?: MessageValidationOptions): ValidationResult {
    const opts = { ...this.DEFAULT_MESSAGE_OPTIONS, ...options };
    const errors: string[] = [];

    // Check if content exists
    if (content === null || content === undefined) {
      errors.push('Message content is required');
      return { isValid: false, errors };
    }

    // Convert to string if not already
    const message = String(content);

    // Check for empty or whitespace-only content
    if (!opts.allowOnlyWhitespace && message.trim().length === 0) {
      errors.push('Message cannot be empty or contain only whitespace');
    }

    // Check minimum length
    if (message.trim().length < opts.minLength) {
      errors.push(`Message must be at least ${opts.minLength} character(s) long`);
    }

    // Check maximum length
    if (message.length > opts.maxLength) {
      errors.push(`Message cannot exceed ${opts.maxLength} characters`);
    }

    // Check for empty lines if not allowed
    if (!opts.allowEmptyLines && message.includes('\n\n')) {
      errors.push('Message cannot contain empty lines');
    }

    // Check for excessive consecutive characters
    if (this.hasExcessiveConsecutiveChars(message, opts.maxConsecutiveChars)) {
      errors.push(`Message cannot have more than ${opts.maxConsecutiveChars} consecutive identical characters`);
    }

    // Check for blocked words
    if (opts.blockedWords.length > 0) {
      const foundBlockedWords = this.findBlockedWords(message, opts.blockedWords);
      if (foundBlockedWords.length > 0) {
        errors.push(`Message contains blocked words: ${foundBlockedWords.join(', ')}`);
      }
    }

    // Check for potential spam patterns
    if (this.isLikelySpam(message)) {
      errors.push('Message appears to be spam');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate room ID format
   */
  validateRoomId(roomId: string): ValidationResult {
    const errors: string[] = [];

    if (!roomId || typeof roomId !== 'string') {
      errors.push('Room ID is required and must be a string');
    } else {
      // Check if it's a valid UUID format (7 characters for this system)
      if (roomId.length !== 7) {
        errors.push('Room ID must be 7 characters long');
      }
      
      if (!/^[a-zA-Z0-9]+$/.test(roomId)) {
        errors.push('Room ID must contain only alphanumeric characters');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize message content
   */
  sanitizeMessage(content: string): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    return content
      // Remove null characters
      .replace(/\0/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Trim leading/trailing whitespace
      .trim()
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove potential script injections (basic)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove HTML tags (basic sanitization)
      .replace(/<[^>]*>/g, '');
  }

  /**
   * Check for excessive consecutive characters
   */
  private hasExcessiveConsecutiveChars(message: string, maxConsecutive: number): boolean {
    let consecutiveCount = 1;
    let previousChar = '';

    for (const char of message) {
      if (char === previousChar) {
        consecutiveCount++;
        if (consecutiveCount > maxConsecutive) {
          return true;
        }
      } else {
        consecutiveCount = 1;
        previousChar = char;
      }
    }

    return false;
  }

  /**
   * Find blocked words in message
   */
  private findBlockedWords(message: string, blockedWords: string[]): string[] {
    const lowerMessage = message.toLowerCase();
    return blockedWords.filter(word => 
      lowerMessage.includes(word.toLowerCase())
    );
  }

  /**
   * Basic spam detection
   */
  private isLikelySpam(message: string): boolean {
    // Check for excessive repetition
    const words = message.toLowerCase().split(/\s+/);
    const wordCount = new Map<string, number>();
    
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    // If any word appears more than 5 times in a short message, it's likely spam
    for (const [, count] of wordCount) {
      if (count > 5 && words.length < 50) {
        return true;
      }
    }

    // Check for excessive capitalization
    const capitalRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    if (capitalRatio > 0.7 && message.length > 10) {
      return true;
    }

    // Check for excessive punctuation
    const punctuationRatio = (message.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length / message.length;
    if (punctuationRatio > 0.3 && message.length > 10) {
      return true;
    }

    return false;
  }

  /**
   * Validate typing event data
   */
  validateTypingData(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Typing data must be an object');
      return { isValid: false, errors };
    }

    // Validate roomId
    const roomIdResult = this.validateRoomId(data.roomId);
    if (!roomIdResult.isValid) {
      errors.push(...roomIdResult.errors.map(e => `Room ID: ${e}`));
    }

    // Validate isTyping
    if (typeof data.isTyping !== 'boolean') {
      errors.push('isTyping must be a boolean value');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate join room data
   */
  validateJoinRoomData(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Join room data must be an object');
      return { isValid: false, errors };
    }

    // Validate roomId
    const roomIdResult = this.validateRoomId(data.roomId);
    if (!roomIdResult.isValid) {
      errors.push(...roomIdResult.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}