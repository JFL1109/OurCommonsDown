/**
 * Cloudflare Worker Script for OurCommons|Markets Maintenance / Failover
 * 
 * This worker intercepts requests to your primary live server.
 * If the primary server is offline or reporting server errors, it gracefully
 * falls back to serving a beautiful status page hosted on GitHub Pages.
 * 
 * It also handles routing for static assets (like CSS and SVG logos) so they
 * load properly from GitHub Pages during an outage.
 */

// CHANGE THIS to your actual GitHub Pages repository URL
const GITHUB_PAGES_URL = 'https://yourusername.github.io/status-repo';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Helper to determine if the request is for a status page asset
    const isAssetRequest = pathname.includes('/assets/') || 
                           pathname.endsWith('.css') || 
                           pathname.endsWith('.svg') || 
                           pathname.endsWith('.png');

    // Helper to fetch asset or page from GitHub Pages
    const fetchFromGitHub = async (statusOverride = null) => {
      // Build the target GitHub Pages URL
      let targetPath = pathname;
      
      // If the asset request is relative or nested under status_down, clean it up
      if (pathname.includes('/status_down/')) {
        targetPath = pathname.substring(pathname.indexOf('/status_down/') + '/status_down'.length);
      }
      
      // If it's not an asset, serve the main index.html status page
      const targetUrl = isAssetRequest 
        ? `${GITHUB_PAGES_URL}${targetPath}`
        : `${GITHUB_PAGES_URL}/index.html`;

      const gitHubResponse = await fetch(targetUrl);
      
      if (!gitHubResponse.ok) {
        // Fallback in case GitHub Pages is also having issues or path is wrong
        return new Response('OurCommons|Markets is currently undergoing maintenance. Please check back soon.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
        });
      }

      // Determine appropriate Content-Type
      let contentType = 'text/html;charset=UTF-8';
      if (pathname.endsWith('.css')) {
        contentType = 'text/css;charset=UTF-8';
      } else if (pathname.endsWith('.svg')) {
        contentType = 'image/svg+xml';
      } else if (pathname.endsWith('.png')) {
        contentType = 'image/png';
      }

      return new Response(gitHubResponse.body, {
        status: statusOverride || (isAssetRequest ? 200 : 503),
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=60' // Cache briefly
        }
      });
    };

    try {
      // 1. Try to fetch from your primary live server
      const response = await fetch(request);
      
      // Server error statuses we want to intercept
      const errorStatuses = [500, 502, 503, 504, 521, 522, 524];

      if (errorStatuses.includes(response.status)) {
        // 2. Server is reporting an error! Serve status page/assets from GitHub Pages
        return await fetchFromGitHub(503);
      }

      return response;

    } catch (err) {
      // 3. Server is totally dead/timing out. Fetch from GitHub Pages as the ultimate fallback
      return await fetchFromGitHub(503);
    }
  }
};
