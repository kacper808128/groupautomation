"""
Fingerprint Manager - handles all browser fingerprint spoofing.
Implements Canvas, WebGL, Audio, Fonts, Screen, UA, Timezone spoofing.
"""
import random
import hashlib
import json
from typing import Any
from dataclasses import dataclass, field

from src.data.user_agents import ALL_USER_AGENTS, MACOS_USER_AGENTS
from src.data.webgl_fingerprints import WEBGL_FINGERPRINTS, WEBGL_EXTENSIONS
from src.data.audio_fingerprints import AUDIO_FINGERPRINTS, AUDIO_CONTEXT_PROPERTIES
from src.data.fonts import FONT_PROFILES
from src.config import settings


@dataclass
class BrowserFingerprint:
    """Complete browser fingerprint profile."""
    user_agent: str
    screen_width: int
    screen_height: int
    color_depth: int = 24
    pixel_ratio: float = 1.0
    timezone: str = "Europe/Warsaw"
    locale: str = "pl-PL"
    languages: list[str] = field(default_factory=lambda: ["pl-PL", "pl", "en-US", "en"])
    hardware_concurrency: int = 8
    device_memory: int = 8
    platform: str = "Win32"
    webgl_vendor: str = ""
    webgl_renderer: str = ""
    audio_fingerprint: float = 124.04344968475198
    canvas_noise_seed: int = 0
    fonts: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "user_agent": self.user_agent,
            "screen": {"width": self.screen_width, "height": self.screen_height},
            "color_depth": self.color_depth,
            "pixel_ratio": self.pixel_ratio,
            "timezone": self.timezone,
            "locale": self.locale,
            "languages": self.languages,
            "hardware_concurrency": self.hardware_concurrency,
            "device_memory": self.device_memory,
            "platform": self.platform,
            "webgl": {"vendor": self.webgl_vendor, "renderer": self.webgl_renderer},
            "audio_fingerprint": self.audio_fingerprint,
            "canvas_noise_seed": self.canvas_noise_seed,
        }

    def get_fingerprint_hash(self) -> str:
        """Generate unique hash for this fingerprint."""
        data = json.dumps(self.to_dict(), sort_keys=True)
        return hashlib.md5(data.encode()).hexdigest()[:16]


