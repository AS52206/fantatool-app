#!/bin/zsh
# Ricostruisce l'icona e "Fantatool.app" sul Desktop (e aggiorna l'icona di
# ~/Applications/Fantatool.app se esiste) a partire da app/static/icon.svg.
# Doppio click dopo aver cambiato icon.svg.
set -e
cd "$(dirname "$0")/.."
SRC="app/static/icon.svg"
TMP="$(mktemp -d)"

qlmanage -t -s 1024 -o "$TMP" "$SRC" >/dev/null 2>&1
mv "$TMP/icon.svg.png" "$TMP/base.png"
mkdir "$TMP/Fantatool.iconset"
i="$TMP/Fantatool.iconset"
for s in 16 32 64 128 256 512 1024; do sips -z $s $s "$TMP/base.png" --out "$TMP/r$s.png" >/dev/null; done
cp "$TMP/r16.png"  "$i/icon_16x16.png";     cp "$TMP/r32.png"  "$i/icon_16x16@2x.png"
cp "$TMP/r32.png"  "$i/icon_32x32.png";     cp "$TMP/r64.png"  "$i/icon_32x32@2x.png"
cp "$TMP/r128.png" "$i/icon_128x128.png";   cp "$TMP/r256.png" "$i/icon_128x128@2x.png"
cp "$TMP/r256.png" "$i/icon_256x256.png";   cp "$TMP/r512.png" "$i/icon_256x256@2x.png"
cp "$TMP/r512.png" "$i/icon_512x512.png";   cp "$TMP/r1024.png" "$i/icon_512x512@2x.png"
iconutil -c icns "$i" -o "app/Fantatool.icns"

APP="$HOME/Desktop/Fantatool.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "app/Fantatool.icns" "$APP/Contents/Resources/Fantatool.icns"
cp "app/Fantatool.Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
cat > "$APP/Contents/MacOS/Fantatool" <<'EX'
#!/bin/zsh
LAUNCH="$HOME/Desktop/Fantatool-App/app/asta-stabile.command"
[[ -x "$LAUNCH" ]] && open -a Terminal "$LAUNCH" || osascript -e 'display alert "Fantatool non trovato" as critical'
EX
chmod +x "$APP/Contents/MacOS/Fantatool"

# aggiorna anche l'eventuale applet in ~/Applications
OLD="$HOME/Applications/Fantatool.app"
[[ -d "$OLD" ]] && cp "app/Fantatool.icns" "$OLD/Contents/Resources/applet.icns" && touch "$OLD"

/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "$APP" "$OLD" 2>/dev/null || true
touch "$APP"
killall Finder Dock 2>/dev/null || true
rm -rf "$TMP"
echo "OK — Fantatool.app aggiornata sul Desktop"
