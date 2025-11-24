const fs = require('fs');
const path = require('path');

/**
 * Logger utility for advanced logging capabilities
 */
class Logger {
  constructor(options = {}) {
    this.logToFile = options.logToFile !== false;
    this.logToConsole = options.logToConsole !== false;
    this.logDir = options.logDir || path.join(__dirname, '../../logs');
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024; // 5MB
    this.maxFiles = options.maxFiles || 5;
    
    // Ensure log directory exists
    if (this.logToFile) {
      this.ensureLogDirectory();
    }
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getCurrentLogFile() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `app-${date}.log`);
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}\n`;
  }

  writeToFile(formattedMessage) {
    if (!this.logToFile) return;

    const logFile = this.getCurrentLogFile();
    
    try {
      // Check file size
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxFileSize) {
          this.rotateLogFiles();
        }
      }
      
      fs.appendFileSync(logFile, formattedMessage);
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  rotateLogFiles() {
    const files = fs.readdirSync(this.logDir)
      .filter(f => f.startsWith('app-') && f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(this.logDir, f),
        time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    // Keep only maxFiles
    if (files.length >= this.maxFiles) {
      files.slice(this.maxFiles - 1).forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          console.error('Error deleting old log file:', error);
        }
      });
    }
  }

  log(level, message, data = null) {
    const formattedMessage = this.formatMessage(level, message, data);
    
    if (this.logToConsole) {
      const colors = {
        info: '\x1b[36m',    // Cyan
        success: '\x1b[32m', // Green
        warning: '\x1b[33m', // Yellow
        error: '\x1b[31m',   // Red
        debug: '\x1b[35m'    // Magenta
      };
      const reset = '\x1b[0m';
      const color = colors[level] || '';
      
      console.log(`${color}${formattedMessage.trim()}${reset}`);
    }
    
    this.writeToFile(formattedMessage);
  }

  info(message, data) {
    this.log('info', message, data);
  }

  success(message, data) {
    this.log('success', message, data);
  }

  warning(message, data) {
    this.log('warning', message, data);
  }

  error(message, data) {
    this.log('error', message, data);
  }

  debug(message, data) {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, data);
    }
  }

  clearOldLogs(daysOld = 7) {
    const now = Date.now();
    const maxAge = daysOld * 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(this.logDir);
      
      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          this.info(`Deleted old log file: ${file}`);
        }
      });
    } catch (error) {
      this.error('Error clearing old logs', { error: error.message });
    }
  }

  getLogs(lines = 100) {
    try {
      const logFile = this.getCurrentLogFile();
      
      if (!fs.existsSync(logFile)) {
        return [];
      }
      
      const content = fs.readFileSync(logFile, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      
      return allLines.slice(-lines);
    } catch (error) {
      this.error('Error reading logs', { error: error.message });
      return [];
    }
  }

  exportLogs(outputPath) {
    try {
      const logFile = this.getCurrentLogFile();
      
      if (!fs.existsSync(logFile)) {
        throw new Error('No log file found');
      }
      
      fs.copyFileSync(logFile, outputPath);
      this.success(`Logs exported to: ${outputPath}`);
      return true;
    } catch (error) {
      this.error('Error exporting logs', { error: error.message });
      return false;
    }
  }
}

// Singleton instance
let loggerInstance = null;

function getLogger(options = {}) {
  if (!loggerInstance) {
    loggerInstance = new Logger(options);
  }
  return loggerInstance;
}

module.exports = { Logger, getLogger };
