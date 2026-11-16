#!/bin/sh
# Retro 90s for Jellyfin: wrapper entrypoint for the official jellyfin/jellyfin Docker image.
#
# At every container start this copies the theme files into Jellyfin's web folder, where they are
# served at /web/ui/retro/, and adds the "Now Showing" script tag to index.html. Then it starts
# Jellyfin exactly as the image would. Nothing is changed outside the container, so removing the
# entrypoint line and recreating the container undoes everything.
#
# Fail-open: if something is missing or a step fails, it logs one line and Jellyfin still starts.
#
# RETRO_SRC  folder that holds retro.css, now-showing.js and fonts/   (default /retro-90s/theme)
# RETRO_WEB  Jellyfin's web folder inside the container               (default /jellyfin/jellyfin-web)
SRC=${RETRO_SRC:-/retro-90s/theme}
WEB=${RETRO_WEB:-/jellyfin/jellyfin-web}
DST=$WEB/ui/retro
MARK=$DST/.retro-90s
log() { echo "[retro-90s] $*"; }

if [ ! -f "$SRC/retro.css" ]; then
  log "no $SRC/retro.css - theme skipped"
elif [ ! -f "$WEB/index.html" ]; then
  log "no $WEB/index.html - theme skipped"
elif [ -e "$DST" ] && [ ! -f "$MARK" ]; then
  log "$DST exists and was not made by this script - theme skipped"
else
  ok=1
  rm -rf "$DST" && mkdir -p "$DST/fonts" || ok=0
  for f in "$SRC"/*.css "$SRC"/*.js; do
    [ -f "$f" ] && [ "$ok" = 1 ] && { cp -f "$f" "$DST/" || ok=0; }
  done
  for f in "$SRC"/fonts/*.woff2; do
    [ -f "$f" ] && [ "$ok" = 1 ] && { cp -f "$f" "$DST/fonts/" || ok=0; }
  done
  if [ "$ok" = 1 ] && : > "$MARK"; then
    log "theme files copied to $DST"
    # Now Showing script: does nothing unless Custom CSS imports retro-banner.css.
    # Remove any earlier tag, then insert one before </body>. The number only defeats browser caching.
    sed -i 's#<script src="ui/retro/now-showing.js[^"]*" data-retro-now-showing></script>##g' "$WEB/index.html"
    if [ -f "$DST/now-showing.js" ] && grep -q '</body>' "$WEB/index.html"; then
      V=$(cksum < "$DST/now-showing.js" | cut -d' ' -f1)
      TAG="<script src=\"ui/retro/now-showing.js?v=$V\" data-retro-now-showing></script>"
      sed -i "s#</body>#${TAG}</body>#" "$WEB/index.html" && log "Now Showing script added to index.html"
    else
      log "Now Showing script not added (no now-showing.js or no </body> in index.html)"
    fi
  else
    rm -rf "$DST" 2>/dev/null
    log "could not write to $WEB (is the container running as a non-root user?) - theme skipped"
  fi
fi
exec /jellyfin/jellyfin "$@"
