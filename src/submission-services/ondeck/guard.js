const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isOnDeckHost(hostname) {
  return hostname === 'ondeck.com' || hostname.endsWith('.ondeck.com');
}

async function installWriteGuard(context) {
  const blocked = [];
  let open = false;

  await context.route(url => isOnDeckHost(url.hostname), route => {
    const request = route.request();
    const method = request.method();
    if (open || SAFE_METHODS.has(method)) return route.continue();

    const entry = `${method} ${new URL(request.url()).pathname}`;
    blocked.push(entry);
    console.log(`OnDeck write guard: BLOCKED ${entry}`);
    return route.abort('blockedbyclient');
  });

  console.log('OnDeck write guard active — every non-GET request to ondeck.com is blocked from here on');

  return {
    blocked,
    allowWrites: () => {
      open = true;
      console.log('OnDeck write guard lifted — this run is allowed to submit');
    },
  };
}

module.exports = { installWriteGuard };
