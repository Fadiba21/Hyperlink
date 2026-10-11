# Audio asset notes

## Existing sounds

Selected OGG samples in `android/app/src/main/res/raw/` come from **Kenney — Interface Sounds**.

- Asset page: https://opengameart.org/content/interface-sounds
- Direct pack: https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip
- License: Creative Commons Zero (CC0 1.0): https://creativecommons.org/publicdomain/zero/1.0/
- Credit: Kenney / Kenney.nl (optional under CC0; included as a courtesy)

The application includes only the small set of interface samples needed for tap, selection, toggle, slider, popup, confirmation, error, and notification feedback. The Soft, Crisp, and Wallet templates remap these bundled Kenney samples; no remote audio is downloaded or played at runtime.

The **Deep 70–140 Hz** template uses eight original, locally synthesized mono OGG tones (`deep_*.ogg`). Their fundamentals range from 72 Hz to 136 Hz with short harmonics and a low-level transient for phone-speaker clarity. These generated tones do not contain third-party samples and have no external asset license requirement.

The **Piano, Harp, Violin, Cello, and Acoustic guitar** templates are synthesized locally at playback by the Android audio module; they use no audio files or third-party recordings. Every event randomly selects a note from an instrument-specific pitch set, so repeats vary. Piano uses a struck, decaying harmonic envelope; harp a bright pluck; violin and cello bowed sustained harmonics with differing ranges, attacks, and vibrato; and acoustic guitar a pluck with a resonant body envelope. Their synthesis code is original and has no external sample-license or attribution requirement. A seeded random source can be passed to the synthesis routine for reproducible tests.

## DeafDeep user-provided sound template

**DeafDeep** replaces the former WND11 sound template and is now the default. All five supplied PCM WAV files are bundled as Android `res/raw` assets and played locally; no audio is fetched at runtime. Filenames are normalized to Android resource-safe lowercase identifiers. The supplied archive does not specify separate licensing terms, so no license or third-party ownership claim is made.

| UI event | Supplied file | Bundled asset |
| --- | --- | --- |
| Tap and toggle | `click.wav` | `deafdeep_click.wav` |
| Select and slider adjustment | `anything.wav` | `deafdeep_anything.wav` |
| Open/unlock | `PinUnlock.wav` | `deafdeep_pin_unlock.wav` |
| Confirm | `order.wav` | `deafdeep_order.wav` |
| Error and in-app notification | `Notif,PopUp.wav` | `deafdeep_notif_popup.wav` |

Every provided audio file is referenced by the DeafDeep effect map. In-app sound effects use Android's **media/music audio usage**, so their level follows the main media volume rather than notification volume. Actual system notifications use Android's separate notification channel and remain subject to the OS notification permission and channel settings.

Existing Soft, Crisp, Wallet, Deep, and synthesized instrument templates remain available. The persisted WND11 selection migrates to DeafDeep on upgrade.
