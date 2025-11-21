# Facebook Group Automation - Anti-Ban Stack 2025

Profesjonalne narzędzie do automatyzacji publikacji w grupach Facebook z zaawansowanymi mechanizmami anty-banowymi.

## Kluczowe funkcje

- **Playwright + Stealth** - najnowsza wersja z pełnym wsparciem stealth
- **Fingerprint Spoofing** - Canvas, WebGL, Audio, Fonts, Screen, UA, Timezone, WebRTC
- **Ludzkie zachowanie** - ruchy myszką Bezier, realistyczne pisanie, scrollowanie
- **Multi-account** - zarządzanie wieloma kontami z round-robin
- **Proxy Support** - residential/mobile proxy z walidacją
- **Limity aktywności** - automatyczne limity i tryb warming
- **Error Handling** - detekcja banów, auto-pauza, retry logic

## Wymagania

- Python 3.10+
- Playwright 1.48+
- Residential/Mobile Proxy (zalecane)

## Instalacja

```bash
# Klonowanie repozytorium
git clone <repo-url>
cd groupautomation

# Tworzenie środowiska wirtualnego
python -m venv venv
source venv/bin/activate  # Linux/Mac
# lub: venv\Scripts\activate  # Windows

# Instalacja zależności
pip install -r requirements.txt

# Instalacja przeglądarek Playwright
playwright install chromium

# Inicjalizacja projektu
python cli.py init
```

## Konfiguracja

Edytuj `config/settings.yaml`:

```yaml
browser:
  headless: false  # MUSI być false!

activity_limits:
  max_posts_per_day: 12
  max_actions_per_day: 40
  warming:
    enabled: true
    duration_days: 10

human_behavior:
  mouse:
    speed_range: [400, 1200]
  typing:
    delay_range: [120, 380]
```

## Użycie

### CLI

```bash
# Dodaj konto
python cli.py add-account konto1 email@example.com --proxy "ip:port:user:pass"

# Zaimportuj cookies (WYMAGANE - nie loguj się przez automatyzację!)
python cli.py import-cookies konto1 cookies.json

# Lista kont
python cli.py list-accounts

# Warming konta (pierwsze 7-14 dni)
python cli.py warm konto1

# Publikacja do grup
python cli.py post groups.txt --text "Treść posta"

# Test proxy
python cli.py test-proxy "ip:port:user:pass"

# Statystyki
python cli.py stats
```

### Python API

```python
import asyncio
from src.main import FacebookGroupAutomation
from src.automation.facebook import PostContent

async def main():
    async with FacebookGroupAutomation() as automation:
        # Dodaj konto
        await automation.add_account(
            "konto1",
            "email@example.com",
            proxy="ip:port:user:pass",
            storage_state="data/sessions/konto1.json"
        )

        # Publikuj do grup
        groups = [
            "https://www.facebook.com/groups/123456",
            "https://www.facebook.com/groups/789012",
        ]

        content = PostContent(
            text="Cześć! To jest testowy post.",
            images=["zdjecie.jpg"]  # opcjonalne
        )

        await automation.post_to_groups(groups, content)

asyncio.run(main())
```

## Przygotowanie cookies

**WAŻNE:** Nigdy nie loguj się przez automatyzację! Używaj tylko importu cookies.

1. Zaloguj się ręcznie do Facebook w przeglądarce
2. Wyeksportuj cookies używając rozszerzenia (np. "EditThisCookie")
3. Zapisz jako JSON
4. Zaimportuj: `python cli.py import-cookies konto1 cookies.json`

## Limity (zalecane)

- **Max 12 postów/dzień/konto** (lepiej 6-10)
- **Max 40 akcji/dzień** (lajki + komentarze + posty)
- **Warming: 7-14 dni** bez postów, tylko engagement
- **Czas między grupami: 4-18 minut**
- **Max 5 kont jednocześnie** na komputerze

## Flow publikacji

System automatycznie wykonuje 10-krokową sekwencję:

1. ✅ Otwórz facebook.com + 10-30s scroll
2. ✅ Nawigacja do grupy przez URL
3. ✅ 15-90s engagement (scroll, kliknięcia, lajki)
4. ✅ Kliknij "Utwórz post"
5. ✅ Human mouse do pola tekstowego
6. ✅ Pisanie z losowymi opóźnieniami + literówki
7. ✅ Upload zdjęć z opóźnieniami
8. ✅ Human mouse do "Opublikuj"
9. ✅ Zostań 45-240s + dodatkowy engagement
10. ✅ Losowa kolejność następnej grupy

## Fingerprint Spoofing

Każde konto ma unikalny fingerprint:

- **Canvas** - szum na toDataURL/toBlob
- **WebGL** - losowy vendor/renderer z prawdziwych GPU
- **Audio** - prawdziwe hashe z bazy 100+ urządzeń
- **Screen** - losowa rozdzielczość z 20 najpopularniejszych
- **User-Agent** - 100+ prawdziwych UA
- **Timezone** - polskie/europejskie strefy
- **WebRTC** - wyłączony leak IP
- **Chrome.runtime** - podrobiony (FB sprawdza!)

## Struktura projektu

```
groupautomation/
├── cli.py                 # CLI interface
├── requirements.txt       # Zależności
├── config/
│   └── settings.yaml      # Konfiguracja
├── src/
│   ├── main.py           # Główna aplikacja
│   ├── config.py         # Loader konfiguracji
│   ├── browser/
│   │   └── manager.py    # Zarządzanie przeglądarką
│   ├── fingerprint/
│   │   └── manager.py    # Fingerprint spoofing
│   ├── automation/
│   │   ├── facebook.py   # Automatyzacja FB
│   │   ├── human_behavior.py  # Symulacja ludzkich zachowań
│   │   └── scheduler.py  # Scheduler zadań
│   ├── account/
│   │   └── manager.py    # Zarządzanie kontami
│   └── data/
│       ├── user_agents.py    # Baza UA
│       ├── webgl_fingerprints.py  # Baza WebGL
│       ├── audio_fingerprints.py  # Baza audio
│       └── fonts.py          # Baza fontów
└── data/
    ├── accounts.db       # Baza danych kont
    └── sessions/         # Pliki sesji
```

## Troubleshooting

### Konto zbanowane
- Sprawdź czy używasz residential/mobile proxy
- Upewnij się, że headless=false
- Zwiększ czasy między postami
- Sprawdź czy cookies są świeże

### Proxy nie działa
```bash
python cli.py test-proxy "ip:port:user:pass"
```

### Błędy selektorów
Facebook często zmienia HTML. Zaktualizuj selektory w `src/automation/facebook.py`.

## Licencja

MIT License
