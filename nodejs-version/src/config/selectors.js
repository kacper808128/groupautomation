/**
 * Selektory Facebook do automatyzacji
 * Uwaga: Facebook często zmienia strukturę HTML, więc te selektory mogą wymagać aktualizacji
 */

module.exports = {
  // Logowanie
  login: {
    emailInput: '#email',
    passwordInput: '#pass',
    loginButton: 'button[name="login"]',
    loginButtonAlt: 'button[type="submit"]'
  },
  
  // Tworzenie posta
  post: {
    // Selektory dla kliknięcia w pole do pisania posta
    createPostButtons: [
      'div[role="button"][aria-label*="napisz"]',
      'div[role="button"][aria-label*="post"]',
      'span[class*="x1lliihq"]:has-text("Co słychać")',
      'span:has-text("What\'s on your mind")',
      '[aria-label="Create a post"]'
    ],
    
    // Pole tekstowe do wpisywania treści
    textArea: [
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[aria-label*="post"]',
      'div[aria-placeholder*="mind"]'
    ],
    
    // Przycisk publikacji
    publishButtons: [
      'div[aria-label="Opublikuj"]',
      'div[aria-label="Post"]',
      'div[aria-label="Udostępnij"]',
      'span:has-text("Opublikuj")',
      'span:has-text("Post")',
      'div[role="button"]:has-text("Post")'
    ]
  },
  
  // Grupy
  groups: {
    // Przyciski nawigacji w grupach
    groupFeed: 'div[role="feed"]',
    groupName: 'h1[class*="x1heor9g"]',
    groupMembers: 'a[href*="/members"]'
  },
  
  // CAPTCHA
  captcha: {
    selectors: [
      'iframe[src*="captcha"]',
      'div[id*="captcha"]',
      'div[class*="captcha"]',
      '#recaptcha',
      '.g-recaptcha',
      'iframe[src*="recaptcha"]',
      'iframe[title*="recaptcha"]'
    ]
  },
  
  // Checkpoint (weryfikacja)
  checkpoint: {
    urls: [
      'facebook.com/checkpoint',
      'facebook.com/login/device-based/regular/login',
      'facebook.com/login/identify',
      'facebook.com/checkpoint/block'
    ],
    selectors: [
      'div[class*="checkpoint"]',
      'button[name="submit[Continue]"]',
      'button[value="OK"]'
    ]
  },
  
  // Powiadomienia i dialogi
  dialogs: {
    closeButton: [
      'div[aria-label="Zamknij"]',
      'div[aria-label="Close"]',
      'div[role="button"][aria-label*="Dismiss"]'
    ],
    saveLoginInfo: 'button[name="__CONFIRM__"]',
    notNow: 'div[role="button"]:has-text("Nie teraz")',
    notNowEn: 'div[role="button"]:has-text("Not Now")'
  },
  
  // Nawigacja
  navigation: {
    home: 'a[aria-label="Home"]',
    notifications: 'a[aria-label*="Notifications"]',
    messages: 'a[aria-label*="Messenger"]',
    menu: 'div[aria-label="Menu"]'
  },
  
  // Profil użytkownika
  profile: {
    menuButton: 'div[aria-label*="Account"]',
    logoutButton: 'span:has-text("Wyloguj")',
    logoutButtonEn: 'span:has-text("Log Out")'
  },
  
  // Formularze i inputy
  forms: {
    submitButton: 'button[type="submit"]',
    cancelButton: 'button[type="button"]:has-text("Cancel")',
    saveButton: 'button:has-text("Save")'
  },
  
  // Ładowanie
  loading: {
    spinner: 'div[role="progressbar"]',
    loadingIndicator: 'div[class*="loading"]'
  },
  
  // Błędy
  errors: {
    errorMessage: 'div[role="alert"]',
    errorText: 'div[class*="error"]'
  }
};
