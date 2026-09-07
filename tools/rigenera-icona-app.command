#!/bin/zsh
# Ricostruisce l'icona e l'app "Fantatool.app" sul Desktop da app/static/icon.svg.
# Doppio click dopo aver cambiato icon.svg.
set -e
cd "$(dirname "$0")/.."
SRC="app/static/icon.svg"
TMP="$(mktemp -d)"
qlmanage -t -s 1024 -o "$TMP" "$SRC" >/dev/null 2>&1
mv "$TMP/icon.svg.png" "$TMP/base.png"
mkdir "$TMP/Fantatool.iconset"
sizes=(16 32 64 128 256 512 1024)
for s in $sizes; do sips -z $s $s "$TMP/base.png" --out "$TMP/r$s.png" >/dev/null; done
i="$TMP/Fantatool.iconset"
cp "$TMP/r16.png" "$i/icon_16x16.png";        cp "$TMP/r32.png" "$i/icon_16x16@2x.png"
cp "$TMP/r32.png" "$i/icon_32x32.png";        cp "$TMP/r64.png" "$i/icon_32x32@2x.png"
cp "$TMP/r128.png" "$i/icon_128x128.png";     cp "$TMP/r256.png" "$i/icon_128x128@2x.png"
cp "$TMP/r256.png" "$i/icon_256x256.png";     cp "$TMP/r512.png" "$i/icon_256x256@2x.png"
cp "$TMP/r512.png" "$i/icon_512x512.png";     cp "$TMP/r1024.png" "$i/icon_512x512@2x.png"
iconutil -c icns "$i" -o "app/Fantatool.icns"

APP="$HOME/Desktop/Fantatool.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "app/Fantatool.icns" "$APP/Contents/Resources/Fantatool.icns"
cp "app/asta-stabile.command" /dev/null 2>/dev/null || true
cat > "$APP/Contents/MacOS/Fantatool" <<'EX'
#!/bin/zsh
LAUNCH="$HOME/Desktop/Fantatool-App/app/asta-stabile.command"
[[ -x "$LAUNCH" ]] && open -a Terminal "$LAUNCH" || osascript -e 'display alert "Fantatool non trovato" as critical'
EX
chmod +x "$APP/Contents/MacOS/Fantatool"
cp "app/Fantatool.Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
touch "$APP"; killall Finder 2>/dev/null || true
echo "OK — Fantatool.app aggiornata sul Desktop"
