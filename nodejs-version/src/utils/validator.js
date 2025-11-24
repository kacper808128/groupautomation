/**
 * Validation utilities for input data
 */

class Validator {
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidPhone(phone) {
    // Supports various phone formats
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phone.length >= 9 && phoneRegex.test(phone);
  }

  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  static isValidFacebookGroupUrl(url) {
    if (!this.isValidUrl(url)) return false;
    
    const urlObj = new URL(url);
    return urlObj.hostname.includes('facebook.com') && 
           (url.includes('/groups/') || url.includes('facebook.com/'));
  }

  static isValidProxyConfig(config) {
    if (!config.host || !config.port) {
      return { valid: false, error: 'Host and port are required' };
    }
    
    if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
      return { valid: false, error: 'Invalid port number' };
    }
    
    return { valid: true };
  }

  static validateCredentials(credentials) {
    const errors = [];
    
    if (!credentials.email || credentials.email.trim().length === 0) {
      errors.push('Email is required');
    }
    
    if (!credentials.password || credentials.password.trim().length === 0) {
      errors.push('Password is required');
    }
    
    if (credentials.email && !this.isValidEmail(credentials.email) && 
        !this.isValidPhone(credentials.email)) {
      errors.push('Invalid email or phone format');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validatePostingConfig(config) {
    const errors = [];
    
    if (!config.message || config.message.trim().length === 0) {
      errors.push('Message is required');
    }
    
    if (config.message && config.message.length > 63206) {
      errors.push('Message is too long (max 63206 characters)');
    }
    
    if (!config.groups || config.groups.length === 0) {
      errors.push('At least one group is required');
    }
    
    if (config.groups) {
      const invalidGroups = config.groups.filter(
        group => !this.isValidFacebookGroupUrl(group)
      );
      
      if (invalidGroups.length > 0) {
        errors.push(`Invalid group URLs: ${invalidGroups.join(', ')}`);
      }
    }
    
    if (config.delayBetweenPosts && 
        (isNaN(config.delayBetweenPosts) || config.delayBetweenPosts < 30)) {
      errors.push('Delay between posts must be at least 30 seconds');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateScheduleConfig(config) {
    const errors = [];
    
    if (!config.name || config.name.trim().length === 0) {
      errors.push('Schedule name is required');
    }
    
    if (!config.type || !['once', 'daily', 'weekly', 'interval'].includes(config.type)) {
      errors.push('Invalid schedule type');
    }
    
    if (config.type === 'once' && !config.datetime) {
      errors.push('Datetime is required for one-time schedule');
    }
    
    if ((config.type === 'daily' || config.type === 'weekly') && 
        (config.hour === undefined || config.minute === undefined)) {
      errors.push('Hour and minute are required for daily/weekly schedule');
    }
    
    if (config.type === 'interval' && 
        (!config.intervalMinutes || config.intervalMinutes < 5)) {
      errors.push('Interval must be at least 5 minutes');
    }
    
    if (config.type === 'weekly' && (!config.daysOfWeek || config.daysOfWeek.length === 0)) {
      errors.push('Days of week are required for weekly schedule');
    }
    
    // Validate posting config
    const postingValidation = this.validatePostingConfig({
      message: config.message,
      groups: config.groups,
      delayBetweenPosts: config.delayBetweenPosts
    });
    
    if (!postingValidation.valid) {
      errors.push(...postingValidation.errors);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '')
      .trim();
  }

  static sanitizeHtml(html) {
    if (typeof html !== 'string') return html;
    
    return html
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  static validateDelay(delay, min = 30, max = 600) {
    if (isNaN(delay)) {
      return { valid: false, error: 'Delay must be a number' };
    }
    
    const numDelay = Number(delay);
    
    if (numDelay < min) {
      return { valid: false, error: `Delay must be at least ${min} seconds` };
    }
    
    if (numDelay > max) {
      return { valid: false, error: `Delay cannot exceed ${max} seconds` };
    }
    
    return { valid: true, value: numDelay };
  }

  static validateGroupList(groupsText) {
    if (!groupsText || groupsText.trim().length === 0) {
      return { valid: false, error: 'Groups list is empty', groups: [] };
    }
    
    const groups = groupsText
      .split('\n')
      .map(g => g.trim())
      .filter(g => g.length > 0);
    
    if (groups.length === 0) {
      return { valid: false, error: 'No valid groups found', groups: [] };
    }
    
    const invalidGroups = groups.filter(g => !this.isValidFacebookGroupUrl(g));
    
    if (invalidGroups.length > 0) {
      return { 
        valid: false, 
        error: `Invalid URLs found: ${invalidGroups.length}`, 
        groups: groups.filter(g => this.isValidFacebookGroupUrl(g)),
        invalidGroups 
      };
    }
    
    return { valid: true, groups };
  }
}

module.exports = Validator;
