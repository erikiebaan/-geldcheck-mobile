# Geldcheck Flutter iOS

Deze map bevat de Flutter-versie van **Heb ik straks genoeg?**

## Huidige status

- Flutter UI gebouwd
- Geldcheck rekenlogica in Dart
- minimale buffer bewaakt gedurende de hele looptijd
- vermogensgrafiek
- pensioen/AOW-fases
- hypotheeklogica
- stressscenario's
- iOS build workflow aanwezig

## iPhone / TestFlight

De GitHub workflow **Build iOS TestFlight candidate** bouwt op een macOS-runner eerst een unsigned iOS release.

Voor een echte TestFlight-upload zijn daarna Apple Developer signinggegevens nodig:

- Apple Developer Team ID
- App Store Connect API Key ID
- App Store Connect Issuer ID
- private API key (.p8)
- distributiecertificaat + wachtwoord
- provisioning profile voor de gekozen bundle identifier

Voorgestelde bundle identifier:

`nl.erikbaan.geldcheck`

Zodra deze Apple-gegevens beschikbaar zijn kan de workflow worden uitgebreid van unsigned build naar een gesigneerde IPA en automatische TestFlight-upload.
