const schedule = require('node-schedule');

class ScheduleManager {
  constructor(store, automationManager) {
    this.store = store;
    this.automationManager = automationManager;
    this.jobs = new Map();
    this.loadSchedules();
  }

  async saveSchedule(scheduleConfig) {
    const schedules = this.store.get('schedules', []);
    
    // Usuń stary harmonogram o tym samym ID jeśli istnieje
    const existingIndex = schedules.findIndex(s => s.id === scheduleConfig.id);
    if (existingIndex !== -1) {
      schedules[existingIndex] = scheduleConfig;
    } else {
      schedules.push(scheduleConfig);
    }
    
    this.store.set('schedules', schedules);
    
    if (scheduleConfig.enabled) {
      this.scheduleJob(scheduleConfig);
    } else {
      this.cancelJob(scheduleConfig.id);
    }
  }

  async deleteSchedule(scheduleId) {
    let schedules = this.store.get('schedules', []);
    schedules = schedules.filter(s => s.id !== scheduleId);
    this.store.set('schedules', schedules);
    this.cancelJob(scheduleId);
  }

  getSchedule() {
    return this.store.get('schedules', []);
  }

  loadSchedules() {
    const schedules = this.store.get('schedules', []);
    schedules.forEach(scheduleConfig => {
      if (scheduleConfig.enabled) {
        this.scheduleJob(scheduleConfig);
      }
    });
  }

  scheduleJob(scheduleConfig) {
    // Anuluj istniejące zadanie jeśli istnieje
    this.cancelJob(scheduleConfig.id);

    let rule;
    
    switch (scheduleConfig.type) {
      case 'once':
        // Jednokrotne uruchomienie
        rule = new Date(scheduleConfig.datetime);
        break;
        
      case 'daily':
        // Codziennie o określonej godzinie
        rule = new schedule.RecurrenceRule();
        rule.hour = scheduleConfig.hour;
        rule.minute = scheduleConfig.minute;
        break;
        
      case 'weekly':
        // Tygodniowo w określone dni
        rule = new schedule.RecurrenceRule();
        rule.dayOfWeek = scheduleConfig.daysOfWeek; // [0-6] gdzie 0 = niedziela
        rule.hour = scheduleConfig.hour;
        rule.minute = scheduleConfig.minute;
        break;
        
      case 'interval':
        // Co X minut/godzin
        const intervalMs = scheduleConfig.intervalMinutes * 60 * 1000;
        const intervalJob = setInterval(async () => {
          await this.executeScheduledTask(scheduleConfig);
        }, intervalMs);
        
        this.jobs.set(scheduleConfig.id, { type: 'interval', job: intervalJob });
        return;
        
      default:
        console.error('Unknown schedule type:', scheduleConfig.type);
        return;
    }

    const job = schedule.scheduleJob(rule, async () => {
      await this.executeScheduledTask(scheduleConfig);
    });

    this.jobs.set(scheduleConfig.id, { type: 'cron', job });
  }

  cancelJob(scheduleId) {
    const jobData = this.jobs.get(scheduleId);
    if (jobData) {
      if (jobData.type === 'cron') {
        jobData.job.cancel();
      } else if (jobData.type === 'interval') {
        clearInterval(jobData.job);
      }
      this.jobs.delete(scheduleId);
    }
  }

  async executeScheduledTask(scheduleConfig) {
    console.log(`Executing scheduled task: ${scheduleConfig.name}`);
    
    try {
      // Przygotuj konfigurację postowania
      const postingConfig = {
        groups: scheduleConfig.groups,
        message: scheduleConfig.message,
        delayBetweenPosts: scheduleConfig.delayBetweenPosts || 60
      };

      // Uruchom automatyzację
      await this.automationManager.startPosting(postingConfig);
      
      console.log(`Scheduled task completed: ${scheduleConfig.name}`);
      
    } catch (error) {
      console.error(`Error executing scheduled task ${scheduleConfig.name}:`, error);
    }
  }

  cancelAllJobs() {
    this.jobs.forEach((jobData, id) => {
      this.cancelJob(id);
    });
  }
}

module.exports = ScheduleManager;
