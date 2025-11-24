/**
 * Activity Limiter - Anti-Ban Stack 2025
 *
 * Implementuje:
 * - Max 12 postów/dzień/konto (lepiej 6-10)
 * - Max 30-40 akcji/dzień (lajki + komentarze + posty)
 * - Tryb warming: pierwsze 7-14 dni tylko lajki/komentarze/scroll
 * - Delay między grupami: 4-18 minut (gaussian)
 * - Delay między kontami: 30-120 sekund
 * - Auto-pauza gdy >2 konta zbanowane w ciągu godziny
 */

const { boundedGaussian } = require('./human-behavior');

// Konfiguracja limitów z checklisty
const LIMITS = {
  // Hard limits
  maxPostsPerDay: 12,        // Max posty na dzień
  recommendedPostsPerDay: 8, // Zalecane (6-10)
  maxActionsPerDay: 40,      // Lajki + komentarze + posty

  // Warming mode
  warmingDays: 10,           // 7-14 dni
  warmingMaxActions: 20,     // Max akcji podczas warmingu
  warmingPostsAllowed: false, // Zero postów podczas warmingu

  // Delays (w minutach)
  delayBetweenGroups: { min: 4, max: 18 }, // 4-18 minut
  delayBetweenAccounts: { min: 0.5, max: 2 }, // 30-120 sekund
  delayBetweenPosts: { min: 15, max: 45 }, // 15-45 minut

  // Anti-ban
  autoPauseOnBans: 2, // Pauza gdy >2 bany w godzinę
  humanErrorFrequency: 12, // Raz na 10-15 postów
};

class ActivityLimiter {
  constructor(store) {
    this.store = store;
    this.todayKey = this.getTodayKey();
  }

  getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  getAccountKey(accountId) {
    return `activity_${accountId}_${this.getTodayKey()}`;
  }

  // Pobierz dzisiejszą aktywność konta
  getActivity(accountId) {
    const key = this.getAccountKey(accountId);
    return this.store.get(key, {
      posts: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      lastAction: null,
      bannedAt: null,
    });
  }

  // Zapisz aktywność
  saveActivity(accountId, activity) {
    const key = this.getAccountKey(accountId);
    this.store.set(key, activity);
  }

  // Sprawdź czy konto może postować
  canPost(accountId) {
    const activity = this.getActivity(accountId);
    const accountData = this.getAccountData(accountId);

    // Sprawdź czy w warming mode
    if (this.isInWarmingMode(accountId)) {
      if (!LIMITS.warmingPostsAllowed) {
        return { allowed: false, reason: 'Account in warming mode - no posts allowed' };
      }
    }

    // Sprawdź limit postów
    if (activity.posts >= LIMITS.maxPostsPerDay) {
      return { allowed: false, reason: `Daily post limit reached (${activity.posts}/${LIMITS.maxPostsPerDay})` };
    }

    // Sprawdź limit akcji
    const totalActions = activity.posts + activity.likes + activity.comments + activity.shares;
    if (totalActions >= LIMITS.maxActionsPerDay) {
      return { allowed: false, reason: `Daily action limit reached (${totalActions}/${LIMITS.maxActionsPerDay})` };
    }

    // Sprawdź czy nie zbanowane
    if (accountData.status === 'banned') {
      return { allowed: false, reason: 'Account is banned' };
    }

    return { allowed: true };
  }

  // Sprawdź czy konto może wykonywać engagement (lajki, komentarze)
  canEngage(accountId) {
    const activity = this.getActivity(accountId);
    const accountData = this.getAccountData(accountId);

    // Sprawdź limit akcji
    const totalActions = activity.posts + activity.likes + activity.comments + activity.shares;

    const maxActions = this.isInWarmingMode(accountId)
      ? LIMITS.warmingMaxActions
      : LIMITS.maxActionsPerDay;

    if (totalActions >= maxActions) {
      return { allowed: false, reason: `Daily action limit reached (${totalActions}/${maxActions})` };
    }

    if (accountData.status === 'banned') {
      return { allowed: false, reason: 'Account is banned' };
    }

    return { allowed: true };
  }

  // Zapisz akcję
  recordAction(accountId, actionType) {
    const activity = this.getActivity(accountId);

    switch (actionType) {
      case 'post':
        activity.posts++;
        break;
      case 'like':
        activity.likes++;
        break;
      case 'comment':
        activity.comments++;
        break;
      case 'share':
        activity.shares++;
        break;
    }

    activity.lastAction = new Date().toISOString();
    this.saveActivity(accountId, activity);

    return activity;
  }

  // Sprawdź czy konto jest w warming mode
  isInWarmingMode(accountId) {
    const accountData = this.getAccountData(accountId);

    if (!accountData.warmingStarted) {
      return false;
    }

    const warmingStart = new Date(accountData.warmingStarted);
    const now = new Date();
    const daysSinceStart = (now - warmingStart) / (1000 * 60 * 60 * 24);

    return daysSinceStart < LIMITS.warmingDays;
  }