class FingerprintManager:
    """Manages browser fingerprint generation and injection."""

    def __init__(self):
        self.config = settings.fingerprint

    def generate_fingerprint(self, seed: int | None = None) -> BrowserFingerprint:
        """Generate a random but consistent fingerprint."""
        if seed is not None:
            random.seed(seed)

        # Screen resolution
        resolution = random.choice(self.config.screen_resolutions)

        # WebGL
        webgl = random.choice(WEBGL_FINGERPRINTS)

        # Fonts
        font_profile = random.choice(FONT_PROFILES)

        # Hardware
        hw_concurrency = random.randint(*self.config.hardware_concurrency_range)
        device_memory = random.choice([4, 8, 16, 32])

        # Timezone and locale
        timezone = random.choice(self.config.timezones)
        locale = random.choice(self.config.locales)

        # Languages based on locale
        if locale.startswith("pl"):
            languages = ["pl-PL", "pl", "en-US", "en"]
        elif locale.startswith("de"):
            languages = ["de-DE", "de", "en-US", "en"]
        else:
            languages = ["en-US", "en"]

        # User agent
        user_agent = random.choice(ALL_USER_AGENTS)

        # Audio fingerprint
        audio_fp = random.choice(AUDIO_FINGERPRINTS)

        # Canvas noise seed (unique per profile)
        canvas_seed = random.randint(1, 1000000)

        # Pixel ratio based on resolution
        if resolution[0] >= 2560:
            pixel_ratio = random.choice([1.0, 1.25, 1.5])
        elif resolution[0] >= 1920:
            pixel_ratio = random.choice([1.0, 1.25])
        else:
            pixel_ratio = 1.0

        fingerprint = BrowserFingerprint(
            user_agent=user_agent,
            screen_width=resolution[0],
            screen_height=resolution[1],
            pixel_ratio=pixel_ratio,
            timezone=timezone,
            locale=locale,
            languages=languages,
            hardware_concurrency=hw_concurrency,
            device_memory=device_memory,
            webgl_vendor=webgl["vendor"],
            webgl_renderer=webgl["renderer"],
            audio_fingerprint=audio_fp,
            canvas_noise_seed=canvas_seed,
            fonts=font_profile["fonts"],
        )

        # Reset random seed
        if seed is not None:
            random.seed()

        return fingerprint

    def get_stealth_scripts(self, fingerprint: BrowserFingerprint) -> list[str]:
        """Generate JavaScript injection scripts for fingerprint spoofing."""
        scripts = []

        # 1. Navigator properties spoofing
        scripts.append(self._get_navigator_script(fingerprint))

        # 2. Screen spoofing
        scripts.append(self._get_screen_script(fingerprint))

        # 3. WebGL spoofing
        scripts.append(self._get_webgl_script(fingerprint))

        # 4. Canvas spoofing (noise injection)
        scripts.append(self._get_canvas_script(fingerprint))

        # 5. Audio fingerprint spoofing
        scripts.append(self._get_audio_script(fingerprint))

        # 6. WebRTC spoofing (disable or limit)
        scripts.append(self._get_webrtc_script())

        # 7. Chrome.runtime spoofing
        scripts.append(self._get_chrome_runtime_script())

        # 8. Permissions API spoofing
        scripts.append(self._get_permissions_script())

        # 9. Battery API spoofing
        scripts.append(self._get_battery_script())

        # 10. Plugin/MimeType spoofing
        scripts.append(self._get_plugins_script())

        return scripts

    def _get_navigator_script(self, fp: BrowserFingerprint) -> str:
        """Navigator properties spoofing script."""
        return f"""
        // Navigator spoofing
        Object.defineProperty(navigator, 'hardwareConcurrency', {{
            get: () => {fp.hardware_concurrency}
        }});

        Object.defineProperty(navigator, 'deviceMemory', {{
            get: () => {fp.device_memory}
        }});

        Object.defineProperty(navigator, 'platform', {{
            get: () => '{fp.platform}'
        }});

        Object.defineProperty(navigator, 'languages', {{
            get: () => {json.dumps(fp.languages)}
        }});

        Object.defineProperty(navigator, 'language', {{
            get: () => '{fp.languages[0]}'
        }});

        // Vendor spoofing
        Object.defineProperty(navigator, 'vendor', {{
            get: () => 'Google Inc.'
        }});

        Object.defineProperty(navigator, 'vendorSub', {{
            get: () => ''
        }});

        // Product spoofing
        Object.defineProperty(navigator, 'product', {{
            get: () => 'Gecko'
        }});

        Object.defineProperty(navigator, 'productSub', {{
            get: () => '20030107'
        }});

        // Max touch points (desktop = 0)
        Object.defineProperty(navigator, 'maxTouchPoints', {{
            get: () => 0
        }});

        // Connection spoofing
        if (navigator.connection) {{
            Object.defineProperty(navigator.connection, 'effectiveType', {{
                get: () => '4g'
            }});
            Object.defineProperty(navigator.connection, 'downlink', {{
                get: () => 10
            }});
            Object.defineProperty(navigator.connection, 'rtt', {{
                get: () => 50
            }});
        }}
        """

    def _get_screen_script(self, fp: BrowserFingerprint) -> str:
        """Screen properties spoofing script."""
        return f"""
        // Screen spoofing
        Object.defineProperty(screen, 'width', {{
            get: () => {fp.screen_width}
        }});

        Object.defineProperty(screen, 'height', {{
            get: () => {fp.screen_height}
        }});

        Object.defineProperty(screen, 'availWidth', {{
            get: () => {fp.screen_width}
        }});

        Object.defineProperty(screen, 'availHeight', {{
            get: () => {fp.screen_height - 40}
        }});

        Object.defineProperty(screen, 'colorDepth', {{
            get: () => {fp.color_depth}
        }});

        Object.defineProperty(screen, 'pixelDepth', {{
            get: () => {fp.color_depth}
        }});

        Object.defineProperty(window, 'devicePixelRatio', {{
            get: () => {fp.pixel_ratio}
        }});

        Object.defineProperty(window, 'outerWidth', {{
            get: () => {fp.screen_width}
        }});

        Object.defineProperty(window, 'outerHeight', {{
            get: () => {fp.screen_height - 80}
        }});

        Object.defineProperty(window, 'innerWidth', {{
            get: () => {fp.screen_width - 17}
        }});

        Object.defineProperty(window, 'innerHeight', {{
            get: () => {fp.screen_height - 140}
        }});
        """

    def _get_webgl_script(self, fp: BrowserFingerprint) -> str:
        """WebGL vendor/renderer spoofing script."""
        extensions_str = json.dumps(WEBGL_EXTENSIONS)
        return f"""
        // WebGL spoofing
        const getParameterProxyHandler = {{
            apply: function(target, thisArg, args) {{
                const param = args[0];
                const gl = thisArg;

                // UNMASKED_VENDOR_WEBGL
                if (param === 37445) {{
                    return '{fp.webgl_vendor}';
                }}
                // UNMASKED_RENDERER_WEBGL
                if (param === 37446) {{
                    return '{fp.webgl_renderer}';
                }}

                return Reflect.apply(target, thisArg, args);
            }}
        }};

        // Apply to WebGLRenderingContext
        if (typeof WebGLRenderingContext !== 'undefined') {{
            WebGLRenderingContext.prototype.getParameter = new Proxy(
                WebGLRenderingContext.prototype.getParameter,
                getParameterProxyHandler
            );
        }}

        // Apply to WebGL2RenderingContext
        if (typeof WebGL2RenderingContext !== 'undefined') {{
            WebGL2RenderingContext.prototype.getParameter = new Proxy(
                WebGL2RenderingContext.prototype.getParameter,
                getParameterProxyHandler
            );
        }}

        // Spoof getSupportedExtensions
        const extensionsList = {extensions_str};

        if (typeof WebGLRenderingContext !== 'undefined') {{
            const originalGetSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
            WebGLRenderingContext.prototype.getSupportedExtensions = function() {{
                return extensionsList;
            }};
        }}
        """

    def _get_canvas_script(self, fp: BrowserFingerprint) -> str:
        """Canvas fingerprint noise injection script."""
        return f"""
        // Canvas fingerprint noise injection
        const canvasNoiseSeed = {fp.canvas_noise_seed};

        // Simple seeded random
        function seededRandom(seed) {{
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        }}

        // Add noise to toDataURL
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type, quality) {{
            const ctx = this.getContext('2d');
            if (ctx) {{
                const imageData = ctx.getImageData(0, 0, this.width, this.height);
                const data = imageData.data;

                // Add subtle noise to random pixels
                let localSeed = canvasNoiseSeed;
                for (let i = 0; i < data.length; i += 4) {{
                    if (seededRandom(localSeed++) < 0.01) {{  // 1% of pixels
                        // Add noise (-2 to +2)
                        const noise = Math.floor(seededRandom(localSeed++) * 5) - 2;
                        data[i] = Math.max(0, Math.min(255, data[i] + noise));
                        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
                        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
                    }}
                }}
                ctx.putImageData(imageData, 0, 0);
            }}
            return originalToDataURL.call(this, type, quality);
        }};

        // Add noise to toBlob
        const originalToBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {{
            const ctx = this.getContext('2d');
            if (ctx) {{
                const imageData = ctx.getImageData(0, 0, this.width, this.height);
                const data = imageData.data;

                let localSeed = canvasNoiseSeed + 1000;
                for (let i = 0; i < data.length; i += 4) {{
                    if (seededRandom(localSeed++) < 0.01) {{
                        const noise = Math.floor(seededRandom(localSeed++) * 5) - 2;
                        data[i] = Math.max(0, Math.min(255, data[i] + noise));
                        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
                        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
                    }}
                }}
                ctx.putImageData(imageData, 0, 0);
            }}
            return originalToBlob.call(this, callback, type, quality);
        }};

        // WebGL readPixels noise
        if (typeof WebGLRenderingContext !== 'undefined') {{
            const originalReadPixels = WebGLRenderingContext.prototype.readPixels;
            WebGLRenderingContext.prototype.readPixels = function(...args) {{
                const result = originalReadPixels.apply(this, args);
                if (args[6] instanceof Uint8Array) {{
                    let localSeed = canvasNoiseSeed + 2000;
                    for (let i = 0; i < args[6].length; i += 4) {{
                        if (seededRandom(localSeed++) < 0.005) {{
                            const noise = Math.floor(seededRandom(localSeed++) * 3) - 1;
                            args[6][i] = Math.max(0, Math.min(255, args[6][i] + noise));
                        }}
                    }}
                }}
                return result;
            }};
        }}
        """

    def _get_audio_script(self, fp: BrowserFingerprint) -> str:
        """AudioContext fingerprint spoofing script."""
        return f"""
        // AudioContext fingerprint spoofing
        const targetAudioFingerprint = {fp.audio_fingerprint};

        // Override OfflineAudioContext
        if (typeof OfflineAudioContext !== 'undefined') {{
            const OriginalOfflineAudioContext = OfflineAudioContext;

            class SpoofedOfflineAudioContext extends OriginalOfflineAudioContext {{
                constructor(...args) {{
                    super(...args);
                }}

                startRendering() {{
                    return super.startRendering().then(buffer => {{
                        // Modify the buffer slightly to match target fingerprint
                        const channelData = buffer.getChannelData(0);
                        const originalSum = channelData.reduce((a, b) => a + b, 0);
                        const targetSum = targetAudioFingerprint;

                        // Calculate adjustment factor
                        if (Math.abs(originalSum) > 0.0001) {{
                            const adjustmentFactor = targetSum / originalSum;
                            for (let i = 0; i < channelData.length; i++) {{
                                channelData[i] *= adjustmentFactor * (0.9999 + Math.random() * 0.0002);
                            }}
                        }}

                        return buffer;
                    }});
                }}
            }}

            window.OfflineAudioContext = SpoofedOfflineAudioContext;
        }}

        // Spoof AudioContext properties
        if (typeof AudioContext !== 'undefined') {{
            const OriginalAudioContext = AudioContext;

            class SpoofedAudioContext extends OriginalAudioContext {{
                constructor(...args) {{
                    super(...args);

                    Object.defineProperty(this, 'baseLatency', {{
                        get: () => 0.005333333333333333
                    }});

                    Object.defineProperty(this, 'outputLatency', {{
                        get: () => 0
                    }});
                }}
            }}

            window.AudioContext = SpoofedAudioContext;
        }}
        """

    def _get_webrtc_script(self) -> str:
        """WebRTC IP leak prevention script."""
        return """
        // WebRTC IP leak prevention
        // Option 1: Completely disable WebRTC (more aggressive)
        // Option 2: Spoof local IPs (less aggressive, used here)

        if (typeof RTCPeerConnection !== 'undefined') {
            const OriginalRTCPeerConnection = RTCPeerConnection;

            class SpoofedRTCPeerConnection extends OriginalRTCPeerConnection {
                constructor(config) {
                    // Force TURN-only mode to prevent local IP leak
                    const newConfig = config || {};
                    newConfig.iceTransportPolicy = 'relay';

                    super(newConfig);
                }

                createDataChannel(...args) {
                    return super.createDataChannel(...args);
                }
            }

            window.RTCPeerConnection = SpoofedRTCPeerConnection;
            window.webkitRTCPeerConnection = SpoofedRTCPeerConnection;
        }

        // Disable getUserMedia for additional privacy
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = function(constraints) {
                // Allow video/audio but prevent IP enumeration through WebRTC
                return originalGetUserMedia(constraints);
            };
        }
        """

    def _get_chrome_runtime_script(self) -> str:
        """Chrome.runtime spoofing script (critical for FB detection in 2025)."""
        return """
        // Chrome.runtime spoofing - FB checks this heavily in 2025
        if (typeof window.chrome === 'undefined') {
            window.chrome = {};
        }

        window.chrome.runtime = {
            connect: function() { return { onMessage: { addListener: function() {} }, postMessage: function() {} }; },
            sendMessage: function() {},
            onMessage: { addListener: function() {}, removeListener: function() {} },
            onConnect: { addListener: function() {}, removeListener: function() {} },
            getManifest: function() { return null; },
            getURL: function(path) { return ''; },
            id: undefined,
            // Make it look like no extension is installed
            lastError: null
        };

        // app property
        window.chrome.app = {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
            getDetails: function() { return null; },
            getIsInstalled: function() { return false; },
            runningState: function() { return 'cannot_run'; }
        };

        // csi property
        window.chrome.csi = function() {
            return {
                startE: Date.now(),
                onloadT: Date.now() + Math.floor(Math.random() * 500) + 500,
                pageT: Math.floor(Math.random() * 1000) + 1000,
                tran: 15
            };
        };

        // loadTimes property
        window.chrome.loadTimes = function() {
            return {
                commitLoadTime: Date.now() / 1000,
                connectionInfo: 'h2',
                finishDocumentLoadTime: Date.now() / 1000 + 0.1,
                finishLoadTime: Date.now() / 1000 + 0.5,
                firstPaintAfterLoadTime: 0,
                firstPaintTime: Date.now() / 1000 + 0.05,
                navigationType: 'Other',
                npnNegotiatedProtocol: 'h2',
                requestTime: Date.now() / 1000 - 0.1,
                startLoadTime: Date.now() / 1000,
                wasAlternateProtocolAvailable: false,
                wasFetchedViaSpdy: true,
                wasNpnNegotiated: true
            };
        };

        // Make chrome object non-writable to prevent detection
        Object.defineProperty(window, 'chrome', {
            writable: false,
            configurable: false
        });
        """

    def _get_permissions_script(self) -> str:
        """Permissions API spoofing script."""
        return """
        // Permissions API spoofing
        if (navigator.permissions && navigator.permissions.query) {
            const originalQuery = navigator.permissions.query.bind(navigator.permissions);

            navigator.permissions.query = function(descriptor) {
                // Return 'prompt' for notification to look like a real user
                if (descriptor.name === 'notifications') {
                    return Promise.resolve({ state: 'prompt', onchange: null });
                }
                // Return 'granted' for geolocation to look normal
                if (descriptor.name === 'geolocation') {
                    return Promise.resolve({ state: 'prompt', onchange: null });
                }
                return originalQuery(descriptor);
            };
        }
        """

    def _get_battery_script(self) -> str:
        """Battery API spoofing script."""
        return """
        // Battery API spoofing (simulate desktop = always charging)
        if (navigator.getBattery) {
            navigator.getBattery = function() {
                return Promise.resolve({
                    charging: true,
                    chargingTime: 0,
                    dischargingTime: Infinity,
                    level: 1.0,
                    addEventListener: function() {},
                    removeEventListener: function() {}
                });
            };
        }
        """

    def _get_plugins_script(self) -> str:
        """Plugin/MimeType spoofing script."""
        return """
        // Plugin spoofing - simulate Chrome default plugins
        const fakePlugins = [
            {
                name: 'PDF Viewer',
                description: 'Portable Document Format',
                filename: 'internal-pdf-viewer',
                mimeTypes: [
                    { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                    { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
                ]
            },
            {
                name: 'Chrome PDF Viewer',
                description: 'Portable Document Format',
                filename: 'internal-pdf-viewer',
                mimeTypes: [
                    { type: 'application/pdf', suffixes: 'pdf', description: '' }
                ]
            },
            {
                name: 'Chromium PDF Viewer',
                description: 'Portable Document Format',
                filename: 'internal-pdf-viewer',
                mimeTypes: [
                    { type: 'application/pdf', suffixes: 'pdf', description: '' }
                ]
            },
            {
                name: 'Microsoft Edge PDF Viewer',
                description: 'Portable Document Format',
                filename: 'internal-pdf-viewer',
                mimeTypes: [
                    { type: 'application/pdf', suffixes: 'pdf', description: '' }
                ]
            },
            {
                name: 'WebKit built-in PDF',
                description: 'Portable Document Format',
                filename: 'internal-pdf-viewer',
                mimeTypes: [
                    { type: 'application/pdf', suffixes: 'pdf', description: '' }
                ]
            }
        ];

        // Create fake PluginArray
        const pluginArray = {
            length: fakePlugins.length,
            item: function(index) { return fakePlugins[index] || null; },
            namedItem: function(name) { return fakePlugins.find(p => p.name === name) || null; },
            refresh: function() {}
        };

        // Add indexed access
        fakePlugins.forEach((plugin, index) => {
            pluginArray[index] = plugin;
            pluginArray[plugin.name] = plugin;
        });

        Object.defineProperty(navigator, 'plugins', {
            get: () => pluginArray
        });

        // MimeType array
        const allMimeTypes = fakePlugins.flatMap(p => p.mimeTypes);
        const mimeTypeArray = {
            length: allMimeTypes.length,
            item: function(index) { return allMimeTypes[index] || null; },
            namedItem: function(name) { return allMimeTypes.find(m => m.type === name) || null; }
        };

        allMimeTypes.forEach((mimeType, index) => {
            mimeTypeArray[index] = mimeType;
            mimeTypeArray[mimeType.type] = mimeType;
        });

        Object.defineProperty(navigator, 'mimeTypes', {
            get: () => mimeTypeArray
        });
        """


# Singleton instance
fingerprint_manager = FingerprintManager()
