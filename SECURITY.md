# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it through GitHub private vulnerability reporting: open the repository's **Security**
tab and choose **Report a vulnerability**. That sends the report privately to the maintainer.

Include what you found, how to reproduce it, and which version or commit you tested.

## What the theme does on your server

- The CSS files only change how Jellyfin's web client looks.
- `theme/now-showing.js` runs in the signed-in user's browser. It asks your own Jellyfin
  server for that user's resume list and recently added movies and shows, using the session
  the web client already has. It sends nothing anywhere else and stores nothing.
- `install/docker/entrypoint.sh` copies files into Jellyfin's web folder inside the container
  and adds one script tag to `index.html`.

This is a hobby project maintained in spare time, with no guaranteed response time.