  // Ile dni zostało do końca warmingu
  getWarmingDaysRemaining(accountId) {
    const accountData = this.getAccountData(accountId);

    if (!accountData.warmingStarted) {
      return 0;
    }

    const warmingStart = new Date(accountData.warmingStarted);
    const now = new Date();
    const daysSinceStart = (now - warmingStart) / (1000 * 60 * 60 * 24);

    return Math.max(0, LIMITS.warmingDays - daysSinceStart);
  }

  // Pobierz dane konta
  getAccountData(accountId) {
    const accounts = this.store.get('facebookAccounts', []);
    const account = accounts.find(a => a.id === accountId);

    return account || {
      id: accountId,
      status: 'active',
      warmingStarted: null,
      bannedAt: null,
      totalPosts: 0,
      banCount: 0,
    };
  }

  // Aktualizuj dane konta
  updateAccountData(accountId, updates) {
    const accounts = this.store.get('facebookAccounts', []);
    const index = accounts.findIndex(a => a.id === accountId);

    if (index >= 0) {
      accounts[index] = { ...accounts[index], ...updates };
    } else {
      accounts.push({ id: accountId, ...updates });
    }

    this.store.set('facebookAccounts', accounts);
  }

  // Oznacz konto jako zbanowane
  markAsBanned(accountId, banType = 'unknown') {
    const accountData = this.getAccountData(accountId);

    this.updateAccountData(accountId, {
      status: 'banned',
      bannedAt: new Date().toISOString(),
      banType: banType,
      banCount: (accountData.banCount || 0) + 1,
    });

    // Zapisz event bana
    this.recordBanEvent(accountId, banType);

    return true;
  }

  // Zapisz event bana (do sprawdzania auto-pauzy)
  recordBanEvent(accountId, banType) {
    const banEvents = this.store.get('banEvents', []);

    banEvents.push({
      accountId,
      banType,
      timestamp: new Date().toISOString(),
    });

    // Zachowaj tylko ostatnie 24h
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEvents = banEvents.filter(e => new Date(e.timestamp) > dayAgo);

    this.store.set('banEvents', recentEvents);
  }

  // Sprawdź czy powinniśmy zatrzymać automatyzację
  shouldPauseAutomation() {
    const banEvents = this.store.get('banEvents', []);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentBans = banEvents.filter(e => new Date(e.timestamp) > hourAgo);

    if (recentBans.length >= LIMITS.autoPauseOnBans) {
      return {
        shouldPause: true,
        reason: `Too many bans in last hour (${recentBans.length} >= ${LIMITS.autoPauseOnBans})`,
        recentBans,
      };
    }

    return { shouldPause: false };
  }

  // Oblicz delay między grupami (4-18 minut)
  getDelayBetweenGroups() {
    const delayMinutes = boundedGaussian(
      LIMITS.delayBetweenGroups.min,
      LIMITS.delayBetweenGroups.max
    );
    return delayMinutes * 60 * 1000; // Zwróć w ms
  }

  // Oblicz delay między kontami (30-120 sekund)
  getDelayBetweenAccounts() {
    const delayMinutes = boundedGaussian(
      LIMITS.delayBetweenAccounts.min,
      LIMITS.delayBetweenAccounts.max
    );
    return delayMinutes * 60 * 1000; // Zwróć w ms
  }

  // Sprawdź czy powinniśmy zrobić "ludzki błąd"
  shouldMakeHumanError(postsSinceLastError) {
    if (postsSinceLastError >= LIMITS.humanErrorFrequency) {
      return Math.random() < 0.5; // 50% szans gdy minęło wystarczająco postów
    }
    return false;
  }

  // Pobierz statystyki dla UI
  getStats(accountId) {
    const activity = this.getActivity(accountId);
    const accountData = this.getAccountData(accountId);
    const totalActions = activity.posts + activity.likes + activity.comments + activity.shares;

    const isWarming = this.isInWarmingMode(accountId);
    const maxActions = isWarming ? LIMITS.warmingMaxActions : LIMITS.maxActionsPerDay;

    return {
      today: {
        posts: activity.posts,
        likes: activity.likes,
        comments: activity.comments,
        totalActions,
        maxPosts: LIMITS.maxPostsPerDay,
        maxActions,
        postsRemaining: LIMITS.maxPostsPerDay - activity.posts,
        actionsRemaining: maxActions - totalActions,
      },
      account: {
        status: accountData.status,
        isWarming,
        warmingDaysRemaining: this.getWarmingDaysRemaining(accountId),
        banCount: accountData.banCount || 0,
      },
      limits: LIMITS,
    };
  }

  // Pobierz wszystkie dostępne konta (niezbangowane, mogące postować)
  getAvailableAccounts() {
    const accounts = this.store.get('facebookAccounts', []);

    return accounts.filter(account => {
      if (account.status === 'banned') return false;

      const canPostResult = this.canPost(account.id);
      return canPostResult.allowed;
    });
  }

  // Rozpocznij warming dla nowego konta
  startWarming(accountId) {
    this.updateAccountData(accountId, {
      warmingStarted: new Date().toISOString(),
      status: 'warming',
    });
  }

  // Zakończ warming (automatycznie lub ręcznie)
  endWarming(accountId) {
    this.updateAccountData(accountId, {
      status: 'active',
    });
  }
}

module.exports = { ActivityLimiter, LIMITS };
